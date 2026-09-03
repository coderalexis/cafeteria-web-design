-- t_11_corte_contado.sql — el corte contando billetes: el conteo por
-- denominación se guarda y tiene que sumar lo contado; el fondo que se deja
-- no puede ser más que lo que hay; la llamada de antes (solo el total) sigue
-- funcionando.
do $t$
declare
  c pruebas.cafe_ids;
  r jsonb;
  s record;
  v_msg text;
begin
  c := pruebas.cafe('cafe-conteo');           -- caja abierta con fondo 500
  perform pruebas.como(c.cashier_id);
  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 2));   -- 80 en efectivo → esperado 580

  -- 1) El conteo tiene que sumar lo contado: es la evidencia del número, no otro número
  begin
    r := public.close_cash_session(580, null, '[{"value": 500, "qty": 1}, {"value": 50, "qty": 1}]'::jsonb, null);
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'El conteo por denominación suma 550%', format('conteo que no suma se rechaza (dio: %s)', v_msg));

  -- 2) Ni dejar de fondo más de lo que hay
  begin
    r := public.close_cash_session(580, null, null, 600);
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'El fondo que dejas no puede ser mayor%', format('fondo mayor que lo contado se rechaza (dio: %s)', v_msg));

  -- 3) Ni un conteo mal formado
  begin
    r := public.close_cash_session(580, null, '[{"value": "quinientos", "qty": 1}]'::jsonb, null);
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'El conteo por denominación no tiene la forma%', format('conteo mal formado se rechaza (dio: %s)', v_msg));
  begin
    r := public.close_cash_session(580, null, '[{"value": 500, "qty": 1.5}]'::jsonb, null);
    v_msg := 'sin error';
  exception when others then v_msg := sqlerrm;
  end;
  perform pruebas.espera(v_msg like 'El conteo por denominación no tiene la forma%', format('cantidad fraccionaria se rechaza (dio: %s)', v_msg));

  -- Nada de eso cerró la caja
  perform pruebas.como_postgres();
  perform pruebas.espera((select status from public.cash_sessions where business_id = c.business_id) = 'abierta', 'los rechazos no cerraron la caja');

  -- 4) Contado billete por billete: 1×500 + 1×50 + 1×20 + 1×10 = 580, y se dejan 300 de fondo
  perform pruebas.como(c.cashier_id);
  r := public.close_cash_session(580, 'Contado en la noche',
    '[{"value": 500, "qty": 1}, {"value": 50, "qty": 1}, {"value": 20, "qty": 1}, {"value": 10, "qty": 1}]'::jsonb, 300);
  perform pruebas.espera((r->>'difference')::numeric = 0, format('cuadró (dio %s)', r->>'difference'));
  perform pruebas.espera((r->>'next_float')::numeric = 300, 'el resumen dice cuánto se dejó de fondo');
  perform pruebas.espera(jsonb_array_length(r->'count_detail') = 4, 'el resumen trae el conteo');
  perform pruebas.como_postgres();
  select * into s from public.cash_sessions where business_id = c.business_id;
  perform pruebas.espera(s.status = 'cerrada' and s.counted_cash = 580 and s.next_float = 300, 'quedó cerrada con contado 580 y fondo 300');
  perform pruebas.espera((s.count_detail->0->>'value')::numeric = 500, 'el conteo quedó guardado tal cual');

  -- 5) La llamada de siempre (solo el total) sigue funcionando: el día siguiente
  perform pruebas.como(c.cashier_id);
  perform public.open_cash_session(300, 'Con el fondo de anoche');
  r := public.close_cash_session(300, null);
  perform pruebas.espera(
    (r->>'difference')::numeric = 0 and r->'count_detail' = 'null'::jsonb and r->'next_float' = 'null'::jsonb,
    'cerrar solo con el total sigue funcionando, sin conteo ni fondo');
  perform pruebas.como_postgres();
end $t$;
