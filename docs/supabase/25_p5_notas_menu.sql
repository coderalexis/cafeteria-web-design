-- 25_p5_notas_menu.sql — P5: notas del menú público (migración: p5_notas_menu).
--
-- Toda carta impresa tiene letra chica: "nuestros jarabes son libres de
-- azúcar", "los paquetes incluyen café del día y fruta", "precios con IVA".
-- No cabía en ningún lado: `receipt_footer` sale en el TICKET (después de
-- pagar, cuando ya no sirve para decidir) y meterla en la descripción de cada
-- producto la repite cinco veces.
--
-- Dos lugares, porque son dos cosas distintas:
--   · `businesses.settings.menu_note` — al pie de todo el menú. No necesita
--     columna: `settings` ya está en el grant por columna de la migración 09,
--     así que el dueño puede escribirla desde su panel.
--   · `menu_categories.note` — bajo el título de una categoría, para lo que
--     solo aplica ahí. Va en columna porque es de la categoría, no del
--     negocio. `menu_categories` sí tiene políticas de escritura completas
--     para owner|admin, así que la columna nueva es editable sin más grants.
--
-- `public_menu` v2 devuelve ambas. Sigue siendo el único RPC con grant a
-- `anon` y sigue listando columnas explícitas: `cost` nunca sale de aquí.

alter table public.menu_categories add column if not exists note text;

comment on column public.menu_categories.note is
  'Nota bajo el título de la categoría en el menú público (letra chica de la carta).';

create or replace function public.public_menu(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_result jsonb;
begin
  if p_slug is null or length(p_slug) > 60 then
    return null;
  end if;

  select id, name, slug, address, phone, receipt_header, settings, status, is_template
  into v_biz
  from businesses
  where slug = p_slug;

  if not found or v_biz.status <> 'active' or v_biz.is_template then
    return null;
  end if;
  if coalesce(v_biz.settings->>'public_menu', 'false') <> 'true' then
    return null;
  end if;

  select jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_biz.name,
      'slug', v_biz.slug,
      'address', v_biz.address,
      'phone', v_biz.phone,
      'tagline', v_biz.receipt_header,
      'menu_note', nullif(v_biz.settings->>'menu_note', '')
    ),
    'categories', coalesce((
      select jsonb_agg(cat order by cat_order)
      from (
        select c.sort_order as cat_order,
               jsonb_build_object(
                 'name', c.name,
                 'slug', c.slug,
                 'color', c.color,
                 'note', nullif(c.note, ''),
                 'products', coalesce((
                   select jsonb_agg(prod order by prod_order)
                   from (
                     select p.sort_order as prod_order,
                            jsonb_build_object(
                              'name', p.name,
                              'description', p.description,
                              'variants', coalesce((
                                select jsonb_agg(jsonb_build_object(
                                         'name', v.name,
                                         'size_label', v.size_label,
                                         'price', v.price
                                       ) order by v.sort_order)
                                from menu_variants v
                                where v.product_id = p.id and v.business_id = v_biz.id and v.is_active
                              ), '[]'::jsonb),
                              'extras', coalesce((
                                select jsonb_agg(distinct jsonb_build_object(
                                         'name', m.name,
                                         'price', m.price_delta
                                       ))
                                from product_modifier_groups pmg
                                join modifier_groups g
                                  on g.id = pmg.group_id and g.business_id = v_biz.id and g.is_active
                                join modifiers m
                                  on m.group_id = g.id and m.business_id = v_biz.id and m.is_active
                                where pmg.product_id = p.id and pmg.business_id = v_biz.id
                                  and m.price_delta > 0
                              ), '[]'::jsonb)
                            ) as prod
                     from menu_products p
                     where p.category_id = c.id and p.business_id = v_biz.id and p.is_active
                       and exists (
                         select 1 from menu_variants v
                         where v.product_id = p.id and v.business_id = v_biz.id and v.is_active
                       )
                   ) prods
                 ), '[]'::jsonb)
               ) as cat
        from menu_categories c
        where c.business_id = v_biz.id and c.is_active
      ) cats
      where jsonb_array_length(cat->'products') > 0
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Único RPC del sistema que `anon` puede ejecutar.
revoke all on function public.public_menu(text) from public;
grant execute on function public.public_menu(text) to anon, authenticated;
