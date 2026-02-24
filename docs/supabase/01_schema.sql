-- Extensions
create extension if not exists "pgcrypto";

-- Roles
create type public.app_role as enum ('admin', 'cajero');
create type public.payment_method as enum ('efectivo', 'transferencia', 'tarjeta_clip');

-- Profiles linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  username text unique,
  role public.app_role not null default 'cajero',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Menu
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories (id) on delete restrict,
  name text not null,
  description text,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.menu_products (id) on delete cascade,
  name text not null,
  size_label text,
  price numeric(10,2) not null check (price >= 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  min_select int not null default 0,
  max_select int,
  is_required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null,
  price_delta numeric(10,2) not null default 0,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_modifier_groups (
  product_id uuid not null references public.menu_products (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  primary key (product_id, group_id)
);

-- Sales
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references public.profiles (id) on delete restrict,
  payment_method public.payment_method not null,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_total numeric(10,2) not null default 0,
  tax_total numeric(10,2) not null default 0,
  total numeric(10,2) not null check (total >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  product_id uuid references public.menu_products (id) on delete set null,
  variant_id uuid references public.menu_variants (id) on delete set null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  notes text
);

create table if not exists public.ticket_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  ticket_item_id uuid not null references public.ticket_items (id) on delete cascade,
  modifier_id uuid references public.modifiers (id) on delete set null,
  modifier_name text not null,
  modifier_price numeric(10,2) not null default 0
);

-- Indexes
create index if not exists idx_menu_products_category_id on public.menu_products (category_id);
create index if not exists idx_menu_variants_product_id on public.menu_variants (product_id);
create index if not exists idx_modifiers_group_id on public.modifiers (group_id);
create index if not exists idx_tickets_cashier_id_created_at on public.tickets (cashier_id, created_at desc);
create index if not exists idx_tickets_created_at on public.tickets (created_at desc);
create index if not exists idx_ticket_items_ticket_id on public.ticket_items (ticket_id);

-- Updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_menu_categories_updated_at before update on public.menu_categories for each row execute function public.set_updated_at();
create trigger set_menu_products_updated_at before update on public.menu_products for each row execute function public.set_updated_at();
create trigger set_menu_variants_updated_at before update on public.menu_variants for each row execute function public.set_updated_at();
create trigger set_modifier_groups_updated_at before update on public.modifier_groups for each row execute function public.set_updated_at();
create trigger set_modifiers_updated_at before update on public.modifiers for each row execute function public.set_updated_at();

-- Auto profile on sign up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1),
    'cajero'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
