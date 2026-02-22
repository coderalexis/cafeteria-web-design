-- Enable RLS
alter table public.profiles enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_products enable row level security;
alter table public.menu_variants enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;
alter table public.ticket_item_modifiers enable row level security;

create or replace function public.current_role()
returns public.app_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Profiles
create policy "profiles_select_own_or_admin" on public.profiles
for select using (auth.uid() = id or public.current_role() = 'admin');

create policy "profiles_update_own_or_admin" on public.profiles
for update using (auth.uid() = id or public.current_role() = 'admin')
with check (auth.uid() = id or public.current_role() = 'admin');

-- Menu readable by authenticated users
create policy "menu_categories_select_authenticated" on public.menu_categories
for select using (auth.role() = 'authenticated');
create policy "menu_products_select_authenticated" on public.menu_products
for select using (auth.role() = 'authenticated');
create policy "menu_variants_select_authenticated" on public.menu_variants
for select using (auth.role() = 'authenticated');
create policy "modifier_groups_select_authenticated" on public.modifier_groups
for select using (auth.role() = 'authenticated');
create policy "modifiers_select_authenticated" on public.modifiers
for select using (auth.role() = 'authenticated');
create policy "product_modifier_groups_select_authenticated" on public.product_modifier_groups
for select using (auth.role() = 'authenticated');

-- Menu writable only by admin
create policy "menu_categories_admin_write" on public.menu_categories
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "menu_products_admin_write" on public.menu_products
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "menu_variants_admin_write" on public.menu_variants
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "modifier_groups_admin_write" on public.modifier_groups
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "modifiers_admin_write" on public.modifiers
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "product_modifier_groups_admin_write" on public.product_modifier_groups
for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Tickets
create policy "tickets_insert_cashier_or_admin" on public.tickets
for insert with check (
  auth.uid() = cashier_id
  and public.current_role() in ('admin', 'cajero')
);

create policy "tickets_select_own_or_admin" on public.tickets
for select using (cashier_id = auth.uid() or public.current_role() = 'admin');

create policy "ticket_items_insert_cashier_or_admin" on public.ticket_items
for insert with check (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_items.ticket_id
      and (t.cashier_id = auth.uid() or public.current_role() = 'admin')
  )
);

create policy "ticket_items_select_own_or_admin" on public.ticket_items
for select using (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_items.ticket_id
      and (t.cashier_id = auth.uid() or public.current_role() = 'admin')
  )
);

create policy "ticket_item_modifiers_insert_cashier_or_admin" on public.ticket_item_modifiers
for insert with check (
  exists (
    select 1
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id
    where ti.id = ticket_item_modifiers.ticket_item_id
      and (t.cashier_id = auth.uid() or public.current_role() = 'admin')
  )
);

create policy "ticket_item_modifiers_select_own_or_admin" on public.ticket_item_modifiers
for select using (
  exists (
    select 1
    from public.ticket_items ti
    join public.tickets t on t.id = ti.ticket_id
    where ti.id = ticket_item_modifiers.ticket_item_id
      and (t.cashier_id = auth.uid() or public.current_role() = 'admin')
  )
);
