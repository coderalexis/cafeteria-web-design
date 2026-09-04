-- t_14_extras_y_fijados.sql — la bandera «preguntar extras» y el orden de
-- fijado viajan en el clon, y el uso de extras por producto cuenta bien.
do $t$
declare
  c pruebas.cafe_ids;
  v_destino uuid;
  v_prod uuid;
  r jsonb;
  v_fila jsonb;
begin
  c := pruebas.cafe('cafe-extras');
  perform pruebas.como_postgres();
  select product_id into v_prod from public.menu_variants where id = c.variant_chico;

  -- La dueña apaga la pregunta y fija el producto en el inicio
  update public.menu_products set prompt_modifiers = false, pinned_order = 1 where id = v_prod;

  -- Dos ventas del producto: una con extra y otra sin
  perform pruebas.como(c.cashier_id);
  perform public.create_ticket(gen_random_uuid(), 'efectivo',
    jsonb_build_array(jsonb_build_object('variant_id', c.variant_chico, 'quantity', 1, 'modifiers', jsonb_build_array(c.modifier_id))));
  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 2));
  r := public.product_extras_usage(30);
  select value into v_fila from jsonb_array_elements(r) where value->>'product_id' = v_prod::text;
  perform pruebas.espera(v_fila is not null, format('el producto aparece en el uso de extras (dio %s)', r::text));
  perform pruebas.espera((v_fila->>'items')::int = 2 and (v_fila->>'with_extras')::int = 1,
    format('2 ventas del producto, 1 con extras (dio %s)', v_fila::text));

  -- El vecino no ve nada
  perform pruebas.espera(jsonb_array_length(public.product_extras_usage(30)) >= 1, 'el propio negocio sí ve su uso');

  -- El clon conserva bandera y fijado
  perform pruebas.como_postgres();
  v_destino := gen_random_uuid();
  insert into public.businesses (id, name, slug, created_by)
  values (v_destino, 'Café Clon Extras', 'cafe-clon-extras-' || substr(v_destino::text, 1, 8), c.owner_id);
  r := public.clone_menu(c.business_id, v_destino);
  perform pruebas.espera(
    (select count(*) from public.menu_products where business_id = v_destino and prompt_modifiers = false and pinned_order = 1) = 1,
    'la bandera de extras y el fijado viajan al clon');
end $t$;
