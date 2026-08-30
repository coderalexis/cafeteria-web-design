-- ============================================================
--  P9 · Pantalla «Por preparar» (la comanda, pero en pantalla)
-- ============================================================
--
-- Para quien atiende SOLO y no tiene impresora térmica. Hasta ahora, ver qué
-- preparar dependía de papel o de la pantalla del ticket recién cobrado, que
-- se pierde en cuanto llega el siguiente cliente.
--
-- El estado vive en la BASE y no en el aparato a propósito: si se marca listo
-- en la tablet, tiene que desaparecer también del celular que alguien dejó
-- parado en la barra.
--
-- Aplicada el 2026-08-30 como `p9_pantalla_por_preparar`.

alter table public.tickets add column prepared_at timestamptz;

comment on column public.tickets.prepared_at is
  'Cuándo se marcó como preparado. Null = sigue en la pantalla «Por preparar».';

-- Los pendientes del día, más viejo primero: es LA consulta de esa pantalla,
-- y se repite cada pocos segundos mientras está abierta.
create index tickets_por_preparar_idx
  on public.tickets (business_id, created_at)
  where prepared_at is null and status = 'completado';

-- Las escrituras sobre tickets solo por función, como el resto del sistema.
create or replace function public.set_ticket_prepared(
  p_ticket_id uuid,
  p_prepared boolean default true
) returns timestamptz
language plpgsql security definer set search_path = public as $body$
declare
  v_ctx record;
  v_when timestamptz;
begin
  select * into v_ctx from member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;

  -- El filtro por business_id es la seguridad: un id de otra cafetería
  -- simplemente no encuentra fila y sale por «Pedido no encontrado».
  update tickets
     set prepared_at = case when p_prepared then now() else null end
   where id = p_ticket_id
     and business_id = v_ctx.business_id
  returning prepared_at into v_when;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;
  return v_when;
end $body$;

revoke all on function public.set_ticket_prepared(uuid, boolean) from public, anon;
grant execute on function public.set_ticket_prepared(uuid, boolean) to authenticated;
