-- ============================================================
-- 14 — P2 (POS): propinas por ticket y color por categoría.
--
-- Las propinas NO son ingreso del negocio: `tickets.total` sigue siendo la
-- venta y `tip_amount` va aparte. Lo que sí cambia es el efectivo esperado en
-- caja (una propina en efectivo entra al cajón) y los reportes, que las
-- muestran como columna propia.
--
-- `create_ticket` cambia de firma (nuevo `p_tip`): se elimina la firma vieja y
-- se recrea con el parámetro al final con default 0, así el código desplegado
-- (que llama con los 6 parámetros nombrados) sigue funcionando hasta el deploy.
-- ============================================================

-- ── Propina por ticket ──────────────────────────────────────
alter table public.tickets
  add column tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0);

-- ── Color por categoría (paleta cerrada; la UI la mapea a clases) ──
alter table public.menu_categories
  add column color text check (color in (
    'amber', 'orange', 'rose', 'pink', 'violet', 'indigo', 'sky', 'teal', 'emerald', 'lime', 'stone'
  ));

-- ── create_ticket v5 ────────────────────────────────────────
drop function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric, jsonb);

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
       product_name, variant_name, size_label)
    values (
      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, round(v_unit * v_qty, 2),
      nullif(trim(coalesce(r.elem->>'notes', '')), ''),
      r.product_name, r.variant_name, r.size_label
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

-- ── Corte: la propina en efectivo entra al cajón ────────────
create or replace function public.close_cash_session(
  p_counted_cash numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_session public.cash_sessions;
  v_cash_sales numeric(10,2);
  v_cash_tips numeric(10,2);
  v_in numeric(10,2);
  v_out numeric(10,2);
  v_expected numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'El efectivo contado debe ser un monto mayor o igual a 0.';
  end if;

  select * into v_session from public.cash_sessions
  where business_id = v_biz and status = 'abierta' for update;
  if not found then
    raise exception 'No hay una caja abierta.';
  end if;

  select coalesce(sum(total), 0), coalesce(sum(tip_amount), 0)
  into v_cash_sales, v_cash_tips
  from public.tickets
  where session_id = v_session.id and status = 'completado' and payment_method = 'efectivo';

  select
    coalesce(sum(amount) filter (where kind = 'entrada'), 0),
    coalesce(sum(amount) filter (where kind = 'salida'), 0)
  into v_in, v_out
  from public.cash_movements
  where session_id = v_session.id;

  v_expected := round(v_session.opening_float + v_cash_sales + v_cash_tips + v_in - v_out, 2);

  update public.cash_sessions
  set status = 'cerrada',
      closed_by = v_ctx.user_id,
      closed_at = now(),
      expected_cash = v_expected,
      counted_cash = round(p_counted_cash, 2),
      difference = round(p_counted_cash - v_expected, 2),
      closing_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = v_session.id;

  return public.cash_session_summary(v_session.id);
end;
$$;

-- ── Resumen de corte con propinas ───────────────────────────
create or replace function public.cash_session_summary(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'opened_at', s.opened_at,
    'closed_at', s.closed_at,
    'opened_by', coalesce(po.full_name, mo.username, ''),
    'closed_by', coalesce(pc.full_name, mc.username),
    'opening_float', s.opening_float,
    'opening_notes', s.opening_notes,
    'closing_notes', s.closing_notes,
    'expected_cash', s.expected_cash,
    'counted_cash', s.counted_cash,
    'difference', s.difference,
    'tickets_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'revenue', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'discount_total', (select coalesce(sum(t.discount_total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'cash_sales', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'tips_total', (select coalesce(sum(t.tip_amount), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'cash_tips', (select coalesce(sum(t.tip_amount), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'cancelled_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'cancelled_amount', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'movements_in', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'entrada'),
    'movements_out', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'salida'),
    'movements', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'amount', m.amount, 'reason', m.reason,
          'created_at', m.created_at,
          'created_by', coalesce(pm.full_name, mm.username, '')
        ) order by m.created_at),
        '[]'::jsonb
      )
      from public.cash_movements m
      left join public.profiles pm on pm.id = m.created_by
      left join public.business_members mm on mm.user_id = m.created_by and mm.business_id = s.business_id
      where m.session_id = s.id
    ),
    'by_method', (
      select coalesce(
        jsonb_agg(jsonb_build_object('method', m.method, 'tickets', m.tickets, 'revenue', m.revenue) order by m.method),
        '[]'::jsonb
      )
      from (
        select t.payment_method::text as method, count(*) as tickets, sum(t.total) as revenue
        from public.tickets t
        where t.session_id = s.id and t.status = 'completado'
        group by t.payment_method
      ) m
    )
  )
  from public.cash_sessions s
  left join public.profiles po on po.id = s.opened_by
  left join public.business_members mo on mo.user_id = s.opened_by and mo.business_id = s.business_id
  left join public.profiles pc on pc.id = s.closed_by
  left join public.business_members mc on mc.user_id = s.closed_by and mc.business_id = s.business_id
  where s.id = p_session_id
    and s.business_id = (select public.current_business_id())
