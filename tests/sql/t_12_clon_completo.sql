-- t_12_clon_completo.sql — clonar la plantilla no debe perder columnas.
--
-- `clone_menu` nació antes que el color y la nota de la categoría, el costo de
-- la variante y la opción por omisión del extra. Cuatro columnas que se
-- quedaban en null sin avisar, así que cada cafetería nueva empezaba sin
-- colores, sin costos y sin la leche por omisión ya marcada.
do $t$
declare
  c pruebas.cafe_ids;
  v_destino uuid;
  r jsonb;
  v_cat uuid;
  v_sin_color int;
begin
  c := pruebas.cafe('cafe-molde');

  -- El origen tiene las cuatro columnas con valor
  perform pruebas.como_postgres();
  select id into v_cat from public.menu_categories where business_id = c.business_id limit 1;
  update public.menu_categories set color = 'violet', note = 'Precios con IVA' where id = v_cat;
  update public.modifiers set is_default = true where id = c.modifier_id;

  v_destino := gen_random_uuid();
  insert into public.businesses (id, name, slug, created_by)
  values (v_destino, 'Café Clonado', 'cafe-clonado-' || substr(v_destino::text, 1, 8), c.owner_id);

  r := public.clone_menu(c.business_id, v_destino);
  perform pruebas.espera((r->>'categories')::int > 0 and (r->>'variants')::int > 0, 'el clon trajo menú');

  perform pruebas.espera(
    (select count(*) from public.menu_categories
      where business_id = v_destino and color = 'violet' and note = 'Precios con IVA') = 1,
    'el color y la nota de la categoría viajan al clon');
  perform pruebas.espera(
    (select coalesce(sum(cost), 0) from public.menu_variants where business_id = v_destino)
    = (select coalesce(sum(cost), 0) from public.menu_variants where business_id = c.business_id),
    'los costos viajan al clon');
  perform pruebas.espera(
    (select count(*) from public.modifiers where business_id = v_destino and is_default) = 1,
    'la opción por omisión viaja al clon');

  -- Y la plantilla del sistema ya no tiene categorías sin color (migración 45)
  select count(*) into v_sin_color
    from public.menu_categories c2
    join public.businesses b on b.id = c2.business_id
   where b.is_template and c2.color is null;
  perform pruebas.espera(v_sin_color = 0, format('la plantilla trae colores (sin color: %s)', v_sin_color));
end $t$;
