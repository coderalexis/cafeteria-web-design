# Integración Next.js + Supabase (POS cafetería)

## A) Diseño del esquema

- `profiles`: perfil por usuario autenticado y rol (`admin`, `cajero`).
- Menú:
  - `menu_categories`
  - `menu_products`
  - `menu_variants`
  - `modifier_groups`, `modifiers`, `product_modifier_groups`
- Ventas:
  - `cash_sessions` (turnos de caja: apertura con fondo, cierre con corte)
  - `tickets` (folio, estado completado/cancelado, descuento, efectivo recibido/cambio)
  - `ticket_items` (con snapshots de nombre de producto/variante)
  - `ticket_item_modifiers` (con snapshot de nombre y precio del modificador)

Relaciones principales:
- `profiles.id -> auth.users.id`
- `menu_products.category_id -> menu_categories.id`
- `menu_variants.product_id -> menu_products.id`
- `modifiers.group_id -> modifier_groups.id`
- `product_modifier_groups.product_id -> menu_products.id`
- `product_modifier_groups.group_id -> modifier_groups.id`
- `tickets.cashier_id -> profiles.id`, `tickets.session_id -> cash_sessions.id`
- `ticket_items.ticket_id -> tickets.id`
- `ticket_items.variant_id -> menu_variants.id` (set null; los snapshots conservan el historial)
- `ticket_item_modifiers.ticket_item_id -> ticket_items.id`

## B) SQL — orden de aplicación

En un proyecto nuevo, ejecutar en orden en el SQL Editor (o vía MCP `apply_migration`):

1. `01_schema.sql` — tablas base
2. `02_rls.sql` — RLS inicial
3. `03_seed.sql` — menú completo (aborta si ya hay ventas)
4. `04_fase0.sql` — folio, `client_ref`, snapshots, RPC `create_ticket`, `business_day()`, RLS endurecido (sin `anon`, `TO authenticated`)
5. `05_fase1.sql` — `cash_sessions`, estado de ticket y cancelación, RPCs `open_cash_session` / `close_cash_session` / `cash_session_summary` / `cancel_ticket`; se eliminan INSERT/DELETE directos en tickets (solo RPC)
6. `06_fase2.sql` — RPC `sales_report` (agregación de reportes en SQL, día de operación CDMX)
7. `07_fase3.sql` — modificadores en la venta y descuento por ticket (`create_ticket` v3), `discount_reason`
8. `08_fase4b.sql` — `cash_movements` (entradas/salidas de efectivo del turno), RPC `add_cash_movement`; el corte los considera

Los archivos `01–03` no se editan; cada cambio posterior es un archivo nuevo numerado.

## C) Cómo escribe la app

- **Toda venta entra por el RPC `create_ticket`** (SECURITY DEFINER): recalcula precios desde el menú (variante + modificadores), valida caja abierta, descuento y efectivo, e inserta ticket + items + modificadores en una transacción. `client_ref` hace idempotente el reintento.
- No hay políticas de INSERT/UPDATE/DELETE directas sobre `tickets`; cancelar es la única "baja" (`cancel_ticket`).
- Lectura vía RLS: cajero ve sus tickets; admin ve todo.
- Los mutaciones de menú/modificadores/cajeros van por server actions que verifican rol (`requireAdmin`) además del RLS.

## D) Integración en Next.js

- Clientes Supabase tipados: `lib/supabase/server.ts`, `client.ts`, `admin.ts` (service role, solo servidor); tipos en `lib/supabase/database.types.ts` (regenerar tras cada migración).
- Server actions: `app/actions/auth.ts`, `menu.ts`, `modifiers.ts`, `sales.ts`, `cash.ts`.
- POS: `app/pos/page.tsx` + `pos-client.tsx` (+ `cash-session-dialog`, `ticket-history-dialog`, `modifier-sheet`, `discount-dialog`).
- Admin: `app/admin/*` (dashboard, categorías, productos, modificadores, ventas con reportes/CSV, cortes, cajeros).
- Middleware `middleware.ts` protege `/admin` y `/pos`.
- Variables de entorno: copiar `env.example.txt` a `.env.local`.

## Notas de error handling

- Server actions validan con zod y devuelven `{ error }` o `{ success: true, ... }` (`ActionResult`).
- Los RPC lanzan excepciones con mensajes en español que la UI muestra tal cual.
- Formularios crudos usan `components/action-form.tsx` para mostrar los errores con toast.
