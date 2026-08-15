-- ============================================================
-- Fase 1 — Operación de caja: sesiones de caja (corte),
-- cancelación de tickets con motivo, cobro en efectivo con cambio.
-- Aplicar después de 04_fase0.sql. Requiere tickets vacíos
-- (pre-producción): session_id se crea NOT NULL.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Sesiones de caja — una sola caja física, a lo más una abierta
-- ────────────────────────────────────────────────────────────

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles (id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_float numeric(10,2) not null check (opening_float >= 0),
  opening_notes text,
  closed_by uuid references public.profiles (id) on delete restrict,
  closed_at timestamptz,
  expected_cash numeric(10,2),
  counted_cash numeric(10,2) check (counted_cash >= 0),
  difference numeric(10,2),
  closing_notes text,
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  constraint cash_sessions_close_consistency check (
    (status = 'abierta' and closed_at is null and closed_by is null and counted_cash is null)
    or (status = 'cerrada' and closed_at is not null and closed_by is not null and counted_cash is not null)
  )
);

create unique index cash_sessions_one_open on public.cash_sessions (status) where status = 'abierta';
create index idx_cash_sessions_opened_at on public.cash_sessions (opened_at desc);
create index idx_cash_sessions_opened_by on public.cash_sessions (opened_by);
create index idx_cash_sessions_closed_by on public.cash_sessions (closed_by);

alter table public.cash_sessions enable row level security;

create policy "cash_sessions_select_authenticated" on public.cash_sessions
for select to authenticated using (true);
-- Sin políticas de insert/update/delete: solo se modifica vía RPC (security definer).

-- ────────────────────────────────────────────────────────────
-- 2. Estado, cancelación y datos de cobro en tickets
-- ────────────────────────────────────────────────────────────

create type public.ticket_status as enum ('completado', 'cancelado');

alter table public.tickets
  add column status public.ticket_status not null default 'completado',
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete restrict,
  add column cancel_reason text,
  add column cash_received numeric(10,2) check (cash_received >= 0),
  add column change_due numeric(10,2) check (change_due >= 0),
  -- Toda venta pertenece a un turno de caja.
  add column session_id uuid not null references public.cash_sessions (id) on delete restrict;

