-- ============================================================
-- Fase 4b — Movimientos de caja: entradas y salidas de efectivo
-- a mitad de turno ("saqué $200 para comprar leche", "metí $500
-- de cambio"). El corte los considera para que la diferencia
-- refleje la realidad. Aplicar después de 07_fase3.sql.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabla (inmutable: un error se corrige con el movimiento contrario)
-- ────────────────────────────────────────────────────────────

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions (id) on delete restrict,
  kind text not null check (kind in ('entrada', 'salida')),
  amount numeric(10,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 2 and 200),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_cash_movements_session_id on public.cash_movements (session_id, created_at);
create index idx_cash_movements_created_by on public.cash_movements (created_by);

alter table public.cash_movements enable row level security;

create policy "cash_movements_select_authenticated" on public.cash_movements
for select to authenticated using (true);
-- Sin insert/update/delete directos: solo vía RPC.

-- ────────────────────────────────────────────────────────────
-- 2. Registrar movimiento (exige caja abierta)
-- ────────────────────────────────────────────────────────────

create or replace function public.add_cash_movement(
  p_kind text,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_session_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_row public.cash_movements;
begin
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;
  if p_kind not in ('entrada', 'salida') then
    raise exception 'Tipo de movimiento inválido.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;
  if v_reason is null or length(v_reason) < 2 then
    raise exception 'Indica el motivo del movimiento.';
  end if;
  if length(v_reason) > 200 then
    raise exception 'El motivo es demasiado largo (máximo 200 caracteres).';
  end if;

  select id into v_session_id from public.cash_sessions where status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja para registrar movimientos.';
  end if;

  insert into public.cash_movements (session_id, kind, amount, reason, created_by)
  values (v_session_id, p_kind, round(p_amount, 2), v_reason, v_uid)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'kind', v_row.kind,
    'amount', v_row.amount,
    'reason', v_row.reason,
    'created_at', v_row.created_at
  );
end;
$$;

revoke execute on function public.add_cash_movement(text, numeric, text) from public, anon;
grant execute on function public.add_cash_movement(text, numeric, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. Cierre: esperado = fondo + efectivo vendido + entradas − salidas
-- ────────────────────────────────────────────────────────────

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
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_session public.cash_sessions;
  v_cash_sales numeric(10,2);
  v_in numeric(10,2);
  v_out numeric(10,2);
  v_expected numeric(10,2);
begin
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'El efectivo contado debe ser un monto mayor o igual a 0.';
  end if;

  select * into v_session from public.cash_sessions where status = 'abierta' for update;
  if not found then
    raise exception 'No hay una caja abierta.';
  end if;

  select coalesce(sum(total), 0) into v_cash_sales
  from public.tickets
  where session_id = v_session.id and status = 'completado' and payment_method = 'efectivo';

  select
    coalesce(sum(amount) filter (where kind = 'entrada'), 0),
    coalesce(sum(amount) filter (where kind = 'salida'), 0)
  into v_in, v_out
  from public.cash_movements
  where session_id = v_session.id;

  v_expected := round(v_session.opening_float + v_cash_sales + v_in - v_out, 2);

  update public.cash_sessions
  set status = 'cerrada',
      closed_by = v_uid,
      closed_at = now(),
      expected_cash = v_expected,
      counted_cash = round(p_counted_cash, 2),
      difference = round(p_counted_cash - v_expected, 2),
      closing_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = v_session.id;

  return public.cash_session_summary(v_session.id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Resumen del corte con movimientos
-- ────────────────────────────────────────────────────────────

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
    'opened_by', coalesce(po.full_name, po.username, ''),
    'closed_by', coalesce(pc.full_name, pc.username),
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
    'cancelled_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'cancelled_amount', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'movements_in', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'entrada'),
    'movements_out', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'salida'),
    'movements', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'amount', m.amount, 'reason', m.reason,
          'created_at', m.created_at, 'created_by', coalesce(pm.full_name, pm.username, '')
        ) order by m.created_at),
        '[]'::jsonb
      )
      from public.cash_movements m
      left join public.profiles pm on pm.id = m.created_by
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
  left join public.profiles pc on pc.id = s.closed_by
  where s.id = p_session_id
    and auth.uid() is not null
$$;
