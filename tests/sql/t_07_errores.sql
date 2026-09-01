-- t_07_errores.sql — los errores se apuntan, con quién y dónde, y una
-- tormenta no llena la base.
do $t$
declare
  c pruebas.cafe_ids;
  n int;
  i int;
begin
  c := pruebas.cafe('cafe-errores');

  -- Con sesión: queda la cafetería y la persona
  perform pruebas.como(c.cashier_id);
  perform public.report_error('/pos', 'Cannot read properties of undefined', 'abc123', 'at Cart (pos-client.tsx:10)', 'Safari iPad');
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors
   where business_id = c.business_id and actor_id = c.cashier_id and route = '/pos' and digest = 'abc123';
  perform pruebas.espera(n = 1, 'el error con sesión se apuntó con cafetería y persona');

  -- Sin sesión (página pública): se apunta igual, anónimo
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform public.report_error('/menu/cafe-errores', 'Failed to fetch', null, null, 'Chrome Android');
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where route = '/menu/cafe-errores' and business_id is null and actor_id is null;
  perform pruebas.espera(n = 1, 'el error anónimo se apuntó sin cafetería');

  -- Nadie lee la tabla directo, ni con sesión
  perform pruebas.como(c.owner_id);
  begin
    perform count(*) from public.app_errors;
    raise exception 'FALLA: el dueño leyó app_errors directo';
  exception when insufficient_privilege then null;
  end;

  -- Anti-tormenta: el mismo error 20 veces en el mismo minuto es UNA fila
  perform pruebas.como(c.cashier_id);
  for i in 1..20 loop
    perform public.report_error('/pos', 'Se repite sin parar', null, null, null);
  end loop;
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where message = 'Se repite sin parar';
  perform pruebas.espera(n = 1, format('la tormenta quedó en una fila (hay %s)', n));

  -- Mensajes distintos sí cuentan cada uno
  perform pruebas.como(c.cashier_id);
  perform public.report_error('/pos', 'Otro distinto', null, null, null);
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where route = '/pos';
  perform pruebas.espera(n = 3, format('tres errores distintos en /pos (hay %s)', n));

  -- Un mensaje kilométrico se recorta en vez de reventar
  perform pruebas.como(c.cashier_id);
  perform public.report_error('/admin', repeat('x', 5000), null, repeat('y', 20000), null);
  perform pruebas.como_postgres();
  select count(*) into n from public.app_errors where route = '/admin' and length(message) = 500 and length(stack) = 4000;
  perform pruebas.espera(n = 1, 'mensaje y traza recortados');

  perform pruebas.como_postgres();
end $t$;