alter table public.tickets add constraint tickets_cancel_consistency check (
  (status = 'completado' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
  or (status = 'cancelado' and cancelled_at is not null and cancelled_by is not null and cancel_reason is not null)
);

create index idx_tickets_session_id on public.tickets (session_id);
create index idx_tickets_cancelled_by on public.tickets (cancelled_by);
create index idx_tickets_status_created_at on public.tickets (status, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 3. Ventas SOLO por RPC. Se eliminan las políticas de INSERT/DELETE
--    directas: nadie puede saltarse el recálculo de precios del
--    servidor ni borrar historial. Cancelar es la única "baja".
-- ────────────────────────────────────────────────────────────

drop policy "tickets_insert_cashier_or_admin" on public.tickets;
drop policy "tickets_delete_admin" on public.tickets;
drop policy "ticket_items_insert_cashier_or_admin" on public.ticket_items;
drop policy "ticket_item_modifiers_insert_cashier_or_admin" on public.ticket_item_modifiers;

-- ────────────────────────────────────────────────────────────
-- 4. Resumen de una sesión (corte): lo usa el cierre, la vista previa
--    antes de cerrar y la reimpresión del corte desde admin.
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
    'cash_sales', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'cancelled_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'cancelled_amount', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
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

revoke execute on function public.cash_session_summary(uuid) from public, anon;
grant execute on function public.cash_session_summary(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. Abrir caja
-- ────────────────────────────────────────────────────────────

create or replace function public.open_cash_session(
  p_opening_float numeric,
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
  v_row public.cash_sessions;
begin
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;
  if p_opening_float is null or p_opening_float < 0 then
    raise exception 'El fondo inicial debe ser un monto mayor o igual a 0.';
  end if;
  if exists (select 1 from public.cash_sessions where status = 'abierta') then
    raise exception 'Ya hay una caja abierta. Ciérrala antes de abrir otra.';
  end if;

  insert into public.cash_sessions (opened_by, opening_float, opening_notes)
  values (v_uid, round(p_opening_float, 2), nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v_row;

  return jsonb_build_object(
    'session_id', v_row.id,
    'opened_at', v_row.opened_at,
    'opening_float', v_row.opening_float
  );
exception
  when unique_violation then
    raise exception 'Ya hay una caja abierta. Ciérrala antes de abrir otra.';
end;
$$;

revoke execute on function public.open_cash_session(numeric, text) from public, anon;
grant execute on function public.open_cash_session(numeric, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. Cerrar caja: esperado = fondo + efectivo de ventas completadas
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

  v_expected := round(v_session.opening_float + v_cash_sales, 2);

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

revoke execute on function public.close_cash_session(numeric, text) from public, anon;
grant execute on function public.close_cash_session(numeric, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. Cancelar ticket (con motivo). Admin: cualquiera. Cajero: solo
--    propios y con la caja de esa venta aún abierta.
-- ────────────────────────────────────────────────────────────

create or replace function public.cancel_ticket(
  p_ticket_id uuid,
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
  v_ticket public.tickets;
  v_session_status text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;
  if v_reason is null then
    raise exception 'Indica el motivo de la cancelación.';
  end if;
  if length(v_reason) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  if v_ticket.status = 'cancelado' then
    raise exception 'Este ticket ya estaba cancelado.';
  end if;

  if v_role <> 'admin' then
    if v_ticket.cashier_id <> v_uid then
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
      cancelled_by = v_uid,
      cancel_reason = v_reason
  where id = v_ticket.id;

  return jsonb_build_object('ticket_id', v_ticket.id, 'folio', v_ticket.folio, 'status', 'cancelado');
end;
$$;

revoke execute on function public.cancel_ticket(uuid, text) from public, anon;
grant execute on function public.cancel_ticket(uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 8. create_ticket v2: exige caja abierta, liga la venta a la sesión,
--    acepta efectivo recibido y calcula el cambio.
--    (Se elimina la firma anterior para que PostgREST no tenga
--    dos candidatas.)
-- ────────────────────────────────────────────────────────────

drop function public.create_ticket(uuid, public.payment_method, jsonb, text);

create or replace function public.create_ticket(
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role public.app_role;
  v_existing jsonb;
  v_session_id uuid;
  v_input_count int;
  v_valid_count int;
  v_subtotal numeric(10,2);
  v_cash_received numeric(10,2);
  v_change_due numeric(10,2);
  v_ticket_id uuid;
  v_folio bigint;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;

  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  -- Idempotencia: si este client_ref ya se registró, devolver el existente
  -- (antes de cualquier otra validación, para que un reintento tardío funcione).
  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'total', t.total,
    'cash_received', t.cash_received, 'change_due', t.change_due, 'duplicate', true
  )
  into v_existing
  from public.tickets t
  where t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  select id into v_session_id from public.cash_sessions where status = 'abierta';
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
    on v.id = (elem->>'variant_id')::uuid and v.is_active
  join public.menu_products p
    on p.id = v.product_id and p.is_active;

  if v_valid_count <> v_input_count then
    raise exception 'Uno o más artículos no existen o están inactivos.';
  end if;

  -- Subtotal con precios del servidor; lo que mande el cliente se ignora.
  select round(sum(v.price * (elem->>'quantity')::int), 2) into v_subtotal
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid;

  -- Efectivo recibido / cambio (solo aplica a pagos en efectivo).
  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_cash_received := round(p_cash_received, 2);
    if v_cash_received < v_subtotal then
      raise exception 'El efectivo recibido (%) es menor que el total (%).', v_cash_received, v_subtotal;
    end if;
    v_change_due := round(v_cash_received - v_subtotal, 2);
  end if;

  insert into public.tickets
    (cashier_id, session_id, payment_method, subtotal, total, notes, client_ref, cash_received, change_due)
  values (
    v_uid,
    v_session_id,
    p_payment_method,
    v_subtotal,
    v_subtotal,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_client_ref,
    v_cash_received,
    v_change_due
  )
  returning id, folio into v_ticket_id, v_folio;

  insert into public.ticket_items
    (ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes, product_name, variant_name, size_label)
  select
    v_ticket_id,
    p.id,
    v.id,
    (elem->>'quantity')::int,
    v.price,
    round(v.price * (elem->>'quantity')::int, 2),
    nullif(trim(coalesce(elem->>'notes', '')), ''),
    p.name,
    v.name,
    v.size_label
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid
  join public.menu_products p on p.id = v.product_id;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'folio', v_folio,
    'total', v_subtotal,
    'cash_received', v_cash_received,
    'change_due', v_change_due
  );

exception
  when unique_violation then
    -- Carrera entre dos requests con el mismo client_ref: gana el primero.
    select jsonb_build_object(
      'ticket_id', t.id, 'folio', t.folio, 'total', t.total,
      'cash_received', t.cash_received, 'change_due', t.change_due, 'duplicate', true
    )
    into v_existing
    from public.tickets t
    where t.client_ref = p_client_ref;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text, numeric) to authenticated;
