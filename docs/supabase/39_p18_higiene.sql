-- 39_p18_higiene.sql — P18: índices (migración: p18_higiene).
-- Punto 13 de la auditoría del 2026-09-01.
--
-- ── Lo que NO va aquí: pg_graphql (punto 11) ────────────────────────
-- Supabase expone un endpoint GraphQL (/graphql/v1) sobre TODAS las tablas de
-- `public` a cualquier usuario autenticado. La RLS aplica igual, así que no
-- es una fuga, pero es una segunda forma de consultar la base que la app no
-- usa. Se intentó cerrar desde SQL y NO se puede: los grants sobre
-- `graphql_public` los hizo `supabase_admin`, y un REVOKE ejecutado por
-- `postgres` solo quita lo que `postgres` otorgó — no falla, simplemente no
-- hace nada (se comprobó con has_schema_privilege). Se apaga desde el panel:
-- Database → Extensions → pg_graphql, o Settings → API → GraphQL.

-- ── Índices ─────────────────────────────────────────────────────────
-- Con la carga de hoy (la consulta más cara de la app tarda 4 ms) nada de
-- esto se nota. Se hace para que las tablas que SÍ crecen no acumulen deuda:
-- `tickets` y `audit_events` reciben filas todos los días.

-- Redundante: (business_id, opened_at) ya existe y cubre lo mismo y más.
drop index if exists public.idx_cash_sessions_opened_at;
-- Nunca usado: `businesses` tiene decenas de filas, siempre va a leer completa.
drop index if exists public.businesses_signup_idx;

-- Llaves foráneas sin índice en tablas que crecen. Postgres las necesita para
-- comprobar borrados del lado referenciado (un perfil, un cliente de lealtad);
-- sin índice, cada comprobación es una lectura completa de la tabla.
create index if not exists tickets_cashier_idx on public.tickets (cashier_id);
create index if not exists tickets_loyalty_customer_idx on public.tickets (loyalty_customer_id)
  where loyalty_customer_id is not null;
create index if not exists audit_events_actor_idx on public.audit_events (actor_id)
  where actor_id is not null;
create index if not exists expenses_created_by_idx on public.expenses (created_by);

-- Se dejan a propósito, aunque el linter los marque:
--   · idx_modifier_groups_business: sigue el mismo patrón que el resto del
--     menú; quitarlo solo por «no usado» en una tabla de diez filas es ruido.
--   · tickets_loyalty_idx (business_id, loyalty_customer_id): lo va a usar el
--     historial por cliente que sigue en el plan.
--   · Las FK compuestas del menú (menu_products, menu_variants, modifiers,
--     product_modifier_groups): ya tienen índice en su primera columna, que
--     es lo que Postgres usa para comprobarlas; el linter pide las dos
--     columnas juntas, pero no hace falta.
