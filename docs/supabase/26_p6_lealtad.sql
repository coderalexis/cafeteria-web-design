-- 26_p6_lealtad.sql — P6: lealtad con sellos (migración: p6_lealtad).
--
-- La tarjetita de cartón («junta 10 y el 11.º va gratis»), pero sin cartón:
-- el cliente se identifica por su TELÉFONO (10 dígitos, lo que un cajero puede
-- pedir en caja sin frenar la fila) y los sellos viven en la base, compartidos
-- entre dispositivos.
--
-- Reglas de dinero, todas en el servidor:
--   · El sello se gana DENTRO de create_ticket, atómico con la venta: no hay
--     sellos sin ticket ni ticket con sello a medias.
--   · 1 sello por visita (ticket completado). La visita que canjea NO gana
--     sello — como en el cartón.
--   · El canje es un descuento de monto fijo sobre el ticket, validado aquí:
--     saldo suficiente (bajo candado de fila), monto ≤ el artículo más caro
--     del ticket (el premio es UNA bebida, no la cuenta), y motivo fijo
--     «Premio de lealtad». Ese descuento NO pasa por el techo de caja: lo
--     autorizan los sellos, no el criterio del cajero.
--   · Cancelar una venta revierte exactamente lo que movió: el ticket guarda
--     `loyalty_delta` (+1 sello, −N el canje) y cancel_ticket lo deshace.
--   · El saldo (`stamps`) no lo escribe ningún cliente: la tabla no tiene
--     políticas de escritura; todo pasa por RPCs.
--
-- El módulo se enciende por negocio (`settings.loyalty`, apagado por defecto:
-- guardar teléfonos de clientes es una decisión del dueño) con
-- `settings.loyalty_target` (sellos para premio, 2–30, default 10). Ninguna
-- de las dos llaves necesita grant nuevo: `settings` ya es editable por el
-- dueño (migración 09) y el techo real está en los RPCs.

-- ── 1) Clientes de lealtad ─────────────────────────────────────────
create table public.loyalty_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  phone text not null,
  name text not null default '',
  stamps int not null default 0 check (stamps >= 0),
  visits int not null default 0 check (visits >= 0),
  rewards_redeemed int not null default 0 check (rewards_redeemed >= 0),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

alter table public.loyalty_customers enable row level security;

-- Leer sí (el cajero busca al cliente en caja); escribir, nadie: solo RPCs.
create policy loyalty_customers_select on public.loyalty_customers
  for select to authenticated
  using (business_id = (select public.current_business_id()));

revoke all on table public.loyalty_customers from public, anon;
grant select on table public.loyalty_customers to authenticated;

-- ── 2) El ticket recuerda qué movió en la tarjeta ──────────────────
alter table public.tickets
  add column loyalty_customer_id uuid references public.loyalty_customers(id) on delete set null,
  add column loyalty_delta int not null default 0;

create index tickets_loyalty_idx on public.tickets (business_id, loyalty_customer_id)
  where loyalty_customer_id is not null;

-- ── 3) Buscar o registrar cliente (cualquier miembro activo) ───────
create or replace function public.loyalty_find_or_create(p_phone text, p_name text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_enabled boolean;
  v_phone text;
  v_name text;
  v_row public.loyalty_customers;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;

  select coalesce(b.settings->>'loyalty', 'false') = 'true'
  into v_enabled from public.businesses b where b.id = v_biz;
  if not v_enabled then
    raise exception 'El módulo de lealtad está apagado en este negocio.';
  end if;

  -- Solo dígitos; si escriben +52 o 52 delante, se quedan los últimos 10.
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) > 10 then
    v_phone := right(v_phone, 10);
  end if;
  if length(v_phone) <> 10 then
    raise exception 'Escribe un teléfono de 10 dígitos.';
  end if;

  v_name := left(trim(coalesce(p_name, '')), 60);

  insert into public.loyalty_customers as lc (business_id, phone, name)
  values (v_biz, v_phone, v_name)
  on conflict (business_id, phone) do update
    set name = case when nullif(excluded.name, '') is not null then excluded.name else lc.name end
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'phone', v_row.phone, 'name', v_row.name,
    'stamps', v_row.stamps, 'visits', v_row.visits,
    'rewards_redeemed', v_row.rewards_redeemed, 'last_visit_at', v_row.last_visit_at
  );
end;
$$;

revoke all on function public.loyalty_find_or_create(text, text) from public, anon;
grant execute on function public.loyalty_find_or_create(text, text) to authenticated;

