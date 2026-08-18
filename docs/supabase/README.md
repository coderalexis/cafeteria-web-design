# Integración Next.js + Supabase (POS cafetería)

## A) Diseño del esquema

**Multi-cafetería (desde `09_multitenant.sql`):** una sola base de datos comparte varias cafeterías (`businesses`). Todas las tablas de negocio llevan `business_id not null default current_business_id()`; el negocio se deriva **siempre** del usuario autenticado (`profiles.active_business_id` + membresía activa en `business_members`), nunca del cliente. Folio, "una caja abierta", `client_ref` y `slug` de categoría son únicos **por negocio**.

- `businesses`: cafeterías (`slug` único, zona horaria, datos del ticket, `plan`/`status`, `is_template`); `business_members` (rol por negocio: `owner`/`admin`/`cajero`, `username` para cuentas de café); `business_counters` (folio consecutivo por negocio).
- `profiles`: perfil por usuario autenticado; `active_business_id`, `is_platform_admin` (operador de la plataforma). *(Las columnas `role`/`username` son legado de una sola cafetería y se retiran en la migración 10.)*
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
- `profiles.id -> auth.users.id`; `business_members.(business_id, user_id) -> businesses, profiles`
- `<tabla>.business_id -> businesses.id` (11 tablas de negocio)
- `menu_products.(category_id, business_id) -> menu_categories.(id, business_id)` (FK compuesta: un producto no puede colgar de una categoría de otro negocio)
- `menu_variants.(product_id, business_id) -> menu_products.(id, business_id)`
- `modifiers.(group_id, business_id) -> modifier_groups.(id, business_id)`
- `product_modifier_groups.(product_id, business_id) -> menu_products`, `.(group_id, business_id) -> modifier_groups`
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
9. `09_multitenant.sql` — multi-cafetería (M0): `businesses`, `business_members`, `business_counters`; `business_id` en las 11 tablas; funciones `member_ctx()`, `current_business_id()`, `current_member_role()` (sustituye a `current_role()`), `my_context()`, `set_active_business()`, `clone_menu()`, `derive_uuid()`, `find_user_id_by_email()`, `business_day(ts, tz)`; RLS y los 7 RPC filtran por negocio; folio por negocio (`business_counters`) y una caja abierta por negocio; backfill de "El Cafecito" (`el-cafecito`) y de la plantilla clonable `plantilla-cafeteria`. Compatible con el código de la app hasta la Fase 4c.

Los archivos `01–03` no se editan; cada cambio posterior es un archivo nuevo numerado.

Prueba de aislamiento entre negocios (impersonación con `set_config('request.jwt.claims', …)` + `set local role authenticated` en una transacción con rollback): usuario de A no ve menú/tickets/cajas/perfiles de B, `cash_session_summary(sesión de B)` → null, `cancel_ticket(ticket de B)` → "Ticket no encontrado.", `sales_report` solo agrega A, un insert de menú toma `business_id` de A por default y la FK compuesta rechaza padres de otro negocio.

## C) Cómo escribe la app

- **Toda venta entra por el RPC `create_ticket`** (SECURITY DEFINER): toma el negocio de `member_ctx()`, recalcula precios desde el menú **de ese negocio** (variante + modificadores), valida caja abierta del negocio, descuento y efectivo, toma el folio de `business_counters` e inserta ticket + items + modificadores en una transacción. `(business_id, client_ref)` hace idempotente el reintento. Las plantillas (`is_template`) no admiten ventas ni caja.
- No hay políticas de INSERT/UPDATE/DELETE directas sobre `tickets`; cancelar es la única "baja" (`cancel_ticket`).
- Lectura vía RLS, siempre dentro del negocio activo: cajero ve sus tickets; owner/admin ven todo el negocio. `businesses` solo permite a owner/admin actualizar `name, timezone, address, phone, receipt_header, receipt_footer` (grant por columna). `business_members` y `business_counters` no aceptan escrituras de clientes.
- Con `service_role` (sin sesión) el default de `business_id` es null: las actions que usen el cliente admin deben pasar `business_id` explícito.
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
