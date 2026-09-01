-- 35_p13_gastos.sql — P13: gastos del negocio, utilidad real y punto de equilibrio
-- (migración: p13_gastos)
--
-- El sistema ya sabía DOS TERCIOS de la cuenta que le importa al dueño:
-- cuánto entró (ingresos) y cuánto costó preparar lo que vendió
-- (ticket_items.unit_cost, fotografiado en la venta). Le faltaba el tercio
-- que decide si el negocio vive: la renta, los sueldos, la luz. Sin eso
-- podía decir «el frappé deja 62 %» pero nunca «este mes ganaste $8,400»,
-- que es la única pregunta que el dueño se hace de verdad.
--
-- Dos tablas, porque son dos cosas distintas en su cabeza:
--
--   · fixed_expenses — «cada mes pago lo mismo». Se capturan UNA vez y el
--     sistema las cuenta solo, mes con mes, sin volver a teclear nada. Es lo
--     que hace posible el punto de equilibrio.
--   · expenses — «este mes además compré una licuadora y le pagué al
--     proveedor». Un renglón por gasto, con su fecha.
--
-- Las dos son SECRETO DEL DUEÑO, hasta para leer. Un cajero no tiene por qué
-- enterarse de cuánto se paga de renta ni de cuánto gana el compañero, así
-- que las políticas exigen owner|admin también en SELECT — al revés que el
-- menú, que el cajero sí necesita leer.
--
-- Lo que NO va aquí es el costo de los insumos que ya se vendieron: eso sale
-- de ticket_items. Capturar la compra de leche como gasto Y cobrarla en el
-- costo del producto la contaría dos veces, y por eso el reporte separa
-- «costo de lo vendido» de «gastos del negocio».

