-- ============================================================
-- 09 — Multi-cafetería (M0): negocios, membresías, business_id en
-- todas las tablas de negocio, RLS y RPCs por negocio, folio y caja
-- por negocio, plantilla de menú clonable.
--
-- Aplicar después de 08_fase4b.sql. Es 100 % compatible con el código
-- de la app desplegado hasta la Fase 4c: conserva profiles.role y
-- profiles.username (se retiran en 10_multitenant_cleanup.sql junto
-- con el despliegue de M1) y mantiene las firmas de todos los RPC.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tipos y tablas nuevas
-- ────────────────────────────────────────────────────────────

create type public.business_role as enum ('owner', 'admin', 'cajero');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  -- etiqueta DNS válida: forma parte del correo sintético de los cajeros
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  timezone text not null default 'America/Mexico_City',
  currency text not null default 'MXN',
  locale text not null default 'es-MX',
  address text,
  phone text,
  receipt_header text,
  receipt_footer text,
  plan text not null default 'free',
  status text not null default 'active' check (status in ('active', 'suspended')),
  is_template boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- referencia a profiles (no a auth.users) para poder embeber en PostgREST
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.business_role not null default 'cajero',
  -- solo cuentas de café (login por usuario); null para owners/admins que entran por correo
  username text check (username ~ '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id),
  unique (business_id, username)
);
create index idx_business_members_user on public.business_members (user_id);

-- Folio consecutivo por negocio (fila bloqueada por create_ticket)
create table public.business_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  next_folio bigint not null default 1 check (next_folio >= 1)
);

alter table public.profiles
  add column active_business_id uuid references public.businesses (id) on delete set null,
  add column is_platform_admin boolean not null default false;

