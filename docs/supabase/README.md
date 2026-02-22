# Integración Next.js + Supabase (POS cafetería)

## A) Diseño del esquema

- `profiles`: perfil por usuario autenticado y rol (`admin`, `cajero`).
- Menú:
  - `menu_categories`
  - `menu_products`
  - `menu_variants`
  - `modifier_groups`
  - `modifiers`
  - `product_modifier_groups`
- Ventas:
  - `tickets`
  - `ticket_items`
  - `ticket_item_modifiers`

Relaciones principales:
- `profiles.id -> auth.users.id`
- `menu_products.category_id -> menu_categories.id`
- `menu_variants.product_id -> menu_products.id`
- `modifiers.group_id -> modifier_groups.id`
- `product_modifier_groups.product_id -> menu_products.id`
- `product_modifier_groups.group_id -> modifier_groups.id`
- `tickets.cashier_id -> profiles.id`
- `ticket_items.ticket_id -> tickets.id`
- `ticket_items.variant_id -> menu_variants.id`
- `ticket_item_modifiers.ticket_item_id -> ticket_items.id`

## B) SQL completo

1. Ejecuta `docs/supabase/01_schema.sql`
2. Ejecuta `docs/supabase/02_rls.sql`
3. Ejecuta `docs/supabase/03_seed.sql`

## C) Integración en Next.js por pasos

1. Instalar dependencias:
   - `@supabase/supabase-js`
   - `@supabase/ssr`
2. Configurar clientes Supabase:
   - `lib/supabase/client.ts`
   - `lib/supabase/server.ts`
   - `lib/supabase/middleware.ts`
3. Variables de entorno:
   - copiar `.env.local.example` a `.env.local`
4. Auth:
   - `app/actions/auth.ts`
   - `app/login/page.tsx`
5. Protección de rutas:
   - `middleware.ts` protege `/admin` y `/pos`
6. Panel admin CRUD (server actions):
   - `app/actions/menu.ts`
   - `app/admin/page.tsx`
7. POS y guardado de ventas:
   - `app/actions/sales.ts`
   - `app/pos/page.tsx`
   - `app/pos/pos-form.tsx`
8. Home y logout:
   - `app/page.tsx`

## Notas de error handling

- Server actions validan datos de entrada y retornan `{ error }`.
- Errores de Supabase se retornan con `error.message`.
- Middleware redirecciona si no hay sesión o rol suficiente.
