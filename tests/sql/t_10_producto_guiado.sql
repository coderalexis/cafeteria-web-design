-- t_10_producto_guiado.sql — el asistente de producto crea todo de un jalón
-- (categoría nueva, precios, preguntas nuevas y existentes) o no crea nada;
-- lo que crea se puede cobrar tal cual con sus extras.
do $t$
declare
  c pruebas.cafe_ids;
  r jsonb;
  v_prod uuid;
  v_cat uuid;
  v_variant uuid;
  v_pescado uuid;
  v_dos uuid;
  v_arroz uuid;
  v_camote uuid;
  v_extra_arroz uuid;
  v_n int;
  v_msg text;
  v_payload jsonb;
begin
  c := pruebas.cafe('cafe-guiado');

  v_payload := jsonb_build_object(
    'name', 'Comida fit',
    'description', 'Proteína a elegir con dos guarniciones',
    'category', jsonb_build_object('name', 'Comidas', 'slug', 'comidas'),
    'variants', jsonb_build_array(jsonb_build_object('price', 120, 'cost', 40)),
    'groups', jsonb_build_array(
      jsonb_build_object('id', c.modifier_group_id),
      jsonb_build_object('name', 'Proteína', 'min_select', 1, 'max_select', 1,
        'options', jsonb_build_array(
          jsonb_build_object('name', 'Pescado'),
          jsonb_build_object('name', 'Pollo', 'is_default', true))),
      jsonb_build_object('name', 'Porciones', 'min_select', 1, 'max_select', 1,
        'options', jsonb_build_array(
          jsonb_build_object('name', '1 porción', 'price_delta', 0),
          jsonb_build_object('name', '2 porciones', 'price_delta', 45))),
      jsonb_build_object('name', 'Guarniciones', 'min_select', 2, 'max_select', 2,
        'options', jsonb_build_array(
          jsonb_build_object('name', 'Arroz'), jsonb_build_object('name', 'Camote'), jsonb_build_object('name', 'Ensalada'))),
      jsonb_build_object('name', 'Guarnición extra', 'min_select', 0, 'max_select', null,
        'options', jsonb_build_array(
          jsonb_build_object('name', 'Arroz extra', 'price_delta', 20),
          jsonb_build_object('name', 'Camote extra', 'price_delta', 20)))
    )
  );

  -- 1) El cajero no puede
  perform pruebas.como(c.cashier_id);
  begin
    r := public.create_product_guided(v_payload);
    v_msg := 'sin error';
  exception when others then
    v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'Solo el dueño%', format('el cajero no crea productos (dio: %s)', v_msg));

  -- 2) El dueño crea todo de un jalón
  perform pruebas.como(c.owner_id);
  r := public.create_product_guided(v_payload);
  v_prod := (r->>'product_id')::uuid;
  v_cat := (r->>'category_id')::uuid;
  perform pruebas.espera(jsonb_array_length(r->'group_ids') = 5, 'cinco preguntas enganchadas (una existente, cuatro nuevas)');

  perform pruebas.como_postgres();
  perform pruebas.espera(
    (select name || '|' || slug from public.menu_categories where id = v_cat and business_id = c.business_id) = 'Comidas|comidas',
    'la categoría nueva existe');
  select id into v_variant from public.menu_variants where product_id = v_prod;
  perform pruebas.espera(
    (select name || '|' || price || '|' || cost from public.menu_variants where product_id = v_prod) = 'Único|120|40',
    'un solo precio → variante «Único» a 120 con costo 40');
  perform pruebas.espera(
    (select count(*) from public.product_modifier_groups where product_id = v_prod) = 5, 'cinco enganches');
  perform pruebas.espera(
    (select min_select || '/' || coalesce(max_select::text, 'sin tope') || '/' || is_required
       from public.modifier_groups where business_id = c.business_id and name = 'Guarniciones') = '2/2/true',
    'Guarniciones: exactamente 2 y obligatoria');
  perform pruebas.espera(
    (select min_select || '/' || coalesce(max_select::text, 'sin tope')
       from public.modifier_groups where business_id = c.business_id and name = 'Guarnición extra') = '0/sin tope',
    'Guarnición extra: las que quiera');
  perform pruebas.espera(
    (select is_default from public.modifiers m join public.modifier_groups g on g.id = m.group_id
       where g.business_id = c.business_id and g.name = 'Proteína' and m.name = 'Pollo'),
    'Pollo quedó por omisión');
  perform pruebas.espera(
    (select count(*) from public.audit_events where business_id = c.business_id
       and action = 'producto.creado' and entity = 'Comida fit' and (details->>'asistente')::boolean) = 1,
    'quedó en la bitácora, en la misma transacción');

  -- 3) …y se cobra tal cual: pescado, 2 porciones (+45), arroz y camote, arroz extra (+20) = 185
  select m.id into v_pescado from public.modifiers m join public.modifier_groups g on g.id = m.group_id where g.business_id = c.business_id and g.name = 'Proteína' and m.name = 'Pescado';
  select m.id into v_dos from public.modifiers m join public.modifier_groups g on g.id = m.group_id where g.business_id = c.business_id and g.name = 'Porciones' and m.name = '2 porciones';
  select m.id into v_arroz from public.modifiers m join public.modifier_groups g on g.id = m.group_id where g.business_id = c.business_id and g.name = 'Guarniciones' and m.name = 'Arroz';
  select m.id into v_camote from public.modifiers m join public.modifier_groups g on g.id = m.group_id where g.business_id = c.business_id and g.name = 'Guarniciones' and m.name = 'Camote';
  select m.id into v_extra_arroz from public.modifiers m join public.modifier_groups g on g.id = m.group_id where g.business_id = c.business_id and g.name = 'Guarnición extra' and m.name = 'Arroz extra';
  perform pruebas.como(c.cashier_id);
  r := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', v_variant, 'quantity', 1,
      'modifiers', jsonb_build_array(v_pescado, v_dos, v_arroz, v_camote, v_extra_arroz))));
  perform pruebas.espera((r->>'total')::numeric = 185, format('la comida se cobra en 185 (dio %s)', r->>'total'));

  -- 4) A medias no entra nada: una regla imposible revienta y no deja rastro
  perform pruebas.como(c.owner_id);
  begin
    r := public.create_product_guided(jsonb_build_object(
      'name', 'Ensalada rota', 'category', jsonb_build_object('id', v_cat),
      'variants', jsonb_build_array(jsonb_build_object('price', 90)),
      'groups', jsonb_build_array(jsonb_build_object('name', 'Toppings', 'min_select', 3, 'max_select', 3,
        'options', jsonb_build_array(jsonb_build_object('name', 'Nuez'), jsonb_build_object('name', 'Arándano'))))));
    v_msg := 'sin error';
  exception when others then
    v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like '%pide elegir 3 pero solo tiene 2%', format('regla imposible rechazada (dio: %s)', v_msg));
  perform pruebas.como_postgres();
  perform pruebas.espera(
    (select count(*) from public.menu_products where business_id = c.business_id and name = 'Ensalada rota') = 0
    and (select count(*) from public.modifier_groups where business_id = c.business_id and name = 'Toppings') = 0,
    'de la ensalada rota no quedó ni el producto ni la pregunta');

  -- 5) Nombre repetido en la misma categoría, sin precio, dos por omisión
  perform pruebas.como(c.owner_id);
  begin
    r := public.create_product_guided(jsonb_build_object('name', 'comida FIT', 'category', jsonb_build_object('id', v_cat),
      'variants', jsonb_build_array(jsonb_build_object('price', 10))));
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'Ya tienes un producto llamado%', 'nombre repetido en la categoría se rechaza');
  begin
    r := public.create_product_guided(jsonb_build_object('name', 'Sin precio', 'category', jsonb_build_object('id', v_cat), 'variants', '[]'::jsonb));
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'Ponle al menos un precio%', 'sin precio se rechaza');
  begin
    r := public.create_product_guided(jsonb_build_object('name', 'Dos omisiones', 'category', jsonb_build_object('id', v_cat),
      'variants', jsonb_build_array(jsonb_build_object('price', 10)),
      'groups', jsonb_build_array(jsonb_build_object('name', 'Leche X', 'min_select', 0, 'max_select', 1,
        'options', jsonb_build_array(jsonb_build_object('name', 'A', 'is_default', true), jsonb_build_object('name', 'B', 'is_default', true))))));
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'Solo una opción%', 'dos opciones por omisión se rechazan');
  perform pruebas.como_postgres();
end $t$;
