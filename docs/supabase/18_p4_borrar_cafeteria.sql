-- 18_p4_borrar_cafeteria.sql — P4: borrado real de una cafetería
-- (migración: p4_borrar_cafeteria).
--
-- Hasta ahora una cafetería solo se podía SUSPENDER (reversible, conserva todo).
-- El operador necesita además poder borrarla de verdad — sobre todo en la etapa
-- de pruebas, donde se crean y desechan cafeterías de ensayo.
--
-- Por qué un RPC y no varios DELETE desde la app: son 15 tablas con
-- `on delete restrict`. Si el borrado se cortara a la mitad quedaría una
-- cafetería mutilada, peor que no haberla borrado. Dentro de una función es una
-- sola transacción: o se va todo, o no se va nada.
--
-- Salvaguardas:
--   · Solo `service_role` (la app ya exige requireSuperAdmin antes de llamar).
--   · Hay que mandar el slug y tiene que coincidir: si la UI manda otro id por
--     un error, el borrado se detiene.
--   · Queda registro en `deleted_businesses`, que SOBREVIVE al negocio. Borrar
--     datos de un tercero sin dejar rastro de quién y cuándo no es aceptable.
--   · NO toca `auth.users`: devuelve los usuarios que quedaron sin ninguna
--     membresía para que la app decida (solo borra cuentas sintéticas de
--     cajero; una persona con correo real se conserva).

create table if not exists public.deleted_businesses (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  slug text not null,
  name text not null,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_by_name text not null default '',
  deleted_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

alter table public.deleted_businesses enable row level security;
-- Sin políticas a propósito: ni siquiera un dueño lo lee. Solo service_role.
revoke all on table public.deleted_businesses from public, anon, authenticated;

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

  -- Foto de lo que se va a borrar, para el registro y para informar al operador.
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

  -- Quiénes se quedan sin ninguna otra cafetería (la app decide qué hacer).
  select coalesce(array_agg(m.user_id), '{}')
  into v_orphans
  from business_members m
  where m.business_id = p_business_id
    and not exists (
      select 1 from business_members o
      where o.user_id = m.user_id and o.business_id <> p_business_id
    );

  -- Orden dictado por las llaves foráneas (hijos antes que padres).
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

  -- Nadie puede quedar "parado" en una cafetería que ya no existe.
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
