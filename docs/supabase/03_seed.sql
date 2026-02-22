-- Categories
insert into public.menu_categories (id, name, slug, sort_order)
values
  ('11111111-1111-1111-1111-111111111111', 'Con café', 'con-cafe', 1),
  ('22222222-2222-2222-2222-222222222222', 'A base de leche', 'a-base-de-leche', 2),
  ('33333333-3333-3333-3333-333333333333', 'Frappes', 'frappes', 3),
  ('44444444-4444-4444-4444-444444444444', 'Panadería', 'panaderia', 4)
on conflict (id) do nothing;

-- Products
insert into public.menu_products (id, category_id, name, description, sort_order)
values
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'Espresso', 'Café concentrado', 1),
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'Latte', 'Leche vaporizada + espresso', 2),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', 'Matcha Latte', 'Matcha con leche', 1),
  ('ccccccc1-cccc-cccc-cccc-ccccccccccc1', '33333333-3333-3333-3333-333333333333', 'Frappe Cappuccino', 'Frío y cremoso', 1),
  ('ddddddd1-dddd-dddd-dddd-ddddddddddd1', '44444444-4444-4444-4444-444444444444', 'Croissant de jamón', 'Pan horneado del día', 1)
on conflict (id) do nothing;

-- Variants
insert into public.menu_variants (id, product_id, name, size_label, price, sort_order)
values
  ('v1111111-1111-1111-1111-111111111111', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Chico', '1 oz', 20, 1),
  ('v1111112-1111-1111-1111-111111111112', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Doble', '2 oz', 40, 2),
  ('v2222221-2222-2222-2222-222222222221', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Chico', '12 oz', 45, 1),
  ('v2222222-2222-2222-2222-222222222222', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Grande', '16 oz', 60, 2),
  ('v3333331-3333-3333-3333-333333333331', 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Frío', '16 oz', 65, 1),
  ('v4444441-4444-4444-4444-444444444441', 'ccccccc1-cccc-cccc-cccc-ccccccccccc1', 'Chico', '12 oz', 45, 1),
  ('v5555551-5555-5555-5555-555555555551', 'ddddddd1-dddd-dddd-dddd-ddddddddddd1', 'Pieza', null, 55, 1)
on conflict (id) do nothing;

-- Modifier groups
insert into public.modifier_groups (id, name, min_select, max_select, is_required, sort_order)
values
  ('g1111111-1111-1111-1111-111111111111', 'Tipo de leche', 0, 1, false, 1),
  ('g2222222-2222-2222-2222-222222222222', 'Extras', 0, 3, false, 2)
on conflict (id) do nothing;

insert into public.modifiers (id, group_id, name, price_delta, sort_order)
values
  ('m1111111-1111-1111-1111-111111111111', 'g1111111-1111-1111-1111-111111111111', 'Leche deslactosada', 8, 1),
  ('m1111112-1111-1111-1111-111111111112', 'g1111111-1111-1111-1111-111111111111', 'Leche de avena', 12, 2),
  ('m2222221-2222-2222-2222-222222222221', 'g2222222-2222-2222-2222-222222222222', 'Shot extra espresso', 10, 1),
  ('m2222222-2222-2222-2222-222222222222', 'g2222222-2222-2222-2222-222222222222', 'Jarabe vainilla', 6, 2)
on conflict (id) do nothing;

insert into public.product_modifier_groups (product_id, group_id)
values
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'g1111111-1111-1111-1111-111111111111'),
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'g2222222-2222-2222-2222-222222222222'),
  ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'g1111111-1111-1111-1111-111111111111')
on conflict do nothing;
