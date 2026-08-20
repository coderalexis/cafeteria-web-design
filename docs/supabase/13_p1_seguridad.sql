-- ============================================================
-- 13 — P1 (producción sólida): ajustes por negocio (settings JSON),
-- auditoría de cambios y PIN de caja para el bloqueo por inactividad.
-- ============================================================

-- ── Ajustes por negocio ─────────────────────────────────────
-- JSON validado por la app (zod). Primer uso: candado de inactividad del POS.
alter table public.businesses add column settings jsonb not null default '{}'::jsonb;
grant update (settings) on public.businesses to authenticated; -- RLS ya limita a owner|admin del negocio activo

-- ── Auditoría ───────────────────────────────────────────────
create table public.audit_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',   -- snapshot: conserva el historial si el perfil cambia
  action text not null,                  -- p. ej. 'producto.creado', 'precio.cambiado'
  entity text,                           -- nombre legible del objeto ('Latte', 'María')
  details jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_events_business_created on public.audit_events (business_id, created_at desc);
alter table public.audit_events enable row level security;
create policy audit_events_select_admin on public.audit_events
for select to authenticated
using (
  business_id = (select public.current_business_id())
  and (select public.current_member_role()) in ('owner', 'admin')
);
revoke all on public.audit_events from anon;
revoke insert, update, delete on public.audit_events from authenticated;

-- Registrar un evento desde la sesión (solo owner|admin del negocio activo)
create or replace function public.log_audit(p_action text, p_entity text default null, p_details jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede registrar actividad.';
  end if;
  if p_action is null or length(trim(p_action)) < 1 or length(trim(p_action)) > 60 then
    raise exception 'Acción inválida.';
  end if;

  select coalesce(nullif(p.full_name, ''), m.username, '')
  into v_name
  from public.profiles p
  left join public.business_members m on m.user_id = p.id and m.business_id = v_ctx.business_id
  where p.id = v_ctx.user_id;

  insert into public.audit_events (business_id, actor_id, actor_name, action, entity, details)
  values (
    v_ctx.business_id, v_ctx.user_id, coalesce(v_name, ''), trim(p_action),
    nullif(left(trim(coalesce(p_entity, '')), 120), ''), p_details
  );
end;
$$;
revoke execute on function public.log_audit(text, text, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, jsonb) to authenticated;

-- ── PIN de caja (candado de inactividad) ────────────────────
-- Tabla aparte SIN políticas de lectura: ni los hashes bcrypt se exponen a
-- los clientes; todo pasa por los RPCs.
create extension if not exists pgcrypto with schema extensions;

create table public.member_pins (
  business_id uuid not null,
  user_id uuid not null,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, user_id) references public.business_members (business_id, user_id) on delete cascade
);
alter table public.member_pins enable row level security;
revoke all on public.member_pins from anon, authenticated;

-- Fijar mi PIN (cualquier miembro activo del negocio activo; 4 a 6 dígitos)
create or replace function public.set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener de 4 a 6 dígitos.';
  end if;

  insert into public.member_pins (business_id, user_id, pin_hash)
  values (v_ctx.business_id, v_ctx.user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (business_id, user_id)
  do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;
revoke execute on function public.set_my_pin(text) from public, anon;
grant execute on function public.set_my_pin(text) to authenticated;

-- ¿Ya tengo PIN en el negocio activo?
create or replace function public.my_pin_set()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_pins mp
    join public.member_ctx() c on c.business_id = mp.business_id and c.user_id = mp.user_id
  )
$$;
revoke execute on function public.my_pin_set() from public, anon;
grant execute on function public.my_pin_set() to authenticated;

-- Verificar mi PIN (desbloqueo del POS); pausa breve si falla (fuerza bruta)
create or replace function public.verify_my_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_hash text;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    perform pg_sleep(0.4);
    return false;
  end if;

  select pin_hash into v_hash from public.member_pins
  where business_id = v_ctx.business_id and user_id = v_ctx.user_id;
  if v_hash is null then
    perform pg_sleep(0.4);
    return false;
  end if;

  v_ok := v_hash = extensions.crypt(p_pin, v_hash);
  if not v_ok then
    perform pg_sleep(0.4);
  end if;
  return v_ok;
end;
$$;
revoke execute on function public.verify_my_pin(text) from public, anon;
grant execute on function public.verify_my_pin(text) to authenticated;

-- Fijar o quitar el PIN de un miembro del equipo (owner|admin; p_pin null = quitar)
create or replace function public.admin_set_member_pin(p_user_id uuid, p_pin text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  if auth.uid() is null then
    raise exception 'Sesión inválida.';
  end if;
  select * into v_ctx from public.member_ctx();
  if not found then
    raise exception 'No tienes un negocio activo (o está suspendido).';
  end if;
  if v_ctx.member_role not in ('owner', 'admin') then
    raise exception 'Solo un administrador puede cambiar el PIN de otro miembro.';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = v_ctx.business_id and user_id = p_user_id
  ) then
    raise exception 'Esa persona no pertenece a esta cafetería.';
  end if;

  if p_pin is null then
    delete from public.member_pins where business_id = v_ctx.business_id and user_id = p_user_id;
    return;
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener de 4 a 6 dígitos.';
  end if;

  insert into public.member_pins (business_id, user_id, pin_hash)
  values (v_ctx.business_id, p_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (business_id, user_id)
  do update set pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;
revoke execute on function public.admin_set_member_pin(uuid, text) from public, anon;
grant execute on function public.admin_set_member_pin(uuid, text) to authenticated;

-- ── my_context ahora incluye settings del negocio ───────────
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
        'receipt_header', b.receipt_header, 'receipt_footer', b.receipt_footer,
        'settings', b.settings)
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
