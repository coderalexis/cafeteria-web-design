-- t_08_lineas.sql — el precio de un carrito se calcula en un solo lugar, y
-- la promoción y el cobro salen de ahí.
do $t$
declare
  c pruebas.cafe_ids;
  v_items jsonb;
  r jsonb;
  v_lineas int; v_sub numeric; v_costo numeric;
  v_dow smallint; v_hora int;
begin
  c := pruebas.cafe('cafe-lineas');

  -- Un carrito con de todo: dos chicos con avena, un grande solo, con nota
  v_items := jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 2, 'modifiers', jsonb_build_array(c.modifier_id)),
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 1, 'notes', ' sin espuma ')
  );
  -- (40 + 12) × 2 = 104 · 55 × 1 = 55 → 159 ; costo 12×2 + 16 = 40

  -- 1) ticket_lines pone precio como se espera
  select count(*), sum(line_total), sum(unit_cost * quantity)
    into v_lineas, v_sub, v_costo
  from public.ticket_lines(c.business_id, v_items);
  perform pruebas.espera(v_lineas = 2, format('dos líneas (dio %s)', v_lineas));
  perform pruebas.espera(v_sub = 159, format('subtotal 159 (dio %s)', v_sub));
  perform pruebas.espera(v_costo = 40, format('costo 40 (dio %s)', v_costo));
  perform pruebas.espera(
    (select notes from public.ticket_lines(c.business_id, v_items) where idx = 2) = 'sin espuma',
    'la nota llega recortada');
  perform pruebas.espera(
    (select unit_price from public.ticket_lines(c.business_id, v_items) where idx = 1) = 52,
    'precio unitario con extra: 52');

  -- 2) Una variante que no existe simplemente no produce línea (create_ticket
  --    la rechaza por su cuenta con su validación de conteo)
  select count(*) into v_lineas from public.ticket_lines(c.business_id,
    jsonb_build_array(jsonb_build_object('variant_id', gen_random_uuid(), 'quantity', 1)));
  perform pruebas.espera(v_lineas = 0, 'variante inexistente → sin línea');

  -- 3) create_ticket cobra exactamente ese subtotal y graba los renglones
  --    con el mismo precio y costo
  perform pruebas.como(c.cashier_id);
  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items);
  perform pruebas.espera((r->>'subtotal')::numeric = 159, format('create_ticket subtotal 159 (dio %s)', r->>'subtotal'));
  perform pruebas.como_postgres();
  select sum(line_total), sum(unit_cost * quantity) into v_sub, v_costo
    from public.ticket_items where ticket_id = (r->>'ticket_id')::uuid;
  perform pruebas.espera(v_sub = 159 and v_costo = 40, 'los renglones grabados suman lo mismo');
  perform pruebas.espera(
    (select count(*) from public.ticket_item_modifiers m
      join public.ticket_items i on i.id = m.ticket_item_id
      where i.ticket_id = (r->>'ticket_id')::uuid and m.modifier_name = 'Leche de avena') = 1,
    'el extra quedó grabado en su renglón');
  perform pruebas.espera(
    (select notes from public.ticket_items where ticket_id = (r->>'ticket_id')::uuid and variant_id = c.variant_grande) = 'sin espuma',
    'la nota del renglón se conserva');

  -- 4) La promoción descuenta sobre la MISMA base: 10 % de 159 = 15.90
  v_dow := extract(dow from (now() at time zone 'America/Mexico_City'))::smallint;
  v_hora := extract(hour from (now() at time zone 'America/Mexico_City'))::int;
  perform pruebas.como(c.owner_id);
  insert into public.promotions (name, kind, value, scope, weekdays, start_hour, end_hour)
  values ('Diez', 'porcentaje', 10, 'ticket', array[v_dow], v_hora, v_hora + 1);
  r := public.promo_preview(v_items);
  perform pruebas.espera((r->>'discount')::numeric = 15.90, format('promo sobre 159 → 15.90 (dio %s)', r->>'discount'));
  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items);
  perform pruebas.espera((r->>'discount_total')::numeric = 15.90 and (r->>'total')::numeric = 143.10,
    format('cobro con promo: −15.90 → 143.10 (dio %s / %s)', r->>'discount_total', r->>'total'));

  -- 5) Promoción por categoría: la base son solo las líneas de esa categoría
  update public.promotions set scope = 'categoria', category_id = c.category_id;
  r := public.promo_preview(v_items);
  perform pruebas.espera((r->>'discount')::numeric = 15.90, 'todo el carrito es de la categoría → misma base');

  perform pruebas.como_postgres();
end $t$;