-- Triggers de businesses
create or replace function public.init_business_counter()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.business_counters (business_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger businesses_init_counter
after insert on public.businesses
for each row execute function public.init_business_counter();

create or replace function public.validate_business_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- lanza "time zone ... not recognized" si la zona no existe
  perform now() at time zone new.timezone;
  return new;
end;
$$;
create trigger businesses_validate
before insert or update on public.businesses
for each row execute function public.validate_business_settings();

create trigger set_businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2. business_id (por ahora nullable y sin default) en las 11 tablas
-- ────────────────────────────────────────────────────────────

alter table public.menu_categories        add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.menu_products          add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.menu_variants          add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.modifier_groups        add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.modifiers              add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.product_modifier_groups add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.cash_sessions          add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.cash_movements         add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.tickets                add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.ticket_items           add column business_id uuid references public.businesses (id) on delete restrict;
alter table public.ticket_item_modifiers  add column business_id uuid references public.businesses (id) on delete restrict;

-- ────────────────────────────────────────────────────────────
-- 3. Funciones núcleo
-- ────────────────────────────────────────────────────────────

-- Contexto del miembro: 0 filas si no hay sesión, si no es miembro activo del
-- negocio activo, o si el negocio está suspendido.
create or replace function public.member_ctx()
returns table (user_id uuid, business_id uuid, member_role public.business_role, timezone text, is_template boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, b.id, m.role, b.timezone, b.is_template
  from public.profiles p
  join public.business_members m on m.user_id = p.id and m.business_id = p.active_business_id and m.is_active
  join public.businesses b on b.id = m.business_id and b.status = 'active'
  where p.id = auth.uid()
$$;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.member_ctx()
$$;

-- Sustituye a current_role() (palabra reservada de SQL): rol dentro del negocio activo.
create or replace function public.current_member_role()
returns public.business_role
language sql
stable
security definer
set search_path = public
as $$
  select member_role from public.member_ctx()
$$;

-- Un solo round trip para middleware y páginas.
create or replace function public.my_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'full_name', p.full_name,
    'is_platform_admin', p.is_platform_admin,
    'business', (
      select jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'timezone', b.timezone,
        'currency', b.currency, 'locale', b.locale, 'status', b.status, 'is_template', b.is_template,
        'address', b.address, 'phone', b.phone,
        'receipt_header', b.receipt_header, 'receipt_footer', b.receipt_footer)
      from public.businesses b
      where b.id = p.active_business_id
        and exists (select 1 from public.business_members m
                    where m.business_id = b.id and m.user_id = p.id and m.is_active)),
    'role', (
      select m.role from public.business_members m
      where m.user_id = p.id and m.business_id = p.active_business_id and m.is_active),
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name, 'slug', b.slug, 'role', m.role,
               'status', b.status, 'is_template', b.is_template) order by b.name), '[]'::jsonb)
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      where m.user_id = p.id and m.is_active))
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.set_active_business(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;
  if not exists (
    select 1 from public.business_members
    where user_id = v_uid and business_id = p_business_id and is_active
  ) then
    raise exception 'No perteneces a ese negocio.';
  end if;
  update public.profiles set active_business_id = p_business_id where id = v_uid;
  return public.my_context();
end;
$$;

-- UUID determinista (con bits de versión/variante válidos) para clonar menús.
create or replace function public.derive_uuid(p_ns uuid, p_key text)
returns uuid
language sql
immutable
as $$
  select overlay(overlay(md5(p_ns::text || ':' || p_key) placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid
$$;

-- Clona el menú de un negocio a otro (vacío) con ids nuevos y remapeo por fórmula.
create or replace function public.clone_menu(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.businesses where id = p_source) then
    raise exception 'Negocio origen no existe.';
  end if;
  if not exists (select 1 from public.businesses where id = p_target) then
    raise exception 'Negocio destino no existe.';
  end if;
  if exists (select 1 from public.menu_categories where business_id = p_target)
     or exists (select 1 from public.modifier_groups where business_id = p_target) then
    raise exception 'El negocio destino ya tiene menú.';
  end if;

  insert into public.menu_categories (id, business_id, name, slug, sort_order, is_active)
  select public.derive_uuid(p_target, c.id::text), p_target, c.name, c.slug, c.sort_order, c.is_active
  from public.menu_categories c where c.business_id = p_source;

  insert into public.menu_products (id, business_id, category_id, name, description, image_url, sort_order, is_active)
  select public.derive_uuid(p_target, p.id::text), p_target, public.derive_uuid(p_target, p.category_id::text),
         p.name, p.description, p.image_url, p.sort_order, p.is_active
  from public.menu_products p where p.business_id = p_source;

  insert into public.menu_variants (id, business_id, product_id, name, size_label, price, sort_order, is_active)
  select public.derive_uuid(p_target, v.id::text), p_target, public.derive_uuid(p_target, v.product_id::text),
         v.name, v.size_label, v.price, v.sort_order, v.is_active
  from public.menu_variants v where v.business_id = p_source;

  insert into public.modifier_groups (id, business_id, name, min_select, max_select, is_required, sort_order, is_active)
  select public.derive_uuid(p_target, g.id::text), p_target, g.name, g.min_select, g.max_select, g.is_required, g.sort_order, g.is_active
  from public.modifier_groups g where g.business_id = p_source;

  insert into public.modifiers (id, business_id, group_id, name, price_delta, sort_order, is_active)
  select public.derive_uuid(p_target, m.id::text), p_target, public.derive_uuid(p_target, m.group_id::text),
         m.name, m.price_delta, m.sort_order, m.is_active
  from public.modifiers m where m.business_id = p_source;

  insert into public.product_modifier_groups (business_id, product_id, group_id)
  select p_target, public.derive_uuid(p_target, l.product_id::text), public.derive_uuid(p_target, l.group_id::text)
  from public.product_modifier_groups l where l.business_id = p_source;

  return jsonb_build_object(
    'categories', (select count(*) from public.menu_categories where business_id = p_target),
    'products',   (select count(*) from public.menu_products   where business_id = p_target),
    'variants',   (select count(*) from public.menu_variants   where business_id = p_target),
    'modifier_groups', (select count(*) from public.modifier_groups where business_id = p_target),
    'modifiers',  (select count(*) from public.modifiers where business_id = p_target),
    'links',      (select count(*) from public.product_modifier_groups where business_id = p_target)
  );
end;
$$;

-- supabase-js no tiene getUserByEmail; solo service_role.
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

-- Día de operación en la zona del negocio (reemplaza business_day(ts)).
create or replace function public.business_day(ts timestamptz, tz text)
returns date
language sql
stable
set search_path = public
as $$
  select (ts at time zone tz)::date
$$;
drop function public.business_day(timestamptz);

-- El perfil ya no lleva rol ni usuario: eso vive en business_members.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Backfill: El Cafecito + membresías + plantilla
-- ────────────────────────────────────────────────────────────

-- Los únicos globales de slug/folio/client_ref pasan a ser por negocio ANTES de
-- clonar la plantilla (los slugs se repiten entre negocios).
alter table public.menu_categories drop constraint menu_categories_slug_key;
alter table public.tickets drop constraint tickets_folio_key;
alter table public.tickets drop constraint tickets_client_ref_key;
alter table public.tickets alter column folio drop identity if exists;

do $$
declare
  v_biz uuid;
  v_tpl uuid;
  v_admin uuid := 'a6cdf641-1f69-47cd-ac3b-f8fae208e22e';
begin
  insert into public.businesses (name, slug, timezone, created_by)
  values ('El Cafecito', 'el-cafecito', 'America/Mexico_City', v_admin)
  returning id into v_biz;

  update public.menu_categories set business_id = v_biz where business_id is null;
  update public.menu_products set business_id = v_biz where business_id is null;
  update public.menu_variants set business_id = v_biz where business_id is null;
  update public.modifier_groups set business_id = v_biz where business_id is null;
  update public.modifiers set business_id = v_biz where business_id is null;
  update public.product_modifier_groups set business_id = v_biz where business_id is null;
  update public.cash_sessions set business_id = v_biz where business_id is null;
  update public.cash_movements set business_id = v_biz where business_id is null;
  update public.tickets set business_id = v_biz where business_id is null;
  update public.ticket_items set business_id = v_biz where business_id is null;
  update public.ticket_item_modifiers set business_id = v_biz where business_id is null;

  -- Membresías desde el rol global actual: admin → owner, cajero → cajero
  insert into public.business_members (business_id, user_id, role, username)
  select v_biz, p.id,
         case when p.role = 'admin' then 'owner' else 'cajero' end::public.business_role,
         lower(p.username)
  from public.profiles p;

  update public.profiles set active_business_id = v_biz;
  update public.profiles set is_platform_admin = true where id = v_admin;

  update public.business_counters
  set next_folio = coalesce((select max(folio) from public.tickets where business_id = v_biz), 0) + 1
  where business_id = v_biz;

  -- Plantilla clonable para negocios nuevos (el operador la edita desde /admin)
  insert into public.businesses (name, slug, is_template, created_by)
  values ('Plantilla cafetería', 'plantilla-cafeteria', true, v_admin)
  returning id into v_tpl;
  perform public.clone_menu(v_biz, v_tpl);
  insert into public.business_members (business_id, user_id, role) values (v_tpl, v_admin, 'owner');
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. Constraints e índices por negocio
-- ────────────────────────────────────────────────────────────

alter table public.menu_categories        alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.menu_products          alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.menu_variants          alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.modifier_groups        alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.modifiers              alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.product_modifier_groups alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.cash_sessions          alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.cash_movements         alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.tickets                alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.ticket_items           alter column business_id set not null, alter column business_id set default public.current_business_id();
alter table public.ticket_item_modifiers  alter column business_id set not null, alter column business_id set default public.current_business_id();

-- Únicos por negocio
alter table public.menu_categories add constraint menu_categories_business_slug_key unique (business_id, slug);
alter table public.tickets add constraint tickets_business_folio_key unique (business_id, folio);
alter table public.tickets add constraint tickets_business_client_ref_key unique (business_id, client_ref);

-- Una caja abierta POR NEGOCIO
drop index public.cash_sessions_one_open;
create unique index cash_sessions_one_open on public.cash_sessions (business_id) where status = 'abierta';

-- Índices con business_id al frente (los globales de tickets quedan cubiertos y se eliminan)
drop index public.idx_tickets_created_at;
drop index public.idx_tickets_status_created_at;
drop index public.idx_tickets_cashier_id_created_at;
create index idx_tickets_business_created_at on public.tickets (business_id, created_at desc);
create index idx_tickets_business_status_created_at on public.tickets (business_id, status, created_at desc);
create index idx_tickets_business_cashier_created_at on public.tickets (business_id, cashier_id, created_at desc);
create index idx_cash_sessions_business_opened_at on public.cash_sessions (business_id, opened_at desc);
create index idx_cash_movements_business_session on public.cash_movements (business_id, session_id, created_at);
create index idx_menu_categories_business on public.menu_categories (business_id);
create index idx_menu_products_business on public.menu_products (business_id);
create index idx_menu_variants_business on public.menu_variants (business_id);
create index idx_modifier_groups_business on public.modifier_groups (business_id);
create index idx_modifiers_business on public.modifiers (business_id);
create index idx_product_modifier_groups_business on public.product_modifier_groups (business_id);
create index idx_ticket_items_business on public.ticket_items (business_id);
create index idx_ticket_item_modifiers_business on public.ticket_item_modifiers (business_id);

-- FKs compuestas en la cadena de menú (la escribe el cliente por RLS): una fila
-- no puede apuntar a un padre de otro negocio.
alter table public.menu_categories add constraint menu_categories_id_business_key unique (id, business_id);
alter table public.menu_products   add constraint menu_products_id_business_key   unique (id, business_id);
alter table public.modifier_groups add constraint modifier_groups_id_business_key unique (id, business_id);

alter table public.menu_products
  drop constraint menu_products_category_id_fkey,
  add constraint menu_products_category_fkey
    foreign key (category_id, business_id) references public.menu_categories (id, business_id) on delete restrict;
alter table public.menu_variants
  drop constraint menu_variants_product_id_fkey,
  add constraint menu_variants_product_fkey
    foreign key (product_id, business_id) references public.menu_products (id, business_id) on delete cascade;
alter table public.modifiers
  drop constraint modifiers_group_id_fkey,
  add constraint modifiers_group_fkey
    foreign key (group_id, business_id) references public.modifier_groups (id, business_id) on delete cascade;
alter table public.product_modifier_groups
  drop constraint product_modifier_groups_product_id_fkey,
  drop constraint product_modifier_groups_group_id_fkey,
  add constraint pmg_product_fkey
    foreign key (product_id, business_id) references public.menu_products (id, business_id) on delete cascade,
  add constraint pmg_group_fkey
    foreign key (group_id, business_id) references public.modifier_groups (id, business_id) on delete cascade;

-- ────────────────────────────────────────────────────────────
-- 6. RLS por negocio
-- ────────────────────────────────────────────────────────────

-- Menú (6 tablas): lectura miembros; escritura owner|admin; with check impide mover filas de negocio.
do $$
declare
  t text;
begin
  foreach t in array array[
    'menu_categories', 'menu_products', 'menu_variants',
    'modifier_groups', 'modifiers', 'product_modifier_groups'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (business_id = (select public.current_business_id()))',
      t || '_select_member', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (business_id = (select public.current_business_id()) and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_insert_admin', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (business_id = (select public.current_business_id()) and (select public.current_member_role()) in (''owner'',''admin'')) with check (business_id = (select public.current_business_id()) and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_update_admin', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (business_id = (select public.current_business_id()) and (select public.current_member_role()) in (''owner'',''admin''))',
      t || '_delete_admin', t);
  end loop;
end;
$$;

-- Ventas: solo SELECT (las escrituras van por RPC)
drop policy tickets_select_own_or_admin on public.tickets;
create policy tickets_select_member on public.tickets
for select to authenticated
using (
  business_id = (select public.current_business_id())
  and (cashier_id = (select auth.uid()) or (select public.current_member_role()) in ('owner', 'admin'))
);

drop policy ticket_items_select_own_or_admin on public.ticket_items;
create policy ticket_items_select_member on public.ticket_items
for select to authenticated
using (
  business_id = (select public.current_business_id())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_items.ticket_id
      and (t.cashier_id = (select auth.uid()) or (select public.current_member_role()) in ('owner', 'admin'))
  )
);

drop policy ticket_item_modifiers_select_own_or_admin on public.ticket_item_modifiers;
create policy ticket_item_modifiers_select_member on public.ticket_item_modifiers
for select to authenticated
using (
  business_id = (select public.current_business_id())
  and exists (
    select 1
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id
    where ti.id = ticket_item_modifiers.ticket_item_id
      and (t.cashier_id = (select auth.uid()) or (select public.current_member_role()) in ('owner', 'admin'))
  )
);

drop policy cash_sessions_select_authenticated on public.cash_sessions;
create policy cash_sessions_select_member on public.cash_sessions
for select to authenticated
using (business_id = (select public.current_business_id()));

drop policy cash_movements_select_authenticated on public.cash_movements;
create policy cash_movements_select_member on public.cash_movements
for select to authenticated
using (business_id = (select public.current_business_id()));

-- profiles: la propia + quienes tienen (o tuvieron) membresía en mi negocio activo
drop policy profiles_select_own_or_admin on public.profiles;
drop policy profiles_insert_admin on public.profiles;
drop policy profiles_delete_admin on public.profiles;
create policy profiles_select_self_or_comember on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.business_members m
    where m.user_id = profiles.id and m.business_id = (select public.current_business_id())
  )
);
-- (sin insert/update/delete para clientes: trigger + service role + set_active_business)

-- businesses: lectura si soy miembro; edición solo owner|admin y solo columnas de ajustes
alter table public.businesses enable row level security;
create policy businesses_select_member on public.businesses
for select to authenticated
using (exists (
  select 1 from public.business_members m
  where m.business_id = businesses.id and m.user_id = (select auth.uid()) and m.is_active
));
create policy businesses_update_admin on public.businesses
for update to authenticated
using (id = (select public.current_business_id()) and (select public.current_member_role()) in ('owner', 'admin'))
with check (id = (select public.current_business_id()) and (select public.current_member_role()) in ('owner', 'admin'));
revoke insert, update, delete on public.businesses from authenticated;
grant update (name, timezone, address, phone, receipt_header, receipt_footer) on public.businesses to authenticated;

-- business_members: lectura de las propias o del negocio activo; sin escritura de clientes
alter table public.business_members enable row level security;
create policy business_members_select on public.business_members
for select to authenticated
using (user_id = (select auth.uid()) or business_id = (select public.current_business_id()));
revoke insert, update, delete on public.business_members from authenticated;

-- business_counters: solo RPC
alter table public.business_counters enable row level security;
revoke all on public.business_counters from authenticated;

-- anon fuera de todo (las tablas nuevas y las creadas después del revoke de Fase 0)
revoke all on public.businesses, public.business_members, public.business_counters,
              public.cash_sessions, public.cash_movements from anon;

-- Ya sin políticas que dependan de ella:
drop function public.current_role();

-- ────────────────────────────────────────────────────────────
-- 7. RPCs v4 (mismas firmas → conservan grants)
-- ────────────────────────────────────────────────────────────

create or replace function public.create_ticket(
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null,
  p_cash_received numeric default null,
  p_discount jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_existing jsonb;
  v_session_id uuid;
  v_input_count int;
  v_valid_count int;
  v_bad int;
  v_subtotal numeric(10,2);
  v_discount numeric(10,2) := 0;
  v_discount_type text;
  v_discount_value numeric;
  v_discount_reason text;
  v_total numeric(10,2);
  v_cash_received numeric(10,2);
  v_change_due numeric(10,2);
  v_ticket_id uuid;
  v_folio bigint;
  v_item_id uuid;
  v_qty int;
  v_unit numeric(10,2);
  r record;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.is_template then
    raise exception 'Este negocio es una plantilla y no admite ventas.';
  end if;

  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  -- Idempotencia por negocio
  select jsonb_build_object(
    'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
    'total', t.total, 'cash_received', t.cash_received, 'change_due', t.change_due, 'duplicate', true
  )
  into v_existing
  from public.tickets t
  where t.business_id = v_biz and t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Caja abierta DEL negocio
  select id into v_session_id from public.cash_sessions where business_id = v_biz and status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja antes de cobrar.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket debe incluir al menos un artículo.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados artículos en el ticket (máximo 50).';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e(elem)
    where coalesce(elem->>'quantity', '') !~ '^[0-9]+$'
       or (elem->>'quantity')::int < 1
       or (elem->>'quantity')::int > 99
  ) then
    raise exception 'Cantidad inválida en un artículo (debe ser un entero de 1 a 99).';
  end if;

  -- Toda variante debe existir, estar activa y pertenecer al negocio (y su producto también).
  select count(*) into v_input_count from jsonb_array_elements(p_items);

  select count(*) into v_valid_count
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v
    on v.id = (elem->>'variant_id')::uuid and v.is_active and v.business_id = v_biz
  join public.menu_products p
    on p.id = v.product_id and p.is_active and p.business_id = v_biz;

  if v_valid_count <> v_input_count then
    raise exception 'Uno o más artículos no existen o están inactivos.';
  end if;

  -- Modificadores: existen, activos, en grupo activo ligado al producto, del mismo negocio.
  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
  ) as sm(mid)
  left join public.modifiers m on m.id = sm.mid::uuid and m.is_active and m.business_id = v_biz
  left join public.modifier_groups g on g.id = m.group_id and g.is_active and g.business_id = v_biz
  left join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  left join public.product_modifier_groups pmg
    on pmg.group_id = g.id and pmg.product_id = v.product_id and pmg.business_id = v_biz
  where m.id is null or g.id is null or pmg.product_id is null;
  if v_bad > 0 then
    raise exception 'Uno o más modificadores no existen o no aplican al producto.';
  end if;

  select count(*) into v_bad
  from (
    select idx, sm.mid
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    group by idx, sm.mid
    having count(*) > 1
  ) d;
  if v_bad > 0 then
    raise exception 'Modificador repetido en un artículo.';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  join public.product_modifier_groups pmg on pmg.product_id = v.product_id and pmg.business_id = v_biz
  join public.modifier_groups g on g.id = pmg.group_id and g.is_active and g.business_id = v_biz
  cross join lateral (
    select count(*) as cnt
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    where m.group_id = g.id
  ) c
  where c.cnt < greatest(g.min_select, case when g.is_required then 1 else 0 end)
     or (g.max_select is not null and c.cnt > g.max_select);
  if v_bad > 0 then
    raise exception 'Faltan o sobran opciones en un grupo de modificadores.';
  end if;

  -- Subtotal con precios del servidor (variante + modificadores del negocio)
  select round(sum(round(v.price + coalesce(md.delta, 0), 2) * (elem->>'quantity')::int), 2)
  into v_subtotal
  from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid and v.business_id = v_biz
  left join lateral (
    select sum(m.price_delta) as delta
    from jsonb_array_elements_text(
      case when jsonb_typeof(elem->'modifiers') = 'array' then elem->'modifiers' else '[]'::jsonb end
    ) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
  ) md on true;

  -- Descuento por ticket
  if p_discount is not null and jsonb_typeof(p_discount) = 'object' then
    v_discount_type := p_discount->>'type';
    v_discount_reason := nullif(trim(coalesce(p_discount->>'reason', '')), '');
    begin
      v_discount_value := (p_discount->>'value')::numeric;
    exception when others then
      raise exception 'Monto de descuento inválido.';
    end;

    if v_discount_type not in ('percent', 'amount') then
      raise exception 'Tipo de descuento inválido.';
    end if;
    if v_discount_value is null or v_discount_value <= 0 then
      raise exception 'El descuento debe ser mayor a 0.';
    end if;
    if v_discount_reason is null then
      raise exception 'Indica el motivo del descuento.';
    end if;
    if length(v_discount_reason) > 200 then
      raise exception 'El motivo del descuento es demasiado largo (máximo 200 caracteres).';
    end if;

    if v_discount_type = 'percent' then
      if v_discount_value > 100 then
        raise exception 'El porcentaje de descuento no puede ser mayor a 100.';
      end if;
      v_discount := round(v_subtotal * v_discount_value / 100, 2);
    else
      v_discount := round(v_discount_value, 2);
    end if;

    if v_discount > v_subtotal then
      raise exception 'El descuento (%) no puede ser mayor que el subtotal (%).', v_discount, v_subtotal;
    end if;
    if v_discount = 0 then
      v_discount_reason := null;
    end if;
  end if;

  v_total := v_subtotal - v_discount;

  -- Efectivo recibido / cambio (sobre el total con descuento)
  if p_payment_method = 'efectivo' and p_cash_received is not null then
    v_cash_received := round(p_cash_received, 2);
    if v_cash_received < v_total then
      raise exception 'El efectivo recibido (%) es menor que el total (%).', v_cash_received, v_total;
    end if;
    v_change_due := round(v_cash_received - v_total, 2);
  end if;

  -- Folio por negocio (bloquea la fila del contador hasta el commit; va después de validar todo)
  update public.business_counters
  set next_folio = next_folio + 1
  where business_id = v_biz
  returning next_folio - 1 into v_folio;
  if v_folio is null then
    raise exception 'Falta el contador de folios del negocio.';
  end if;

  insert into public.tickets
    (business_id, folio, cashier_id, session_id, payment_method, subtotal, discount_total, discount_reason, total,
     notes, client_ref, cash_received, change_due)
  values (
    v_biz, v_folio, v_ctx.user_id, v_session_id, p_payment_method, v_subtotal, v_discount, v_discount_reason, v_total,
    nullif(trim(coalesce(p_notes, '')), ''), p_client_ref, v_cash_received, v_change_due
  )
  returning id into v_ticket_id;

  for r in
    select
      e.elem,
      e.idx,
      v.id as variant_id,
      v.price,
      v.name as variant_name,
      v.size_label,
      p.id as product_id,
      p.name as product_name,
      case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end as mods,
      coalesce((
        select sum(m.price_delta)
        from jsonb_array_elements_text(
          case when jsonb_typeof(e.elem->'modifiers') = 'array' then e.elem->'modifiers' else '[]'::jsonb end
        ) as sm(mid)
        join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
      ), 0) as delta
    from jsonb_array_elements(p_items) with ordinality as e(elem, idx)
    join public.menu_variants v on v.id = (e.elem->>'variant_id')::uuid and v.business_id = v_biz
    join public.menu_products p on p.id = v.product_id and p.business_id = v_biz
    order by e.idx
  loop
    v_qty := (r.elem->>'quantity')::int;
    v_unit := round(r.price + r.delta, 2);

    insert into public.ticket_items
      (business_id, ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes,
       product_name, variant_name, size_label)
    values (
      v_biz, v_ticket_id, r.product_id, r.variant_id, v_qty, v_unit, round(v_unit * v_qty, 2),
      nullif(trim(coalesce(r.elem->>'notes', '')), ''),
      r.product_name, r.variant_name, r.size_label
    )
    returning id into v_item_id;

    insert into public.ticket_item_modifiers (business_id, ticket_item_id, modifier_id, modifier_name, modifier_price)
    select v_biz, v_item_id, m.id, m.name, m.price_delta
    from jsonb_array_elements_text(r.mods) as sm(mid)
    join public.modifiers m on m.id = sm.mid::uuid and m.business_id = v_biz
    order by m.sort_order, m.name;
  end loop;

  return jsonb_build_object(
    'ticket_id', v_ticket_id,
    'folio', v_folio,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'total', v_total,
    'cash_received', v_cash_received,
    'change_due', v_change_due
  );

