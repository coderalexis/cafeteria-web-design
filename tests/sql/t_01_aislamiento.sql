-- t_01_aislamiento.sql — dos cafeterías no se ven entre sí.
--
-- Es la promesa más básica de la plataforma y la que más cuesta creer sin
-- prueba: que Gym Coffe jamás vea una venta, un producto o un gasto de
-- Cafecito Jaral aunque compartan base. Aquí se intenta cruzar por cada
-- puerta —lectura directa, escritura directa y RPC— y todas deben cerrarse.
do $t$
declare
  a pruebas.cafe_ids;
  b pruebas.cafe_ids;
  r jsonb;
  n int;
  v_ticket_b uuid;
begin
  a := pruebas.cafe('cafe-a');
  b := pruebas.cafe('cafe-b');

  -- B vende algo, para que haya un ticket ajeno que intentar leer
  perform pruebas.como(b.cashier_id);
  r := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(b.variant_chico, 1));
  v_ticket_b := (r->>'ticket_id')::uuid;

  -- ── Como dueño de A ──
  perform pruebas.como(a.owner_id);

  perform pruebas.espera((select public.current_business_id()) = a.business_id, 'el negocio activo del dueño de A es A');

  select count(*) into n from public.menu_variants;
  perform pruebas.espera(n = 2, format('el dueño de A ve solo sus 2 variantes (vio %s)', n));

  select count(*) into n from public.tickets;
  perform pruebas.espera(n = 0, format('el dueño de A no ve tickets de B (vio %s)', n));

  select count(*) into n from public.cash_sessions;
  perform pruebas.espera(n = 1, format('el dueño de A ve solo su caja (vio %s)', n));

  select count(*) into n from public.business_members;
  perform pruebas.espera(n = 2, format('el dueño de A ve solo a su equipo (vio %s)', n));

  -- Escritura cruzada por RLS: el update afecta 0 filas, no falla ruidoso
  update public.menu_variants set price = 1 where id = b.variant_chico;
  get diagnostics n = row_count;
  perform pruebas.espera(n = 0, 'A no puede cambiar precios de B');

  -- Insertar apuntando al negocio de B: la política with check lo rechaza
  begin
    insert into public.menu_categories (business_id, name, slug) values (b.business_id, 'Colada', 'colada');
    raise exception 'FALLA: A insertó una categoría en B';
  exception when insufficient_privilege then null;
  end;

  -- RPC con id ajeno: «no encontrado», sin revelar que existe
  begin
    perform public.cancel_ticket(v_ticket_b, 'Intento cruzado');
    raise exception 'FALLA: A canceló un ticket de B';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  perform pruebas.espera(public.cash_session_summary(
    (select id from public.cash_sessions where business_id = b.business_id)) is null,
    'el resumen de la caja de B es null para A');

  -- El reporte de A no suma la venta de B
  r := public.sales_report(current_date - 1, current_date + 1);
  perform pruebas.espera((r->'totals'->>'tickets')::int = 0, 'el reporte de A no trae ventas de B');

  -- ── Como cajera de A: solo lo suyo ──
  perform pruebas.como(a.cashier_id);
  r := public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(a.variant_chico, 1));
  select count(*) into n from public.tickets;
  perform pruebas.espera(n = 1, format('la cajera de A ve exactamente su ticket (vio %s)', n));

  select count(*) into n from public.expenses;
  perform pruebas.espera(n = 0, 'la cajera no lee gastos');

  perform pruebas.como_postgres();
end $t$;
