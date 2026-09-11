-- t_20_inventario.sql — inventario por pieza (P45, migración 57): la venta
-- descuenta y la cancelación devuelve solo lo que descontó; corregir sale
-- gratis; fuera de menú no toca nada; el negativo se permite; la entrada con
-- costo actualiza el costo de la variante y la cajera no puede ponerlo; la
-- merma exige motivo; contar es de admin; el diario cuadra renglón a renglón;
-- ningún cliente escribe las tablas; y borrar el café se lleva todo.
do $t$
declare
  c pruebas.cafe_ids;
  v_r jsonb;
  v_t jsonb;
  v_t2 jsonb;
  v_c jsonb;
  v_q int;
  v_n int;
  v_ok boolean;
  v_msg text;
begin
  c := pruebas.cafe('cafe-inventario');

  -- ── Marcar: solo admin, y la existencia inicial queda como conteo ──
  perform pruebas.como(c.cashier_id);
  begin
    perform public.stock_track(c.variant_chico, true, 10, 3);
    raise exception 'FALLA: la cajera pudo decidir qué se cuenta';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;

  perform pruebas.como(c.owner_id);
  v_r := public.stock_track(c.variant_chico, true, 10, 3);
  perform pruebas.espera((v_r->>'qty')::int = 10 and (v_r->>'min_qty')::int = 3, 'marcar con existencia inicial deja 10 y mínimo 3');
  perform pruebas.espera(
    (select count(*) from public.stock_movements where variant_id = c.variant_chico and kind = 'conteo' and qty = 10 and qty_after = 10 and reason = 'Existencia inicial') = 1,
    'la existencia inicial queda en el diario como conteo');

  -- ── La venta descuenta (y lo grande, que no se cuenta, no) ──────────
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 2),
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 1),
    jsonb_build_object('custom', jsonb_build_object('name', 'Fruta', 'price', 30), 'quantity', 1)), null, 1000);
  select qty into v_q from public.stock_items where variant_id = c.variant_chico;
  perform pruebas.espera(v_q = 8, format('vender 2 deja 8 (quedó %s)', v_q));
  perform pruebas.espera(v_t->'stock' = jsonb_build_array(jsonb_build_object('variant_id', c.variant_chico, 'qty', 8)),
    'create_ticket devuelve la existencia nueva de lo que contó, y solo de eso');
  perform pruebas.espera(
    (select count(*) from public.stock_movements where ticket_id = (v_t->>'ticket_id')::uuid) = 1,
    'un movimiento por renglón contado; lo grande y lo fuera de menú no dejan rastro');
  perform pruebas.espera(not exists (select 1 from public.stock_items where variant_id = c.variant_grande),
    'lo que no se marcó no aparece en existencias');

  -- ── Cancelar devuelve ───────────────────────────────────────────────
  v_c := public.cancel_ticket((v_t->>'ticket_id')::uuid, 'se arrepintió');
  select qty into v_q from public.stock_items where variant_id = c.variant_chico;
  perform pruebas.espera(v_q = 10, format('cancelar devuelve las 2 (quedó %s)', v_q));
  perform pruebas.espera(v_c->'stock' = jsonb_build_array(jsonb_build_object('variant_id', c.variant_chico, 'qty', 10)),
    'cancel_ticket también devuelve la existencia nueva');

  -- ── Corregir sale gratis: cancela y vuelve a cobrar ─────────────────
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 3)), null, 1000);
  v_t2 := public.correct_ticket((v_t->>'ticket_id')::uuid, gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 1)), null, 1000);
  select qty into v_q from public.stock_items where variant_id = c.variant_chico;
  perform pruebas.espera(v_q = 9, format('corregir de 3 a 1 deja 9 (quedó %s)', v_q));

  -- ── Negativo permitido: nunca se bloquea una venta ──────────────────
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 12)), null, 1000);
  select qty into v_q from public.stock_items where variant_id = c.variant_chico;
  perform pruebas.espera(v_q = -3, format('vender más de lo que hay deja -3 y NO bloquea (quedó %s)', v_q));

  -- ── Entradas: la cajera sí, pero sin costo ──────────────────────────
  v_r := public.stock_move(c.variant_chico, 'entrada', 15, null, null);
  perform pruebas.espera((v_r->>'qty_after')::int = 12, 'la cajera registra la entrada y queda en 12');
  begin
    perform public.stock_move(c.variant_chico, 'entrada', 1, null, 9.5);
    raise exception 'FALLA: la cajera pudo poner el costo';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;
  perform pruebas.espera((select cost from public.menu_variants where id = c.variant_chico) = 12, 'el costo sigue en 12');

  perform pruebas.como(c.owner_id);
  v_r := public.stock_move(c.variant_chico, 'entrada', 3, null, 9.5);
  perform pruebas.espera((v_r->>'qty_after')::int = 15 and (v_r->>'cost_updated')::boolean, 'la dueña mete 3 con costo');
  perform pruebas.espera((select cost from public.menu_variants where id = c.variant_chico) = 9.5,
    'la entrada con costo actualiza el costo de la variante');
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_chico, 'quantity', 1)), null, 1000);
  perform pruebas.espera(
    (select unit_cost from public.ticket_items where ticket_id = (v_t->>'ticket_id')::uuid) = 9.5,
    'la siguiente venta ya fotografía el costo nuevo');

  -- ── Merma: con motivo, y la cajera puede ────────────────────────────
  perform pruebas.como(c.cashier_id);
  begin
    perform public.stock_move(c.variant_chico, 'merma', 2, '   ', null);
    raise exception 'FALLA: dejó pasar una merma sin motivo';
  exception when others then
    if sqlerrm not like 'Indica el motivo%' then raise; end if;
  end;
  v_r := public.stock_move(c.variant_chico, 'merma', 2, 'Caducó', null);
  perform pruebas.espera((v_r->>'qty_after')::int = 12 and (v_r->>'qty')::int = -2, 'la merma resta 2 y deja 12');

  -- ── Conteo: solo admin; el sistema calcula la diferencia ────────────
  begin
    perform public.stock_move(c.variant_chico, 'conteo', 20, null, null);
    raise exception 'FALLA: la cajera pudo contar';
  exception when others then
    if sqlerrm not like 'Solo un administrador%' then raise; end if;
  end;
  perform pruebas.como(c.owner_id);
  v_r := public.stock_move(c.variant_chico, 'conteo', 12, null, null);
  perform pruebas.espera((v_r->>'moved')::boolean = false, 'contar lo mismo que dice el sistema no es un movimiento');
  v_r := public.stock_move(c.variant_chico, 'conteo', 9, 'sobraban en la vitrina', null);
  perform pruebas.espera((v_r->>'qty')::int = -3 and (v_r->>'qty_after')::int = 9, 'contar 9 registra la diferencia (-3)');

  -- ── El diario cuadra renglón a renglón ──────────────────────────────
  perform pruebas.como_postgres();
  select bool_and(ok) into v_ok from (
    select m.qty_after = sum(m.qty) over (order by m.seq) as ok
    from public.stock_movements m where m.variant_id = c.variant_chico) s;
  perform pruebas.espera(v_ok, 'cada qty_after es la suma de todo lo anterior');
  perform pruebas.espera(
    (select count(*) from public.audit_events where business_id = c.business_id and action in ('existencias.marcado', 'existencias.entrada', 'existencias.merma', 'existencias.conteo')) >= 4,
    'marcar, entradas, merma y conteo dejan bitácora');

  -- ── Ningún cliente escribe las tablas ───────────────────────────────
  perform pruebas.como(c.owner_id);
  begin
    insert into public.stock_movements (business_id, variant_id, kind, qty, qty_after)
    values (c.business_id, c.variant_chico, 'entrada', 100, 999);
    raise exception 'FALLA: el dueño pudo escribir el diario a mano';
  exception when insufficient_privilege then null;
  end;
  update public.stock_items set qty = 999 where variant_id = c.variant_chico;
  perform pruebas.espera((select qty from public.stock_items where variant_id = c.variant_chico) = 9,
    'un update directo no cambia nada (sin política de escritura)');

  -- ── Cancelar una venta de ANTES de contar no inventa piezas ─────────
  perform public.stock_track(c.variant_grande, false);
  perform pruebas.como(c.cashier_id);
  v_t := public.create_ticket(gen_random_uuid(), 'efectivo', jsonb_build_array(
    jsonb_build_object('variant_id', c.variant_grande, 'quantity', 4)), null, 1000);
  perform pruebas.como(c.owner_id);
  perform public.stock_track(c.variant_grande, true, 5, 0);
  perform public.cancel_ticket((v_t->>'ticket_id')::uuid, 'era de prueba');
  perform pruebas.espera((select qty from public.stock_items where variant_id = c.variant_grande) = 5,
    'cancelar una venta anterior al conteo deja los 5 como estaban');

  -- ── Dejar de contar conserva el diario ──────────────────────────────
  perform public.stock_track(c.variant_chico, false);
  perform pruebas.espera(not exists (select 1 from public.stock_items where variant_id = c.variant_chico),
    'al desmarcar desaparece de existencias');
  select count(*) into v_n from public.stock_movements where variant_id = c.variant_chico;
  perform pruebas.espera(v_n >= 8, format('el diario se queda (%s renglones)', v_n));

  -- ── Borrar la cafetería se lleva su inventario ──────────────────────
  perform pruebas.como_postgres();
  perform public.delete_business(c.business_id, 'cafe-inventario');
  perform pruebas.espera(not exists (select 1 from public.stock_items where business_id = c.business_id)
    and not exists (select 1 from public.stock_movements where business_id = c.business_id),
    'delete_business también borra existencias y diario');

  raise notice 't_20_inventario: ok';
end $t$;
