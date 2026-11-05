-- t_21_operacion.sql — migración 60: los reportes de error tienen cubetas
-- (sin sesión no se puede tapar lo de los cafés), derive_uuid tiene camino de
-- búsqueda fijo y los crons anotan sus envíos para no repetirlos.
do $t$
declare
  c pruebas.cafe_ids;
  n int;
  i int;
begin
  c := pruebas.cafe('cafe-operacion');

  -- ── Sin sesión: 30 por hora entre todos ────────────────────────────
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  for i in 1..40 loop
    perform public.report_error('/menu/x', 'anónimo ' || i, null, null, null);
  end loop;
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where actor_id is null;
  perform pruebas.espera(n = 30, format('sin sesión se guardan 30 por hora (hay %s)', n));

  -- ── Con sesión: la cubeta anónima llena no estorba ─────────────────
  perform pruebas.como(c.cashier_id);
  perform public.report_error('/pos', 'el error real de un café', null, null, null);
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where message = 'el error real de un café';
  perform pruebas.espera(n = 1, 'con sesión se guarda aunque los anónimos llenaron lo suyo');

  -- ── Una sola persona no pasa de 60 por hora… ───────────────────────
  perform pruebas.como(c.cashier_id);
  for i in 1..80 loop
    perform public.report_error('/pos', 'cajera ' || i, null, null, null);
  end loop;
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where actor_id = c.cashier_id;
  perform pruebas.espera(n = 60, format('una persona guarda 60 por hora (hay %s)', n));

  -- ── …y otra persona sigue pudiendo reportar ────────────────────────
  perform pruebas.como(c.owner_id);
  perform public.report_error('/admin', 'lo del dueño', null, null, null);
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where actor_id = c.owner_id;
  perform pruebas.espera(n = 1, 'otra persona reporta aunque la cajera llenó su cubeta');

  -- ── derive_uuid: camino de búsqueda fijo, mismo resultado ──────────
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'derive_uuid' and 'search_path=""' = any (p.proconfig);
  perform pruebas.espera(n = 1, 'derive_uuid tiene search_path fijo');
  perform pruebas.espera(
    public.derive_uuid('00000000-0000-0000-0000-000000000000'::uuid, 'k')
      = overlay(overlay(md5('00000000-0000-0000-0000-000000000000:k') placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid,
    'derive_uuid da lo mismo que antes');

  -- ── cron_corridas: la misma clave no entra dos veces ───────────────
  insert into public.cron_corridas (trabajo, clave) values ('correo-errores', '2026-11-05');
  begin
    insert into public.cron_corridas (trabajo, clave) values ('correo-errores', '2026-11-05');
    raise exception 'FALLA: la misma corrida se anotó dos veces';
  exception when unique_violation then null;
  end;

  -- …y ningún cliente la ve ni la escribe.
  perform pruebas.como(c.owner_id);
  begin
    perform count(*) from public.cron_corridas;
    raise exception 'FALLA: el dueño leyó cron_corridas';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cron_corridas (trabajo, clave) values ('x', 'y');
    raise exception 'FALLA: el dueño escribió en cron_corridas';
  exception when insufficient_privilege then null;
  end;

  perform pruebas.como_postgres();
end $t$;
