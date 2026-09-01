-- 37_p16_bitacora_atomica.sql — P16: la bitácora de las dos decisiones que
-- mueven dinero sin pasar por la caja se escribe en la MISMA transacción
-- (migración: p16_bitacora_atomica).
--
-- La auditoría de la app (`logAudit` en lib/audit.ts) es «de buen esfuerzo»:
-- si el registro falla, la acción ya se aplicó y no queda rastro. Para
-- editar un producto eso es aceptable —mejor que la carta se guarde aunque
-- la bitácora tosa—. Para dos cosas no lo es:
--
--   · Condonar un fiado: comida servida cuyo dinero desaparece por decisión
--     de alguien. Es la única forma de que un consumo no entre a la caja, y
--     tiene que quedar por escrito quién y por qué, o no vale.
--   · Ajustar sellos de lealtad: cada sello es una bebida gratis futura.
--
-- Aquí las dos pasan a un RPC que hace el cambio Y escribe la bitácora en
-- una sola transacción: o quedan las dos cosas, o ninguna. `log_audit` ya
-- exige owner|admin y deriva el negocio de la sesión; desde dentro de otra
-- función SECURITY DEFINER sigue viendo la misma sesión, así que no hay que
-- duplicar nada.

-- ── 1) Condonar un fiado ───────────────────────────────────────────
create or replace function public.forgive_owed(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ctx record;
  v_row public.parked_orders;
  v_reason text;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo el dueño o un administrador puede condonar un fiado.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Escribe un motivo de al menos 3 letras.';
  end if;
  if length(v_reason) > 120 then
    raise exception 'El motivo es demasiado largo (máximo 120 caracteres).';
  end if;

  -- Se lee y se bloquea antes de borrar: después no habría de qué dejar
  -- constancia, y dos administradores no pueden condonar lo mismo a la vez.
  select * into v_row
  from public.parked_orders
  where id = p_id and business_id = v_ctx.business_id and owed_since is not null
  for update;
  if not found then
    raise exception 'Esa cuenta ya no existe o no está marcada como fiado.';
  end if;

  delete from public.parked_orders where id = v_row.id;

  -- En la misma transacción: si esto falla, el borrado de arriba se revierte.
  perform public.log_audit(
    'fiado.condonado',
    v_row.name,
    jsonb_build_object('motivo', v_reason, 'debia_desde', v_row.owed_since)
  );

  return jsonb_build_object('id', v_row.id, 'name', v_row.name);
end;
$fn$;

revoke all on function public.forgive_owed(uuid, text) from public, anon;
grant execute on function public.forgive_owed(uuid, text) to authenticated;

-- ── 2) Ajuste de sellos, con su bitácora adentro ───────────────────
create or replace function public.loyalty_adjust(p_customer uuid, p_delta int, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_row public.loyalty_customers;
begin
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un dueño o administrador puede ajustar sellos.';
  end if;
  if p_delta is null or p_delta = 0 or p_delta < -99 or p_delta > 99 then
    raise exception 'El ajuste debe ser un entero entre -99 y 99, distinto de 0.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Indica el motivo del ajuste.';
  end if;

  update public.loyalty_customers
  set stamps = greatest(0, stamps + p_delta)
  where id = p_customer and business_id = v_ctx.business_id
  returning * into v_row;
  if not found then
    raise exception 'Cliente de lealtad no encontrado.';
  end if;

  -- Antes lo escribía la app después de volver, y podía no escribirlo.
  perform public.log_audit(
    'lealtad.ajuste',
    coalesce(nullif(v_row.name, ''), v_row.phone),
    jsonb_build_object('delta', p_delta, 'reason', trim(p_reason), 'stamps', v_row.stamps)
  );

  return jsonb_build_object('id', v_row.id, 'stamps', v_row.stamps);
end;
$$;

revoke all on function public.loyalty_adjust(uuid, int, text) from public, anon;
grant execute on function public.loyalty_adjust(uuid, int, text) to authenticated;
