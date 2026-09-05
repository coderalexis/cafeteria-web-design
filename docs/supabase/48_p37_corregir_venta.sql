-- 48_p37_corregir_venta.sql — P37: corregir una venta ya cobrada
-- (migración: p37_corregir_venta).
--
-- «Se equivocó en algo» era hasta hoy cancelar y volver a cobrar a mano: dos
-- pasos, un motivo inventado y la hora de la venta perdida. Ahora es UNA
-- operación: la original queda cancelada con el motivo automático
-- «Corregida: ahora es el ticket #N» y la corregida nace como ticket nuevo,
-- con los precios del menú y TODAS las validaciones de cualquier cobro
-- (extras, techo del cajero, lealtad, promoción, para llevar). Nada se edita
-- en sitio: un ticket cobrado no cambia nunca —eso es lo que hace confiables
-- los cortes, la bitácora y las notas que ya se imprimieron.
--
-- Reglas (las de cancelar, más una):
--   · cajero: solo sus ventas; dueño/admin: cualquiera;
--   · SIEMPRE con la caja de esa venta todavía abierta —también para
--     administradores— porque la corregida cae en el mismo corte que la
--     original; con la caja cerrada el corte ya se contó y lo que queda es
--     cancelar (eso sí lo puede un administrador cuando sea);
--   · la corregida conserva la HORA de la original (el reporte por horas y
--     el día de operación no se mueven) y apunta a ella (`corrected_from`).
--
-- Orden dentro de la transacción: primero se cancela la original y luego
-- nace la nueva. Así un canje de lealtad se puede corregir (la cancelación
-- devuelve los sellos que la nueva vuelve a gastar) y, si la nueva no pasa
-- alguna validación, la excepción deshace también la cancelación: o quedan
-- las dos cosas, o ninguna.

alter table public.tickets
  add column corrected_from uuid references public.tickets(id) on delete set null;

comment on column public.tickets.corrected_from is
  'Venta original que esta corrige (aquella quedó cancelada con motivo automático).';

create index tickets_corrected_from_idx on public.tickets (corrected_from)
  where corrected_from is not null;

create or replace function public.correct_ticket(
  p_original uuid,
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null,
  p_tip numeric default 0,
  p_loyalty_customer uuid default null,
  p_loyalty_redeem boolean default false,
  p_takeout boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_orig public.tickets;
  v_session_status text;
  v_repetida jsonb;
  v_nuevo jsonb;
  v_nuevo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  select * into v_orig from public.tickets
  where id = p_original and business_id = v_biz for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;

  -- Reintento de una corrección que ya se hizo (la red se cayó después de
  -- guardar): la misma respuesta, sin cancelar ni cobrar nada dos veces.
  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'takeout_fee', t.takeout_fee, 'tip_amount', t.tip_amount, 'cash_received', t.cash_received,
    'change_due', t.change_due, 'duplicate', true,
    'corrected_from', v_orig.id, 'original_folio', v_orig.folio
  )
  into v_repetida
  from public.tickets t
  where t.business_id = v_biz and t.client_ref = p_client_ref and t.corrected_from = v_orig.id;
  if v_repetida is not null then
    return v_repetida;
  end if;

  if v_orig.status <> 'completado' then
    raise exception 'Esa venta ya está cancelada; cóbrala de nuevo como una venta normal.';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') and v_orig.cashier_id <> v_ctx.user_id then
    raise exception 'Solo puedes corregir tus propias ventas.';
  end if;
  select status into v_session_status from public.cash_sessions where id = v_orig.session_id;
  if v_session_status is distinct from 'abierta' then
    raise exception 'La caja de esa venta ya se cerró: ya no se puede corregir, solo cancelar.';
  end if;

  -- 1) La original se cancela (con motivo provisional: el folio nuevo aún no existe).
  perform public.cancel_ticket(v_orig.id, 'Corregida');

  -- 2) La corregida, con todas las validaciones de un cobro y la hora de la original.
  v_nuevo := public.create_ticket(
    p_client_ref, p_payment_method, p_items, p_notes, p_cash_received, p_discount, p_tip,
    p_loyalty_customer, p_loyalty_redeem, p_takeout, v_orig.created_at
  );
  v_nuevo_id := (v_nuevo->>'ticket_id')::uuid;
  update public.tickets set corrected_from = v_orig.id where id = v_nuevo_id;

  -- 3) Ya con folio, el motivo definitivo en la original.
  update public.tickets
  set cancel_reason = 'Corregida: ahora es el ticket #' || (v_nuevo->>'folio')
  where id = v_orig.id;

  return v_nuevo || jsonb_build_object('corrected_from', v_orig.id, 'original_folio', v_orig.folio);
end;
$$;

revoke execute on function public.correct_ticket(uuid, uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean) from public, anon;
grant execute on function public.correct_ticket(uuid, uuid, public.payment_method, jsonb, text, numeric, jsonb, numeric, uuid, boolean, boolean) to authenticated;