exception
  when unique_violation then
    -- Carrera con el mismo client_ref del mismo negocio: gana el primero
    -- (la subtransacción revierte también el incremento del contador).
    select jsonb_build_object(
      'ticket_id', t.id, 'folio', t.folio, 'subtotal', t.subtotal, 'discount_total', t.discount_total,
      'total', t.total, 'cash_received', t.cash_received, 'change_due', t.change_due, 'duplicate', true
    )
    into v_existing
    from public.tickets t
    where t.business_id = v_biz and t.client_ref = p_client_ref;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

create or replace function public.open_cash_session(
  p_opening_float numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_row public.cash_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.is_template then
    raise exception 'Este negocio es una plantilla y no admite ventas.';
  end if;
  if p_opening_float is null or p_opening_float < 0 then
    raise exception 'El fondo inicial debe ser un monto mayor o igual a 0.';
  end if;
  if exists (select 1 from public.cash_sessions where business_id = v_biz and status = 'abierta') then
    raise exception 'Ya hay una caja abierta. Ciérrala antes de abrir otra.';
  end if;

  insert into public.cash_sessions (business_id, opened_by, opening_float, opening_notes)
  values (v_biz, v_ctx.user_id, round(p_opening_float, 2), nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v_row;

  return jsonb_build_object(
    'session_id', v_row.id,
    'opened_at', v_row.opened_at,
    'opening_float', v_row.opening_float
  );
exception
  when unique_violation then
    raise exception 'Ya hay una caja abierta. Ciérrala antes de abrir otra.';
end;
$$;

create or replace function public.close_cash_session(
  p_counted_cash numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_session public.cash_sessions;
  v_cash_sales numeric(10,2);
  v_in numeric(10,2);
  v_out numeric(10,2);
  v_expected numeric(10,2);
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'El efectivo contado debe ser un monto mayor o igual a 0.';
  end if;

  select * into v_session from public.cash_sessions
  where business_id = v_biz and status = 'abierta' for update;
  if not found then
    raise exception 'No hay una caja abierta.';
  end if;

  select coalesce(sum(total), 0) into v_cash_sales
  from public.tickets
  where session_id = v_session.id and status = 'completado' and payment_method = 'efectivo';

  select
    coalesce(sum(amount) filter (where kind = 'entrada'), 0),
    coalesce(sum(amount) filter (where kind = 'salida'), 0)
  into v_in, v_out
  from public.cash_movements
  where session_id = v_session.id;

  v_expected := round(v_session.opening_float + v_cash_sales + v_in - v_out, 2);

  update public.cash_sessions
  set status = 'cerrada',
      closed_by = v_ctx.user_id,
      closed_at = now(),
      expected_cash = v_expected,
      counted_cash = round(p_counted_cash, 2),
      difference = round(p_counted_cash - v_expected, 2),
      closing_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = v_session.id;

  return public.cash_session_summary(v_session.id);
end;
$$;

create or replace function public.cash_session_summary(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'opened_at', s.opened_at,
    'closed_at', s.closed_at,
    'opened_by', coalesce(po.full_name, mo.username, ''),
    'closed_by', coalesce(pc.full_name, mc.username),
    'opening_float', s.opening_float,
    'opening_notes', s.opening_notes,
    'closing_notes', s.closing_notes,
    'expected_cash', s.expected_cash,
    'counted_cash', s.counted_cash,
    'difference', s.difference,
    'tickets_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'revenue', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'discount_total', (select coalesce(sum(t.discount_total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado'),
    'cash_sales', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'completado' and t.payment_method = 'efectivo'),
    'cancelled_count', (select count(*) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'cancelled_amount', (select coalesce(sum(t.total), 0) from public.tickets t where t.session_id = s.id and t.status = 'cancelado'),
    'movements_in', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'entrada'),
    'movements_out', (select coalesce(sum(m.amount), 0) from public.cash_movements m where m.session_id = s.id and m.kind = 'salida'),
    'movements', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'amount', m.amount, 'reason', m.reason,
          'created_at', m.created_at,
          'created_by', coalesce(pm.full_name, mm.username, '')
        ) order by m.created_at),
        '[]'::jsonb
      )
      from public.cash_movements m
      left join public.profiles pm on pm.id = m.created_by
      left join public.business_members mm on mm.user_id = m.created_by and mm.business_id = s.business_id
      where m.session_id = s.id
    ),
    'by_method', (
      select coalesce(
        jsonb_agg(jsonb_build_object('method', m.method, 'tickets', m.tickets, 'revenue', m.revenue) order by m.method),
        '[]'::jsonb
      )
      from (
        select t.payment_method::text as method, count(*) as tickets, sum(t.total) as revenue
        from public.tickets t
        where t.session_id = s.id and t.status = 'completado'
        group by t.payment_method
      ) m
    )
  )
  from public.cash_sessions s
  left join public.profiles po on po.id = s.opened_by
  left join public.business_members mo on mo.user_id = s.opened_by and mo.business_id = s.business_id
  left join public.profiles pc on pc.id = s.closed_by
  left join public.business_members mc on mc.user_id = s.closed_by and mc.business_id = s.business_id
  where s.id = p_session_id
    and s.business_id = (select public.current_business_id())
