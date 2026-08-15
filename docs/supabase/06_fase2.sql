-- ============================================================
-- Fase 2 — Reportes: agregación de ventas en SQL con día de
-- operación en America/Mexico_City. Aplicar después de 05_fase1.sql.
-- ============================================================

-- Rango de días de operación [p_from, p_to] (inclusive), opcionalmente
-- filtrado por cajero y método de pago. Solo admin.
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
  v_role public.app_role;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'admin' then
    raise exception 'Solo un administrador puede ver reportes.';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'El rango máximo es de un año.';
  end if;

  -- Límites UTC del rango de días CDMX (usa el índice de created_at).
  v_start := p_from::timestamp at time zone 'America/Mexico_City';
  v_end := (p_to + 1)::timestamp at time zone 'America/Mexico_City';

  with base as (
    select t.id, t.cashier_id, t.payment_method, t.total, t.discount_total, t.status, t.created_at
    from public.tickets t
    where t.created_at >= v_start
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
    'totals', (
      select jsonb_build_object(
        'tickets', (select count(*) from ok),
        'revenue', (select coalesce(sum(total), 0) from ok),
        'avg_ticket', (select round(coalesce(avg(total), 0), 2) from ok),
        'discount_total', (select coalesce(sum(discount_total), 0) from ok),
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
        select public.business_day(created_at) as day, count(*) as tickets, sum(total) as revenue
        from ok group by 1
      ) x on x.day = d.day
    ),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'tickets', h.tickets, 'revenue', h.revenue) order by h.hour), '[]'::jsonb)
      from (
        select extract(hour from created_at at time zone 'America/Mexico_City')::int as hour, count(*) as tickets, sum(total) as revenue
        from ok group by 1
      ) h
    ),
    'by_cashier', (
      select coalesce(jsonb_agg(jsonb_build_object('cashier_id', c.cashier_id, 'name', c.name, 'tickets', c.tickets, 'revenue', c.revenue) order by c.revenue desc), '[]'::jsonb)
      from (
        select ok.cashier_id, coalesce(p.full_name, p.username, 'Desconocido') as name, count(*) as tickets, sum(ok.total) as revenue
        from ok left join public.profiles p on p.id = ok.cashier_id
        group by ok.cashier_id, p.full_name, p.username
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

revoke execute on function public.sales_report(date, date, uuid, public.payment_method) from public, anon;
grant execute on function public.sales_report(date, date, uuid, public.payment_method) to authenticated;
