-- t_09_extra_por_omision.sql — la opción por omisión de un grupo de extras:
-- como mucho una por grupo (marcar otra desmarca), se va con la opción al
-- borrarla, la copia clone_menu, y la cambian dueños pero no cajeros.
do $t$
declare
  c pruebas.cafe_ids;
  v_desl uuid;
  v_veg uuid;
  v_clon uuid;
  v_n int;
begin
  c := pruebas.cafe('cafe-omision');
  insert into public.modifiers (business_id, group_id, name, price_delta, sort_order)
  values (c.business_id, c.modifier_group_id, 'Deslactosada', 0, 2) returning id into v_desl;

  -- 1) Marcar una
  update public.modifiers set is_default = true where id = c.modifier_id;
  perform pruebas.espera((select is_default from public.modifiers where id = c.modifier_id), 'la opción por omisión queda marcada');

  -- 2) Marcar otra desmarca a la anterior: nunca hay dos
  update public.modifiers set is_default = true where id = v_desl;
  select count(*) into v_n from public.modifiers where group_id = c.modifier_group_id and is_default;
  perform pruebas.espera(v_n = 1 and (select is_default from public.modifiers where id = v_desl), 'marcar otra desmarca a la anterior');

  -- 3) Borrarla deja al grupo sin opción por omisión, y el grupo sigue
  delete from public.modifiers where id = v_desl;
  perform pruebas.espera(
    (select count(*) from public.modifiers where group_id = c.modifier_group_id and is_default) = 0,
    'sin opción por omisión tras borrarla');
  perform pruebas.espera((select count(*) from public.modifier_groups where id = c.modifier_group_id) = 1, 'el grupo sigue');

  -- 4) clone_menu la copia
  update public.modifiers set is_default = true where id = c.modifier_id;
  insert into public.businesses (name, slug) values ('Clon', 'clon-omision') returning id into v_clon;
  perform public.clone_menu(c.business_id, v_clon);
  select count(*) into v_n
  from public.modifiers m join public.modifier_groups g on g.id = m.group_id
  where g.business_id = v_clon and g.name = 'Leche' and m.name = 'Leche de avena' and m.is_default;
  perform pruebas.espera(v_n = 1, format('el clon trae la opción por omisión de «Leche» (dio %s)', v_n));

  -- 5) El dueño la cambia (y el trigger desmarca a la hermana bajo RLS); el cajero no
  insert into public.modifiers (business_id, group_id, name, price_delta, sort_order)
  values (c.business_id, c.modifier_group_id, 'Vegetal', 10, 3) returning id into v_veg;
  perform pruebas.como(c.owner_id);
  update public.modifiers set is_default = true where id = v_veg;
  get diagnostics v_n = row_count;
  perform pruebas.espera(v_n = 1, 'el dueño puede marcar la opción por omisión');
  perform pruebas.espera(
    (select count(*) from public.modifiers where group_id = c.modifier_group_id and is_default) = 1
    and (select is_default from public.modifiers where id = v_veg),
    'al marcar como dueño, la anterior se desmarca');
  perform pruebas.como(c.cashier_id);
  update public.modifiers set is_default = true where id = c.modifier_id;
  get diagnostics v_n = row_count;
  perform pruebas.espera(v_n = 0, 'el cajero no toca el menú');
  perform pruebas.como_postgres();
end $t$;