$$;

create or replace function public.cancel_ticket(
  p_ticket_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_ticket public.tickets;
  v_session_status text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_reason is null then
    raise exception 'Indica el motivo de la cancelación.';
  end if;
  if length(v_reason) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select * into v_ticket from public.tickets
  where id = p_ticket_id and business_id = v_biz for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  if v_ticket.status = 'cancelado' then
    raise exception 'Este ticket ya estaba cancelado.';
  end if;

  if v_ctx.member_role not in ('owner', 'admin') then
    if v_ticket.cashier_id <> v_ctx.user_id then
      raise exception 'Solo puedes cancelar tus propias ventas.';
    end if;
    select status into v_session_status from public.cash_sessions where id = v_ticket.session_id;
    if v_session_status is distinct from 'abierta' then
      raise exception 'La caja de esta venta ya se cerró; pide a un administrador que la cancele.';
    end if;
  end if;

  update public.tickets
  set status = 'cancelado',
      cancelled_at = now(),
      cancelled_by = v_ctx.user_id,
      cancel_reason = v_reason
  where id = v_ticket.id;

  return jsonb_build_object('ticket_id', v_ticket.id, 'folio', v_ticket.folio, 'status', 'cancelado');
end;
$$;

create or replace function public.add_cash_movement(
  p_kind text,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_session_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_row public.cash_movements;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  v_biz := v_ctx.business_id;
  if v_ctx.is_template then
    raise exception 'Este negocio es una plantilla y no admite ventas.';
  end if;
  if p_kind not in ('entrada', 'salida') then
    raise exception 'Tipo de movimiento inválido.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0.';
  end if;
  if v_reason is null or length(v_reason) < 2 then
    raise exception 'Indica el motivo del movimiento.';
  end if;
  if length(v_reason) > 200 then
    raise exception 'El motivo es demasiado largo (máximo 200 caracteres).';
  end if;

  select id into v_session_id from public.cash_sessions where business_id = v_biz and status = 'abierta';
  if v_session_id is null then
    raise exception 'La caja está cerrada. Abre la caja para registrar movimientos.';
  end if;

  insert into public.cash_movements (business_id, session_id, kind, amount, reason, created_by)
  values (v_biz, v_session_id, p_kind, round(p_amount, 2), v_reason, v_ctx.user_id)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'kind', v_row.kind,
    'amount', v_row.amount,
    'reason', v_row.reason,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.sales_report(
  p_from date,
  p_to date,
  p_cashier uuid default null,
  p_method public.payment_method default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_biz uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede ver reportes.';
  end if;
  v_biz := v_ctx.business_id;
  v_tz := v_ctx.timezone;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'El rango máximo es de un año.';
  end if;

  -- Límites UTC del rango de días en la zona del negocio (usa el índice de created_at).
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  with base as (
    select t.id, t.cashier_id, t.payment_method, t.total, t.discount_total, t.status, t.created_at
    from public.tickets t
    where t.business_id = v_biz
      and t.created_at >= v_start
      and t.created_at < v_end
      and (p_cashier is null or t.cashier_id = p_cashier)
      and (p_method is null or t.payment_method = p_method)
  ),
  ok as (
    select * from base where status = 'completado'
  ),
  ok_items as (
    select ti.product_name, ti.variant_name, ti.size_label, ti.quantity, ti.line_total
    from public.ticket_items ti
    join ok on ok.id = ti.ticket_id
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'timezone', v_tz,
    'totals', (
      select jsonb_build_object(
        'tickets', (select count(*) from ok),
        'revenue', (select coalesce(sum(total), 0) from ok),
        'avg_ticket', (select round(coalesce(avg(total), 0), 2) from ok),
        'discount_total', (select coalesce(sum(discount_total), 0) from ok),
        'items_sold', (select coalesce(sum(quantity), 0) from ok_items),
        'cancelled_count', (select count(*) from base where status = 'cancelado'),
        'cancelled_amount', (select coalesce(sum(total), 0) from base where status = 'cancelado')
      )
    ),
    'by_method', (
      select coalesce(jsonb_agg(jsonb_build_object('method', m.method, 'tickets', m.tickets, 'revenue', m.revenue) order by m.method), '[]'::jsonb)
      from (
        select payment_method::text as method, count(*) as tickets, sum(total) as revenue
        from ok group by payment_method
      ) m
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'tickets', coalesce(x.tickets, 0), 'revenue', coalesce(x.revenue, 0)) order by d.day), '[]'::jsonb)
      from generate_series(p_from, p_to, interval '1 day') as g(ts)
      cross join lateral (select g.ts::date as day) d
      left join (
        select public.business_day(created_at, v_tz) as day, count(*) as tickets, sum(total) as revenue
        from ok group by 1
      ) x on x.day = d.day
    ),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'tickets', h.tickets, 'revenue', h.revenue) order by h.hour), '[]'::jsonb)
      from (
        select extract(hour from created_at at time zone v_tz)::int as hour, count(*) as tickets, sum(total) as revenue
        from ok group by 1
      ) h
    ),
    'by_cashier', (
      select coalesce(jsonb_agg(jsonb_build_object('cashier_id', c.cashier_id, 'name', c.name, 'tickets', c.tickets, 'revenue', c.revenue) order by c.revenue desc), '[]'::jsonb)
      from (
        select ok.cashier_id,
               coalesce(nullif(p.full_name, ''), m.username, 'Desconocido') as name,
               count(*) as tickets, sum(ok.total) as revenue
        from ok
        left join public.profiles p on p.id = ok.cashier_id
        left join public.business_members m on m.user_id = ok.cashier_id and m.business_id = v_biz
        group by ok.cashier_id, p.full_name, m.username
      ) c
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_name', t.product_name, 'variant_name', t.variant_name, 'size_label', t.size_label, 'qty', t.qty, 'revenue', t.revenue) order by t.qty desc, t.revenue desc), '[]'::jsonb)
      from (
        select product_name, variant_name, size_label, sum(quantity) as qty, sum(line_total) as revenue
        from ok_items
        group by product_name, variant_name, size_label
        order by qty desc, revenue desc
        limit 10
      ) t
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 8. Grants
-- ────────────────────────────────────────────────────────────

revoke execute on function public.member_ctx() from public, anon;
grant execute on function public.member_ctx() to authenticated;
revoke execute on function public.current_business_id() from public, anon;
grant execute on function public.current_business_id() to authenticated;
revoke execute on function public.current_member_role() from public, anon;
grant execute on function public.current_member_role() to authenticated;
revoke execute on function public.my_context() from public, anon;
grant execute on function public.my_context() to authenticated;
revoke execute on function public.set_active_business(uuid) from public, anon;
grant execute on function public.set_active_business(uuid) to authenticated;
revoke execute on function public.business_day(timestamptz, text) from public, anon;
grant execute on function public.business_day(timestamptz, text) to authenticated;

revoke execute on function public.derive_uuid(uuid, text) from public, anon, authenticated;
revoke execute on function public.clone_menu(uuid, uuid) from public, anon, authenticated;
grant execute on function public.clone_menu(uuid, uuid) to service_role;
revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

revoke execute on function public.init_business_counter() from public, anon, authenticated;
revoke execute on function public.validate_business_settings() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
