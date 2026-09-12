-- t_20_inventario.sql — inventario (P45, migraciones 57 y 58): se cuentan dos
-- clases de cosas. Los INSUMOS (café en grano, vasos) no están en el menú, se
-- cuentan a mano y admiten decimales. Lo DEL MENÚ se cuenta entero y baja solo
-- con la venta. Aquí se prueba: permisos, la venta que descuenta, la
-- cancelación que devuelve solo lo suyo, corregir, el negativo permitido, el
-- costo que solo aplica al menú, la merma con motivo, el conteo, el diario que
-- cuadra, que ningún cliente escribe, que volver a contar empieza de cero y
-- que borrar el café se lleva todo.
do $t$
declare
  c pruebas.cafe_ids;
  v_r jsonb;
  v_t jsonb;
  v_c jsonb;
  v_item uuid;
  v_vitem uuid;
  v_gitem uuid;
  v_q numeric;
  v_n int;
  v_ok boolean;
begin
  c := pruebas.cafe('cafe-inventario');

  -- ── Un insumo: nace contándose, con su unidad y sus decimales ──────
  perform pruebas.como(c.cashier_id);
  begin
    perform public.supply_save('Café en grano', 'kilo', null, 5, 2);
    raise exception 'FALLA: la cajera pudo dar de alta un insumo';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;

  perform pruebas.como(c.owner_id);
  v_r := public.supply_save('Café en grano', 'kilo', null, 5.5, 2);
  v_item := (v_r->>'item_id')::uuid;
  perform pruebas.espera((v_r->>'qty')::numeric = 5.5 and v_r->>'unit' = 'kilo',
    'un insumo se cuenta en kilos y admite medio kilo');
  perform pruebas.espera(
    (select count(*) from public.stock_movements
      where item_id = v_item and kind = 'conteo' and qty = 5.5 and reason = 'Existencia inicial') = 1,
    'la existencia inicial del insumo queda en el diario');

  begin
    perform public.supply_save('  café EN GRANO ', 'pieza', null, null, null);
    raise exception 'FALLA: aceptó dos insumos con el mismo nombre';
  exception when others then
    if sqlerrm not like 'Ya cuentas algo%' then raise; end if;
  end;

  -- La entrada de un insumo NO toca el costo del menú: nunca se vende solo.
  v_r := public.stock_move(v_item, 'entrada', 2.25, null, 180);
  perform pruebas.espera((v_r->>'qty_after')::numeric = 7.75, 'entran 2.25 kilos y quedan 7.75');
  perform pruebas.espera(not (v_r->>'cost_updated')::boolean, 'el costo de un insumo no toca el menú');

  -- ── Lo del menú: entero, y la cajera no decide qué se cuenta ───────
  perform pruebas.como(c.cashier_id);
  begin
    perform public.stock_track(c.variant_chico, true, 10, 3);
    raise exception 'FALLA: la cajera pudo decidir qué se cuenta';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;

  perform pruebas.como(c.owner_id);
  v_r := public.stock_track(c.variant_chico, true, 10, 3);
  v_vitem := (v_r->>'item_id')::uuid;
  perform pruebas.espera((v_r->>'qty')::numeric = 10 and (v_r->>'min_qty')::numeric = 3,
    'marcar algo del menú deja 10 y mínimo 3');
  begin
    perform public.stock_move(v_vitem, 'entrada', 2.5, null, null);
    raise exception 'FALLA: aceptó medio panqué';
  exception when others then
    if sqlerrm not like 'Lo que está en el menú%' then raise; end if;
  end;

  -- ── La venta descuenta (y lo grande, que no se cuenta, no) ─────────
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 2),
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 1),
    jsonb_build_object('custom', jsonb_build_object('name', 'Fruta', 'price', 30), 'quantity', 1)), null, 1000);
  select qty into v_q from public.stock_items where id = v_vitem;
  perform pruebas.espera(v_q = 8, format('vender 2 deja 8 (quedó %s)', v_q));
  perform pruebas.espera(v_t->'stock' = jsonb_build_array(jsonb_build_object('variant_id', c.variant_chico, 'qty', 8)),
    'create_ticket devuelve la existencia nueva de lo que contó, y solo de eso');
  perform pruebas.espera(
    (select count(*) from public.stock_movements where ticket_id = (v_t->>'ticket_id')::uuid) = 1,
    'un movimiento por renglón contado; lo grande y lo fuera de menú no dejan rastro');

  -- ── Cancelar devuelve ──────────────────────────────────────────────
  v_c := public.cancel_ticket((v_t->>'ticket_id')::uuid, 'se arrepintió');
  select qty into v_q from public.stock_items where id = v_vitem;
  perform pruebas.espera(v_q = 10, format('cancelar devuelve las 2 (quedó %s)', v_q));
  perform pruebas.espera(v_c->'stock' = jsonb_build_array(jsonb_build_object('variant_id', c.variant_chico, 'qty', 10)),
    'cancel_ticket también devuelve la existencia nueva');

  -- ── Corregir sale gratis: cancela y vuelve a cobrar ────────────────
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 3)), null, 1000);
  perform public.correct_ticket((v_t->>'ticket_id')::uuid, gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 1)), null, 1000);
  select qty into v_q from public.stock_items where id = v_vitem;
  perform pruebas.espera(v_q = 9, format('corregir de 3 a 1 deja 9 (quedó %s)', v_q));

  -- ── Negativo permitido: nunca se bloquea una venta ─────────────────
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 12)), null, 1000);
  select qty into v_q from public.stock_items where id = v_vitem;
  perform pruebas.espera(v_q = -3, format('vender más de lo que hay deja -3 y NO bloquea (quedó %s)', v_q));

  -- ── Entradas: la cajera sí, pero sin costo ─────────────────────────
  v_r := public.stock_move(v_vitem, 'entrada', 15, null, null);
  perform pruebas.espera((v_r->>'qty_after')::numeric = 12, 'la cajera registra la entrada y queda en 12');
  begin
    perform public.stock_move(v_vitem, 'entrada', 1, null, 9.5);
    raise exception 'FALLA: la cajera pudo poner el costo';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;
  perform pruebas.espera((select cost from public.menu_variants where id = c.variant_chico) = 12, 'el costo sigue en 12');

  perform pruebas.como(c.owner_id);
  v_r := public.stock_move(v_vitem, 'entrada', 3, null, 9.5);
  perform pruebas.espera((v_r->>'qty_after')::numeric = 15 and (v_r->>'cost_updated')::boolean, 'la dueña mete 3 con costo');
  perform pruebas.espera((select cost from public.menu_variants where id = c.variant_chico) = 9.5,
    'la entrada con costo actualiza el costo de la variante');
  -- Un costo en cero es «no lo sé», no «me salió gratis».
  perform public.stock_move(v_vitem, 'entrada', 1, null, 0);
  perform pruebas.espera((select cost from public.menu_variants where id = c.variant_chico) = 9.5,
    'una entrada con costo 0 no borra el costo');
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 1)), null, 1000);
  perform pruebas.espera(
    (select unit_cost from public.ticket_items where ticket_id = (v_t->>'ticket_id')::uuid) = 9.5,
    'la siguiente venta ya fotografía el costo nuevo');

  -- ── Merma: con motivo, y la cajera puede ───────────────────────────
  perform pruebas.como(c.cashier_id);
  begin
    perform public.stock_move(v_vitem, 'merma', 2, '   ', null);
    raise exception 'FALLA: dejó pasar una merma sin motivo';
  exception when others then
    if sqlerrm not like 'Indica el motivo%' then raise; end if;
  end;
  v_r := public.stock_move(v_vitem, 'merma', 2, 'Caducó', null);
  perform pruebas.espera((v_r->>'qty_after')::numeric = 13 and (v_r->>'qty')::numeric = -2, 'la merma resta 2 y deja 13');
  -- Y también puede anotar el insumo que se le cayó.
  v_r := public.stock_move(v_item, 'merma', 0.75, 'Se cayó o se rompió', null);
  perform pruebas.espera((v_r->>'qty_after')::numeric = 7, 'la cajera merma 0.75 kilos y quedan 7');

  -- ── Conteo: solo admin; el sistema calcula la diferencia ───────────
  begin
    perform public.stock_move(v_vitem, 'conteo', 20, null, null);
    raise exception 'FALLA: la cajera pudo contar';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;
  perform pruebas.como(c.owner_id);
  v_r := public.stock_move(v_vitem, 'conteo', 13, null, null);
  perform pruebas.espera((v_r->>'moved')::boolean = false, 'contar lo mismo que dice el sistema no es un movimiento');
  v_r := public.stock_move(v_vitem, 'conteo', 10, 'sobraban en la vitrina', null);
  perform pruebas.espera((v_r->>'qty')::numeric = -3 and (v_r->>'qty_after')::numeric = 10,
    'contar 10 registra la diferencia (-3)');
  v_r := public.stock_move(v_item, 'conteo', 6.25, 'pesé el costal', null);
  perform pruebas.espera((v_r->>'qty')::numeric = -0.75, 'el conteo de un insumo también admite decimales');

  -- ── El diario cuadra renglón a renglón ─────────────────────────────
  perform pruebas.como_postgres();
  select bool_and(ok) into v_ok from (
    select m.qty_after = sum(m.qty) over (order by m.seq) as ok
    from public.stock_movements m where m.item_id = v_vitem) s;
  perform pruebas.espera(v_ok, 'cada qty_after es la suma de todo lo anterior');
  perform pruebas.espera(
    (select count(*) from public.audit_events where business_id = c.business_id
      and action in ('existencias.marcado', 'existencias.entrada', 'existencias.merma', 'existencias.conteo')) >= 4,
    'marcar, entradas, merma y conteo dejan bitácora');

  -- ── Ningún cliente escribe las tablas ──────────────────────────────
  perform pruebas.como(c.owner_id);
  begin
    insert into public.stock_movements (business_id, item_id, kind, qty, qty_after)
    values (c.business_id, v_vitem, 'entrada', 100, 999);
    raise exception 'FALLA: el dueño pudo escribir el diario a mano';
  exception when insufficient_privilege then null;
  end;
  update public.stock_items set qty = 999 where id = v_vitem;
  perform pruebas.espera((select qty from public.stock_items where id = v_vitem) = 10,
    'un update directo no cambia nada (sin política de escritura)');
  begin
    insert into public.supplies (business_id, name) values (c.business_id, 'A mano');
    raise exception 'FALLA: el dueño pudo dar de alta un insumo a mano';
  exception when insufficient_privilege then null;
  end;

  -- ── Cancelar una venta de ANTES de contar no inventa piezas ────────
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 4)), null, 1000);
  perform pruebas.como(c.owner_id);
  v_r := public.stock_track(c.variant_grande, true, 5, 0);
  v_gitem := (v_r->>'item_id')::uuid;
  perform public.cancel_ticket((v_t->>'ticket_id')::uuid, 'era de prueba');
  perform pruebas.espera((select qty from public.stock_items where id = v_gitem) = 5,
    'cancelar una venta anterior al conteo deja los 5 como estaban');

  -- ── Dejar de contar y volver a contar EMPIEZA DE CERO ──────────────
  -- El diario se queda, pero una venta de la cuenta anterior ya no revive:
  -- el sello `tracked_seq` corta. (Con una marca de tiempo no bastaba: dentro
  -- de una transacción `now()` es igual para todos.)
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 2)), null, 1000);
  perform pruebas.espera((select qty from public.stock_items where id = v_gitem) = 3, 'la venta deja 3');
  perform pruebas.como(c.owner_id);
  perform public.stock_track(c.variant_grande, false);
  perform pruebas.espera(
    (select not tracked from public.stock_items where id = v_gitem), 'al desmarcar se apaga, no se borra');
  select count(*) into v_n from public.stock_movements where item_id = v_gitem;
  perform pruebas.espera(v_n >= 2, format('el diario se queda (%s renglones)', v_n));
  perform public.stock_track(c.variant_grande, true, 4, 0);
  perform public.cancel_ticket((v_t->>'ticket_id')::uuid, 'tarde');
  perform pruebas.espera((select qty from public.stock_items where id = v_gitem) = 4,
    'cancelar una venta de la cuenta anterior no devuelve piezas');

  -- Y mientras no se cuenta, la venta no descuenta.
  perform public.stock_track(c.variant_grande, false);
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 1)), null, 1000);
  perform pruebas.espera((select qty from public.stock_items where id = v_gitem) = 4,
    'lo que no se está contando no baja con la venta');
  perform pruebas.espera(v_t->'stock' = '[]'::jsonb, 'y no aparece en lo que devuelve el cobro');

  -- ── Un insumo también se puede apagar y renombrar ──────────────────
  perform pruebas.como(c.owner_id);
  perform public.supply_save('Café en grano premium', 'kilo',
    (select supply_id from public.stock_items where id = v_item), null, 3);
  perform pruebas.espera((select name from public.supplies where id = (select supply_id from public.stock_items where id = v_item))
    = 'Café en grano premium', 'un insumo se puede renombrar');

  -- ── Borrar la cafetería se lleva su inventario ─────────────────────
  perform pruebas.como_postgres();
  perform public.delete_business(c.business_id, 'cafe-inventario');
  perform pruebas.espera(
    not exists (select 1 from public.stock_items where business_id = c.business_id)
    and not exists (select 1 from public.stock_movements where business_id = c.business_id)
    and not exists (select 1 from public.supplies where business_id = c.business_id),
    'delete_business borra insumos, existencias y diario');

  raise notice 't_20_inventario: ok';
end $t$;
