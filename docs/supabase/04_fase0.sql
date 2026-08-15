-- ============================================================
-- Fase 0 — Cimientos: datos de venta confiables
-- Aplicar después de 01_schema.sql, 02_rls.sql y 03_seed.sql.
-- Requiere tickets/ticket_items vacíos (pre-producción).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Columnas nuevas
-- ────────────────────────────────────────────────────────────

-- folio: número humano consecutivo para recibos y cortes.
-- client_ref: clave de idempotencia generada por el POS; un
-- reintento tras timeout no puede duplicar la venta.
alter table public.tickets
  add column folio bigint generated always as identity,
  add column client_ref uuid not null;

alter table public.tickets
  add constraint tickets_folio_key unique (folio),
  add constraint tickets_client_ref_key unique (client_ref);

-- Snapshots: la línea de venta conserva su descripción aunque el
-- producto/variante cambie de nombre o se elimine después.
alter table public.ticket_items
  add column product_name text not null,
  add column variant_name text not null,
  add column size_label text;

-- Índices FK faltantes (advisor: unindexed_foreign_keys)
create index idx_ticket_items_variant_id on public.ticket_items (variant_id);
create index idx_ticket_items_product_id on public.ticket_items (product_id);
create index idx_ticket_item_modifiers_ticket_item_id on public.ticket_item_modifiers (ticket_item_id);
create index idx_ticket_item_modifiers_modifier_id on public.ticket_item_modifiers (modifier_id);
create index idx_product_modifier_groups_group_id on public.product_modifier_groups (group_id);

-- ────────────────────────────────────────────────────────────
-- 2. Día de operación (America/Mexico_City)
-- ────────────────────────────────────────────────────────────

create or replace function public.business_day(ts timestamptz)
returns date
language sql
stable
set search_path = public
as $$
  select (ts at time zone 'America/Mexico_City')::date
$$;

revoke execute on function public.business_day(timestamptz) from public, anon;
grant execute on function public.business_day(timestamptz) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. RPC atómico de venta — precios 100% del servidor
-- ────────────────────────────────────────────────────────────

create or replace function public.create_ticket(
  p_client_ref uuid,
  p_payment_method public.payment_method,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role public.app_role;
  v_existing jsonb;
  v_input_count int;
  v_valid_count int;
  v_subtotal numeric(10,2);
  v_ticket_id uuid;
  v_folio bigint;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sesión inválida.';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Perfil no encontrado.';
  end if;

  if p_client_ref is null then
    raise exception 'Falta la referencia del ticket (client_ref).';
  end if;

  -- Idempotencia: si este client_ref ya se registró, devolver el existente.
  select jsonb_build_object('ticket_id', t.id, 'folio', t.folio, 'total', t.total, 'duplicate', true)
  into v_existing
  from public.tickets t
  where t.client_ref = p_client_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ticket debe incluir al menos un artículo.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Demasiados artículos en el ticket (máximo 50).';
  end if;

  -- Cantidades: enteros 1..99.
  if exists (
    select 1
    from jsonb_array_elements(p_items) as e(elem)
    where coalesce(elem->>'quantity', '') !~ '^[0-9]+$'
       or (elem->>'quantity')::int < 1
       or (elem->>'quantity')::int > 99
  ) then
    raise exception 'Cantidad inválida en un artículo (debe ser un entero de 1 a 99).';
  end if;

  -- Toda variante debe existir y estar activa (y su producto también).
  select count(*) into v_input_count from jsonb_array_elements(p_items);

  select count(*) into v_valid_count
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v
    on v.id = (elem->>'variant_id')::uuid and v.is_active
  join public.menu_products p
    on p.id = v.product_id and p.is_active;

  if v_valid_count <> v_input_count then
    raise exception 'Uno o más artículos no existen o están inactivos.';
  end if;

  -- Subtotal con precios del servidor; lo que mande el cliente se ignora.
  select round(sum(v.price * (elem->>'quantity')::int), 2) into v_subtotal
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid;

  insert into public.tickets (cashier_id, payment_method, subtotal, total, notes, client_ref)
  values (
    v_uid,
    p_payment_method,
    v_subtotal,
    v_subtotal,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_client_ref
  )
  returning id, folio into v_ticket_id, v_folio;

  insert into public.ticket_items
    (ticket_id, product_id, variant_id, quantity, unit_price, line_total, notes, product_name, variant_name, size_label)
  select
    v_ticket_id,
    p.id,
    v.id,
    (elem->>'quantity')::int,
    v.price,
    round(v.price * (elem->>'quantity')::int, 2),
    nullif(trim(coalesce(elem->>'notes', '')), ''),
    p.name,
    v.name,
    v.size_label
  from jsonb_array_elements(p_items) as e(elem)
  join public.menu_variants v on v.id = (elem->>'variant_id')::uuid
  join public.menu_products p on p.id = v.product_id;

  return jsonb_build_object('ticket_id', v_ticket_id, 'folio', v_folio, 'total', v_subtotal);

exception
  when unique_violation then
    -- Carrera entre dos requests con el mismo client_ref: gana el primero.
    select jsonb_build_object('ticket_id', t.id, 'folio', t.folio, 'total', t.total, 'duplicate', true)
    into v_existing
    from public.tickets t
    where t.client_ref = p_client_ref;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

revoke execute on function public.create_ticket(uuid, public.payment_method, jsonb, text) from public, anon;
grant execute on function public.create_ticket(uuid, public.payment_method, jsonb, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. Seguridad
-- ────────────────────────────────────────────────────────────

-- 4a. Un cajero podía auto-promoverse a admin (la política UPDATE de
-- profiles no restringía columnas). Toda edición de perfiles pasa por
-- server actions con service-role, así que el UPDATE vía RLS se elimina.
drop policy "profiles_update_own_or_admin" on public.profiles;

-- 4b. Nada en public es accesible sin sesión (advisor: anon_table_exposed).
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Funciones: sin EXECUTE para anon; las de trigger tampoco para authenticated
-- (advisor: anon/authenticated_security_definer_function_executable).
revoke execute on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 4c. search_path fijo (advisor: function_search_path_mutable).
alter function public.set_updated_at() set search_path = public;

-- ────────────────────────────────────────────────────────────
-- 5. Políticas RLS recreadas: TO authenticated + (select ...)
--    (advisors: auth_rls_initplan, multiple_permissive_policies)
-- ────────────────────────────────────────────────────────────

-- Profiles
drop policy "profiles_select_own_or_admin" on public.profiles;
drop policy "profiles_insert_admin" on public.profiles;
drop policy "profiles_delete_admin" on public.profiles;

create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using ((select auth.uid()) = id or (select public.current_role()) = 'admin');

create policy "profiles_insert_admin" on public.profiles
for insert to authenticated
with check ((select public.current_role()) = 'admin');

create policy "profiles_delete_admin" on public.profiles
for delete to authenticated
using ((select public.current_role()) = 'admin');

-- Menú: lectura para authenticated; escritura solo admin, separada por
-- comando para no duplicar políticas permisivas de SELECT.
drop policy "menu_categories_select_authenticated" on public.menu_categories;
drop policy "menu_products_select_authenticated" on public.menu_products;
drop policy "menu_variants_select_authenticated" on public.menu_variants;
drop policy "modifier_groups_select_authenticated" on public.modifier_groups;
drop policy "modifiers_select_authenticated" on public.modifiers;
drop policy "product_modifier_groups_select_authenticated" on public.product_modifier_groups;
drop policy "menu_categories_admin_write" on public.menu_categories;
drop policy "menu_products_admin_write" on public.menu_products;
drop policy "menu_variants_admin_write" on public.menu_variants;
drop policy "modifier_groups_admin_write" on public.modifier_groups;
drop policy "modifiers_admin_write" on public.modifiers;
drop policy "product_modifier_groups_admin_write" on public.product_modifier_groups;

do $$
declare
  t text;
begin
  foreach t in array array[
    'menu_categories', 'menu_products', 'menu_variants',
    'modifier_groups', 'modifiers', 'product_modifier_groups'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_authenticated', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.current_role()) = ''admin'')',
      t || '_insert_admin', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.current_role()) = ''admin'') with check ((select public.current_role()) = ''admin'')',
      t || '_update_admin', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.current_role()) = ''admin'')',
      t || '_delete_admin', t);
  end loop;
