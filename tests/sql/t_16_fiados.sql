-- t_16_fiados.sql — fiados por persona: la venta fiada es una venta, el saldo
-- es lo fiado menos lo abonado, los abonos en efectivo entran a la caja,
-- nada se cobra de más, y el vecino no ve nada.
do $t$
declare
  c pruebas.cafe_ids;
  otro pruebas.cafe_ids;
  v_cli uuid;
  v_t jsonb;
  v_t2 jsonb;
  v_pago jsonb;
  v_saldos jsonb;
  v_estado jsonb;
  v_mov int;
  v_resumen jsonb;
  v_session uuid;
begin
  c := pruebas.cafe('cafe-fiados');

  -- Con el módulo apagado no se fía.
  perform pruebas.como(c.cashier_id);
  begin
    perform public.credit_customer_upsert('Beto');
    raise exception 'FALLA: dejó dar de alta una cuenta con el módulo apagado';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%módulo de fiados está apagado%', 'módulo apagado: ' || sqlerrm);
  end;

  perform pruebas.como_postgres();
  update public.businesses set settings = coalesce(settings, '{}'::jsonb) || '{"credit": true}'::jsonb where id = c.business_id;
  perform pruebas.como(c.cashier_id);

  -- Alta: el nombre se normaliza y no se duplica.
  v_cli := (public.credit_customer_upsert('  Beto  Entrenador ', '5551234567')->>'id')::uuid;
  perform pruebas.espera(
    (public.credit_customer_upsert('beto entrenador')->>'id')::uuid = v_cli,
    'el mismo nombre con otras mayúsculas es la misma cuenta');
  perform pruebas.espera(
    (select name from public.credit_customers where id = v_cli) = 'Beto Entrenador',
    'el nombre se guarda limpio');

  -- Un fiado exige cuenta; con cuenta, es una venta con su hora y sus precios.
  begin
    perform public.create_ticket(gen_random_uuid(), 'fiado', pruebas.items(c.variant_chico, 1));
    raise exception 'FALLA: dejó fiar sin decir a quién';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%a nombre de alguien%', 'fiar sin cuenta: ' || sqlerrm);
  end;
  begin
    perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 1), null, null, null, 0, null, false, false, null, v_cli);
    raise exception 'FALLA: dejó poner cuenta de fiado a una venta en efectivo';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%Solo una venta fiada%', 'cuenta en venta no fiada: ' || sqlerrm);
  end;
  begin
    perform public.create_ticket(gen_random_uuid(), 'fiado', pruebas.items(c.variant_chico, 1), null, null, null, 10, null, false, false, null, v_cli);
    raise exception 'FALLA: dejó fiar la propina';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%propina no se fía%', 'propina fiada: ' || sqlerrm);
  end;

  v_t := public.create_ticket(gen_random_uuid(), 'fiado', pruebas.items(c.variant_chico, 2), null, null, null, 0, null, false, false, null, v_cli);
  perform pruebas.espera((v_t->'credit'->>'balance')::numeric = 2 * c.precio_chico,
    format('la respuesta trae el saldo que queda (dio %s)', v_t->'credit'->>'balance'));
  perform pruebas.espera(
    (select credit_customer_id from public.tickets where id = (v_t->>'ticket_id')::uuid) = v_cli
    and (select payment_method::text from public.tickets where id = (v_t->>'ticket_id')::uuid) = 'fiado',
    'el ticket queda a nombre de la persona y con método fiado');
  v_t2 := public.create_ticket(gen_random_uuid(), 'fiado', pruebas.items(c.variant_grande, 1), null, null, null, 0, null, false, false, null, v_cli);
  perform pruebas.espera((v_t2->'credit'->>'balance')::numeric = 2 * c.precio_chico + c.precio_grande, 'el saldo acumula');

  -- No entra a la caja.
  select id into v_session from public.cash_sessions where business_id = c.business_id and status = 'abierta';
  v_resumen := public.cash_session_summary(v_session);
  perform pruebas.espera((v_resumen->>'cash_sales')::numeric = 0 and (v_resumen->>'credit_sales')::numeric = 2 * c.precio_chico + c.precio_grande,
    format('el corte separa lo fiado de lo cobrado en efectivo (dio cash %s fiado %s)', v_resumen->>'cash_sales', v_resumen->>'credit_sales'));

  -- Abonar: en efectivo entra a la caja como movimiento; nunca más de lo que debe.
  begin
    perform public.credit_pay(v_cli, 10000, 'efectivo');
    raise exception 'FALLA: dejó abonar más de lo que debe';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%solo debe $%', 'abono mayor que la deuda: ' || sqlerrm);
  end;
  v_pago := public.credit_pay(v_cli, 50, 'efectivo', 'quincena');
  perform pruebas.espera((v_pago->>'balance')::numeric = 2 * c.precio_chico + c.precio_grande - 50, 'el abono baja el saldo');
  select count(*) into v_mov from public.cash_movements m
  where m.session_id = v_session and m.kind = 'entrada' and m.amount = 50 and m.reason like 'Abono de «Beto Entrenador»%';
  perform pruebas.espera(v_mov = 1, 'el abono en efectivo es una entrada de caja del turno');
  v_resumen := public.cash_session_summary(v_session);
  perform pruebas.espera((v_resumen->>'credit_paid_cash')::numeric = 50 and (v_resumen->>'movements_in')::numeric = 50,
    'el corte desglosa los abonos en efectivo');
  -- La bitácora solo la leen los administradores (RLS): se mira como postgres.
  perform pruebas.como_postgres();
  perform pruebas.espera(
    exists (select 1 from public.audit_events a where a.business_id = c.business_id and a.action = 'fiado.abono' and a.actor_id = c.cashier_id),
    'el abono queda en la bitácora aunque lo registre la cajera');
  perform pruebas.como(c.cashier_id);

  -- Por transferencia no toca la caja.
  v_pago := public.credit_pay(v_cli, 20, 'transferencia');
  select count(*) into v_mov from public.cash_movements m where m.session_id = v_session and m.kind = 'entrada';
  perform pruebas.espera(v_mov = 1, 'un abono por transferencia no crea movimiento de caja');

  -- Cancelar una venta fiada baja la deuda sola.
  perform public.cancel_ticket((v_t2->>'ticket_id')::uuid, 'se lo regalaron');
  perform pruebas.espera(public.credit_balances()->0->>'balance' is not null, 'hay saldos');
  perform pruebas.espera(
    (select (e->>'balance')::numeric from jsonb_array_elements(public.credit_balances()) e where (e->>'id')::uuid = v_cli) = 2 * c.precio_chico - 70,
    format('saldo = fiado vivo − abonos (dio %s)', (select e->>'balance' from jsonb_array_elements(public.credit_balances()) e where (e->>'id')::uuid = v_cli)));

  -- El estado de cuenta lista cargos y abonos.
  v_estado := public.credit_statement(v_cli);
  perform pruebas.espera(jsonb_array_length(v_estado->'entries') = 4, format('4 movimientos en el estado de cuenta (dio %s)', jsonb_array_length(v_estado->'entries')));
  perform pruebas.espera((v_estado->'customer'->>'balance')::numeric = 2 * c.precio_chico - 70, 'el estado de cuenta trae el saldo');

  -- Saldo en cero: ya no se puede abonar.
  perform public.credit_pay(v_cli, 2 * c.precio_chico - 70, 'tarjeta_clip');
  begin
    perform public.credit_pay(v_cli, 1, 'efectivo');
    raise exception 'FALLA: dejó abonar a quien no debe';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    perform pruebas.espera(sqlerrm like '%no debe nada%', 'sin deuda no hay abono: ' || sqlerrm);
  end;

  -- El vecino no ve ni toca nada.
  otro := pruebas.cafe('cafe-vecino-fiados');
  perform pruebas.como_postgres();
  update public.businesses set settings = coalesce(settings, '{}'::jsonb) || '{"credit": true}'::jsonb where id = otro.business_id;
  perform pruebas.como(otro.cashier_id);
  perform pruebas.espera(jsonb_array_length(public.credit_balances()) = 0, 'el vecino no ve las cuentas ajenas');
  perform pruebas.espera(public.credit_statement(v_cli) is null, 'el vecino no ve el estado de cuenta ajeno');
  begin
    perform public.credit_pay(v_cli, 1, 'efectivo');
    raise exception 'FALLA: el vecino abonó a una cuenta ajena';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;
  perform pruebas.espera((select count(*) from public.credit_customers) = 0, 'RLS: el vecino no lee cuentas ajenas');

  -- Borrar la cafetería con fiados no se atora (lección de la 26).
  perform pruebas.como_postgres();
  perform public.delete_business(c.business_id, 'cafe-fiados');
  perform pruebas.espera(not exists (select 1 from public.credit_customers where business_id = c.business_id), 'delete_business también borra los fiados');
end $t$;
