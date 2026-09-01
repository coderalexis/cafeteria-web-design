-- t_02_create_ticket.sql — el precio lo pone el servidor, y otras reglas de
-- dinero de la función más importante del sistema.
do $t$
declare
  c pruebas.cafe_ids;
  r jsonb; r2 jsonb;
  v_ref uuid := gen_random_uuid();
  n int;
  v_folio1 bigint; v_folio2 bigint;
begin
  c := pruebas.cafe('cafe-ticket');
  perform pruebas.como(c.cashier_id);

  -- 1) El cliente no manda precios: dos chicos = 2 × $40, sin importar qué diga el carrito
  r := public.create_ticket(v_ref, 'efectivo', pruebas.items(c.variant_chico, 2));
  perform pruebas.espera((r->>'subtotal')::numeric = 80, format('subtotal servidor 80 (dio %s)', r->>'subtotal'));
  perform pruebas.espera((r->>'total')::numeric = 80, 'total sin descuento = subtotal');
  v_folio1 := (r->>'folio')::bigint;

  -- 2) Idempotencia: el mismo client_ref devuelve el MISMO ticket, no otro
  r2 := public.create_ticket(v_ref, 'efectivo', pruebas.items(c.variant_chico, 2));
  perform pruebas.espera(r2->>'ticket_id' = r->>'ticket_id', 'mismo client_ref → mismo ticket');
  perform pruebas.espera((r2->>'duplicate')::boolean, 'la repetición se marca como duplicada');
  select count(*) into n from public.tickets where business_id = c.business_id;
  perform pruebas.espera(n = 1, 'no se creó un segundo ticket');

  -- 3) Folios consecutivos por negocio
  r2 := public.create_ticket(gen_random_uuid(), 'tarjeta_clip', pruebas.items(c.variant_grande, 1));
  v_folio2 := (r2->>'folio')::bigint;
  perform pruebas.espera(v_folio2 = v_folio1 + 1, format('folio consecutivo (%s → %s)', v_folio1, v_folio2));

  -- 4) El extra se cobra: latte + leche de avena = 40 + 12
  r2 := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1, c.modifier_id));
  perform pruebas.espera((r2->>'subtotal')::numeric = 52, format('modificador sumado (dio %s)', r2->>'subtotal'));

  -- 5) El costo se FOTOGRAFÍA en la venta: subir el costo después no mueve el margen viejo
  perform pruebas.como_postgres();
  update public.menu_variants set cost = 99 where id = c.variant_chico;
  select count(*) into n from public.ticket_items ti
   join public.tickets t on t.id = ti.ticket_id
   where t.business_id = c.business_id and ti.variant_id = c.variant_chico and ti.unit_cost = 12;
  perform pruebas.espera(n >= 1, 'unit_cost quedó fotografiado en 12');

  -- 6) Techo de descuento del cajero: con 10 % de tope, un 50 % se rechaza
  update public.businesses set settings = settings || '{"discount_max_cashier": 10}'::jsonb
   where id = c.business_id;
  perform pruebas.como(c.cashier_id);
  begin
    perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1),
      null, null, '{"type":"percent","value":50,"reason":"Amigo"}'::jsonb);
    raise exception 'FALLA: la cajera aplicó 50 %% con tope de 10 %%';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;
  -- …y el dueño sí puede
  perform pruebas.como(c.owner_id);
  r2 := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1),
      null, null, '{"type":"percent","value":50,"reason":"Cortesía del dueño"}'::jsonb);
  perform pruebas.espera((r2->>'discount_total')::numeric = 20, 'el dueño descuenta 50 % sin tope');

  -- 7) Efectivo insuficiente se rechaza; suficiente calcula el cambio
  begin
    perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1), null, 30);
    raise exception 'FALLA: aceptó $30 recibidos por un ticket de $40';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;
  r2 := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1), null, 100);
  perform pruebas.espera((r2->>'change_due')::numeric = 60, format('cambio 60 (dio %s)', r2->>'change_due'));

  -- 8) Con la caja cerrada no se vende
  perform public.close_cash_session(1000, 'Cierre de prueba');
  begin
    perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1));
    raise exception 'FALLA: vendió con la caja cerrada';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  perform pruebas.como_postgres();
end $t$;
