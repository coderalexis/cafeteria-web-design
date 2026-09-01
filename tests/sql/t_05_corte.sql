-- t_05_corte.sql — el corte de caja: lo esperado contra lo contado.
--
-- El momento que más pleitos causa en una cafetería. Aquí se comprueba que
-- el efectivo esperado sea exactamente fondo + ventas en efectivo + entradas
-- − salidas, que la tarjeta NO entre en el cajón, y que la diferencia se
-- calcule contra lo contado.
do $t$
declare
  c pruebas.cafe_ids;
  r jsonb;
  s record;
  n int;
begin
  c := pruebas.cafe('cafe-corte');           -- caja abierta con fondo 500
  perform pruebas.como(c.cashier_id);

  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 2));   -- 80 en efectivo
  perform public.create_ticket(gen_random_uuid(), 'tarjeta_clip', pruebas.items(c.variant_grande, 1)); -- 55 con tarjeta: no va al cajón
  perform public.add_cash_movement('salida', 200, 'Compra de leche');
  perform public.add_cash_movement('entrada', 50, 'Cambio en monedas');

  -- Solo puede haber UNA caja abierta por negocio
  begin
    perform public.open_cash_session(100, 'Segunda caja');
    raise exception 'FALLA: abrió una segunda caja';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  -- Se cuenta $420 → esperado 500 + 80 + 50 − 200 = 430 → diferencia −10
  r := public.close_cash_session(420, 'Faltó una moneda');

  perform pruebas.como_postgres();
  select * into s from public.cash_sessions where business_id = c.business_id;
  perform pruebas.espera(s.status = 'cerrada', 'la caja quedó cerrada');
  perform pruebas.espera(s.expected_cash = 430, format('esperado 430 (dio %s)', s.expected_cash));
  perform pruebas.espera(s.counted_cash = 420, 'contado 420');
  perform pruebas.espera(s.difference = -10, format('diferencia −10 (dio %s)', s.difference));

  -- El resumen de la caja cuadra con lo mismo, y separa por método de pago
  perform pruebas.como(c.owner_id);
  r := public.cash_session_summary(s.id);
  perform pruebas.espera(r is not null, 'el dueño ve el resumen');
  perform pruebas.espera((r->>'expected_cash')::numeric = 430, 'el resumen dice 430 esperados');

  -- Cerrada, ya no admite movimientos ni ventas
  perform pruebas.como(c.cashier_id);
  begin
    perform public.add_cash_movement('salida', 10, 'Tarde');
    raise exception 'FALLA: movimiento con la caja cerrada';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  -- Y se puede volver a abrir: el ciclo del día siguiente
  perform public.open_cash_session(600, 'Día siguiente');
  select count(*) into n from public.cash_sessions where business_id = c.business_id and status = 'abierta';
  perform pruebas.espera(n = 1, 'una caja abierta de nuevo');

  perform pruebas.como_postgres();
end $t$;
