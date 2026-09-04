-- 46_p33_nombres_por_hora.sql — P33: quién suele venir a esta hora
-- (migración: p33_nombres_por_hora).
--
-- Juan pasa por su café casi siempre después de entrenar, entre 8 y 10. Al
-- abrir una cuenta a esa hora su nombre debe estar a un toque, sin que nadie
-- tenga que registrarlo en ningún lado: basta con que la cajera le haya
-- abierto cuenta otras veces.
--
-- Cada cuenta que se abre deja una visita: el nombre y la hora local del
-- negocio. Lo hace un disparador, no la app, para que también cuente lo que
-- se abra desde cualquier aparato o versión. La sugerencia se calcula al
-- abrir: nombres de los últimos 60 días agrupados por hora; el POS filtra la
-- franja de dos horas alrededor de ahora y descarta los chips fijos (mesas y
-- etiquetas) y los nombres automáticos.

create table public.account_visits (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  hour smallint not null check (hour between 0 and 23),
  created_at timestamptz not null default now()
);
create index account_visits_business_created on public.account_visits (business_id, created_at desc);

-- Sin políticas a propósito: se escribe por disparador y se lee por RPC.
alter table public.account_visits enable row level security;
revoke all on public.account_visits from public, anon, authenticated;

create or replace function public.record_account_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_name text;
begin
  v_name := left(trim(coalesce(new.name, '')), 40);
  if v_name = '' then
    return new;
  end if;
  select timezone into v_tz from public.businesses where id = new.business_id;
  insert into public.account_visits (business_id, name, hour)
  values (new.business_id, v_name, extract(hour from now() at time zone coalesce(v_tz, 'America/Mexico_City'))::smallint);
  return new;
end;
$$;

drop trigger if exists parked_orders_record_visit on public.parked_orders;
create trigger parked_orders_record_visit
  after insert on public.parked_orders
  for each row execute function public.record_account_visit();

-- Nombres de los últimos 60 días, por hora local: [{name, hour, n}, …].
-- Se agrupa sin distinguir mayúsculas («juan» y «Juan» son la misma persona)
-- y se devuelve la forma en que más veces se escribió.
create or replace function public.account_name_suggestions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', v.name, 'hour', v.hour, 'n', v.n) order by v.n desc, v.name), '[]'::jsonb)
  from (
    select mode() within group (order by name) as name, hour, count(*) as n
    from public.account_visits
    where business_id = (select business_id from public.member_ctx())
      and created_at > now() - interval '60 days'
    group by lower(name), hour
  ) v;
$$;

revoke all on function public.account_name_suggestions() from public, anon;
grant execute on function public.account_name_suggestions() to authenticated;
