-- t_18_indice_usuario.sql — el login por usuario SIN café: la consulta que
-- ahora hace `login` (buscar `username` en todos los negocios) tiene índice y
-- solo alcanza cuentas de café activas. Lo que se prueba es la promesa del
-- índice, no su plan: que exista, que sea parcial y que la búsqueda devuelva
-- exactamente los candidatos que `elegirCafe` espera.
do $t$
declare
  a pruebas.cafe_ids;
  b pruebas.cafe_ids;
  v_def text;
  v_n int;
  v_slugs text;
begin
  a := pruebas.cafe('cafe-login-a');
  b := pruebas.cafe('cafe-login-b');

  -- ── El índice existe y es el parcial que se pidió ──────────────────
  select indexdef into v_def
  from pg_indexes
  where schemaname = 'public' and indexname = 'idx_business_members_username';

  if v_def is null then
    raise exception 'FALLA: no existe idx_business_members_username';
  end if;
  if v_def not like '%username%' then
    raise exception 'FALLA: el índice no es por username: %', v_def;
  end if;
  if v_def not like '%WHERE%' or v_def not like '%is_active%' then
    raise exception 'FALLA: el índice debería ser parcial (solo cuentas activas): %', v_def;
  end if;

  -- ── Un usuario repetido en dos cafés trae DOS candidatos ───────────
  -- Es el caso que obliga a preguntar el café; «cajero» y «admin» van a
  -- repetirse en cuanto haya dos cafés que los usen.
  update public.business_members set username = 'cajero'
  where business_id = a.business_id and user_id = a.cashier_id;
  update public.business_members set username = 'cajero'
  where business_id = b.business_id and user_id = b.cashier_id;

  select count(*), string_agg(bu.slug, ',' order by bu.slug)
    into v_n, v_slugs
  from public.business_members m
  join public.businesses bu on bu.id = m.business_id
  where m.username = 'cajero' and m.is_active
    and m.business_id in (a.business_id, b.business_id);

  if v_n <> 2 then
    raise exception 'FALLA: se esperaban 2 candidatos para «cajero», hubo %', v_n;
  end if;
  if v_slugs <> 'cafe-login-a,cafe-login-b' then
    raise exception 'FALLA: candidatos inesperados: %', v_slugs;
  end if;

  -- ── Una cuenta DESACTIVADA deja de ser candidata ───────────────────
  -- Si no, alguien a quien se le quitó el acceso seguiría resolviendo (y
  -- peor: convertiría un usuario único en «repetido», pidiendo un café que
  -- la persona no tiene por qué conocer).
  update public.business_members set is_active = false
  where business_id = b.business_id and user_id = b.cashier_id;

  select count(*) into v_n
  from public.business_members m
  where m.username = 'cajero' and m.is_active
    and m.business_id in (a.business_id, b.business_id);

  if v_n <> 1 then
    raise exception 'FALLA: tras desactivar, se esperaba 1 candidato, hubo %', v_n;
  end if;

  -- ── Las membresías por correo no estorban ──────────────────────────
  -- No tienen usuario, así que ni entran al índice ni pueden resolver.
  select count(*) into v_n
  from public.business_members m
  where m.username is null and m.business_id in (a.business_id, b.business_id);

  if v_n = 0 then
    raise exception 'FALLA: el café de prueba debería tener al menos una membresía sin usuario (la del dueño)';
  end if;

  raise notice 't_18 OK: índice parcial por usuario, repetidos detectados y desactivados fuera';
end $t$;
