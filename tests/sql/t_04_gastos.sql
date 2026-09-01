-- t_04_gastos.sql — la cuenta completa del mes y el punto de equilibrio.
do $t$
declare
  c pruebas.cafe_ids;
  r jsonb;
  n int;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  c := pruebas.cafe('cafe-gastos');

  -- Tres ventas hoy: 2 chicos (80, costo 24) + 1 grande (55, costo 16)
  perform pruebas.como(c.cashier_id);
  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_chico, 2));
  perform public.create_ticket(gen_random_uuid(), 'efectivo', pruebas.items(c.variant_grande, 1));

  perform pruebas.como(c.owner_id);
  insert into public.fixed_expenses (name, category, monthly_amount)
  values ('Renta', 'renta', 8000), ('Sueldos', 'sueldos', 24000);
  insert into public.expenses (spent_on, category, description, amount, paid_with)
  values (v_hoy, 'mantenimiento', 'Reparación del molino', 900, 'efectivo');

  r := public.profit_report();

  perform pruebas.espera((r->>'revenue')::numeric = 135, format('ingresos 135 (dio %s)', r->>'revenue'));
  perform pruebas.espera((r->>'cost_of_goods')::numeric = 40, format('costo 40 (dio %s)', r->>'cost_of_goods'));
  perform pruebas.espera((r->>'gross_margin')::numeric = 95, 'margen bruto 95');
  perform pruebas.espera((r->>'fixed_total')::numeric = 32000, 'fijos 32000');
  perform pruebas.espera((r->>'variable_total')::numeric = 900, 'variables 900');
  perform pruebas.espera((r->>'net_profit')::numeric = 95 - 32900, 'utilidad = margen − gastos');
  perform pruebas.espera((r->>'sold_without_cost')::int = 0, 'todo lo vendido tenía costo');
  perform pruebas.espera((r->>'is_current_month')::boolean, 'es el mes en curso');

  -- Equilibrio: fijos / margen%  (95/135 = 70.37 %) → 32000 / 0.7037 ≈ 45,473
  perform pruebas.espera(abs((r->'break_even'->>'monthly')::numeric - 32000 / (95.0 / 135.0)) < 1,
    format('equilibrio mensual ≈ 45,473 (dio %s)', r->'break_even'->>'monthly'));
  perform pruebas.espera((r->'break_even'->>'days_open')::int between 1 and 31, 'días que abre entre 1 y 31');

  -- Un mes viejo no arrastra los gastos variables de hoy
  r := public.profit_report((v_hoy - interval '2 months')::date);
  perform pruebas.espera((r->>'variable_total')::numeric = 0, 'hace dos meses no hay variables');
  perform pruebas.espera(not (r->>'is_current_month')::boolean, 'hace dos meses no es el mes actual');

  -- Apagar un gasto fijo lo saca de la cuenta sin borrarlo
  update public.fixed_expenses set is_active = false where name = 'Sueldos';
  r := public.profit_report();
  perform pruebas.espera((r->>'fixed_total')::numeric = 8000, 'el fijo apagado ya no cuenta');

  -- La cajera: ni lee, ni inserta, ni calcula
  perform pruebas.como(c.cashier_id);
  select count(*) into n from public.fixed_expenses;
  perform pruebas.espera(n = 0, 'la cajera no ve gastos fijos');
  select count(*) into n from public.expenses;
  perform pruebas.espera(n = 0, 'la cajera no ve gastos');
  begin
    insert into public.fixed_expenses (name, category, monthly_amount) values ('Trampa', 'otros', 1);
    raise exception 'FALLA: la cajera insertó un gasto fijo';
  exception when insufficient_privilege then null; end;
  begin
    perform public.profit_report();
    raise exception 'FALLA: la cajera vio la utilidad';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
  end;

  perform pruebas.como_postgres();
end $t$;
