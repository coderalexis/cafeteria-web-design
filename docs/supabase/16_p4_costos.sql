-- 16_p4_costos.sql — P4: costo por variante y margen (migración: p4_costo_margen).
--
-- El sistema ya sabía cuánto VENDES; ahora sabe cuánto GANAS. Dos piezas:
--   1. menu_variants.cost — cuánto te cuesta preparar esa variante.
--   2. ticket_items.unit_cost — FOTOGRAFÍA del costo al momento de la venta,
--      igual que unit_price y los nombres de producto. Sin esto, subir el
--      costo de la leche en marzo cambiaría el margen de enero.
--
-- create_ticket pasa a v7 (misma firma, conserva grants) y se agrega el RPC
-- margin_report(p_from, p_to) para owner|admin, en la zona del negocio.
--
-- Las variantes existentes quedan en costo 0: el margen se ve inflado hasta
-- que se capturen los costos, y por eso el reporte cuenta explícitamente
-- cuántas piezas se vendieron sin costo capturado.

alter table public.menu_variants
  add column cost numeric(10,2) not null default 0 check (cost >= 0);

alter table public.ticket_items
  add column unit_cost numeric(10,2) not null default 0 check (unit_cost >= 0);
-- v7 (P4): además del precio y los nombres, fotografía el COSTO de la variante
-- en unit_cost. Sin snapshot, subir el costo de la leche cambiaría el margen de
-- meses ya cerrados.
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

-- ── Reporte de margen: qué deja cada producto, no solo qué vende ───
-- Usa el costo fotografiado en ticket_items.unit_cost, así que el margen de un
-- periodo pasado no cambia aunque hoy suba el costo de un insumo.
create or replace function public.margin_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_ctx record;
  v_biz uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo el dueño o un administrador puede ver el margen.';
  end if;
  v_biz := v_ctx.business_id;
  v_tz := v_ctx.timezone;

  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'Rango inválido.';
  end if;
  v_start := (p_from::timestamp) at time zone v_tz;
  v_end := ((p_to + 1)::timestamp) at time zone v_tz;

  with base as (
    select ti.product_name, ti.variant_name, ti.size_label,
           ti.quantity, ti.line_total,
           ti.unit_cost * ti.quantity as cost_total,
           ti.unit_cost
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id and t.status = 'completado'
    where ti.business_id = v_biz
      and t.created_at >= v_start and t.created_at < v_end
  ),
  agg as (
    select product_name, variant_name, size_label,
           sum(quantity)::bigint as qty,
           sum(line_total) as revenue,
           sum(cost_total) as cost,
           sum(line_total) - sum(cost_total) as margin,
           max(unit_cost) as unit_cost
    from base
    group by 1, 2, 3
  ),
  tot as (
    select coalesce(sum(revenue), 0) as revenue,
           coalesce(sum(cost), 0) as cost,
           coalesce(sum(margin), 0) as margin,
           coalesce(sum(qty), 0) as items
    from agg
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totals', jsonb_build_object(
      'revenue', (select revenue from tot),
      'cost', (select cost from tot),
      'margin', (select margin from tot),
      'items_sold', (select items from tot),
      'margin_pct', case when (select revenue from tot) > 0
                         then round(100 * (select margin from tot) / (select revenue from tot), 1)
                         else 0 end,
      'sold_without_cost', (select coalesce(sum(qty), 0) from agg where unit_cost = 0)
    ),
    'by_product', (
      select coalesce(jsonb_agg(x order by x_margin desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'product_name', product_name, 'variant_name', variant_name, 'size_label', size_label,
                 'qty', qty, 'revenue', revenue, 'cost', cost, 'margin', margin,
                 'margin_pct', case when revenue > 0 then round(100 * margin / revenue, 1) else 0 end,
                 'unit_cost', unit_cost
               ) as x,
               margin as x_margin
        from agg
        order by margin desc
        limit 12
      ) t1
    ),
    'losers', (
      select coalesce(jsonb_agg(x order by x_pct asc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'product_name', product_name, 'variant_name', variant_name, 'size_label', size_label,
                 'qty', qty, 'revenue', revenue, 'margin', margin,
                 'margin_pct', round(100 * margin / revenue, 1)
               ) as x,
               round(100 * margin / revenue, 1) as x_pct
        from agg
        where revenue > 0 and unit_cost > 0 and (100 * margin / revenue) < 40
        order by (100 * margin / revenue) asc
        limit 8
      ) t2
    ),
    'missing_cost', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'product_name', p.name, 'variant_name', v.name, 'price', v.price
             ) order by p.sort_order, v.sort_order), '[]'::jsonb)
      from public.menu_variants v
      join public.menu_products p on p.id = v.product_id and p.business_id = v_biz
      where v.business_id = v_biz and v.is_active and p.is_active and v.cost = 0
    ),
    'priced_count', (
      select count(*) from public.menu_variants v
      join public.menu_products p on p.id = v.product_id and p.business_id = v_biz
      where v.business_id = v_biz and v.is_active and p.is_active
    )
  ) into v_result;

  return v_result;
end;
$fn$;
revoke execute on function public.margin_report(date, date) from public, anon;
grant execute on function public.margin_report(date, date) to authenticated;
