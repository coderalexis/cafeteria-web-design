-- 20_p5_descuento_por_rol.sql — P5: techo de descuento para caja
-- (migración: p5_descuento_por_rol).
--
-- Un cajero que puede descontar sin límite es la fuga de dinero más común en
-- una cafetería. El techo vive en settings.discount_max_cashier (porcentaje;
-- 0 = solo administradores, 100 = sin límite y es el valor por omisión, así
-- que nadie cambia de comportamiento al desplegar).
--
-- La validación va DENTRO de create_ticket y no solo en la pantalla: el POS
-- corre en el navegador del cajero y ahí cualquier tope es una sugerencia.
-- Dueños y administradores no tienen techo.
-- v9 (P5): respeta el techo de descuento de caja (settings.discount_max_cashier).
-- Sigue fotografiando el costo de la variante en unit_cost (v7).
create or replace function public.create_ticket(
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null,
  p_tip numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Idempotencia por negocio
  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
    'change_due', t.change_due, 'duplicate', true
  )
  into v_existing
  from public.tickets t
  where t.business_id = v_biz and t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Caja abierta DEL negocio
  select id into v_session_id from public.cash_sessions where business_id = v_biz and status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja antes de cobrar.';
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

  -- Toda variante debe existir, estar activa y pertenecer al negocio (y su producto también).
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

  -- Modificadores: existen, activos, en grupo activo ligado al producto, del mismo negocio.
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

  -- Subtotal con precios del servidor (variante + modificadores del negocio)
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

  -- Descuento por ticket
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

    -- Techo de descuento para caja. Va aquí y no solo en la pantalla porque
    -- el cliente es manipulable: quien cobra no debe poder regalar la venta.
    -- Dueños y administradores no tienen techo.
    if v_ctx.member_role = 'cajero' then
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

  v_total := v_subtotal - v_discount;

  -- Propina (no es ingreso del negocio; se guarda aparte)
  if p_tip is not null then
    v_tip := round(p_tip, 2);
    if v_tip < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;
    if v_tip > greatest(v_total, 0) * 2 + 1000 then
      raise exception 'La propina es demasiado alta para este ticket.';
    end if;
  end if;

  -- Lo que el cliente debe pagar = venta + propina
  v_due := v_total + v_tip;

  -- Efectivo recibido / cambio
  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_cash_received := round(p_cash_received, 2);
    if v_cash_received < v_due then
      raise exception 'El efectivo recibido (%) es menor que el total a pagar (%).', v_cash_received, v_due;
    end if;
    v_change_due := round(v_cash_received - v_due, 2);
  end if;

  -- Folio por negocio (bloquea la fila del contador hasta el commit; va después de validar todo)
  update public.business_counters
  set next_folio = next_folio + 1
  where business_id = v_biz
  returning next_folio - 1 into v_folio;
  if v_folio is null then
    raise exception 'Falta el contador de folios del negocio.';
  end if;

  insert into public.tickets
    (business_id, folio, cashier_id, session_id, payment_method, subtotal, discount_total, discount_reason, total,
     tip_amount, notes, client_ref, cash_received, change_due)
  values (
    v_biz, v_folio, v_ctx.user_id, v_session_id, p_payment_method, v_subtotal, v_discount, v_discount_reason, v_total,
    v_tip, nullif(trim(coalesce(p_notes, '')), ''), p_client_ref, v_cash_received, v_change_due
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

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'folio', v_folio,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'total', v_total,
    'tip_amount', v_tip,
    'cash_received', v_cash_received,
    'change_due', v_change_due
  );

exception
  when unique_violation then
    -- Carrera con el mismo client_ref del mismo negocio: gana el primero
    -- (la subtransacción revierte también el incremento del contador).
    select jsonb_build_object(
      'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
      'total', t.total, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
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
$$;
revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric) to authenticated;
