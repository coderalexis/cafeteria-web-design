-- 28_p7_para_llevar.sql — P7a: cargo por «Para llevar» configurable por
-- cafetería (aplicada en producción como `p7_para_llevar`), y con ella la
-- definición completa de `create_ticket` v12.
--
-- Reglas:
--   · El MONTO vive en businesses.settings.takeout_fee y lo aplica el
--     servidor: el POS solo manda la bandera `p_takeout`. Tope de 100 por si
--     los ajustes traen basura.
--   · tickets.takeout_fee es fotografía por venta (cambiar el ajuste no
--     reescribe ventas viejas) y entra en la consistencia del total:
--     total = subtotal − descuento + impuestos + para_llevar.
--   · Va DESPUÉS del descuento a propósito: el empaque no se descuenta.
--   · La firma de create_ticket CAMBIA (parámetros nuevos): se da de baja la
--     vieja para que PostgREST no vea dos sobrecargas.
--
-- ── Por qué este archivo trae la v12 y no la v11 ────────────────────
-- Esta migración y la 29 se aplicaron en producción por el conector, con
-- parches sobre pg_get_functiondef, y en el repo quedaron solo como notas.
-- La suite de pruebas (tests/sql) reproduce las migraciones desde cero y lo
-- detectó en su primera corrida: sin este SQL, el replay dejaba un
-- create_ticket sin `takeout_fee` ni `created_at` y la 36 no encontraba su
-- texto. La definición de abajo se rescató de la base viva —quitándole el
-- parche de la 36— y es exactamente la v12: la v11 (para llevar) más el
-- `p_captured_at` de la 29. Reconstruir la v11 sola sería inventar historia.

-- ── 1) La columna y la consistencia del total ──────────────────────
alter table public.tickets
  add column takeout_fee numeric(10,2) not null default 0
  constraint tickets_takeout_fee_check check (takeout_fee >= 0);

alter table public.tickets drop constraint if exists tickets_total_consistency;
alter table public.tickets
  add constraint tickets_total_consistency
  check (total = subtotal - discount_total + tax_total + takeout_fee);

-- ── 2) Baja de la firma anterior (v10, migración 26) ───────────────
drop function if exists public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean);

