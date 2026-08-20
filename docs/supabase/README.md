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
10. `10_multitenant_cleanup.sql` — (M1) elimina `profiles.role`/`profiles.username` y el tipo `app_role`. **Aplicar solo después de desplegar el código de M1.**
11. `11_platform.sql` — (M3) RPC `platform_overview()` (resumen de negocios para `/super`; solo `service_role`).
12. `12_insights.sql` — Reportes 2: RPC `sales_insights(p_from, p_to)` (owner|admin, zona del negocio): comparativo vs. periodo anterior, por día de la semana, mapa de calor día×hora, métricas por cajero, descuentos y cancelaciones por motivo/usuario, productos sin movimiento, modificadores más pedidos, combinaciones frecuentes. Lo consume `/admin/analisis`.

Los archivos `01–03` no se editan; cada cambio posterior es un archivo nuevo numerado.

Prueba de aislamiento entre negocios (impersonación con `set_config('request.jwt.claims', …)` + `set local role authenticated` en una transacción con rollback): usuario de A no ve menú/tickets/cajas/perfiles de B, `cash_session_summary(sesión de B)` → null, `cancel_ticket(ticket de B)` → "Ticket no encontrado.", `sales_report` solo agrega A, un insert de menú toma `business_id` de A por default y la FK compuesta rechaza padres de otro negocio.

## C) Cómo escribe la app

- **Toda venta entra por el RPC `create_ticket`** (SECURITY DEFINER): toma el negocio de `member_ctx()`, recalcula precios desde el menú **de ese negocio** (variante + modificadores), valida caja abierta del negocio, descuento y efectivo, toma el folio de `business_counters` e inserta ticket + items + modificadores en una transacción. `(business_id, client_ref)` hace idempotente el reintento. Las plantillas (`is_template`) no admiten ventas ni caja.
- No hay políticas de INSERT/UPDATE/DELETE directas sobre `tickets`; cancelar es la única "baja" (`cancel_ticket`).
- Lectura vía RLS, siempre dentro del negocio activo: cajero ve sus tickets; owner/admin ven todo el negocio. `businesses` solo permite a owner/admin actualizar `name, timezone, address, phone, receipt_header, receipt_footer` (grant por columna). `business_members` y `business_counters` no aceptan escrituras de clientes.
- Con `service_role` (sin sesión) el default de `business_id` es null: las actions que usen el cliente admin deben pasar `business_id` explícito.
- Las mutaciones de menú/modificadores van por server actions que verifican rol (`requireAdmin` = owner|admin del negocio activo) además del RLS. El equipo (`app/actions/team.ts`) escribe `business_members`/perfiles con service role, filtrando SIEMPRE por el negocio activo del que llama.

## D) Integración en Next.js

- Clientes Supabase tipados: `lib/supabase/server.ts`, `client.ts`, `admin.ts` (service role, solo servidor); tipos en `lib/supabase/database.types.ts` (regenerar tras cada migración).
- Contexto de sesión: `lib/context.ts` (`getContext` = usuario + `my_context()` cacheado por request; `requireContext`/`requireRole`/`requireSuperAdmin`/`checkExpectedBusiness`), forma compartida en `lib/context-shape.ts`, provider cliente `components/business-provider.tsx` (`useBusiness`/`useAppContext`) y `components/business-switcher.tsx`.
- Recuperación de contraseña (correo real vía SMTP propio/Resend): `/olvide-contrasena` → `resetPasswordForEmail`; la plantilla (docs/supabase/email-templates/reset-password.html) enlaza a `/restablecer/confirmar?token_hash=…&type=recovery` (Route Handler que hace `verifyOtp` y puede escribir cookies) → `/restablecer` pide la contraseña nueva. Las cuentas de café (correo sintético, incluidos dominios legados y sus subdominios) no reciben correo: su contraseña se restablece desde Equipo.
- Server actions: `app/actions/auth.ts` (login por correo o usuario+café, logout, cambiar mi contraseña, recuperación), `business.ts` (cambiar negocio activo, ajustes del negocio), `team.ts` (equipo), `super.ts` (panel del operador: crear cafetería + dueño, suspender/reactivar, clonar plantilla, entrar como dueño; todo con `requireSuperAdmin()` + service role), `menu.ts`, `modifiers.ts`, `sales.ts`, `cash.ts`.
- Panel del operador `/super` (`profiles.is_platform_admin`): lista de cafeterías con miembros/ventas 30 días (`platform_overview()`), alta de cafetería (slug = identificador para el login de cajeros, zona horaria, copia del menú de la plantilla `is_template`) con dueño por correo (cuenta existente o nueva con contraseña temporal mostrada una vez).
- POS: `app/pos/page.tsx` + `pos-client.tsx` (+ `cash-session-dialog`, `ticket-history-dialog`, `modifier-sheet`, `discount-dialog`).
- Admin: `app/admin/*` (dashboard, categorías, productos, modificadores, ventas con reportes/CSV, análisis, cortes, equipo, negocio). Cuenta: `/cuenta`; selector `/seleccionar-negocio`; `/suspendido`.
- Zona horaria por negocio (`businesses.timezone`): `lib/dates.ts` calcula el día de operación con Intl (`dateStringInTz`, `daysToUtcRange`, `businessDayRange`), sin offsets fijos; `formatDate/Time` aceptan la zona; los recibos (`lib/receipt.ts`) llevan nombre, encabezado, dirección, teléfono y pie del negocio (`/admin/negocio` los edita con el cliente de sesión: RLS + grant por columna).
- Middleware `middleware.ts`: sin sesión → `/login`; con sesión resuelve `my_context()` una vez: `/super` solo platform admin; `/admin` y `/pos` exigen negocio activo vigente (si no → `/seleccionar-negocio`, suspendido → `/suspendido`); `/admin` exige owner|admin; `/pos` no aplica a plantillas.
- Variables de entorno: copiar `env.example.txt` a `.env.local` (`SYNTHETIC_EMAIL_DOMAIN` para los correos sintéticos `usuario@slug.<dominio>` de las cuentas de café).

## Notas de error handling

- Server actions validan con zod y devuelven `{ error }` o `{ success: true, ... }` (`ActionResult`).
- Los RPC lanzan excepciones con mensajes en español que la UI muestra tal cual.
- Formularios crudos usan `components/action-form.tsx` para mostrar los errores con toast.
