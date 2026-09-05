-- 49_p38_fiado_enum.sql — P38: «Fiado» como método de pago (migración: p38_fiado_enum).
--
-- Va en su propio archivo a propósito: Postgres no deja USAR un valor nuevo
-- de un enum en la misma transacción que lo agrega, y la migración 50 lo
-- usa en restricciones y funciones. Así cada archivo es una transacción y
-- el CI (que aplica uno por uno) y el conector (que aplica cada migración
-- por separado) se comportan igual.
--
-- Qué significa: una venta cobrada con «fiado» es una venta hecha —el
-- café ya dio el producto— cuyo dinero todavía no entra. No suma al
-- efectivo de la caja (como tarjeta o transferencia) y queda a nombre de
-- alguien en su cuenta de fiados (migración 50).

alter type public.payment_method add value if not exists 'fiado';
