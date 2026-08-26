-- 17_p4_menu_publico.sql — P4: menú público con QR (migración: p4_menu_publico).
--
-- Una página SIN sesión (/menu/<slug>) para el QR de las mesas. Como no hay
-- usuario, no hay `member_ctx()` ni RLS que aplique: el único camino es este
-- RPC SECURITY DEFINER con grant a `anon`.
--
-- Reglas del RPC (todas deliberadas):
--   · Solo publica si el dueño lo activó (`settings.public_menu = true`).
--     Apagado por defecto: el menú de un negocio no se hace público solo.
--   · Nada de negocios suspendidos ni de la plantilla interna.
--   · Columnas EXPLÍCITAS. En particular `menu_variants.cost` NUNCA sale de
--     aquí: es información interna del negocio (migración 16).
--   · Devuelve null cuando no aplica; la app responde 404 sin distinguir entre
--     "no existe" y "no publicado".

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
      'tagline', v_biz.receipt_header
    ),
    'categories', coalesce((
      select jsonb_agg(cat order by cat_order)
      from (
        select c.sort_order as cat_order,
               jsonb_build_object(
                 'name', c.name,
                 'slug', c.slug,
                 'color', c.color,
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
