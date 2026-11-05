-- t_22_caja_olvidada.sql — force_close_cash_session (migración 27): con ella
-- el cron y la carga del POS cierran la caja que nadie cortó. Mueve dinero en
-- el sentido de que fija el EFECTIVO ESPERADO de ese turno, así que se prueba
-- que lo calcule igual que el corte normal, que no cierre antes de tiempo, que
-- no cierre dos veces y que solo el servidor pueda llamarla.
do $t$
declare
  c pruebas.cafe_ids;
  v_sesion uuid;
  v_r jsonb;
  v_s public.cash_sessions;
  v_esperado numeric;
begin
  -- pruebas.cafe abre la caja con $500 de fondo.
  c := pruebas.cafe('cafe-caja-olvidada');
  select id into v_sesion from public.cash_sessions where business_id = c.business_id and status = 'abierta';

  -- Un turno con de todo: efectivo con propina, tarjeta y una salida de caja.
  perform pruebas.como(c.cashier_id);
  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 2), null, 1000, null, 10);
  perform public.create_ticket(gen_random_uuid(), 'tarjeta_clip', pruebas.items(c.variant_grande, 1));
  perform public.add_cash_movement('salida', 20, 'Hielo');
  v_esperado := 500 + 2 * c.precio_chico + 10 - 20;

  -- Ningún cliente la puede llamar: solo el servidor (service role).
  begin
    perform public.force_close_cash_session(v_sesion, now() - interval '1 hour', 'desde el cliente');
    raise exception 'FALLA: la cajera cerró la caja con force_close_cash_session';
  exception when insufficient_privilege then null;
  end;

  perform pruebas.como_postgres();

  -- Antes de su hora no se cierra.
  begin
    perform public.force_close_cash_session(v_sesion, now() + interval '1 hour', 'temprano');
    raise exception 'FALLA: cerró una caja que todavía no vencía';
  exception when raise_exception then
    perform pruebas.espera(sqlerrm like '%todavía no vence%', 'antes de su hora se niega: ' || sqlerrm);
  end;

  -- Vencida: se cierra con el esperado del corte normal y sin contado.
  v_r := public.force_close_cash_session(v_sesion, now() - interval '1 hour', 'Cerrada automáticamente: prueba');
  select * into v_s from public.cash_sessions where id = v_sesion;
  perform pruebas.espera(v_s.status = 'cerrada' and v_s.auto_closed, 'quedó cerrada y marcada como automática');
  perform pruebas.espera(v_s.expected_cash = v_esperado,
    format('esperado = fondo + efectivo + propina − salida (%s, hay %s)', v_esperado, v_s.expected_cash));
  perform pruebas.espera((v_r->>'expected_cash')::numeric = v_esperado, 'devuelve el mismo esperado');
  perform pruebas.espera(v_s.counted_cash is null and v_s.difference is null, 'sin contado ni diferencia: nadie contó');
  perform pruebas.espera(v_s.closing_notes = 'Cerrada automáticamente: prueba', 'guarda el motivo');

  -- Dos caminos a la vez (el cron y el POS): el segundo no la vuelve a cerrar.
  begin
    perform public.force_close_cash_session(v_sesion, now() - interval '1 hour', 'otra vez');
    raise exception 'FALLA: cerró dos veces la misma caja';
  exception when raise_exception then
    perform pruebas.espera(sqlerrm like '%ya estaba cerrada%', 'la segunda vez se niega: ' || sqlerrm);
  end;
  select * into v_s from public.cash_sessions where id = v_sesion;
  perform pruebas.espera(v_s.closing_notes = 'Cerrada automáticamente: prueba', 'el segundo intento no pisó el motivo');

  -- Sin motivo, deja uno por omisión.
  perform pruebas.como(c.cashier_id);
  perform public.open_cash_session(100, null);
  perform pruebas.como_postgres();
  select id into v_sesion from public.cash_sessions where business_id = c.business_id and status = 'abierta';
  perform public.force_close_cash_session(v_sesion, now() - interval '1 minute', null);
  select * into v_s from public.cash_sessions where id = v_sesion;
  perform pruebas.espera(v_s.closing_notes = 'Cerrada automáticamente.' and v_s.expected_cash = 100,
    'sin motivo: el de siempre, y sin ventas el esperado es el fondo');
end $t$;
