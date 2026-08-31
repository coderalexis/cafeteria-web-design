-- ============================================================
--  P11e · Las cuentas abiertas también van a «Por preparar»
-- ============================================================
--
-- «Por preparar» solo mostraba lo YA COBRADO, y en una cafetería con mesas
-- eso llega tarde: ahí se sirve antes de cobrar, así que lo pendiente de la
-- barra son justamente las cuentas abiertas. La pantalla se perdía el caso
-- para el que se hizo.
--
-- La trampa es que una cuenta ACUMULA rondas: mostrarla entera haría que la
-- barra vuelva a preparar lo que ya sirvió. Y no basta con marcar la cuenta
-- «lista», porque la siguiente ronda la devolvería completa.
--
-- `prepared_lines` es una FOTO de cuánto se preparó de cada renglón:
-- {"<lineId>": cantidad}. Lo pendiente es `cantidad_actual - cantidad_foto`
-- por renglón, así que:
--   · producto nuevo en la ronda 2 -> renglón nuevo, pendiente completo
--   · más de lo mismo (1 -> 3, mismo lineId al fusionar) -> pendientes 2
--   · si se quita algo, la resta da negativo y se trata como 0
-- Al cobrar, la fila se borra y la cuenta desaparece sola de la pantalla.
--
-- Los `lineId` sobreviven el viaje: `mergeParkedCarts` suma cantidades sobre
-- el renglón que ya existía, y serializar/rehidratar el carrito los conserva.
--
-- Aplicada el 2026-08-31 como `p11e_cuentas_por_preparar`.

alter table public.parked_orders
  add column prepared_lines jsonb not null default '{}'::jsonb;

comment on column public.parked_orders.prepared_lines is
  'Foto de lo ya preparado por renglón {"lineId": cantidad}. Lo pendiente es la resta contra el carrito actual.';
