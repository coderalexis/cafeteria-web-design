-- t_03_promociones.sql — las promociones por horario, decididas en el servidor.
-- Es el ensayo que se hizo a mano al construirlas, ahora repetible.
do $t$
declare
  c pruebas.cafe_ids;
  r jsonb;
  v_items jsonb;
  v_dow smallint; v_hora int;
  v_promo uuid; v_promo2 uuid;
  n int;
begin
  c := pruebas.cafe('cafe-promo');
  v_items := pruebas.items(c.variant_chico, 2);            -- subtotal 80
  v_dow := extract(dow from (now() at time zone 'America/Mexico_City'))::smallint;
  v_hora := extract(hour from (now() at time zone 'America/Mexico_City'))::int;

  perform pruebas.como(c.owner_id);

  -- 1) 20 % en la categoría, viva ahora: la vista previa y el cobro coinciden
  insert into public.promotions (name, kind, value, scope, category_id, weekdays, start_hour, end_hour)
  values ('Tarde de prueba', 'porcentaje', 20, 'categoria', c.category_id, array[v_dow], v_hora, v_hora + 1)
  returning id into v_promo;

  r := public.promo_preview(v_items);
  perform pruebas.espera(r is not null, 'la vista previa ve la promoción');
  perform pruebas.espera((r->>'discount')::numeric = 16, format('vista previa 16 (dio %s)', r->>'discount'));

  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items);
  perform pruebas.espera((r->>'discount_total')::numeric = 16, format('cobró 16 de descuento (dio %s)', r->>'discount_total'));
  perform pruebas.espera((r->>'total')::numeric = 64, 'total 64');
  perform pruebas.espera(r->'promotion'->>'id' = v_promo::text, 'devuelve la promoción aplicada');
  select count(*) into n from public.tickets
   where id = (r->>'ticket_id')::uuid and promotion_id = v_promo and discount_reason = 'Promoción: Tarde de prueba';
  perform pruebas.espera(n = 1, 'el ticket guardó promotion_id y el motivo');

  -- 2) Con descuento a mano la promoción NO entra (una sola casilla)
  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items, null, null,
        '{"type":"percent","value":5,"reason":"Cortesía"}'::jsonb);
  perform pruebas.espera((r->>'discount_total')::numeric = 4, 'manda el descuento a mano');
  perform pruebas.espera(r->'promotion' = 'null'::jsonb, 'no se apiló la promoción');

  -- 3) Fuera de horario, nada
  update public.promotions set start_hour = case when v_hora >= 23 then 0 else 23 end,
                               end_hour = case when v_hora >= 23 then 1 else 24 end where id = v_promo;
  perform pruebas.espera(public.promo_preview(v_items) is null, 'fuera de horario no aplica');
  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items);
  perform pruebas.espera((r->>'discount_total')::numeric = 0, 'fuera de horario no descuenta al cobrar');

  -- 4) Otro día, nada
  update public.promotions set start_hour = v_hora, end_hour = v_hora + 1,
                               weekdays = array[((v_dow + 3) % 7)::smallint] where id = v_promo;
  perform pruebas.espera(public.promo_preview(v_items) is null, 'otro día no aplica');

  -- 5) Compra mínima
  update public.promotions set weekdays = array[v_dow], min_ticket = 81 where id = v_promo;
  perform pruebas.espera(public.promo_preview(v_items) is null, 'sin alcanzar la compra mínima no aplica');
  update public.promotions set min_ticket = 0 where id = v_promo;

  -- 6) Dos promociones: gana la que más descuenta
  insert into public.promotions (name, kind, value, scope, weekdays, start_hour, end_hour)
  values ('Toda la venta', 'porcentaje', 30, 'ticket', array[v_dow], v_hora, v_hora + 1)
  returning id into v_promo2;
  r := public.promo_preview(v_items);
  perform pruebas.espera((r->>'id')::uuid = v_promo2, 'gana la mayor');
  perform pruebas.espera((r->>'discount')::numeric = 24, 'la mayor descuenta 24');

  -- 7) Monto fijo topado al importe de la categoría
  update public.promotions set is_active = false where id = v_promo2;
  update public.promotions set kind = 'monto', value = 5000 where id = v_promo;
  r := public.promo_preview(v_items);
  perform pruebas.espera((r->>'discount')::numeric = 80, 'el monto fijo se topa al importe');
  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items);
  perform pruebas.espera((r->>'total')::numeric = 0, 'total 0 con promo topada');

  -- 8) Apagada, nada; y una venta normal sigue intacta (propina y folio)
  update public.promotions set is_active = false where business_id = c.business_id;
  perform pruebas.espera(public.promo_preview(v_items) is null, 'apagada no aplica');
  r := public.create_ticket(gen_random_uuid(), 'efectivo', v_items, null, null, null, 15);
  perform pruebas.espera((r->>'discount_total')::numeric = 0 and (r->>'tip_amount')::numeric = 15 and r->>'folio' is not null,
    'venta normal: sin descuento, con propina y folio');
  update public.promotions set is_active = true, kind = 'porcentaje', value = 20 where id = v_promo;

  -- 9) Reglas de la tabla
  begin
    insert into public.promotions (name,kind,value,scope,weekdays,start_hour,end_hour)
    values ('Mala','porcentaje',120,'ticket',array[1::smallint],1,2);
    raise exception 'FALLA: aceptó 120 por ciento';
  exception when check_violation then null; end;
  begin
    insert into public.promotions (name,kind,value,scope,weekdays,start_hour,end_hour)
    values ('Mala','monto',10,'ticket',array[1::smallint],10,10);
    raise exception 'FALLA: aceptó fin <= inicio';
  exception when check_violation then null; end;
  begin
    insert into public.promotions (name,kind,value,scope,weekdays,start_hour,end_hour)
    values ('Mala','monto',10,'categoria',array[1::smallint],1,2);
    raise exception 'FALLA: aceptó categoría sin category_id';
  exception when check_violation then null; end;

  -- 10) Reporte
  r := public.promotions_report(30);
  perform pruebas.espera(jsonb_array_length(r->'by_promotion') = 2, 'el reporte lista las dos');

  -- 11) La cajera lee y ve la vista previa, pero no escribe ni ve el reporte
  perform pruebas.como(c.cashier_id);
  select count(*) into n from public.promotions;
  perform pruebas.espera(n = 2, 'la cajera lee las promociones');
  begin
    insert into public.promotions (name,kind,value,scope,weekdays,start_hour,end_hour)
    values ('Trampa','monto',5,'ticket',array[1::smallint],1,2);
    raise exception 'FALLA: la cajera creó una promoción';
  exception when insufficient_privilege then null; end;
  begin
    perform public.promotions_report(30);
    raise exception 'FALLA: la cajera vio el reporte';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;
  perform pruebas.espera(public.promo_preview(v_items) is not null, 'la cajera ve la promoción viva en el POS');

  perform pruebas.como_postgres();
end $t$;
