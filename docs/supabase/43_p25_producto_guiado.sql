-- 43_p25_producto_guiado.sql — P25: un producto completo en UNA transacción
-- (migración: p25_producto_guiado).
--
-- El asistente «Nuevo producto» del panel crea de un jalón el producto, sus
-- precios (variantes), sus preguntas nuevas con opciones, y los enganches a
-- preguntas que ya existían. Hacerlo desde la app con los inserts de siempre
-- son cinco viajes y la posibilidad real de quedar a medias: un producto sin
-- precio (invisible e invendible) o una pregunta creada y no enganchada, que
-- es justo el olvido que el asistente existe para evitar. Aquí o entra todo
-- o no entra nada.
--
-- Recibe un solo JSON:
--   { name, description?,
--     category: { id } | { name, slug, color? },
--     variants: [{ name?, size_label?, price, cost? }],           -- 1..12
--     groups:   [ { id } | { name, min_select, max_select|null,     -- 0..8
--                            options: [{ name, price_delta?, is_default? }] } ] }
-- Devuelve { product_id, category_id, group_ids }.
--
-- Valida lo mismo que validan las pantallas de siempre (roles, negocio,
-- reglas mínimo/máximo, una sola opción por omisión) porque el cliente es
-- manipulable; los mensajes van en español porque llegan tal cual a la
-- persona.
create or replace function public.create_product_guided(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_name text;
  v_desc text;
  v_cat_id uuid;
  v_prod_id uuid;
  v_grp_id uuid;
  v_var jsonb;
  v_grp jsonb;
  v_opt jsonb;
  v_next int;
  v_i int;
  v_n int;
  v_min int;
  v_max int;
  v_defaults int;
  v_group_ids uuid[] := '{}';
begin
  select * into v_ctx from member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo el dueño o un administrador puede agregar productos.';
  end if;
  v_biz := v_ctx.business_id;

  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Datos inválidos.';
  end if;
  if length(p::text) > 60000 then
    raise exception 'El producto trae demasiados datos.';
  end if;

  -- ── Nombre y descripción ─────────────────────────────────────────
  v_name := trim(coalesce(p->>'name', ''));
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'El nombre del producto debe tener entre 2 y 80 caracteres.';
  end if;
  v_desc := nullif(trim(coalesce(p->>'description', '')), '');
  if length(v_desc) > 300 then
    raise exception 'La descripción es demasiado larga (máximo 300 caracteres).';
  end if;

  -- ── Categoría: una existente (id) o una nueva (name + slug) ──────
  if coalesce(p->'category'->>'id', '') <> '' then
    select id into v_cat_id from menu_categories
    where business_id = v_biz and id = (p->'category'->>'id')::uuid;
    if v_cat_id is null then
      raise exception 'Esa categoría no existe.';
    end if;
  else
    if length(trim(coalesce(p->'category'->>'name', ''))) < 2 or coalesce(p->'category'->>'slug', '') = '' then
      raise exception 'Elige una categoría o escribe el nombre de una nueva.';
    end if;
    select coalesce(max(sort_order), 0) + 1 into v_next from menu_categories where business_id = v_biz;
    insert into menu_categories (business_id, name, slug, sort_order, color)
    values (v_biz, trim(p->'category'->>'name'), p->'category'->>'slug', v_next, nullif(p->'category'->>'color', ''))
    returning id into v_cat_id;
  end if;

  -- ── Producto (dos «Latte» en la misma categoría confunden al cajero) ──
  perform 1 from menu_products
  where business_id = v_biz and category_id = v_cat_id and lower(name) = lower(v_name);
  if found then
    raise exception 'Ya tienes un producto llamado «%» en esa categoría.', v_name;
  end if;
  select coalesce(max(sort_order), 0) + 1 into v_next
  from menu_products where business_id = v_biz and category_id = v_cat_id;
  insert into menu_products (business_id, category_id, name, description, sort_order)
  values (v_biz, v_cat_id, v_name, v_desc, v_next)
  returning id into v_prod_id;

  -- ── Precios ──────────────────────────────────────────────────────
  if jsonb_typeof(p->'variants') is distinct from 'array' or jsonb_array_length(p->'variants') = 0 then
    raise exception 'Ponle al menos un precio.';
  end if;
  if jsonb_array_length(p->'variants') > 12 then
    raise exception 'Demasiados tamaños (máximo 12).';
  end if;
  v_i := 0;
  for v_var in select * from jsonb_array_elements(p->'variants') loop
    v_i := v_i + 1;
    if coalesce((v_var->>'price')::numeric, -1) < 0 then
      raise exception 'El precio de «%» no es válido.', coalesce(nullif(trim(v_var->>'name'), ''), v_name);
    end if;
    if coalesce((v_var->>'cost')::numeric, 0) < 0 then
      raise exception 'El costo no puede ser negativo.';
    end if;
    insert into menu_variants (business_id, product_id, name, size_label, price, cost, sort_order)
    values (
      v_biz, v_prod_id,
      coalesce(nullif(trim(v_var->>'name'), ''), 'Único'),
      nullif(trim(coalesce(v_var->>'size_label', '')), ''),
      round((v_var->>'price')::numeric, 2),
      round(coalesce((v_var->>'cost')::numeric, 0), 2),
      v_i
    );
  end loop;

  -- ── Preguntas (extras): existentes por id, o nuevas con sus opciones ──
  if jsonb_typeof(coalesce(p->'groups', '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Datos inválidos en las preguntas.';
  end if;
  if jsonb_array_length(coalesce(p->'groups', '[]'::jsonb)) > 8 then
    raise exception 'Demasiadas preguntas para un producto (máximo 8).';
  end if;
  for v_grp in select * from jsonb_array_elements(coalesce(p->'groups', '[]'::jsonb)) loop
    if coalesce(v_grp->>'id', '') <> '' then
      select id into v_grp_id from modifier_groups
      where business_id = v_biz and id = (v_grp->>'id')::uuid;
      if v_grp_id is null then
        raise exception 'Una de las preguntas elegidas ya no existe.';
      end if;
    else
      if length(trim(coalesce(v_grp->>'name', ''))) < 2 or length(trim(v_grp->>'name')) > 60 then
        raise exception 'Cada pregunta necesita un nombre (de 2 a 60 caracteres).';
      end if;
      v_min := coalesce((v_grp->>'min_select')::int, 0);
      v_max := nullif(v_grp->>'max_select', '')::int;
      if v_min < 0 or v_min > 20 or (v_max is not null and (v_max < 1 or v_max > 20 or v_max < v_min)) then
        raise exception 'La regla de «%» no es válida.', trim(v_grp->>'name');
      end if;
      if jsonb_typeof(v_grp->'options') is distinct from 'array' or jsonb_array_length(v_grp->'options') = 0 then
        raise exception 'La pregunta «%» necesita al menos una opción.', trim(v_grp->>'name');
      end if;
      if jsonb_array_length(v_grp->'options') > 20 then
        raise exception 'La pregunta «%» trae demasiadas opciones (máximo 20).', trim(v_grp->>'name');
      end if;
      -- Una regla imposible dejaría el producto sin poderse cobrar.
      if v_min > jsonb_array_length(v_grp->'options') then
        raise exception 'La pregunta «%» pide elegir % pero solo tiene % opciones.',
          trim(v_grp->>'name'), v_min, jsonb_array_length(v_grp->'options');
      end if;
      select count(*) into v_defaults
      from jsonb_array_elements(v_grp->'options') o
      where coalesce((o.value->>'is_default')::boolean, false);
      if v_defaults > 1 then
        raise exception 'Solo una opción de «%» puede ir por omisión.', trim(v_grp->>'name');
      end if;

      select coalesce(max(sort_order), 0) + 1 into v_next from modifier_groups where business_id = v_biz;
      insert into modifier_groups (business_id, name, min_select, max_select, is_required, sort_order)
      values (v_biz, trim(v_grp->>'name'), v_min, v_max, v_min > 0, v_next)
      returning id into v_grp_id;

      v_n := 0;
      for v_opt in select * from jsonb_array_elements(v_grp->'options') loop
        v_n := v_n + 1;
        if length(trim(coalesce(v_opt->>'name', ''))) < 1 or length(trim(v_opt->>'name')) > 60 then
          raise exception 'Una opción de «%» no tiene nombre.', trim(v_grp->>'name');
        end if;
        if coalesce((v_opt->>'price_delta')::numeric, 0) < 0 then
          raise exception 'El costo extra de «%» no puede ser negativo.', trim(v_opt->>'name');
        end if;
        insert into modifiers (business_id, group_id, name, price_delta, sort_order, is_default)
        values (
          v_biz, v_grp_id, trim(v_opt->>'name'),
          round(coalesce((v_opt->>'price_delta')::numeric, 0), 2),
          v_n,
          coalesce((v_opt->>'is_default')::boolean, false)
        );
      end loop;
    end if;

    insert into product_modifier_groups (business_id, product_id, group_id)
    values (v_biz, v_prod_id, v_grp_id)
    on conflict do nothing;
    v_group_ids := v_group_ids || v_grp_id;
  end loop;

  -- Bitácora en la misma transacción (migración 37): si esto no entra, nada entró.
  perform public.log_audit(
    'producto.creado', v_name,
    jsonb_build_object('asistente', true, 'precios', jsonb_array_length(p->'variants'),
                       'preguntas', coalesce(array_length(v_group_ids, 1), 0))
  );

  return jsonb_build_object('product_id', v_prod_id, 'category_id', v_cat_id, 'group_ids', to_jsonb(v_group_ids));
end;
$$;

revoke all on function public.create_product_guided(jsonb) from public, anon;
grant execute on function public.create_product_guided(jsonb) to authenticated;
