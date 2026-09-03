-- 45_p31_colores_clon.sql — P31: la plantilla nace con colores y el clon deja
-- de perder columnas (migración: p31_colores_clon).
--
-- Dos cosas del mismo origen:
--
-- 1) `clone_menu` se escribió en la migración 09 y nunca se actualizó. Desde
--    entonces el menú ganó cuatro columnas que la función no copia: el color
--    y la nota de la categoría (10/12), el costo de la variante (16) y la
--    opción por omisión del extra (42). Cada cafetería creada desde /super
--    clonando la plantilla nacía sin ellas, en silencio.
--
-- 2) La plantilla no tenía colores. El color de categoría existe para
--    distinguir de un vistazo en la barra —es lo que ya usa Gym Coffe—, así
--    que la plantilla debe traerlos puestos: quien empieza no tiene por qué
--    saber que hay que elegirlos uno por uno. Los paquetes de menú del
--    registro público ya los traían (migración 24).
--
-- Los colores se ponen SOLO donde no hay ninguno: si alguien ya eligió, se
-- respeta. Y solo en la plantilla; las cafeterías que ya operan no se tocan.

create or replace function public.clone_menu(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.businesses where id = p_source) then
    raise exception 'Negocio origen no existe.';
  end if;
  if not exists (select 1 from public.businesses where id = p_target) then
    raise exception 'Negocio destino no existe.';
  end if;
  if exists (select 1 from public.menu_categories where business_id = p_target)
     or exists (select 1 from public.modifier_groups where business_id = p_target) then
    raise exception 'El negocio destino ya tiene menú.';
  end if;

  insert into public.menu_categories (id, business_id, name, slug, sort_order, is_active, color, note)
  select public.derive_uuid(p_target, c.id::text), p_target, c.name, c.slug, c.sort_order, c.is_active,
         c.color, c.note
  from public.menu_categories c where c.business_id = p_source;

  insert into public.menu_products (id, business_id, category_id, name, description, image_url, sort_order, is_active)
  select public.derive_uuid(p_target, p.id::text), p_target, public.derive_uuid(p_target, p.category_id::text),
         p.name, p.description, p.image_url, p.sort_order, p.is_active
  from public.menu_products p where p.business_id = p_source;

  insert into public.menu_variants (id, business_id, product_id, name, size_label, price, sort_order, is_active, cost)
  select public.derive_uuid(p_target, v.id::text), p_target, public.derive_uuid(p_target, v.product_id::text),
         v.name, v.size_label, v.price, v.sort_order, v.is_active, v.cost
  from public.menu_variants v where v.business_id = p_source;

  insert into public.modifier_groups (id, business_id, name, min_select, max_select, is_required, sort_order, is_active)
  select public.derive_uuid(p_target, g.id::text), p_target, g.name, g.min_select, g.max_select, g.is_required, g.sort_order, g.is_active
  from public.modifier_groups g where g.business_id = p_source;

  insert into public.modifiers (id, business_id, group_id, name, price_delta, sort_order, is_active, is_default)
  select public.derive_uuid(p_target, m.id::text), p_target, public.derive_uuid(p_target, m.group_id::text),
         m.name, m.price_delta, m.sort_order, m.is_active, m.is_default
  from public.modifiers m where m.business_id = p_source;

  insert into public.product_modifier_groups (business_id, product_id, group_id)
  select p_target, public.derive_uuid(p_target, l.product_id::text), public.derive_uuid(p_target, l.group_id::text)
  from public.product_modifier_groups l where l.business_id = p_source;

  return jsonb_build_object(
    'categories', (select count(*) from public.menu_categories where business_id = p_target),
    'products',   (select count(*) from public.menu_products   where business_id = p_target),
    'variants',   (select count(*) from public.menu_variants   where business_id = p_target),
    'modifier_groups', (select count(*) from public.modifier_groups where business_id = p_target),
    'modifiers',  (select count(*) from public.modifiers where business_id = p_target),
    'links',      (select count(*) from public.product_modifier_groups where business_id = p_target)
  );
end;
$$;

-- Colores de la plantilla, en el mismo criterio que los paquetes de menú:
-- café ámbar, leche naranja, frappés azul cielo, infusiones verde, frías
-- turquesa, panadería rosa. Los diez son distintos entre sí para que la
-- rejilla del POS se lea de un vistazo.
update public.menu_categories c
   set color = v.color
  from (values
          ('con-cafe',        'amber'),
          ('a-base-de-leche', 'orange'),
          ('frappes',         'sky'),
          ('infusiones',      'emerald'),
          ('sodas',           'teal'),
          ('crepas-dulces',   'violet'),
          ('crepas-saladas',  'lime'),
          ('croissants',      'indigo'),
          ('panaderia',       'rose'),
          ('extras',          'stone')
       ) as v(slug, color)
 where c.slug = v.slug
   and c.color is null
   and c.business_id in (select id from public.businesses where is_template);
