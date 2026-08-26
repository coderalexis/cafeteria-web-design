-- 19_p4_borrar_cuentas.sql — P4: al borrar una cafetería también se van las
-- cuentas que quedan sin nada (migración: p4_borrar_cuentas).
--
-- La versión de la migración 18 solo devolvía huérfanos para que la app
-- borrara las cuentas SINTÉTICAS de cajero, y conservaba a las personas con
-- correo real. El operador prefiere que se vaya también el dueño: si su única
-- cafetería desaparece, su cuenta ya no sirve para nada y quedaría colgada.
--
-- Lo único que cambia es a quién se considera huérfano. Dos exclusiones que NO
-- son opinables:
--   · **Quien ejecuta el borrado.** Sin esto, borrar tu última cafetería te
--     borraría a ti mismo y perderías el acceso a la plataforma.
--   · **Cualquier `is_platform_admin`.** Un operador no es cliente de una
--     cafetería; su cuenta no debe depender de que exista.
-- Van en la función y no en la interfaz para que la garantía valga aunque
-- alguien llame al RPC directamente.
--
-- Un dueño que administre OTRA cafetería tampoco es huérfano: la subconsulta
-- `not exists` ya lo cubría y se conserva igual.

create or replace function public.delete_business(
  p_business_id uuid,
  p_slug text,
  p_actor uuid default null,
  p_actor_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_summary jsonb;
  v_orphans uuid[];
begin
  select id, slug, name, is_template into v_biz
  from businesses where id = p_business_id;
  if not found then
    raise exception 'Cafetería no encontrada.';
  end if;
  if v_biz.slug is distinct from p_slug then
    raise exception 'La confirmación no coincide con la cafetería.';
  end if;

  v_summary := jsonb_build_object(
    'tickets', (select count(*) from tickets where business_id = p_business_id),
    'ventas_total', (select coalesce(sum(total), 0) from tickets where business_id = p_business_id and status = 'completado'),
    'cortes', (select count(*) from cash_sessions where business_id = p_business_id),
    'categorias', (select count(*) from menu_categories where business_id = p_business_id),
    'productos', (select count(*) from menu_products where business_id = p_business_id),
    'variantes', (select count(*) from menu_variants where business_id = p_business_id),
    'miembros', (select count(*) from business_members where business_id = p_business_id),
    'eventos_bitacora', (select count(*) from audit_events where business_id = p_business_id),
    'era_plantilla', v_biz.is_template
  );

  -- Quién se queda sin ninguna cafetería (y por tanto sin razón de existir).
  select coalesce(array_agg(m.user_id), '{}')
  into v_orphans
  from business_members m
  join profiles p on p.id = m.user_id
  where m.business_id = p_business_id
    and m.user_id is distinct from p_actor
    and not coalesce(p.is_platform_admin, false)
    and not exists (
      select 1 from business_members o
      where o.user_id = m.user_id and o.business_id <> p_business_id
    );

  delete from ticket_item_modifiers where business_id = p_business_id;
  delete from ticket_items where business_id = p_business_id;
  delete from tickets where business_id = p_business_id;
  delete from cash_movements where business_id = p_business_id;
  delete from cash_sessions where business_id = p_business_id;
  delete from product_modifier_groups where business_id = p_business_id;
  delete from modifiers where business_id = p_business_id;
  delete from modifier_groups where business_id = p_business_id;
  delete from menu_variants where business_id = p_business_id;
  delete from menu_products where business_id = p_business_id;
  delete from menu_categories where business_id = p_business_id;
  delete from audit_events where business_id = p_business_id;
  delete from member_pins where business_id = p_business_id;
  delete from business_members where business_id = p_business_id;
  delete from business_counters where business_id = p_business_id;

  update profiles set active_business_id = null where active_business_id = p_business_id;

  delete from businesses where id = p_business_id;

  insert into deleted_businesses (business_id, slug, name, deleted_by, deleted_by_name, summary)
  values (p_business_id, v_biz.slug, v_biz.name, p_actor, coalesce(p_actor_name, ''), v_summary);

  return jsonb_build_object(
    'slug', v_biz.slug,
    'name', v_biz.name,
    'summary', v_summary,
    'orphan_user_ids', v_orphans
  );
end;
$$;

revoke all on function public.delete_business(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_business(uuid, text, uuid, text) to service_role;