-- ── 1) Gastos fijos: lo que se paga todos los meses ────────────────
create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 60),
  category text not null check (category in (
    'renta', 'sueldos', 'servicios', 'insumos',
    'mantenimiento', 'publicidad', 'impuestos', 'otros')),
  monthly_amount numeric(10,2) not null check (monthly_amount > 0 and monthly_amount <= 9999999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fixed_expenses is
  'Gastos que se repiten cada mes (renta, sueldos, luz). Se capturan una vez y el monto es SIEMPRE mensual, para que el dueño no tenga que convertir nada.';

create index fixed_expenses_biz_idx on public.fixed_expenses (business_id) where is_active;

-- ── 2) Gastos registrados: lo que pasó un día concreto ─────────────
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default public.current_business_id()
    references public.businesses(id) on delete restrict,
  spent_on date not null,
  category text not null check (category in (
    'renta', 'sueldos', 'servicios', 'insumos',
    'mantenimiento', 'publicidad', 'impuestos', 'otros')),
  description text not null check (length(trim(description)) between 2 and 120),
  amount numeric(10,2) not null check (amount > 0 and amount <= 9999999),
  -- Cómo se pagó. Texto propio y no el enum de las ventas: «tarjeta_clip» es
  -- la terminal con la que COBRA, no con la que paga.
  paid_with text check (paid_with in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  -- Si el gasto nació de una salida de caja queda amarrado a ella, para no
  -- capturarlo dos veces. Único: una salida se vuelve un solo gasto.
  cash_movement_id uuid unique references public.cash_movements(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.expenses is
  'Gastos con fecha (compras, reparaciones). Los que se repiten cada mes van en fixed_expenses; capturarlos aquí también los contaría dos veces.';

create index expenses_biz_fecha_idx on public.expenses (business_id, spent_on desc);

create trigger set_fixed_expenses_updated_at before update on public.fixed_expenses
  for each row execute function public.set_updated_at();
create trigger set_expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ── 3) RLS: owner|admin, incluso para leer ─────────────────────────
alter table public.fixed_expenses enable row level security;
alter table public.expenses enable row level security;

do $pol$
declare t text;
begin
  foreach t in array array['fixed_expenses', 'expenses'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using '
      '(business_id = (select public.current_business_id()) '
      ' and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_select_admin', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check '
      '(business_id = (select public.current_business_id()) '
      ' and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_insert_admin', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using '
      '(business_id = (select public.current_business_id()) '
      ' and (select public.current_member_role()) in (''owner'',''admin'')) with check '
      '(business_id = (select public.current_business_id()) '
      ' and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_update_admin', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using '
      '(business_id = (select public.current_business_id()) '
      ' and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_delete_admin', t);
  end loop;
end;
$pol$;

revoke all on table public.fixed_expenses from public, anon;
revoke all on table public.expenses from public, anon;
grant select, insert, update, delete on table public.fixed_expenses to authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;

-- ── 4) profit_report: la cuenta completa de un mes ─────────────────
--
-- Un solo viaje trae todo lo que necesitan el tablero y la página de gastos.
-- Trabaja por MES cerrado y no por rango libre a propósito: la renta es
-- mensual, y prorratear «del 3 al 19» daría un número que nadie sabe leer.
--
-- El margen que usa el punto de equilibrio NO es el del mes en curso —el día
-- 2 serían tres ventas—: sale de los últimos 60 días, que ya es suficiente
-- para que no lo mueva un día raro.
create or replace function public.profit_report(p_month date default null)
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
  v_mes_ini date;
  v_mes_fin date;
  v_start timestamptz;
  v_end timestamptz;
  v_hoy date;
  v_ingresos numeric := 0;
  v_costo numeric := 0;
  v_sin_costo bigint := 0;
  v_fijos numeric := 0;
  v_variables numeric := 0;
  v_margen numeric;
  v_gastos numeric;
  v_r60 numeric := 0;
  v_c60 numeric := 0;
  v_ratio numeric;
  v_dias_abre int;
  v_equilibrio_mes numeric;
  v_cubierto date;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo el dueño o un administrador puede ver la utilidad.';
  end if;
  v_biz := v_ctx.business_id;
  v_tz := v_ctx.timezone;

  v_hoy := public.business_day(now(), v_tz);
  v_mes_ini := date_trunc('month', coalesce(p_month, v_hoy))::date;
  v_mes_fin := (v_mes_ini + interval '1 month')::date;
  v_start := (v_mes_ini::timestamp) at time zone v_tz;
  v_end := (v_mes_fin::timestamp) at time zone v_tz;

  -- Ingresos y costo de lo vendido del mes
  select coalesce(sum(ti.line_total), 0),
         coalesce(sum(ti.unit_cost * ti.quantity), 0),
         coalesce(sum(ti.quantity) filter (where ti.unit_cost = 0), 0)
    into v_ingresos, v_costo, v_sin_costo
  from public.ticket_items ti
  join public.tickets t on t.id = ti.ticket_id and t.status = 'completado'
  where ti.business_id = v_biz
    and t.created_at >= v_start and t.created_at < v_end;

  v_margen := v_ingresos - v_costo;

  select coalesce(sum(monthly_amount), 0) into v_fijos
  from public.fixed_expenses where business_id = v_biz and is_active;

  select coalesce(sum(amount), 0) into v_variables
  from public.expenses
  where business_id = v_biz and spent_on >= v_mes_ini and spent_on < v_mes_fin;

  v_gastos := v_fijos + v_variables;

  -- Margen de los últimos 60 días, para que el equilibrio no dependa del día
  select coalesce(sum(ti.line_total), 0), coalesce(sum(ti.unit_cost * ti.quantity), 0)
    into v_r60, v_c60
  from public.ticket_items ti
  join public.tickets t on t.id = ti.ticket_id and t.status = 'completado'
  where ti.business_id = v_biz
    and t.created_at >= ((v_hoy - 59)::timestamp) at time zone v_tz;

  v_ratio := case when v_r60 > 0 then (v_r60 - v_c60) / v_r60 else null end;

  -- Días que de verdad abre al mes: se cuentan los que tuvieron venta en los
  -- últimos 30, no se le pregunta. Sin historia todavía, se asume 30.
  select count(distinct public.business_day(t.created_at, v_tz)) into v_dias_abre
  from public.tickets t
  where t.business_id = v_biz and t.status = 'completado'
    and t.created_at >= ((v_hoy - 29)::timestamp) at time zone v_tz;
  if v_dias_abre is null or v_dias_abre = 0 then v_dias_abre := 30; end if;

  v_equilibrio_mes := case when v_ratio is not null and v_ratio > 0
                           then round(v_fijos / v_ratio, 2) else null end;

  -- Día del mes en que el margen acumulado alcanzó a cubrir TODOS los gastos
  select min(dia) into v_cubierto
  from (
    select public.business_day(t.created_at, v_tz) as dia,
           sum(sum(ti.line_total - ti.unit_cost * ti.quantity))
             over (order by public.business_day(t.created_at, v_tz)) as acum
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id and t.status = 'completado'
    where ti.business_id = v_biz
      and t.created_at >= v_start and t.created_at < v_end
    group by 1
  ) d
  where v_gastos > 0 and d.acum >= v_gastos;

  return jsonb_build_object(
    'month', v_mes_ini,
    'is_current_month', v_mes_ini = date_trunc('month', v_hoy)::date,
    'revenue', v_ingresos,
    'cost_of_goods', v_costo,
    'gross_margin', v_margen,
    'margin_pct', case when v_ingresos > 0 then round(100 * v_margen / v_ingresos, 1) else 0 end,
    'sold_without_cost', v_sin_costo,
    'fixed_total', v_fijos,
    'variable_total', v_variables,
    'expenses_total', v_gastos,
    'net_profit', v_margen - v_gastos,
    'break_even', jsonb_build_object(
      'monthly', v_equilibrio_mes,
      'daily', case when v_equilibrio_mes is not null
                    then round(v_equilibrio_mes / greatest(v_dias_abre, 1), 2) else null end,
      'days_open', v_dias_abre,
      'margin_pct', case when v_ratio is not null then round(100 * v_ratio, 1) else null end
    ),
    'covered_on', v_cubierto,
    'by_category', (
      select coalesce(jsonb_agg(x order by monto desc), '[]'::jsonb)
      from (
        select jsonb_build_object('category', cat, 'amount', monto, 'kind', tipo) as x, monto
        from (
          select category as cat, sum(monthly_amount) as monto, 'fijo' as tipo
          from public.fixed_expenses where business_id = v_biz and is_active
          group by category
          union all
          select category, sum(amount), 'variable'
          from public.expenses
          where business_id = v_biz and spent_on >= v_mes_ini and spent_on < v_mes_fin
          group by category
        ) u
      ) t1
    )
  );
end;
$fn$;

revoke execute on function public.profit_report(date) from public, anon;
grant execute on function public.profit_report(date) to authenticated;
