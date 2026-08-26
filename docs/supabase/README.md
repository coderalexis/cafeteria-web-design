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
13. `13_p1_seguridad.sql` — P1: `businesses.settings` (jsonb con grant de columna; hoy `lock_minutes` del candado del POS), tabla `audit_events` + RPC `log_audit` (bitácora por negocio, solo owner|admin la lee/escribe; la consume `/admin/actividad`), y PIN de caja: tabla `member_pins` (hashes bcrypt vía pgcrypto, sin lectura para clientes) con RPCs `set_my_pin` / `my_pin_set` / `verify_my_pin` / `admin_set_member_pin`; `my_context()` ahora incluye `settings`.
14. `14_p2_pos.sql` — P2 (POS): `tickets.tip_amount` (propina; **no** es venta: `total` sigue siendo la venta y el cobro es `total + propina`) con `create_ticket` v5 (`p_tip`), la propina sumada al efectivo esperado en `close_cash_session` y reportada en `cash_session_summary`, `sales_report` y `sales_insights`; `menu_categories.color` (paleta fija para pintar el POS) y RPC `top_variants(p_days, p_limit)` (más vendidos del negocio → fila de favoritos del POS).

15. `15_p3_resumen.sql` — P3b: RPC `weekly_summary(p_business_id, p_from, p_to)` (solo `service_role`): agregado de una semana (ventas, propinas aparte, por día, top 5, por cajero, canceladas) para el correo del lunes. Lo consumen `/api/resumen-semanal` (cron de Vercel, lunes 14:00 UTC, requiere env `CRON_SECRET`) y el botón de `/super`; cada negocio puede apagarlo en Negocio → Resumen semanal (`settings.weekly_email`).

16. `16_p4_costos.sql` — P4: `menu_variants.cost` (cuánto cuesta preparar cada variante) y `ticket_items.unit_cost` (**fotografía** del costo al vender, como `unit_price`: subir un costo hoy no debe mover el margen de meses cerrados). `create_ticket` pasa a v7 (misma firma) y guarda el costo; nuevo RPC `margin_report(p_from, p_to)` para owner|admin: venta, costo, margen y % del periodo, los productos que más dejan, los de margen bajo (<40 %) y **cuáles variantes activas no tienen costo capturado** (sin eso, un producto sin costo aparentaría 100 % de margen). Lo consume `/admin/analisis`.

17. `17_p4_menu_publico.sql` — P4: RPC `public_menu(p_slug)`, **el único con grant a `anon`** (la página `/menu/<slug>` no tiene sesión, así que no hay RLS que la cubra). Solo responde si `settings.public_menu = true`, el negocio está activo y no es plantilla; en cualquier otro caso devuelve null y la app da 404 sin distinguir "no existe" de "no publicado". Columnas explícitas: `menu_variants.cost` NUNCA sale de aquí.

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
- Seguridad de caja: con `settings.lock_minutes` > 0, el POS se bloquea tras esa inactividad (`app/pos/lock-screen.tsx`) y se desbloquea con el PIN del usuario (se crea ahí mismo si no existe, o en /cuenta; un admin lo asigna/quita desde Equipo). Aviso de sin conexión con reintento seguro (el `client_ref` hace idempotente volver a pulsar Cobrar). Auditoría: `lib/audit.ts` (`logAudit`) desde menú/modificadores/equipo/negocio → vista `/admin/actividad`.
- Respaldos: `.github/workflows/backup.yml` hace un `pg_dump` diario cifrado (secrets `SUPABASE_DB_URL` y `BACKUP_PASSPHRASE`) y lo guarda 30 días como artefacto del workflow.
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

## E) Correo y respaldos (operación)

- Dominio: `cafecitopos.com` (Cloudflare). Resend verificado (DKIM/SPF) y conectado como SMTP de Supabase Auth (remitente `no-reply@cafecitopos.com`).
- Plantilla de "Reset Password": `docs/supabase/email-templates/reset-password.html` (pegar en Supabase → Authentication → Emails; el enlace usa `{{ .SiteURL }}/restablecer/confirmar?token_hash={{ .TokenHash }}&type=recovery`).
- Respaldos: workflow `backup.yml` (03:00 CDMX aprox.) → `pg_dump` cifrado, artefacto 30 días. Secrets del repo: `SUPABASE_DB_URL` (cadena "Session pooler" con contraseña) y `BACKUP_PASSPHRASE`. Restaurar: `openssl enc -d -aes-256-cbc -pbkdf2 -in db.dump.enc -out db.dump` y `pg_restore --clean --if-exists -d <url destino> db.dump`.
