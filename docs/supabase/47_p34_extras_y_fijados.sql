-- 47_p34_extras_y_fijados.sql — P34: extras solo donde se usan, y productos
-- fijados en el inicio del POS (migración: p34_extras_y_fijados).
--
-- En Gym Coffe, «Tipo de leche» está enganchado a 15 productos y «Proteína
-- extra» a 9, los dos opcionales, y el POS pregunta al tocar. Pero solo el
-- 36 % de lo vendido llevó algún extra: dos de cada tres toques abrían una
-- hoja para nada. Ahora cada producto dice si se pregunta al tocar
-- (`prompt_modifiers`); apagado, entra directo con sus opciones por omisión
-- y los extras se cambian desde la línea. Las preguntas obligatorias se
-- preguntan siempre, diga lo que diga la bandera.
--
-- Y la primera pantalla la decide la dueña: `pinned_order` fija un producto
-- en «Más vendidos» del POS, en el orden que ella quiera; los automáticos
-- rellenan lo que falte.
--
-- `product_extras_usage` es el dato para decidir: cuántas ventas de cada
-- producto llevaron extras en los últimos días. Donde casi nadie elige nada,
-- el panel sugiere apagar la pregunta.

alter table public.menu_products
  add column if not exists prompt_modifiers boolean not null default true,
  add column if not exists pinned_order smallint;

comment on column public.menu_products.prompt_modifiers is
  'true = al tocar el producto se abre la hoja de extras; false = entra directo con las opciones por omisión (las preguntas obligatorias se preguntan siempre).';
comment on column public.menu_products.pinned_order is
  'Posición en «Más vendidos» del POS cuando la dueña lo fija; nulo = no fijado.';

-- Lección de la migración 45: toda columna nueva del menú tiene que viajar en el clon.
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

  insert into public.menu_products (id, business_id, category_id, name, description, image_url, sort_order, is_active, prompt_modifiers, pinned_order)
  select public.derive_uuid(p_target, p.id::text), p_target, public.derive_uuid(p_target, p.category_id::text),
         p.name, p.description, p.image_url, p.sort_order, p.is_active, p.prompt_modifiers, p.pinned_order
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

-- Cuántas ventas de cada producto llevaron extras: [{product_id, items, with_extras}, …].
create or replace function public.product_extras_usage(p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'items', x.items, 'with_extras', x.with_extras)), '[]'::jsonb)
  from (
    select v.product_id,
           count(*) as items,
           count(*) filter (where exists (select 1 from public.ticket_item_modifiers m where m.ticket_item_id = i.id)) as with_extras
    from public.ticket_items i
    join public.tickets t on t.id = i.ticket_id
    join public.menu_variants v on v.id = i.variant_id
    where t.business_id = (select business_id from public.member_ctx())
      and t.status = 'completado'
      and t.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
    group by v.product_id
  ) x;
$$;

revoke all on function public.product_extras_usage(int) from public, anon;
grant execute on function public.product_extras_usage(int) to authenticated;
