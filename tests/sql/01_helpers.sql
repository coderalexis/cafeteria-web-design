-- 01_helpers.sql — ayudantes para las pruebas. Se aplica DESPUÉS de las
-- migraciones (necesita las tablas) y vive en el esquema `pruebas` para que
-- no se confunda con nada de producción.
--
-- Dos ideas que se repiten en toda prueba:
--   · pruebas.cafe(slug): una cafetería nueva con dueño, cajera, un menú
--     chico con costos, y la caja abierta. Devuelve los ids para armar
--     tickets sin adivinar nada.
--   · pruebas.como(usuario): impersonar a alguien como lo haría PostgREST —
--     rol `authenticated` y el `sub` en los claims—, para que RLS y los RPC
--     se comporten igual que en producción.

create schema pruebas;

create type pruebas.cafe_ids as (
  business_id uuid,
  owner_id uuid,
  cashier_id uuid,
  category_id uuid,
  variant_chico uuid,
  variant_grande uuid,
  precio_chico numeric,
  precio_grande numeric,
  modifier_group_id uuid,
  modifier_id uuid
);

create or replace function pruebas.como(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

create or replace function pruebas.como_postgres()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pruebas.cafe(p_slug text, p_tz text default 'America/Mexico_City')
returns pruebas.cafe_ids language plpgsql as $$
declare
  r pruebas.cafe_ids;
  v_prod uuid;
begin
  perform pruebas.como_postgres();

  insert into public.businesses (name, slug, timezone)
  values (initcap(replace(p_slug, '-', ' ')), p_slug, p_tz)
  returning id into r.business_id;

  -- El trigger handle_new_user crea el profile a partir de auth.users,
  -- exactamente como cuando alguien se registra.
  insert into auth.users (email, raw_user_meta_data)
  values (p_slug || '.dueno@pruebas.local', '{"full_name":"Dueño"}')
  returning id into r.owner_id;
  insert into auth.users (email, raw_user_meta_data)
  values (p_slug || '.cajera@pruebas.local', '{"full_name":"Cajera"}')
  returning id into r.cashier_id;

  insert into public.business_members (business_id, user_id, role, username)
  values (r.business_id, r.owner_id, 'owner', null),
         (r.business_id, r.cashier_id, 'cajero', 'cajera');
  update public.profiles set active_business_id = r.business_id
   where id in (r.owner_id, r.cashier_id);

  -- Menú mínimo con costos, para que margen y utilidad tengan con qué trabajar
  insert into public.menu_categories (business_id, name, slug, sort_order)
  values (r.business_id, 'Café', 'cafe', 1) returning id into r.category_id;
  insert into public.menu_products (business_id, category_id, name, sort_order)
  values (r.business_id, r.category_id, 'Latte', 1) returning id into v_prod;
  insert into public.menu_variants (business_id, product_id, name, size_label, price, cost, sort_order)
  values (r.business_id, v_prod, 'Chico', 'Chico', 40, 12, 1) returning id into r.variant_chico;
  insert into public.menu_variants (business_id, product_id, name, size_label, price, cost, sort_order)
  values (r.business_id, v_prod, 'Grande', 'Grande', 55, 16, 2) returning id into r.variant_grande;
  r.precio_chico := 40; r.precio_grande := 55;

  insert into public.modifier_groups (business_id, name, min_select, max_select, is_required, sort_order)
  values (r.business_id, 'Leche', 0, 1, false, 1) returning id into r.modifier_group_id;
  insert into public.modifiers (business_id, group_id, name, price_delta, sort_order)
  values (r.business_id, r.modifier_group_id, 'Leche de avena', 12, 1) returning id into r.modifier_id;
  insert into public.product_modifier_groups (business_id, product_id, group_id)
  values (r.business_id, v_prod, r.modifier_group_id);

  -- Caja abierta por la cajera, como empieza cualquier día
  perform pruebas.como(r.cashier_id);
  perform public.open_cash_session(500, 'Fondo de prueba');
  perform pruebas.como_postgres();

  return r;
end $$;

/** Un ticket de N latte chicos, cobrado por quien esté impersonado. */
create or replace function pruebas.items(p_variant uuid, p_qty int default 1, p_modifier uuid default null)
returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('variant_id', p_variant, 'quantity', p_qty)
    || case when p_modifier is null then '{}'::jsonb
            else jsonb_build_object('modifiers', jsonb_build_array(p_modifier)) end)
$$;

/** Falla con un mensaje claro si la condición no se cumple. */
create or replace function pruebas.espera(p_ok boolean, p_mensaje text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALLA: %', p_mensaje;
  end if;
end $$;
