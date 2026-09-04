-- t_13_nombres_por_hora.sql — abrir una cuenta deja una visita con nombre y
-- hora local; la sugerencia devuelve lo de este negocio y nada del vecino.
do $t$
declare
  c pruebas.cafe_ids;
  otro pruebas.cafe_ids;
  r jsonb;
  v_hora int;
begin
  c := pruebas.cafe('cafe-juan');
  otro := pruebas.cafe('cafe-vecino');

  -- Juan abre cuenta dos veces; una cuenta sin nombre útil no deja visita
  perform pruebas.como(c.cashier_id);
  insert into public.parked_orders (business_id, name, cart, created_by) values (c.business_id, 'Juan', '{"lines": []}'::jsonb, c.cashier_id);
  insert into public.parked_orders (business_id, name, cart, created_by) values (c.business_id, 'juan', '{"lines": []}'::jsonb, c.cashier_id);
  insert into public.parked_orders (business_id, name, cart, created_by) values (c.business_id, '   ', '{"lines": []}'::jsonb, c.cashier_id);

  perform pruebas.como_postgres();
  perform pruebas.espera((select count(*) from public.account_visits where business_id = c.business_id) = 2, 'dos visitas de Juan, ninguna del nombre vacío');
  select extract(hour from now() at time zone (select timezone from public.businesses where id = c.business_id))::int into v_hora;
  perform pruebas.espera((select count(*) from public.account_visits where business_id = c.business_id and hour = v_hora) = 2, 'la hora es la local del negocio');

  -- La sugerencia junta «Juan» y «juan», con la hora
  perform pruebas.como(c.cashier_id);
  r := public.account_name_suggestions();
  perform pruebas.espera(jsonb_array_length(r) = 1, format('un solo nombre sugerido (dio %s)', r::text));
  perform pruebas.espera((r->0->>'n')::int = 2 and (r->0->>'hour')::int = v_hora and lower(r->0->>'name') = 'juan', format('Juan con 2 visitas a esta hora (dio %s)', r::text));

  -- El vecino no ve a Juan, ni Juan al vecino
  perform pruebas.como(otro.cashier_id);
  perform pruebas.espera(jsonb_array_length(public.account_name_suggestions()) = 0, 'el otro negocio no ve visitas ajenas');
  perform pruebas.como_postgres();
end $t$;
