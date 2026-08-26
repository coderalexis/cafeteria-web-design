-- 15_p3_resumen.sql — P3b: resumen semanal por correo (nombre de migración: p3_weekly_summary).
--
-- weekly_summary(p_business_id, p_from, p_to): agregado de UNA semana para el
-- correo del lunes. La llama el cron (ruta /api/resumen-semanal con service
-- role) y el botón de /super; corre SIN sesión de usuario, por eso recibe el
-- negocio por parámetro en lugar de usar member_ctx(), y por eso SOLO
-- service_role puede ejecutarla.
--
-- La propina no es venta: revenue es la venta y tips_total va aparte (igual
-- que en sales_report / sales_insights).

create or replace function public.weekly_summary(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_pstart timestamptz;
  v_result jsonb;
begin
  select id, name, slug, timezone into v_biz
  from businesses where id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado.';
  end if;
  if p_to < p_from or p_to - p_from > 31 then
    raise exception 'Rango inválido.';
  end if;

  v_tz := v_biz.timezone;
  v_start := (p_from::timestamp) at time zone v_tz;
  v_end := ((p_to + 1)::timestamp) at time zone v_tz;
  v_pstart := ((p_from - (p_to - p_from + 1))::timestamp) at time zone v_tz;

  with cur as (
    select t.id, t.cashier_id, t.total, t.tip_amount, t.discount_total, t.created_at
    from tickets t
    where t.business_id = p_business_id and t.status = 'completado'
      and t.created_at >= v_start and t.created_at < v_end
  ),
  cancelled as (
    select count(*) as n, coalesce(sum(t.total), 0) as amount
    from tickets t
    where t.business_id = p_business_id and t.status = 'cancelado'
      and t.created_at >= v_start and t.created_at < v_end
  ),
  prev as (
    select count(*) as tickets, coalesce(sum(t.total), 0) as revenue
    from tickets t
    where t.business_id = p_business_id and t.status = 'completado'
      and t.created_at >= v_pstart and t.created_at < v_start
  ),
  items as (
    select ti.product_name, ti.variant_name, ti.size_label, ti.quantity, ti.line_total
    from ticket_items ti
    join cur on cur.id = ti.ticket_id
  )
  select jsonb_build_object(
    'business', jsonb_build_object('id', v_biz.id, 'name', v_biz.name, 'slug', v_biz.slug, 'timezone', v_tz),
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'tickets', (select count(*) from cur),
      'revenue', (select coalesce(sum(total), 0) from cur),
      'tips_total', (select coalesce(sum(tip_amount), 0) from cur),
      'discount_total', (select coalesce(sum(discount_total), 0) from cur),
      'items_sold', (select coalesce(sum(quantity), 0) from items),
      'avg_ticket', (select coalesce(round(avg(total), 2), 0) from cur),
      'cancelled_count', (select n from cancelled),
      'cancelled_amount', (select amount from cancelled)
    ),
    'previous', jsonb_build_object(
      'tickets', (select tickets from prev),
      'revenue', (select revenue from prev)
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'tickets', d.tickets, 'revenue', d.revenue) order by d.day), '[]'::jsonb)
      from (
        select business_day(created_at, v_tz) as day, count(*) as tickets, sum(total) as revenue
        from cur group by 1
      ) d
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', p.product_name, 'variant_name', p.variant_name,
        'size_label', p.size_label, 'qty', p.qty, 'revenue', p.revenue
      ) order by p.qty desc), '[]'::jsonb)
      from (
        select product_name, variant_name, size_label, sum(quantity) as qty, sum(line_total) as revenue
        from items group by 1, 2, 3 order by qty desc limit 5
      ) p
    ),
    'by_cashier', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.name, 'tickets', c.tickets, 'revenue', c.revenue, 'tips', c.tips
      ) order by c.revenue desc), '[]'::jsonb)
      from (
        select coalesce(pr.full_name, m.username, 'Desconocido') as name,
               count(*) as tickets, sum(cur.total) as revenue, sum(cur.tip_amount) as tips
        from cur
        left join business_members m on m.business_id = p_business_id and m.user_id = cur.cashier_id
        left join profiles pr on pr.id = cur.cashier_id
        group by 1
      ) c
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.weekly_summary(uuid, date, date) from public, anon, authenticated;
grant execute on function public.weekly_summary(uuid, date, date) to service_role;
