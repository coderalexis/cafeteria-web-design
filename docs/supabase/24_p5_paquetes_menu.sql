-- 24_p5_paquetes_menu.sql — P5: paquetes de menú (migración: p5_paquetes_menu).
--
-- Hasta ahora, registrarse clonaba entero el menú de `plantilla-cafeteria`:
-- 10 categorías, 88 productos y 160 variantes que nadie pidió. Quien abre una
-- cafetería de especialidad no vende crepas, y borrar 88 productos a mano para
-- dejar los 6 que sí vende es peor que empezar de cero.
--
-- Ahora el dueño arma su menú con paquetes ("Café espresso", "Frappés",
-- "Panadería"…). El catálogo vive en `lib/menu-packs.ts` — datos de la app, no
-- filas de la base: así se corrige un precio o se agrega un sabor con un deploy,
-- sin migración, y no hay una tabla de plantillas que mantener por negocio.
--
-- Por qué un RPC y no inserts desde la app: son tres niveles encadenados
-- (categoría → producto → variantes) más los modificadores. A medias quedaría
-- un producto sin variantes, invisible en el menú público e invendible en el
-- POS. Dentro de la función es una sola transacción.
--
-- Reglas:
--   · El negocio SIEMPRE sale de `member_ctx()`, nunca del cliente.
--   · Solo owner|admin (la comprobación va aquí, no en la interfaz, porque
--     `authenticated` puede llamar al RPC directo).
--   · **Aditivo e idempotente**: una categoría que ya existe se reutiliza y un
--     producto con el mismo nombre en ella se omite. Instalar dos veces el
--     mismo paquete no duplica nada, y dos paquetes pueden compartir categoría.
--   · Topes de tamaño: el payload lo arma el servidor, pero el RPC no puede
--     asumirlo.

create or replace function public.install_menu_pack(p_pack jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_cat jsonb; v_prod jsonb; v_grp jsonb;
  v_cat_id uuid; v_prod_id uuid; v_grp_id uuid;
  v_next int; v_i int;
  v_cats int := 0; v_prods int := 0; v_vars int := 0; v_grps int := 0;
begin
  select * into v_ctx from member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo el dueño o un administrador puede agregar productos.';
  end if;
  v_biz := v_ctx.business_id;

  if jsonb_typeof(p_pack) is distinct from 'object' then
    raise exception 'Paquete inválido.';
  end if;
  if jsonb_array_length(coalesce(p_pack->'categories', '[]'::jsonb)) > 25 then
    raise exception 'El paquete trae demasiadas categorías.';
  end if;
  if length(p_pack::text) > 200000 then
    raise exception 'El paquete es demasiado grande.';
  end if;

  for v_cat in select * from jsonb_array_elements(coalesce(p_pack->'categories', '[]'::jsonb))
  loop
    if coalesce(v_cat->>'slug', '') = '' or coalesce(v_cat->>'name', '') = '' then
      raise exception 'Categoría sin nombre o identificador.';
    end if;
    if jsonb_array_length(coalesce(v_cat->'products', '[]'::jsonb)) > 80 then
      raise exception 'La categoría «%» trae demasiados productos.', v_cat->>'name';
    end if;

    -- Reutilizar la categoría si ya está: dos paquetes pueden compartirla.
    select id into v_cat_id from menu_categories
    where business_id = v_biz and slug = v_cat->>'slug';

    if v_cat_id is null then
      select coalesce(max(sort_order), 0) + 1 into v_next
      from menu_categories where business_id = v_biz;
      insert into menu_categories (business_id, name, slug, sort_order, color)
      values (v_biz, v_cat->>'name', v_cat->>'slug', v_next, nullif(v_cat->>'color', ''))
      returning id into v_cat_id;
      v_cats := v_cats + 1;
    end if;

    for v_prod in select * from jsonb_array_elements(coalesce(v_cat->'products', '[]'::jsonb))
    loop
      -- Ya lo tiene (lo instaló antes, o lo creó a mano): no duplicar.
      perform 1 from menu_products
      where business_id = v_biz and category_id = v_cat_id and name = v_prod->>'name';
      if found then
        continue;
      end if;

      select coalesce(max(sort_order), 0) + 1 into v_next
      from menu_products where business_id = v_biz and category_id = v_cat_id;
      insert into menu_products (business_id, category_id, name, description, sort_order)
      values (v_biz, v_cat_id, v_prod->>'name', nullif(v_prod->>'description', ''), v_next)
      returning id into v_prod_id;
      v_prods := v_prods + 1;

      insert into menu_variants (business_id, product_id, name, size_label, price, sort_order)
      select v_biz, v_prod_id, e.value->>'name', nullif(e.value->>'size_label', ''),
             (e.value->>'price')::numeric, e.ord::int
      from jsonb_array_elements(coalesce(v_prod->'variants', '[]'::jsonb)) with ordinality as e(value, ord);
      get diagnostics v_i = row_count;
      v_vars := v_vars + v_i;

      if v_i = 0 then
        raise exception 'El producto «%» no trae precios.', v_prod->>'name';
      end if;
    end loop;
  end loop;

  -- Modificadores: se crean si no existen y se enganchan a los productos de las
  -- categorías que indique el paquete. El enganche corre aunque el grupo ya
  -- existiera, para que "Tipo de leche" alcance también a los frappés que
  -- acaban de entrar.
  for v_grp in select * from jsonb_array_elements(coalesce(p_pack->'modifier_groups', '[]'::jsonb))
  loop
    if coalesce(v_grp->>'name', '') = '' then
      raise exception 'Grupo de modificadores sin nombre.';
    end if;

    select id into v_grp_id from modifier_groups
    where business_id = v_biz and name = v_grp->>'name';

    if v_grp_id is null then
      select coalesce(max(sort_order), 0) + 1 into v_next
      from modifier_groups where business_id = v_biz;
      insert into modifier_groups (business_id, name, min_select, max_select, is_required, sort_order)
      values (v_biz, v_grp->>'name',
              coalesce((v_grp->>'min_select')::int, 0),
              nullif(v_grp->>'max_select', '')::int,
              coalesce((v_grp->>'is_required')::boolean, false),
              v_next)
      returning id into v_grp_id;
      v_grps := v_grps + 1;

      insert into modifiers (business_id, group_id, name, price_delta, sort_order)
      select v_biz, v_grp_id, e.value->>'name',
             coalesce((e.value->>'price_delta')::numeric, 0), e.ord::int
      from jsonb_array_elements(coalesce(v_grp->'options', '[]'::jsonb)) with ordinality as e(value, ord);
    end if;

    insert into product_modifier_groups (business_id, product_id, group_id)
    select v_biz, p.id, v_grp_id
    from menu_products p
    join menu_categories c on c.id = p.category_id and c.business_id = v_biz
    where p.business_id = v_biz
      and c.slug in (select jsonb_array_elements_text(coalesce(v_grp->'attach_to', '[]'::jsonb)))
    on conflict do nothing;
  end loop;

  return jsonb_build_object(
    'categorias', v_cats,
    'productos', v_prods,
    'variantes', v_vars,
    'grupos', v_grps
  );
end;
$$;

revoke all on function public.install_menu_pack(jsonb) from public, anon;
grant execute on function public.install_menu_pack(jsonb) to authenticated;
