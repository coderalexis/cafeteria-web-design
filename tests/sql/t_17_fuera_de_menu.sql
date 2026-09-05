-- t_17_fuera_de_menu.sql — renglones fuera de menú: el precio lo manda la
-- caja pero acotado, con nombre, sin extras y con el módulo encendido; el
-- renglón queda marcado y sin costo; las promociones por ticket lo cuentan y
-- las de categoría no; lo vendido así se puede repetir; corregir funciona.
do $t$
declare
  c pruebas.cafe_ids;
  otro pruebas.cafe_ids;
  v_t jsonb;
  v_b jsonb;
  v_rec jsonb;
  v_dow smallint := extract(dow from now() at time zone 'America/Mexico_City')::smallint;
  v_hora int := extract(hour from now() at time zone 'America/Mexico_City')::int;
  v_promo uuid;
  v_fila record;
  v_msg text;
begin
  c := pruebas.cafe('cafe-fuera');
  perform pruebas.como(c.cashier_id);

  -- Un latte del menú y dos «fruta picada sin yogurt» a $45.50.
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 1),
    jsonb_build_object('custom', jsonb_build_object('name', '  Fruta  picada sin yogurt ', 'price', 45.5), 'quantity', 2, 'notes', 'sin miel')));
  perform pruebas.espera((v_t->>'total')::numeric = c.precio_chico + 91,
    format('el total suma el menú y lo fuera de menú (dio %s)', v_t->>'total'));
  select * into v_fila from public.ticket_items where ticket_id = (v_t->>'ticket_id')::uuid and is_custom;
  perform pruebas.espera(found and v_fila.product_name = 'Fruta picada sin yogurt' and v_fila.unit_price = 45.5
    and v_fila.quantity = 2 and v_fila.line_total = 91 and v_fila.product_id is null and v_fila.variant_id is null
    and v_fila.unit_cost = 0 and v_fila.notes = 'sin miel',
    'el renglón queda marcado, con nombre limpio, precio de caja, sin producto ni costo');
  perform pruebas.espera(
    (select count(*) from public.ticket_items where ticket_id = (v_t->>'ticket_id')::uuid and not is_custom) = 1,
    'el renglón del menú sigue siendo del menú');

  -- Lo que no pasa: sin nombre, precio 0, precio absurdo, con extras, las dos cosas a la vez.
  foreach v_msg in array array[
    jsonb_build_array(jsonb_build_object('custom', jsonb_build_object('name', '   ', 'price', 10), 'quantity', 1))::text,
    jsonb_build_array(jsonb_build_object('custom', jsonb_build_object('name', 'Algo', 'price', 0), 'quantity', 1))::text,
    jsonb_build_array(jsonb_build_object('custom', jsonb_build_object('name', 'Algo', 'price', 10000), 'quantity', 1))::text,
    jsonb_build_array(jsonb_build_object('custom', jsonb_build_object('name', 'Algo', 'price', 10), 'quantity', 1, 'modifiers', jsonb_build_array(c.modifier_id)))::text
  ] loop
    begin
      perform public.create_ticket(gen_random_uuid(), 'efectivo', v_msg::jsonb);
      raise exception 'FALLA: dejó pasar un renglón fuera de menú inválido: %', v_msg;
    exception when others then
      if sqlerrm like 'FALLA:%' then raise; end if;
      perform pruebas.espera(sqlerrm like '%fuera de menú necesita nombre%', 'renglón inválido rechazado con el mensaje claro: ' || sqlerrm);
    end;
  end loop;
  begin
    perform public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
      jsonb_build_object('variant_id', c.variant_chico, 'custom', jsonb_build_object('name', 'Algo', 'price', 10), 'quantity', 1)));
    -- Con variant_id, el elemento cuenta como del menú y el `custom` se ignora: es un latte normal.
  end;

  -- Con el módulo apagado no se vende fuera de menú (lo del menú sigue igual).
  perform pruebas.como_postgres();
  update public.businesses set settings = coalesce(settings, '{}'::jsonb) || '{"custom_items": false}'::jsonb where id = c.business_id;
  perform pruebas.como(c.cashier_id);
  begin
    perform public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
      jsonb_build_object('custom', jsonb_build_object('name', 'Algo', 'price', 10), 'quantity', 1)));
    raise exception 'FALLA: dejó vender fuera de menú con el módulo apagado';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%fuera de menú está apagado%', 'módulo apagado: ' || sqlerrm);
  end;
  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1));
  perform pruebas.como_postgres();
  update public.businesses set settings = settings - 'custom_items' where id = c.business_id;
  perform pruebas.como(c.cashier_id);

  -- Promoción por ticket: lo fuera de menú cuenta. Por categoría: no.
  perform pruebas.como_postgres();
  insert into public.promotions (business_id, name, kind, value, scope, weekdays, start_hour, end_hour)
  values (c.business_id, 'Diez por ciento', 'porcentaje', 10, 'ticket', array[v_dow], v_hora, least(v_hora + 1, 24))
  returning id into v_promo;
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('custom', jsonb_build_object('name', 'Charola', 'price', 100), 'quantity', 1)));
  perform pruebas.espera((v_t->>'discount_total')::numeric = 10 and (v_t->>'total')::numeric = 90,
    format('la promoción por ticket descuenta también lo fuera de menú (dio desc %s total %s)', v_t->>'discount_total', v_t->>'total'));
  perform pruebas.como_postgres();
  update public.promotions set scope = 'categoria', category_id = c.category_id where id = v_promo;
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('custom', jsonb_build_object('name', 'Charola', 'price', 100), 'quantity', 1)));
  perform pruebas.espera((v_t->>'discount_total')::numeric = 0,
    format('la promoción por categoría no toca lo fuera de menú (dio desc %s)', v_t->>'discount_total'));
  perform pruebas.como_postgres();
  update public.promotions set is_active = false where id = v_promo;
  perform pruebas.como(c.cashier_id);

  -- Lo vendido así se puede repetir: agrupado por nombre, con el último precio.
  v_rec := public.custom_items_recent(60);
  perform pruebas.espera(
    (select count(*) from jsonb_array_elements(v_rec)) = 2
    and exists (select 1 from jsonb_array_elements(v_rec) e where e->>'name' = 'Charola' and (e->>'price')::numeric = 100 and (e->>'n')::int = 2)
    and exists (select 1 from jsonb_array_elements(v_rec) e where e->>'name' = 'Fruta picada sin yogurt' and (e->>'price')::numeric = 45.5),
    format('recientes agrupados con su último precio (dio %s)', v_rec::text));

  -- Corregir una venta con renglón fuera de menú: el renglón viaja tal cual.
  v_b := public.correct_ticket((v_t->>'ticket_id')::uuid, gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('custom', jsonb_build_object('name', 'Charola', 'price', 120), 'quantity', 1)));
  perform pruebas.espera((v_b->>'total')::numeric = 120 and (select is_custom from public.ticket_items where ticket_id = (v_b->>'ticket_id')::uuid),
    'corregir conserva el renglón fuera de menú con el precio nuevo');

  -- El vecino no ve lo que vendió este café.
  otro := pruebas.cafe('cafe-vecino-fuera');
  perform pruebas.como(otro.cashier_id);
  perform pruebas.espera((select count(*) from jsonb_array_elements(public.custom_items_recent(60))) = 0, 'el vecino no ve recientes ajenos');
end $t$;
