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

-- Supabase da estos permisos de base sobre `public`; sin ellos, los grants
-- de las migraciones («grant select on table … to authenticated») no bastan
-- porque el rol ni siquiera puede entrar al esquema.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