-- ── 3) create_ticket v12 ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_ticket(p_client_ref uuid, p_payment_method payment_method, p_items jsonb, p_notes text DEFAULT NULL::text, p_cash_received numeric DEFAULT NULL::numeric, p_discount jsonb DEFAULT NULL::jsonb, p_tip numeric DEFAULT 0, p_loyalty_customer uuid DEFAULT NULL::uuid, p_loyalty_redeem boolean DEFAULT false, p_takeout boolean DEFAULT false, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ctx record;
  v_biz uuid;
  v_existing jsonb;
  v_session_id uuid;
  v_input_count int;
  v_valid_count int;
  v_bad int;
  v_subtotal numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_discount_type text;
  v_discount_value numeric;
  v_discount_reason text;
  v_max_disc numeric;
  v_total numeric(10,2);
  v_tip numeric(10,2) := 0;
  v_due numeric(10,2);
  v_cash_received numeric(10,2);
  v_change_due numeric(10,2);
  v_ticket_id uuid;
  v_folio bigint;
  v_item_id uuid;
  v_qty int;
  v_unit numeric(10,2);
  v_loyalty public.loyalty_customers;
  v_loyalty_enabled boolean := false;
  v_loyalty_target int := 10;
  v_loyalty_delta int := 0;
  v_takeout numeric(10,2) := 0;
  v_created timestamptz := now();
  v_opened timestamptz;
  v_max_unit numeric(10,2);
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.is_template then
    raise exception 'Este negocio es una plantilla y no admite ventas.';
  end if;

  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'takeout_fee', t.takeout_fee, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
    'change_due', t.change_due, 'duplicate', true
  )
  into v_existing
  from public.tickets t
  where t.business_id = v_biz and t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_session_id from public.cash_sessions where business_id = v_biz and status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja antes de cobrar.';
  end if;

  if p_captured_at is not null then
    -- Venta capturada sin internet y subida después: vale la hora REAL de la
    -- venta, no la de la subida (si no, el reporte por horas y el día de
    -- operación mienten). Tres candados: nada del futuro, nada de hace más de
    -- 24 h, y nada anterior al turno abierto — una venta de un turno ya
    -- cerrado no puede colarse en el corte de este.
    v_created := p_captured_at;
    if v_created > now() + interval '2 minutes' then
      raise exception 'La hora de captura está en el futuro.';
    end if;
    if v_created < now() - interval '24 hours' then
      raise exception 'La venta es de hace más de 24 horas: regístrala a mano.';
    end if;
    select opened_at into v_opened from public.cash_sessions where id = v_session_id;
    if v_created < v_opened then
      raise exception 'Esta venta se capturó en un turno anterior que ya se cerró: regístrala a mano.';
    end if;
    if v_created > now() then v_created := now(); end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket debe incluir al menos un artículo.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados artículos en el ticket (máximo 50).';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e(elem)
    where coalesce(elem->>'quantity', '') !~ '^[0-9]+$'
       or (elem->>'quantity')::int < 1
       or (elem->>'quantity')::int > 99
  ) then
    raise exception 'Cantidad inválida en un artículo (debe ser un entero de 1 a 99).';
  end if;

  select count(*) into v_input_count from jsonb_array_elements(p_items);

  select count(*) into v_valid_count
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v
    on v.id = (elem->>'variant_id')::uuid and v.is_active and v.business_id = v_biz
  join public.menu_products p
    on p.id = v.product_id and p.is_active and p.business_id = v_biz;

  if v_valid_count <> v_input_count then
    raise exception 'Uno o más artículos no existen o están inactivos.';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
  ) as sm(mid)
  left join public.modifiers m on m.id = sm.mid::uuid and m.is_active and m.business_id = v_biz
  left join public.modifier_groups g on g.id = m.group_id and g.is_active and g.business_id = v_biz
  left join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  left join public.product_modifier_groups pmg
    on pmg.group_id = g.id and pmg.product_id = v.product_id and pmg.business_id = v_biz
  where m.id is null or g.id is null or pmg.product_id is null;
  if v_bad > 0 then
    raise exception 'Uno o más modificadores no existen o no aplican al producto.';
  end if;

  select count(*) into v_bad
  from (
    select idx, sm.mid
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    group by idx, sm.mid
    having count(*) > 1
  ) d;
  if v_bad > 0 then
    raise exception 'Modificador repetido en un artículo.';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  join public.product_modifier_groups pmg on pmg.product_id = v.product_id and pmg.business_id = v_biz
  join public.modifier_groups g on g.id = pmg.group_id and g.is_active and g.business_id = v_biz
  cross join lateral (
    select count(*) as cnt
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    where m.group_id = g.id
  ) c
  where c.cnt < greatest(g.min_select, case when g.is_required then 1 else 0 end)
     or (g.max_select is not null and c.cnt > g.max_select);
  if v_bad > 0 then
    raise exception 'Faltan o sobran opciones en un grupo de modificadores.';
  end if;

  select round(sum(round(v.price + coalesce(md.delta, 0), 2) * (elem->>'quantity')::int), 2)
  into v_subtotal
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  left join lateral (
    select sum(m.price_delta) as delta
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
  ) md on true;

  if coalesce(p_loyalty_redeem, false) and p_loyalty_customer is null then
    raise exception 'Falta el cliente de lealtad para canjear el premio.';
  end if;
  if p_loyalty_customer is not null then
    select coalesce(b.settings->>'loyalty', 'false') = 'true',
           greatest(2, least(30, coalesce((b.settings->>'loyalty_target')::int, 10)))
    into v_loyalty_enabled, v_loyalty_target
    from public.businesses b where b.id = v_biz;
    if not v_loyalty_enabled then
      raise exception 'El módulo de lealtad está apagado en este negocio.';
    end if;

    select * into v_loyalty from public.loyalty_customers
    where id = p_loyalty_customer and business_id = v_biz
    for update;
    if not found then
      raise exception 'Cliente de lealtad no encontrado.';
    end if;

    if coalesce(p_loyalty_redeem, false) then
      if v_loyalty.stamps < v_loyalty_target then
        raise exception 'Este cliente lleva % de % sellos: aún no hay premio que canjear.',
          v_loyalty.stamps, v_loyalty_target;
      end if;
      if p_discount is null then
        raise exception 'El canje del premio va como descuento del artículo gratis: falta el descuento.';
      end if;
      v_loyalty_delta := -v_loyalty_target;
    else
      v_loyalty_delta := 1;
    end if;
  end if;

  if p_discount is not null and jsonb_typeof(p_discount) = 'object' then
    v_discount_type := p_discount->>'type';
    v_discount_reason := nullif(trim(coalesce(p_discount->>'reason', '')), '');
    begin
      v_discount_value := (p_discount->>'value')::numeric;
    exception when others then
      raise exception 'Monto de descuento inválido.';
    end;

    if v_discount_type not in ('percent', 'amount') then
      raise exception 'Tipo de descuento inválido.';
    end if;
    if v_discount_value is null or v_discount_value <= 0 then
      raise exception 'El descuento debe ser mayor a 0.';
    end if;
    if v_discount_reason is null then
      raise exception 'Indica el motivo del descuento.';
    end if;
    if length(v_discount_reason) > 200 then
      raise exception 'El motivo del descuento es demasiado largo (máximo 200 caracteres).';
    end if;

    if v_discount_type = 'percent' then
      if v_discount_value > 100 then
        raise exception 'El porcentaje de descuento no puede ser mayor a 100.';
      end if;
      v_discount := round(v_subtotal * v_discount_value / 100, 2);
    else
      v_discount := round(v_discount_value, 2);
    end if;

    if v_discount > v_subtotal then
      raise exception 'El descuento (%) no puede ser mayor que el subtotal (%).', v_discount, v_subtotal;
    end if;
    if v_discount = 0 then
      v_discount_reason := null;
    end if;

    if v_ctx.member_role = 'cajero' and not coalesce(p_loyalty_redeem, false) then
      select coalesce((b.settings->>'discount_max_cashier')::numeric, 100)
      into v_max_disc
      from businesses b where b.id = v_biz;
      if v_max_disc <= 0 then
        raise exception 'Los descuentos los aplica un administrador.';
      end if;
      if v_subtotal > 0 and (v_discount * 100 / v_subtotal) > v_max_disc + 0.001 then
        raise exception 'El descuento supera el máximo permitido en caja (% %%).', round(v_max_disc, 2);
      end if;
    end if;
  end if;

  if p_loyalty_customer is not null and coalesce(p_loyalty_redeem, false) then
    if v_discount_type is distinct from 'amount' or v_discount <= 0 then
      raise exception 'El premio de lealtad se canjea como descuento de monto fijo.';
    end if;
    if v_discount_reason is distinct from 'Premio de lealtad' then
      raise exception 'El motivo del descuento de canje debe ser «Premio de lealtad».';
    end if;
    select max(round(v.price + coalesce(md.delta, 0), 2)) into v_max_unit
    from jsonb_array_elements(p_items) as e(elem)
    join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
    left join lateral (
      select sum(m.price_delta) as delta
      from jsonb_array_elements_text(
        case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
      ) as sm(mid)
      join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    ) md on true;
    if v_discount > v_max_unit + 0.001 then
      raise exception 'El premio (%) no puede valer más que el artículo más caro del ticket (%).',
        v_discount, v_max_unit;
    end if;
  end if;

  v_total := v_subtotal - v_discount;

  if p_takeout then
    -- Cargo por «Para llevar»: el MONTO lo dictan los ajustes del negocio,
    -- nunca el cliente — el POS solo manda la bandera. Tope de 100 por si
    -- los ajustes traen basura. Va después del descuento a propósito: el
    -- cargo del empaque no se descuenta.
    select least(greatest(coalesce((b.settings->>'takeout_fee')::numeric, 0), 0), 100)
      into v_takeout
    from public.businesses b where b.id = v_biz;
    v_takeout := round(coalesce(v_takeout, 0), 2);
    v_total := v_total + v_takeout;
  end if;

  if p_tip is not null then
    v_tip := round(p_tip, 2);
    if v_tip < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;
    if v_tip > greatest(v_total, 0) * 2 + 1000 then
      raise exception 'La propina es demasiado alta para este ticket.';
    end if;
  end if;

  v_due := v_total + v_tip;

  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_cash_received := round(p_cash_received, 2);
    if v_cash_received < v_due then
      raise exception 'El efectivo recibido (%) es menor que el total a pagar (%).', v_cash_received, v_due;
    end if;
    v_change_due := round(v_cash_received - v_due, 2);
  end if;

  update public.business_counters
  set next_folio = next_folio + 1
  where business_id = v_biz
  returning next_folio - 1 into v_folio;
  if v_folio is null then
    raise exception 'Falta el contador de folios del negocio.';
  end if;

  insert into public.tickets
    (business_id, folio, cashier_id, session_id, payment_method, subtotal, discount_total, discount_reason, total,
     tip_amount, notes, client_ref, cash_received, change_due, loyalty_customer_id, loyalty_delta, takeout_fee, created_at)
  values (
    v_biz, v_folio, v_ctx.user_id, v_session_id, p_payment_method, v_subtotal, v_discount, v_discount_reason, v_total,
    v_tip, nullif(trim(coalesce(p_notes, '')), ''), p_client_ref, v_cash_received, v_change_due,
    p_loyalty_customer, v_loyalty_delta, v_takeout, v_created
  )
  returning id into v_ticket_id;

  for r in
    select
      e.elem,
      e.idx,
      v.id as variant_id,
      v.price,
      v.cost,
      v.name as variant_name,
      v.size_label,
      p.id as product_id,
      p.name as product_name,
      case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end as mods,
      coalesce((
        select sum(m.price_delta)
        from jsonb_array_elements_text(
          case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
        ) as sm(mid)
        join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
      ), 0) as delta
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
    join public.menu_variants v on v.id = (e.elem->>'variant_id')::uuid and v.business_id = v_biz
    join public.menu_products p on p.id = v.product_id and p.business_id = v_biz
    order by e.idx
  loop
    v_qty := (r.elem->>'quantity')::int;
    v_unit := round(r.price + r.delta, 2);

    insert into public.ticket_items
      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,
       product_name, variant_name, size_label, unit_cost)
    values (
      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, round(v_unit * v_qty, 2),
      nullif(trim(coalesce(r.elem->>'notes', '')), ''),
      r.product_name, r.variant_name, r.size_label, r.cost
    )
    returning id into v_item_id;

    insert into public.ticket_item_modifiers (business_id, ticket_item_id, modifier_id, modifier_name, modifier_price)
    select v_biz, v_item_id, m.id, m.name, m.price_delta
    from jsonb_array_elements_text(r.mods) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    order by m.sort_order, m.name;
  end loop;

  if p_loyalty_customer is not null then
    update public.loyalty_customers
    set stamps = stamps + v_loyalty_delta,
        visits = visits + 1,
        rewards_redeemed = rewards_redeemed + case when coalesce(p_loyalty_redeem, false) then 1 else 0 end,
        last_visit_at = now()
    where id = p_loyalty_customer;
  end if;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'folio', v_folio,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'total', v_total,
    'takeout_fee', v_takeout,
    'tip_amount', v_tip,
    'cash_received', v_cash_received,
    'change_due', v_change_due,
    'loyalty', case when p_loyalty_customer is null then null else jsonb_build_object(
      'customer_id', v_loyalty.id,
      'name', v_loyalty.name,
      'phone', v_loyalty.phone,
      'stamps', v_loyalty.stamps + v_loyalty_delta,
      'target', v_loyalty_target,
      'redeemed', coalesce(p_loyalty_redeem, false)
    ) end
  );

exception
  when unique_violation then
    select jsonb_build_object(
      'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
      'total', t.total, 'takeout_fee', t.takeout_fee, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
      'change_due', t.change_due, 'duplicate', true
    )
    into v_existing
    from public.tickets t
    where t.business_id = v_biz and t.client_ref = p_client_ref;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$function$;

revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean, timestamptz) to authenticated;
