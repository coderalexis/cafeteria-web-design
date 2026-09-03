-- 44_p27_corte_contado.sql — P27: el corte contando billetes
-- (migración: p27_corte_contado).
--
-- El cierre de caja pedía un solo número, «efectivo contado», y la suma la
-- hacía el cajero en la cabeza o en un papel: ahí nacen los faltantes que
-- nadie sabe explicar. Ahora el cierre puede guardar el conteo por
-- denominación ([{"value": 500, "qty": 3}, …]) y cuánto se dejó en el cajón
-- como fondo del siguiente turno. Con eso el corte impreso dice «3 × $500»
-- y una diferencia se puede revisar al día siguiente sin volver a contar; y
-- la apertura de mañana ya sabe con cuánto empieza.
--
-- La firma de close_cash_session cambia (dos parámetros nuevos, con valor
-- por omisión). Se TIRA la vieja antes de crear la nueva: si convivieran,
-- PostgREST no sabría cuál llamar cuando el cliente manda solo dos
-- parámetros, que es lo que hace el código desplegado hasta que entre el
-- nuevo. Con una sola función, la llamada vieja sigue resolviendo.

alter table public.cash_sessions
  add column if not exists count_detail jsonb,
  add column if not exists next_float numeric(10,2);

comment on column public.cash_sessions.count_detail is
  'Conteo por denominación al cerrar: [{"value": 500, "qty": 3}, …]. Nulo si se escribió el total a mano.';
comment on column public.cash_sessions.next_float is
  'Efectivo que se dejó en el cajón como fondo del siguiente turno. Nulo si no se dijo.';

drop function if exists public.close_cash_session(numeric, text);

create function public.close_cash_session(
  p_counted_cash numeric,
  p_notes text default null,
  p_count_detail jsonb default null,
  p_next_float numeric default null
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
  v_suma numeric(10,2);
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
  -- Lo que se deja de fondo sale de lo contado: no puede ser más que eso.
  if p_next_float is not null and (p_next_float < 0 or round(p_next_float, 2) > round(p_counted_cash, 2)) then
    raise exception 'El fondo que dejas no puede ser mayor que lo contado (ni negativo).';
  end if;
  -- El conteo por denominación, si viene, tiene que ser una lista sana y
  -- sumar exactamente lo contado: es la evidencia del número, no otro número.
  if p_count_detail is not null then
    begin
      if jsonb_typeof(p_count_detail) <> 'array' or jsonb_array_length(p_count_detail) > 20 then
        raise exception 'forma';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_count_detail) d
        where jsonb_typeof(d) <> 'object'
           or coalesce((d->>'value')::numeric, 0) <= 0
           or coalesce((d->>'qty')::numeric, -1) < 0
           or (d->>'qty')::numeric <> floor((d->>'qty')::numeric)
      ) then
        raise exception 'forma';
      end if;
      select coalesce(sum((d->>'value')::numeric * (d->>'qty')::numeric), 0)
        into v_suma
        from jsonb_array_elements(p_count_detail) d;
    exception
      when others then
        raise exception 'El conteo por denominación no tiene la forma esperada.';
    end;
    if round(v_suma, 2) <> round(p_counted_cash, 2) then
      raise exception 'El conteo por denominación suma % y no lo contado (%).', round(v_suma, 2), round(p_counted_cash, 2);
    end if;
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
      closing_notes = nullif(trim(coalesce(p_notes, '')), ''),
      count_detail = p_count_detail,
      next_float = round(p_next_float, 2)
  where id = v_session.id;

  return public.cash_session_summary(v_session.id);
end;
$$;

revoke all on function public.close_cash_session(numeric, text, jsonb, numeric) from public, anon;
grant execute on function public.close_cash_session(numeric, text, jsonb, numeric) to authenticated;

-- El resumen (lo que imprime el corte y lo que ve el panel) trae el conteo y
-- el fondo. Misma firma: conserva sus permisos.
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
    'count_detail', s.count_detail,
    'next_float', s.next_float,
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
