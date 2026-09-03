-- 41_p21_extra_por_omision.sql — P21: opción por omisión en cada grupo de
-- extras (migración: p21_extra_por_omision).
--
-- ★ LA DESHACE LA 42. La FK compuesta de abajo crea una SEGUNDA relación
--   entre modifier_groups y modifiers, y PostgREST ya no sabe cuál embeber
--   en `modifiers(...)` (error 300 en el POS, Modificadores y Productos).
--   Se descubrió en tsc con la migración ya aplicada en producción, así que
--   se conserva tal cual y la 42 la deshace y pone la bandera en la opción.
--
-- En Gym Coffe el grupo «Tipo de leche» va en 21 productos y es opcional; si
-- casi todo el mundo pide deslactosada, preguntarlo en cada venta es ruido y
-- no preguntarlo obliga a entrar al carrito a ponerla. La dueña lo resumió:
-- «que no se pregunte porque siempre será deslactosado». Con una opción por
-- omisión en el grupo, la hoja de extras se abre YA con ella marcada (modo
-- «preguntar al tocar») o la venta la lleva sin preguntar (modo «solo
-- obligatorios»). El servidor no cambia: los extras siguen viajando en el
-- carrito y create_ticket los valida igual; esto solo decide qué propone la
-- pantalla.
--
-- Diseño: la opción por omisión tiene que ser de SU grupo. En vez de un
-- trigger, una FK compuesta contra (id, group_id) donde el propio id del
-- grupo forma parte de la referencia: la base no puede aceptar una opción
-- ajena. Al borrar la opción, solo se limpia default_modifier_id (SET NULL
-- por columna, Postgres 15+); el grupo se queda.

-- ── 1) La columna y su candado ──────────────────────────────────────
alter table public.modifiers
  add constraint modifiers_id_group_unique unique (id, group_id);

alter table public.modifier_groups
  add column default_modifier_id uuid;

alter table public.modifier_groups
  add constraint modifier_groups_default_modifier_fk
  foreign key (default_modifier_id, id)
  references public.modifiers (id, group_id)
  on delete set null (default_modifier_id);

comment on column public.modifier_groups.default_modifier_id is
  'Opción que la pantalla propone sola (marcada en la hoja, o puesta sin preguntar en modo «solo obligatorios»). Debe ser de este grupo; al borrarla se limpia.';

-- ── 2) clone_menu copia la opción por omisión ───────────────────────
-- Se PARCHEA la función viva por ancla, igual que create_ticket en la 36 y
-- la 40: retipearla entera es la forma fácil de revertir un arreglo en
-- silencio. El ancla es el insert de los vínculos producto↔grupo, que va
-- justo después de copiar grupos y opciones; ahí ya existen los ids
-- derivados de ambos.
do $patch$
declare
  v_def text;
  v_ancla text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'clone_menu';
  if v_def is null then
    raise exception 'No encontré clone_menu.';
  end if;

  v_ancla := E'  insert into public.product_modifier_groups (business_id, product_id, group_id)\n';
  if position(v_ancla in v_def) = 0 then
    raise exception 'Parche clone_menu: no encontré el insert de product_modifier_groups.';
  end if;
  if position('default_modifier_id' in v_def) > 0 then
    raise exception 'Parche clone_menu: ya estaba aplicado.';
  end if;

  v_nuevo :=
    E'  -- La opción por omisión de cada grupo, con el id derivado del destino (migración 41).\n'
    '  update public.modifier_groups t\n'
    '     set default_modifier_id = public.derive_uuid(p_target, g.default_modifier_id::text)\n'
    '    from public.modifier_groups g\n'
    '   where g.business_id = p_source\n'
    '     and g.default_modifier_id is not null\n'
    '     and t.id = public.derive_uuid(p_target, g.id::text);\n'
    '\n'
    || v_ancla;
  v_def := replace(v_def, v_ancla, v_nuevo);

  execute v_def;
end;
$patch$;
