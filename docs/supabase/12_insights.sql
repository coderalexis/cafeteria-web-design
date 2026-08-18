-- ============================================================
-- 12 — Reportes 2: RPC sales_insights (análisis para /admin/analisis).
-- Comparativo contra el periodo anterior de la misma duración, ventas por
-- día de la semana, mapa de calor día×hora, métricas por cajero,
-- descuentos y cancelaciones (por motivo y por quién), productos sin
-- movimiento, modificadores más pedidos y combinaciones frecuentes.
-- Solo owner|admin del negocio activo; todo en la zona horaria del negocio.
-- ============================================================

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
    select t.id, t.cashier_id, t.cancelled_by, t.status, t.total, t.discount_total, t.discount_reason,
           t.cancel_reason, t.created_at, (t.created_at at time zone v_tz) as local_ts
    from public.tickets t
    where t.business_id = v_biz and t.created_at >= v_start and t.created_at < v_end
  ),
  prev as (
    select t.id, t.status, t.total, t.discount_total
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
        'items_per_ticket', c.items_per_ticket,
        'discount_count', c.discount_count, 'discount_total', c.discount_total,
        'cancelled_count', c.cancelled_count, 'cancelled_amount', c.cancelled_amount
      ) order by c.revenue desc, c.name), '[]'::jsonb)
      from (
        select t.cashier_id,
               coalesce(m.name, 'Desconocido') as name,
               count(*) filter (where t.status = 'completado') as tickets,
               coalesce(sum(t.total) filter (where t.status = 'completado'), 0) as revenue,
               round(coalesce(avg(t.total) filter (where t.status = 'completado'), 0), 2) as avg_ticket,
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

revoke execute on function public.sales_insights(date, date) from public, anon;
grant execute on function public.sales_insights(date, date) to authenticated;
