-- 38_p17_errores.sql — P17: los errores de la app dejan rastro y llegan al
-- operador (migración: p17_errores).
--
-- Hasta hoy, si el POS tronaba un sábado a las 8 de la mañana, el dueño veía
-- «Algo salió mal» y nadie más se enteraba hasta que llamara. Los límites de
-- error de la app (`app/error.tsx`, `app/admin/error.tsx`) solo escribían en
-- la consola del navegador, que nadie mira.
--
-- Sin proveedor externo, a propósito: una tabla, un RPC y el correo que ya
-- existe. Con dos cafeterías eso alcanza y no agrega una cuenta más que
-- pagar ni una llave más que cuidar.
--
-- Reglas:
--   · `app_errors` NO tiene políticas: ningún cliente lee ni escribe directo.
--     Se escribe por `report_error` y se lee desde /super con service role.
--   · `report_error` lo puede llamar cualquiera, INCLUSO anónimo, porque las
--     páginas públicas (el menú por QR, la nota de compra) también truenan.
--   · Anti-tormenta: el mismo error (misma ruta y mensaje) no se apunta más
--     de una vez por minuto, y nunca más de 300 renglones por hora en total.
--     Un bucle de renderizado roto no puede llenar la base ni inflar el
--     resumen del día.
--   · Se guardan 30 días. La limpieza la hace el mismo RPC de vez en cuando,
--     para no necesitar otro cron.

create table public.app_errors (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  route text not null,
  message text not null,
  digest text,
  stack text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index app_errors_recientes_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;
revoke all on table public.app_errors from public, anon, authenticated;

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
as $fn$
declare
  v_ctx record;
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

  -- Anti-tormenta 2: tope global por hora, venga de donde venga.
  if (select count(*) from public.app_errors where created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;

  insert into public.app_errors (business_id, actor_id, route, message, digest, stack, user_agent)
  values (v_biz, v_actor, v_route, v_message,
          left(p_digest, 64), left(p_stack, 4000), left(p_user_agent, 300));

  -- Limpieza oportunista: una de cada ~50 veces, para no pagar el borrado en
  -- cada reporte y no necesitar un cron aparte.
  if random() < 0.02 then
    delete from public.app_errors where created_at < now() - interval '30 days';
  end if;
end;
$fn$;

revoke all on function public.report_error(text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text) to anon, authenticated;