-- ── 4) Ajuste manual (solo dueño/administrador; la app deja bitácora) ──
create or replace function public.loyalty_adjust(p_customer uuid, p_delta int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_row public.loyalty_customers;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un dueño o administrador puede ajustar sellos.';
  end if;
  if p_delta is null or p_delta = 0 or p_delta < -99 or p_delta > 99 then
    raise exception 'El ajuste debe ser un entero entre -99 y 99, distinto de 0.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Indica el motivo del ajuste.';
  end if;

  update public.loyalty_customers
  set stamps = greatest(0, stamps + p_delta)
  where id = p_customer and business_id = v_ctx.business_id
  returning * into v_row;
  if not found then
    raise exception 'Cliente de lealtad no encontrado.';
  end if;

  return jsonb_build_object('id', v_row.id, 'stamps', v_row.stamps);
end;
$$;

revoke all on function public.loyalty_adjust(uuid, int, text) from public, anon;
grant execute on function public.loyalty_adjust(uuid, int, text) to authenticated;

-- ── 5) create_ticket v10: sellos y canje, atómicos con la venta ────
-- Firma nueva (dos parámetros con default al final). En Postgres eso crea
-- una función NUEVA: al final se elimina la firma vieja para que PostgREST
-- no vea sobrecargas, y los grants se declaran de cero (no se heredan).
create or replace function public.create_ticket(
  p_client_ref uuid,
  p_payment_method payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null,
  p_tip numeric default 0,
  p_loyalty_customer uuid default null,
  p_loyalty_redeem boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
    'total', t.total, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
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

  -- ── Lealtad: validar y APARTAR al cliente antes de cobrar ─────────
  -- El candado de fila (for update) serializa dos cajas cobrando al mismo
  -- cliente: sin él, dos canjes simultáneos gastarían los mismos sellos.
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

    -- Techo de descuento para caja. Va aquí y no solo en la pantalla porque
    -- el cliente es manipulable: quien cobra no debe poder regalar la venta.
    -- Dueños y administradores no tienen techo. El canje de lealtad tampoco
    -- pasa por él: lo autorizan los sellos (validados abajo con su propio
    -- tope: el artículo más caro), no el criterio del cajero.
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

  -- ── Lealtad: el canje solo puede valer UNA bebida ─────────────────
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
     tip_amount, notes, client_ref, cash_received, change_due, loyalty_customer_id, loyalty_delta)
  values (
    v_biz, v_folio, v_ctx.user_id, v_session_id, p_payment_method, v_subtotal, v_discount, v_discount_reason, v_total,
    v_tip, nullif(trim(coalesce(p_notes, '')), ''), p_client_ref, v_cash_received, v_change_due,
    p_loyalty_customer, v_loyalty_delta
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

  -- ── Lealtad: aplicar el movimiento con la venta ya escrita ────────
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
$function$;

-- La firma vieja (7 parámetros) se va: dos sobrecargas confundirían a
-- PostgREST y dejarían un camino sin las validaciones de lealtad.
drop function public.create_ticket(uuid, payment_method, jsonb, text, numeric, jsonb, numeric);

revoke all on function public.create_ticket(uuid, payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean) from public, anon;
grant execute on function public.create_ticket(uuid, payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean) to authenticated;

-- ── 6) cancel_ticket v2: cancelar devuelve lo que la tarjeta movió ─
-- Misma firma → create or replace conserva los grants de la migración 09.
create or replace function public.cancel_ticket(p_ticket_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ctx record;
  v_biz uuid;
  v_ticket public.tickets;
  v_session_status text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_reason is null then
    raise exception 'Indica el motivo de la cancelación.';
  end if;
  if length(v_reason) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select * into v_ticket from public.tickets
  where id = p_ticket_id and business_id = v_biz for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  if v_ticket.status = 'cancelado' then
    raise exception 'Este ticket ya estaba cancelado.';
  end if;

  if v_ctx.member_role not in ('owner', 'admin') then
    if v_ticket.cashier_id <> v_ctx.user_id then
      raise exception 'Solo puedes cancelar tus propias ventas.';
    end if;
    select status into v_session_status from public.cash_sessions where id = v_ticket.session_id;
    if v_session_status is distinct from 'abierta' then
      raise exception 'La caja de esta venta ya se cerró; pide a un administrador que la cancele.';
    end if;
  end if;

  update public.tickets
  set status = 'cancelado',
      cancelled_at = now(),
      cancelled_by = v_ctx.user_id,
      cancel_reason = v_reason
  where id = v_ticket.id;

  -- Revertir el movimiento de la tarjeta: un sello ganado se quita, un canje
  -- devuelve los sellos gastados. `greatest(0, …)` cubre el caso raro de
  -- cancelar un sello DESPUÉS de que ya se canjeó el premio que lo usaba:
  -- preferimos perdonar un sello a dejar un saldo negativo imposible.
  if v_ticket.loyalty_customer_id is not null and v_ticket.loyalty_delta <> 0 then
    update public.loyalty_customers
    set stamps = greatest(0, stamps - v_ticket.loyalty_delta),
        visits = greatest(0, visits - 1),
        rewards_redeemed = greatest(0, rewards_redeemed - case when v_ticket.loyalty_delta < 0 then 1 else 0 end)
    where id = v_ticket.loyalty_customer_id and business_id = v_biz;
  end if;

  return jsonb_build_object('ticket_id', v_ticket.id, 'folio', v_ticket.folio, 'status', 'cancelado');
end;
$function$;

-- ── 7) delete_business v3: la tabla nueva entra al borrado total ───
-- (aplicada como migración aparte `p6_lealtad_borrado`, descubierta al borrar
-- el fixture de verificación: `loyalty_customers` es `on delete restrict`,
-- así que borrar una cafetería con clientes de lealtad fallaba. Toda tabla
-- nueva con business_id DEBE entrar aquí — este es el recordatorio.)
-- Cambios sobre la v2 (migración 19): `delete from loyalty_customers` después
-- de tickets (que la referencian con set null) y antes de businesses, y el
-- conteo `clientes_lealtad` en el resumen que sobrevive en deleted_businesses.
