-- 42_p21_extra_por_omision_2.sql — P21, corrección de la 41: la opción por
-- omisión vive en la OPCIÓN, no en el grupo (migración: p21_extra_por_omision_2).
--
-- La 41 la guardaba en `modifier_groups.default_modifier_id` con una FK
-- compuesta contra `modifiers (id, group_id)`. Elegante para la base, y un
-- problema para la app: esa FK crea una SEGUNDA relación entre las dos
-- tablas, y PostgREST (lo que hay debajo de supabase-js) ya no sabe cuál
-- embeber: cada `modifiers(...)` dentro de un select de `modifier_groups`
-- —el POS, Modificadores, Productos— se vuelve ambiguo (error 300) y
-- habría que ponerle `!modifiers_group_id_fkey` a cada consulta presente y
-- futura. Se detectó en tsc antes de desplegar código, pero la migración ya
-- estaba aplicada; de ahí que esta la deshaga en vez de reescribirla.
--
-- Diseño nuevo: `modifiers.is_default`. Una bandera en la opción no crea
-- relaciones. «Como mucho una por grupo» lo garantiza un índice único
-- parcial, y un trigger desmarca a las hermanas al marcar una, para que
-- desde la app sea UNA sentencia. Borrar o desactivar la opción se lleva la
-- omisión con ella sin nada que limpiar.

-- ── 1) Deshacer la 41 ──────────────────────────────────────────────
-- Primero el parche de clone_menu (referencia la columna que se va).
do $undo$
declare
  v_def text;
  v_bloque text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'clone_menu';
  if v_def is null then
    raise exception 'No encontré clone_menu.';
  end if;
  v_bloque :=
    E'  -- La opción por omisión de cada grupo, con el id derivado del destino (migración 41).\n'
    '  update public.modifier_groups t\n'
    '     set default_modifier_id = public.derive_uuid(p_target, g.default_modifier_id::text)\n'
    '    from public.modifier_groups g\n'
    '   where g.business_id = p_source\n'
    '     and g.default_modifier_id is not null\n'
    '     and t.id = public.derive_uuid(p_target, g.id::text);\n'
    '\n';
  if position(v_bloque in v_def) = 0 then
    raise exception 'Deshacer la 41: no encontré su bloque en clone_menu.';
  end if;
  execute replace(v_def, v_bloque, '');
end;
$undo$;

alter table public.modifier_groups drop constraint modifier_groups_default_modifier_fk;
alter table public.modifier_groups drop column default_modifier_id;
alter table public.modifiers drop constraint modifiers_id_group_unique;

-- ── 2) La bandera y su candado ─────────────────────────────────────
alter table public.modifiers
  add column is_default boolean not null default false;

create unique index modifiers_one_default_per_group
  on public.modifiers (group_id) where is_default;

comment on column public.modifiers.is_default is
  'La opción que la pantalla propone sola: marcada al abrir la hoja de extras, o puesta sin preguntar en modo «solo obligatorios». Como mucho una por grupo.';

-- ── 3) Marcar una desmarca a sus hermanas ──────────────────────────
-- BEFORE: las hermanas se desmarcan antes de escribir esta fila, así el
-- índice único nunca ve dos. Corre con los permisos de quien edita (RLS
-- incluida): las hermanas son del mismo negocio, así que un dueño puede.
create or replace function public.modifiers_single_default()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.is_default and (tg_op = 'INSERT' or not old.is_default or new.group_id <> old.group_id) then
    update public.modifiers
       set is_default = false
     where group_id = new.group_id and id <> new.id and is_default;
  end if;
  return new;
end;
$fn$;

drop trigger if exists modifiers_single_default on public.modifiers;
create trigger modifiers_single_default
  before insert or update of is_default, group_id on public.modifiers
  for each row execute function public.modifiers_single_default();

-- ── 4) clone_menu copia la bandera ─────────────────────────────────
-- Parche por ancla sobre la función viva (misma técnica que la 36, 40 y 41).
do $patch$
declare
  v_def text;
  v_a1 text; v_b1 text;
  v_a2 text; v_b2 text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'clone_menu';

  v_a1 := 'insert into public.modifiers (id, business_id, group_id, name, price_delta, sort_order, is_active)';
  v_b1 := 'insert into public.modifiers (id, business_id, group_id, name, price_delta, sort_order, is_active, is_default)';
  v_a2 := E'         m.name, m.price_delta, m.sort_order, m.is_active\n';
  v_b2 := E'         m.name, m.price_delta, m.sort_order, m.is_active, m.is_default\n';
  if position(v_a1 in v_def) = 0 or position(v_a2 in v_def) = 0 then
    raise exception 'Parche clone_menu: no encontré el insert de modifiers.';
  end if;
  if position('is_default' in v_def) > 0 then
    raise exception 'Parche clone_menu: ya estaba aplicado.';
  end if;
  v_def := replace(replace(v_def, v_a1, v_b1), v_a2, v_b2);
  execute v_def;
end;
$patch$;
