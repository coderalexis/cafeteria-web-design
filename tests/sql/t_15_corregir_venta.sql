-- t_15_corregir_venta.sql — corregir una venta: la original queda cancelada
-- con el motivo automático, la nueva conserva la hora y apunta a la original;
-- reglas de rol y de caja; lealtad y reintentos.
do $t$
declare
  c pruebas.cafe_ids;
  v_a jsonb;
  v_b jsonb;
  v_otra jsonb;
  v_ref uuid := gen_random_uuid();
  v_orig public.tickets;
  v_nueva public.tickets;
  v_cliente uuid;
  v_sellos int;
begin
  c := pruebas.cafe('cafe-corregir');

  -- La cajera cobra 2 lattes… y eran 1.
  perform pruebas.como(c.cashier_id);
  v_a := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 2), null, 100);
  v_b := public.correct_ticket((v_a->>'ticket_id')::uuid, v_ref, 'efectivo', pruebas.items(c.variant_chico, 1), null, 50);

  select * into v_orig from public.tickets where id = (v_a->>'ticket_id')::uuid;
  select * into v_nueva from public.tickets where id = (v_b->>'ticket_id')::uuid;
  perform pruebas.espera(
    v_orig.status = 'cancelado' and v_orig.cancel_reason = 'Corregida: ahora es el ticket #' || v_nueva.folio,
    format('la original queda cancelada con el motivo automático (dio %s / %s)', v_orig.status, v_orig.cancel_reason));
  perform pruebas.espera(
    v_nueva.status = 'completado' and v_nueva.corrected_from = v_orig.id and v_nueva.total = c.precio_chico,
    format('la nueva apunta a la original y cobra 1 latte (dio total %s)', v_nueva.total));
  perform pruebas.espera(v_nueva.created_at = v_orig.created_at, 'la nueva conserva la hora de la original');
  perform pruebas.espera((v_b->>'original_folio')::bigint = v_orig.folio, 'la respuesta dice qué folio corrigió');

  -- Reintento con el mismo client_ref (se fue la red después de guardar): la
  -- misma venta, sin cancelar ni cobrar nada dos veces.
  v_otra := public.correct_ticket(v_orig.id, v_ref, 'efectivo', pruebas.items(c.variant_chico, 1), null, 50);
  perform pruebas.espera(
    (v_otra->>'ticket_id')::uuid = v_nueva.id and (v_otra->>'duplicate')::boolean,
    'reintentar la misma corrección devuelve la misma venta');
  perform pruebas.espera(
    (select count(*) from public.tickets where business_id = c.business_id) = 2,
    'el reintento no creó un tercer ticket');

  -- Una venta ya cancelada no se corrige.
  begin
    perform public.correct_ticket(v_orig.id, gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1));
    raise exception 'FALLA: dejó corregir una venta ya cancelada';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%ya está cancelada%', 'una venta cancelada no se corrige: ' || sqlerrm);
  end;

  -- Si la corregida no pasa una validación, la original NO queda cancelada.
  begin
    perform public.correct_ticket(v_nueva.id, gen_random_uuid(), 'efectivo', '[]'::jsonb);
    raise exception 'FALLA: dejó corregir con un carrito vacío';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;
  perform pruebas.espera(
    (select status from public.tickets where id = v_nueva.id) = 'completado',
    'una corrección que falla no deja cancelada la venta');

  -- Lealtad: corregir una venta con sello deja los sellos como estaban.
  perform pruebas.como_postgres();
  update public.businesses set settings = coalesce(settings, '{}'::jsonb) || '{"loyalty": true, "loyalty_target": 5}'::jsonb
  where id = c.business_id;
  perform pruebas.como(c.cashier_id);
  v_cliente := (public.loyalty_find_or_create('5551112222', 'Ana')->>'id')::uuid;
  v_a := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1), null, null, null, 0, v_cliente);
  v_b := public.correct_ticket((v_a->>'ticket_id')::uuid, gen_random_uuid(), 'efectivo', pruebas.items(c.variant_grande, 1), null, null, null, 0, v_cliente);
  select stamps into v_sellos from public.loyalty_customers where id = v_cliente;
  perform pruebas.espera(v_sellos = 1, format('corregir una venta con sello deja 1 sello, no 2 ni 0 (dio %s)', v_sellos));

  -- La cajera no corrige ventas del dueño.
  perform pruebas.como(c.owner_id);
  v_a := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_grande, 1));
  perform pruebas.como(c.cashier_id);
  begin
    perform public.correct_ticket((v_a->>'ticket_id')::uuid, gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1));
    raise exception 'FALLA: la cajera corrigió una venta ajena';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%tus propias ventas%', 'la cajera solo corrige las suyas: ' || sqlerrm);
  end;

  -- El corte solo cuenta las ventas vivas.
  perform pruebas.espera(
    (select sum(total) from public.tickets where business_id = c.business_id and status = 'completado')
      = c.precio_chico + c.precio_grande + c.precio_grande,
    format('el corte cuenta solo las ventas vivas (dio %s, esperaba %s; vivas: %s)',
      (select sum(total) from public.tickets where business_id = c.business_id and status = 'completado'),
      c.precio_chico + c.precio_grande + c.precio_grande,
      (select string_agg(folio || ':' || total || ':' || status || ':' || coalesce(discount_reason, '-'), ' ' order by folio) from public.tickets where business_id = c.business_id)));

  -- Con la caja cerrada ya no se corrige, ni el dueño.
  perform pruebas.como(c.owner_id);
  perform public.close_cash_session(500 + c.precio_chico + c.precio_grande + c.precio_grande, 'cierre');
  begin
    perform public.correct_ticket((v_a->>'ticket_id')::uuid, gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1));
    raise exception 'FALLA: dejó corregir con la caja cerrada';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%ya se cerró%', 'con la caja cerrada solo queda cancelar: ' || sqlerrm);
  end;
end $t$;
