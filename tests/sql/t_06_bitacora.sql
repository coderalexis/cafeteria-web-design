-- t_06_bitacora.sql — condonar un fiado y ajustar sellos dejan constancia,
-- o no ocurren.
do $t$
declare
  c pruebas.cafe_ids;
  v_cuenta uuid;
  v_cliente uuid;
  r jsonb;
  n int;
begin
  c := pruebas.cafe('cafe-bitacora');

  -- Una cuenta abierta marcada como fiado, como la deja el POS
  perform pruebas.como(c.cashier_id);
  insert into public.parked_orders (name, cart, owed_since, owed_contact)
  values ('Carlos del gym', '{"lines":[]}'::jsonb, now() - interval '3 days', '5512345678')
  returning id into v_cuenta;

  -- La cajera no puede condonar
  begin
    perform public.forgive_owed(v_cuenta, 'Se fue sin pagar');
    raise exception 'FALLA: la cajera condonó un fiado';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  -- El dueño sí, y queda escrito quién y por qué, en la misma transacción
  perform pruebas.como(c.owner_id);
  begin
    perform public.forgive_owed(v_cuenta, 'ok');
    raise exception 'FALLA: aceptó un motivo de dos letras';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  r := public.forgive_owed(v_cuenta, 'Cliente de confianza, se le perdona');
  perform pruebas.espera(r->>'name' = 'Carlos del gym', 'devuelve el nombre de la cuenta');
  select count(*) into n from public.parked_orders where id = v_cuenta;
  perform pruebas.espera(n = 0, 'la cuenta desapareció');

  perform pruebas.como_postgres();
  select count(*) into n from public.audit_events
   where business_id = c.business_id and action = 'fiado.condonado' and entity = 'Carlos del gym'
     and details->>'motivo' = 'Cliente de confianza, se le perdona' and actor_id = c.owner_id;
  perform pruebas.espera(n = 1, 'quedó el renglón de bitácora con motivo y autor');

  -- Condonar dos veces no se puede: la segunda ya no existe
  perform pruebas.como(c.owner_id);
  begin
    perform public.forgive_owed(v_cuenta, 'Otra vez');
    raise exception 'FALLA: condonó una cuenta que ya no existía';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  -- Ajuste de sellos: también deja rastro adentro del RPC
  perform pruebas.como_postgres();
  insert into public.loyalty_customers (business_id, phone, name, stamps)
  values (c.business_id, '5587654321', 'Ana', 3) returning id into v_cliente;
  perform pruebas.como(c.owner_id);
  r := public.loyalty_adjust(v_cliente, 2, 'Se le olvidó pedir su sello');
  perform pruebas.espera((r->>'stamps')::int = 5, 'los sellos subieron a 5');
  perform pruebas.como_postgres();
  select count(*) into n from public.audit_events
   where business_id = c.business_id and action = 'lealtad.ajuste' and entity = 'Ana'
     and (details->>'delta')::int = 2 and (details->>'stamps')::int = 5;
  perform pruebas.espera(n = 1, 'el ajuste de sellos quedó en la bitácora');

  perform pruebas.como_postgres();
end $t$;
