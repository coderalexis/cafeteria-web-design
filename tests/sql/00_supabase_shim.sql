-- 00_supabase_shim.sql — lo mínimo de Supabase que las migraciones dan por
-- sentado, imitado en un Postgres pelón para poder reproducirlas desde cero.
--
-- Las 36 migraciones solo dependen de cuatro cosas que Supabase trae puestas:
--   · los roles anon / authenticated / service_role,
--   · el esquema auth con la tabla users y las funciones uid() / role() / jwt(),
--   · pgcrypto dentro del esquema `extensions` (para los PIN de caja),
--   · gen_random_uuid(), que ya es del núcleo desde Postgres 13.
--
-- auth.uid() lee `request.jwt.claims`, igual que en Supabase: así las
-- pruebas impersonan a un usuario con set_config y las políticas RLS y los
-- RPCs se comportan exactamente como en producción. No es un mock de la
-- lógica —la lógica es la real—, es solo el suelo que le falta.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to public;

-- Las columnas que las migraciones tocan: id, email, raw_user_meta_data
-- (handle_new_user saca de ahí el nombre) y encrypted_password por si alguna
-- prueba quiere verificar contraseñas con crypt().
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  )
$$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- Supabase da estos permisos de base sobre `public`: los tres roles pueden
-- TODO sobre cualquier tabla, secuencia o función nueva, y la puerta real es
-- la RLS. Por eso una migración solo necesita «revocar de anon» donde quiere
-- cerrar (la 04 lo hace) y dar grants explícitos solo en tablas donde quiere
-- ser más estricta. Sin esto, el replay pedía permisos que en producción
-- nadie tuvo que pedir, y la suite fallaba por una razón que no era del
-- sistema.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