$$;

-- ── Reporte de ventas con propinas ──────────────────────────
create or replace function public.sales_report(
  p_from date,
  p_to date,
  p_cashier uuid default null,
  p_method public.payment_method default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede ver reportes.';
  end if;
  v_biz := v_ctx.business_id;
  v_tz := v_ctx.timezone;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'El rango máximo es de un año.';
  end if;

  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  with base as (
    select t.id, t.cashier_id, t.payment_method, t.total, t.discount_total, t.tip_amount, t.status, t.created_at
    from public.tickets t
    where t.business_id = v_biz
      and t.created_at >= v_start
      and t.created_at < v_end
      and (p_cashier is null or t.cashier_id = p_cashier)
      and (p_method is null or t.payment_method = p_method)
  ),
  ok as (
    select * from base where status = 'completado'
  ),
  ok_items as (
    select ti.product_name, ti.variant_name, ti.size_label, ti.quantity, ti.line_total
    from public.ticket_items ti
    join ok on ok.id = ti.ticket_id
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'timezone', v_tz,
    'totals', (
      select jsonb_build_object(
        'tickets', (select count(*) from ok),
        'revenue', (select coalesce(sum(total), 0) from ok),
        'avg_ticket', (select round(coalesce(avg(total), 0), 2) from ok),
        'discount_total', (select coalesce(sum(discount_total), 0) from ok),
        'tips_total', (select coalesce(sum(tip_amount), 0) from ok),
        'items_sold', (select coalesce(sum(quantity), 0) from ok_items),
        'cancelled_count', (select count(*) from base where status = 'cancelado'),
        'cancelled_amount', (select coalesce(sum(total), 0) from base where status = 'cancelado')
      )
    ),
    'by_method', (
      select coalesce(jsonb_agg(jsonb_build_object('method', m.method, 'tickets', m.tickets, 'revenue', m.revenue) order by m.method), '[]'::jsonb)
      from (
        select payment_method::text as method, count(*) as tickets, sum(total) as revenue
        from ok group by payment_method
      ) m
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'tickets', coalesce(x.tickets, 0), 'revenue', coalesce(x.revenue, 0)) order by d.day), '[]'::jsonb)
      from generate_series(p_from, p_to, interval '1 day') as g(ts)
      cross join lateral (select g.ts::date as day) d
      left join (
        select public.business_day(created_at, v_tz) as day, count(*) as tickets, sum(total) as revenue
        from ok group by 1
      ) x on x.day = d.day
    ),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'tickets', h.tickets, 'revenue', h.revenue) order by h.hour), '[]'::jsonb)
      from (
        select extract(hour from created_at at time zone v_tz)::int as hour, count(*) as tickets, sum(total) as revenue
        from ok group by 1
      ) h
    ),
    'by_cashier', (
      select coalesce(jsonb_agg(jsonb_build_object('cashier_id', c.cashier_id, 'name', c.name, 'tickets', c.tickets, 'revenue', c.revenue, 'tips', c.tips) order by c.revenue desc), '[]'::jsonb)
      from (
        select ok.cashier_id,
               coalesce(nullif(p.full_name, ''), m.username, 'Desconocido') as name,
               count(*) as tickets, sum(ok.total) as revenue, sum(ok.tip_amount) as tips
        from ok
        left join public.profiles p on p.id = ok.cashier_id
        left join public.business_members m on m.user_id = ok.cashier_id and m.business_id = v_biz
        group by ok.cashier_id, p.full_name, m.username
      ) c
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_name', t.product_name, 'variant_name', t.variant_name, 'size_label', t.size_label, 'qty', t.qty, 'revenue', t.revenue) order by t.qty desc, t.revenue desc), '[]'::jsonb)
      from (
        select product_name, variant_name, size_label, sum(quantity) as qty, sum(line_total) as revenue
        from ok_items
        group by product_name, variant_name, size_label
        order by qty desc, revenue desc
        limit 10
      ) t
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ── Análisis con propinas (totales y por cajero) ────────────
create or replace function public.sales_insights(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_tz text;
  v_days int;
  v_prev_from date;
  v_prev_to date;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede ver reportes.';
  end if;
  v_biz := v_ctx.business_id;
  v_tz := v_ctx.timezone;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'El rango máximo es de un año.';
  end if;

  v_days := p_to - p_from + 1;
  v_prev_to := p_from - 1;
  v_prev_from := p_from - v_days;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;
  v_prev_start := v_prev_from::timestamp at time zone v_tz;

  with cur as (
    select t.id, t.cashier_id, t.cancelled_by, t.status, t.total, t.discount_total, t.tip_amount, t.discount_reason,
           t.cancel_reason, t.created_at, (t.created_at at time zone v_tz) as local_ts
    from public.tickets t
    where t.business_id = v_biz and t.created_at >= v_start and t.created_at < v_end
  ),
  prev as (
    select t.id, t.status, t.total, t.discount_total, t.tip_amount
    from public.tickets t
    where t.business_id = v_biz and t.created_at >= v_prev_start and t.created_at < v_start
  ),
  cur_ok as (select * from cur where status = 'completado'),
  prev_ok as (select * from prev where status = 'completado'),
  cur_items as (
    select ti.id, ti.ticket_id, ti.product_id, ti.product_name, ti.quantity, ti.line_total, c.cashier_id
    from public.ticket_items ti
    join cur_ok c on c.id = ti.ticket_id
  ),
  prev_items as (
    select ti.quantity from public.ticket_items ti join prev_ok c on c.id = ti.ticket_id
  ),
  members as (
    select m.user_id, coalesce(nullif(p.full_name, ''), m.username, 'Desconocido') as name
    from public.business_members m
    left join public.profiles p on p.id = m.user_id
    where m.business_id = v_biz
  ),
  weekdays as (
    select extract(isodow from d)::int as dow, count(*)::int as days
    from generate_series(p_from, p_to, interval '1 day') as d
    group by 1
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', v_days,
    'prev_from', v_prev_from,
    'prev_to', v_prev_to,
    'timezone', v_tz,
    'current', (
      select jsonb_build_object(
        'tickets', (select count(*) from cur_ok),
        'revenue', (select coalesce(sum(total), 0) from cur_ok),
        'avg_ticket', (select round(coalesce(avg(total), 0), 2) from cur_ok),
        'items_sold', (select coalesce(sum(quantity), 0) from cur_items),
        'discount_total', (select coalesce(sum(discount_total), 0) from cur_ok),
        'tips_total', (select coalesce(sum(tip_amount), 0) from cur_ok),
        'cancelled_count', (select count(*) from cur where status = 'cancelado'),
        'cancelled_amount', (select coalesce(sum(total), 0) from cur where status = 'cancelado')
      )
    ),
    'previous', (
      select jsonb_build_object(
        'tickets', (select count(*) from prev_ok),
        'revenue', (select coalesce(sum(total), 0) from prev_ok),
        'avg_ticket', (select round(coalesce(avg(total), 0), 2) from prev_ok),
        'items_sold', (select coalesce(sum(quantity), 0) from prev_items),
        'discount_total', (select coalesce(sum(discount_total), 0) from prev_ok),
        'tips_total', (select coalesce(sum(tip_amount), 0) from prev_ok),
        'cancelled_count', (select count(*) from prev where status = 'cancelado'),
        'cancelled_amount', (select coalesce(sum(total), 0) from prev where status = 'cancelado')
      )
    ),
    'by_weekday', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dow', w.dow, 'days', w.days,
        'tickets', coalesce(x.tickets, 0), 'revenue', coalesce(x.revenue, 0),
        'avg_revenue_per_day', round(coalesce(x.revenue, 0) / w.days, 2),
        'avg_tickets_per_day', round(coalesce(x.tickets, 0)::numeric / w.days, 1)
      ) order by w.dow), '[]'::jsonb)
      from weekdays w
      left join (
        select extract(isodow from local_ts)::int as dow, count(*) as tickets, sum(total) as revenue
        from cur_ok group by 1
      ) x on x.dow = w.dow
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', h.dow, 'hour', h.hour, 'tickets', h.tickets, 'revenue', h.revenue) order by h.dow, h.hour), '[]'::jsonb)
      from (
        select extract(isodow from local_ts)::int as dow, extract(hour from local_ts)::int as hour,
               count(*) as tickets, sum(total) as revenue
        from cur_ok group by 1, 2
      ) h
    ),
    'by_cashier', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'cashier_id', c.cashier_id, 'name', c.name,
        'tickets', c.tickets, 'revenue', c.revenue, 'avg_ticket', c.avg_ticket,
        'items_per_ticket', c.items_per_ticket, 'tips', c.tips,
        'discount_count', c.discount_count, 'discount_total', c.discount_total,
        'cancelled_count', c.cancelled_count, 'cancelled_amount', c.cancelled_amount
      ) order by c.revenue desc, c.name), '[]'::jsonb)
      from (
        select t.cashier_id,
               coalesce(m.name, 'Desconocido') as name,
               count(*) filter (where t.status = 'completado') as tickets,
               coalesce(sum(t.total) filter (where t.status = 'completado'), 0) as revenue,
               round(coalesce(avg(t.total) filter (where t.status = 'completado'), 0), 2) as avg_ticket,
               coalesce(sum(t.tip_amount) filter (where t.status = 'completado'), 0) as tips,
               round(coalesce((select sum(i.quantity) from cur_items i where i.cashier_id = t.cashier_id), 0)::numeric
                     / greatest(count(*) filter (where t.status = 'completado'), 1), 1) as items_per_ticket,
               count(*) filter (where t.status = 'completado' and t.discount_total > 0) as discount_count,
               coalesce(sum(t.discount_total) filter (where t.status = 'completado'), 0) as discount_total,
               count(*) filter (where t.status = 'cancelado') as cancelled_count,
               coalesce(sum(t.total) filter (where t.status = 'cancelado'), 0) as cancelled_amount
        from cur t
        left join members m on m.user_id = t.cashier_id
        group by t.cashier_id, m.name
      ) c
    ),
    'discounts', (
      select jsonb_build_object(
        'count', (select count(*) from cur_ok where discount_total > 0),
        'total', (select coalesce(sum(discount_total), 0) from cur_ok),
        'by_reason', (
          select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.cnt, 'amount', r.amount) order by r.amount desc, r.cnt desc), '[]'::jsonb)
          from (
            select coalesce(nullif(lower(trim(discount_reason)), ''), '(sin motivo)') as reason, count(*) as cnt, sum(discount_total) as amount
            from cur_ok where discount_total > 0 group by 1 order by 3 desc limit 10
          ) r
        ),
        'by_user', (
          select coalesce(jsonb_agg(jsonb_build_object('name', u.name, 'count', u.cnt, 'amount', u.amount) order by u.amount desc), '[]'::jsonb)
          from (
            select coalesce(m.name, 'Desconocido') as name, count(*) as cnt, sum(t.discount_total) as amount
            from cur_ok t left join members m on m.user_id = t.cashier_id
            where t.discount_total > 0 group by 1
          ) u
        )
      )
    ),
    'cancellations', (
      select jsonb_build_object(
        'count', (select count(*) from cur where status = 'cancelado'),
        'amount', (select coalesce(sum(total), 0) from cur where status = 'cancelado'),
        'by_reason', (
          select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.cnt, 'amount', r.amount) order by r.cnt desc, r.amount desc), '[]'::jsonb)
          from (
            select coalesce(nullif(lower(trim(cancel_reason)), ''), '(sin motivo)') as reason, count(*) as cnt, sum(total) as amount
            from cur where status = 'cancelado' group by 1 order by 2 desc limit 10
          ) r
        ),
        'by_user', (
          select coalesce(jsonb_agg(jsonb_build_object('name', u.name, 'count', u.cnt, 'amount', u.amount) order by u.cnt desc), '[]'::jsonb)
          from (
            select coalesce(m.name, 'Desconocido') as name, count(*) as cnt, sum(t.total) as amount
            from cur t left join members m on m.user_id = t.cancelled_by
            where t.status = 'cancelado' group by 1
          ) u
        )
      )
    ),
    'products', (
      select jsonb_build_object(
        'active_count', (select count(*) from public.menu_products p where p.business_id = v_biz and p.is_active),
        'without_sales_count', (
          select count(*) from public.menu_products p
          where p.business_id = v_biz and p.is_active
            and not exists (select 1 from cur_items i where i.product_id = p.id)
        ),
        'low_movement', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'product_id', s.id, 'name', s.name, 'category', s.category, 'qty', s.qty, 'last_sold_at', s.last_sold_at
          ) order by s.qty, s.last_sold_at nulls first, s.name), '[]'::jsonb)
          from (
            select p.id, p.name, c.name as category, coalesce(x.qty, 0) as qty, ls.last_sold_at
            from public.menu_products p
            join public.menu_categories c on c.id = p.category_id and c.business_id = v_biz
            left join (select i.product_id, sum(i.quantity) as qty from cur_items i group by 1) x on x.product_id = p.id
            left join (
              select ti.product_id, max(t.created_at) as last_sold_at
              from public.ticket_items ti
              join public.tickets t on t.id = ti.ticket_id and t.status = 'completado'
              where ti.business_id = v_biz
              group by 1
            ) ls on ls.product_id = p.id
            where p.business_id = v_biz and p.is_active
            order by coalesce(x.qty, 0), ls.last_sold_at nulls first, p.name
            limit 20
          ) s
        ),
        'top_modifiers', (
          select coalesce(jsonb_agg(jsonb_build_object('name', tm.name, 'times', tm.times, 'qty', tm.qty) order by tm.qty desc, tm.name), '[]'::jsonb)
          from (
            select m.modifier_name as name, count(*) as times, sum(i.quantity) as qty
            from public.ticket_item_modifiers m
            join cur_items i on i.id = m.ticket_item_id
            group by 1 order by 3 desc limit 10
          ) tm
        ),
        'combos', (
          select coalesce(jsonb_agg(jsonb_build_object('a', cb.a, 'b', cb.b, 'tickets', cb.tickets) order by cb.tickets desc, cb.a, cb.b), '[]'::jsonb)
          from (
            select a.product_name as a, b.product_name as b, count(distinct a.ticket_id) as tickets
            from cur_items a
            join cur_items b on b.ticket_id = a.ticket_id and a.product_name < b.product_name
            group by 1, 2
            having count(distinct a.ticket_id) >= 2
            order by 3 desc, 1, 2
            limit 10
          ) cb
        )
      )
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ── Más vendidos del negocio (para la fila de favoritos del POS) ──
-- Devuelve variantes por unidades vendidas en los últimos p_days días.
create or replace function public.top_variants(p_days int default 30, p_limit int default 8)
returns table (variant_id uuid, qty bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ti.variant_id, sum(ti.quantity)::bigint as qty
  from public.ticket_items ti
  join public.tickets t on t.id = ti.ticket_id and t.status = 'completado'
  join public.menu_variants v on v.id = ti.variant_id and v.is_active
  join public.menu_products p on p.id = v.product_id and p.is_active
  where ti.business_id = (select public.current_business_id())
    and t.created_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1))
    and ti.variant_id is not null
  group by ti.variant_id
  order by qty desc
  limit greatest(least(coalesce(p_limit, 8), 24), 1)
$$;
revoke execute on function public.top_variants(int, int) from public, anon;
grant execute on function public.top_variants(int, int) to authenticated;
