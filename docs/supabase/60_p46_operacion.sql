-- 60_p46_operacion.sql — tres arreglos de operación (revisión del 2026-11-04).
--
-- 1. `derive_uuid` sin `search_path` fijo. Lo marcaba el linter de Supabase
--    («function_search_path_mutable»): una función cuyo camino de búsqueda
--    depende de quién la llama puede resolver otra `md5` u `overlay` que no
--    sea la del sistema. Solo usa funciones del sistema, así que va vacío.
--
-- 2. `report_error` con un solo tope de 300 por hora PARA TODOS. Está abierta
--    a `anon` (las páginas públicas también reportan) y la llave pública va en
--    el JS de la página: cualquiera podía gastar el tope solo y, durante esa
--    hora, los errores y avisos reales de los cafés ya no se guardaban ni
--    llegaban al correo de la mañana. Ahora hay cubetas: sin sesión, 30 por
--    hora entre todos; con sesión, 60 por persona y 300 entre todos. Un
--    reporte con sesión nunca se queda fuera por culpa de los anónimos, y una
--    sola cuenta (aunque sea de prueba gratis) no llena la de los demás.
--
-- 3. Correr un cron dos veces reenviaba sus correos: el aviso de fin de
--    prueba, el resumen de errores y el resumen semanal. Vercel avisa que un
--    cron puede llegar repetido, y un «Run» a mano desde el panel hace lo
--    mismo. `cron_corridas` anota cada envío con una clave (café + día, o café
--    + semana); el cron reserva la clave ANTES de mandar y, si ya existía, no
--    manda. Sin `business_id` a propósito: la clave lo lleva como texto, así
--    que borrar un café no choca con esta tabla (no entra en delete_business).
--    Solo la toca el servidor (service role): RLS encendido y sin políticas.

-- ── 1. derive_uuid ────────────────────────────────────────────────────
alter function public.derive_uuid(uuid, text) set search_path = '';

-- ── 2. report_error con cubetas ───────────────────────────────────────
create or replace function public.report_error(
  p_route text,
  p_message text,
  p_digest text default null,
  p_stack text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz uuid;
  v_actor uuid;
  v_route text := left(coalesce(nullif(trim(p_route), ''), '?'), 200);
  v_message text := left(coalesce(nullif(trim(p_message), ''), 'Error sin mensaje'), 500);
begin
  -- Con sesión se anota quién y en qué cafetería; sin sesión (páginas
  -- públicas) se anota igual, solo que anónimo.
  v_actor := auth.uid();
  if v_actor is not null then
    select business_id into v_biz from public.member_ctx();
  end if;

  -- Anti-tormenta 1: el mismo error, en el mismo minuto, cuenta una vez.
  if exists (
    select 1 from public.app_errors
    where route = v_route and message = v_message
      and created_at > now() - interval '1 minute'
  ) then
    return;
  end if;

  -- Anti-tormenta 2, por cubetas: sin sesión, 30 por hora entre todos; con
  -- sesión, 60 por persona y 300 entre todos (ver la cabecera).
  if v_actor is null then
    if (select count(*) from public.app_errors
        where actor_id is null and created_at > now() - interval '1 hour') >= 30 then
      return;
    end if;
  elsif (select count(*) from public.app_errors
         where actor_id = v_actor and created_at > now() - interval '1 hour') >= 60
     or (select count(*) from public.app_errors
         where actor_id is not null and created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into public.app_errors (business_id, actor_id, route, message, digest, stack, user_agent)
  values (v_biz, v_actor, v_route, v_message,
          left(p_digest, 64), left(p_stack, 4000), left(p_user_agent, 300));

  -- Limpieza oportunista: una de cada ~50 veces, para no pagar el borrado en
  -- cada reporte y no necesitar un cron aparte.
  if random() < 0.02 then
    delete from public.app_errors where created_at < now() - interval '2 days';
  end if;
end;
$$;

-- `create or replace` conserva los permisos; se repiten por claridad.
revoke all on function public.report_error(text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text) to anon, authenticated;

-- ── 3. cron_corridas ──────────────────────────────────────────────────
create table public.cron_corridas (
  trabajo text not null,
  clave text not null,
  creada timestamptz not null default now(),
  primary key (trabajo, clave)
);

alter table public.cron_corridas enable row level security;
revoke all on public.cron_corridas from anon, authenticated;

comment on table public.cron_corridas is
  'Envíos de los crons ya hechos (aviso de prueba, resumen de errores, resumen semanal), para no repetirlos si el cron corre dos veces. Solo service role.';

-- ── Comprobación: la base tiene exactamente este cuerpo ───────────────
-- md5 del cuerpo de report_error entre los `$$` de arriba, calculado sobre
-- este mismo archivo al armarlo. Si no coincide, la migración falla.
do $$
declare
  v_real text;
  v_config text[];
begin
  select md5(p.prosrc) into v_real
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'report_error';
  if v_real is distinct from 'c13359a8c824cad24bcf240fdc4a8b43' then
    raise exception 'El cuerpo de report_error en la base no es el de este archivo (md5 %).', v_real;
  end if;

  select p.proconfig into v_config
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'derive_uuid';
  if v_config is null or not ('search_path=""' = any (v_config)) then
    raise exception 'derive_uuid no quedó con search_path fijo (%).', v_config;
  end if;
  raise notice 'p46_operacion: report_error y derive_uuid coinciden con el archivo.';
end $$;