end;
$$;

-- Tickets (sin política UPDATE: las ventas son inmutables por diseño)
drop policy "tickets_insert_cashier_or_admin" on public.tickets;
drop policy "tickets_select_own_or_admin" on public.tickets;
drop policy "tickets_delete_admin" on public.tickets;

create policy "tickets_insert_cashier_or_admin" on public.tickets
for insert to authenticated
with check (
  (select auth.uid()) = cashier_id
  and (select public.current_role()) in ('admin', 'cajero')
);

create policy "tickets_select_own_or_admin" on public.tickets
for select to authenticated
using (cashier_id = (select auth.uid()) or (select public.current_role()) = 'admin');

create policy "tickets_delete_admin" on public.tickets
for delete to authenticated
using ((select public.current_role()) = 'admin');

-- Ticket items
drop policy "ticket_items_insert_cashier_or_admin" on public.ticket_items;
drop policy "ticket_items_select_own_or_admin" on public.ticket_items;

create policy "ticket_items_insert_cashier_or_admin" on public.ticket_items
for insert to authenticated
with check (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_items.ticket_id
      and (t.cashier_id = (select auth.uid()) or (select public.current_role()) = 'admin')
  )
);

create policy "ticket_items_select_own_or_admin" on public.ticket_items
for select to authenticated
using (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_items.ticket_id
      and (t.cashier_id = (select auth.uid()) or (select public.current_role()) = 'admin')
  )
);

-- Ticket item modifiers
drop policy "ticket_item_modifiers_insert_cashier_or_admin" on public.ticket_item_modifiers;
drop policy "ticket_item_modifiers_select_own_or_admin" on public.ticket_item_modifiers;

create policy "ticket_item_modifiers_insert_cashier_or_admin" on public.ticket_item_modifiers
for insert to authenticated
with check (
  exists (
    select 1
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id
    where ti.id = ticket_item_modifiers.ticket_item_id
      and (t.cashier_id = (select auth.uid()) or (select public.current_role()) = 'admin')
  )
);

create policy "ticket_item_modifiers_select_own_or_admin" on public.ticket_item_modifiers
for select to authenticated
using (
  exists (
    select 1
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id
    where ti.id = ticket_item_modifiers.ticket_item_id
      and (t.cashier_id = (select auth.uid()) or (select public.current_role()) = 'admin')
  )
);
