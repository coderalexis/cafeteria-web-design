-- 27_p6_caja_olvidada.sql — P6: cierre automático de la caja olvidada
-- (migración: p6_caja_olvidada).
--
-- Una caja que nunca se cierra rompe dos cosas: el arqueo deja de significar
-- algo (el efectivo del cajón contra las ventas de tres días no cuadra con
-- nada) y el negocio no puede abrir la del día siguiente —índice único de una
-- caja abierta por negocio—, así que deja de registrar su fondo inicial.
--
-- La decisión difícil: al cerrar sola, NADIE contó el efectivo. Poner
-- `counted_cash = expected_cash` daría un arqueo perfecto de mentira y
-- borraría la evidencia de cualquier faltante. Preferimos un cierre que diga
-- la verdad: sin conteo, sin diferencia, marcado como automático.
--
-- Eso exige relajar `cash_sessions_close_consistency`, que hasta hoy obligaba
-- a que TODA sesión cerrada tuviera `closed_by` y `counted_cash`. La regla
-- nueva mantiene esa exigencia para los cortes de persona y abre exactamente
-- un caso más: `auto_closed = true`, sin quién ni cuánto.
--
-- Cuándo se considera olvidada lo decide `lib/cash-session.ts` (hora de cierre
-- del negocio + 3 h de gracia; 12 h si no hay horario; techo de 24 h). Vive en
-- TypeScript y no aquí porque necesita la zona horaria del negocio y está
-- cubierta por pruebas; este RPC solo escribe lo que se le pide.

alter table public.cash_sessions
  add column auto_closed boolean not null default false;

alter table public.cash_sessions
  drop constraint cash_sessions_close_consistency;

alter table public.cash_sessions
  add constraint cash_sessions_close_consistency check (
    (status = 'abierta' and closed_at is null and closed_by is null and counted_cash is null and not auto_closed)
    or (status = 'cerrada' and closed_at is not null and auto_closed)
    or (status = 'cerrada' and closed_at is not null and closed_by is not null and counted_cash is not null)
  );

comment on column public.cash_sessions.auto_closed is
  'Cerrada por el sistema tras quedar olvidada. Sin conteo ni diferencia: nadie contó el efectivo.';

-- ── Cierre automático (solo service_role) ─────────────────────────
-- Recibe el corte por parámetro: quien llama ya calculó el límite con la zona
-- horaria y el horario del negocio. Se revalida aquí de todos modos —que la
-- sesión siga abierta y que de verdad haya vencido— para que un cálculo
-- equivocado del lado de la app no pueda cerrar un turno en curso.
create or replace function public.force_close_cash_session(
  p_session_id uuid,
  p_deadline timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cash_sessions;
  v_expected numeric(10,2);
begin
  select * into v_session from public.cash_sessions
  where id = p_session_id for update;
  if not found then
    raise exception 'Sesión de caja no encontrada.';
  end if;
  if v_session.status <> 'abierta' then
    raise exception 'Esa caja ya estaba cerrada.';
  end if;
  if p_deadline is null or now() < p_deadline then
    raise exception 'Esa caja todavía no vence; no se cierra sola.';
  end if;

  -- Mismo cálculo del esperado que el corte normal: fondo + ventas en
  -- efectivo + propinas en efectivo + entradas − salidas.
  select round(
    v_session.opening_float
    + coalesce((select sum(t.total + t.tip_amount) from public.tickets t
                where t.session_id = v_session.id and t.status = 'completado'
                  and t.payment_method = 'efectivo'), 0)
    + coalesce((select sum(case when m.kind = 'entrada' then m.amount else -m.amount end)
                from public.cash_movements m where m.session_id = v_session.id), 0)
  , 2) into v_expected;

  update public.cash_sessions
  set status = 'cerrada',
      closed_at = now(),
      auto_closed = true,
      expected_cash = v_expected,
      counted_cash = null,
      difference = null,
      closing_notes = left(coalesce(p_reason, 'Cerrada automáticamente.'), 500)
  where id = v_session.id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'opened_at', v_session.opened_at,
    'expected_cash', v_expected,
    'auto_closed', true
  );
end;
$$;

revoke all on function public.force_close_cash_session(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.force_close_cash_session(uuid, timestamptz, text) to service_role;
