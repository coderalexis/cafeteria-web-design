-- ============================================================
--  P11c · Fiado: cuentas que se van sin pagar
-- ============================================================
--
-- Una cuenta abierta y un fiado son cosas distintas y hasta ahora vivían
-- revueltas. La cuenta abierta es de HOY: la mesa está comiendo, se cobra en
-- un rato, y su lugar es la lista del POS. El fiado es de alguien que YA se
-- fue: puede volver el martes, no estorba la operación del día, y lo que
-- hace falta saber de él es quién debe, cuánto y desde cuándo.
--
-- Mezclarlos tenía un costo medible: quien lee «3 cuentas abiertas» al
-- cerrar caja todas las noches deja de leerlo, y ahí es donde se pierde el
-- café del viernes que nadie pagó.
--
-- `owed_since` es la marca Y la fecha de la deuda: nulo = cuenta del día.
-- Se usa además para excluirla de la caducidad de una semana — un fiado no
-- se borra solo, se cobra o se condona.
--
-- NO se registra ninguna venta al marcar el fiado. La venta sigue naciendo
-- al COBRAR, que es cuando entra el dinero a la caja: un ticket del viernes
-- que nadie pagó dejaría el arqueo de esa noche corto y parecería un robo.
--
-- Aplicada el 2026-08-31 como `p11c_fiado`.

alter table public.parked_orders
  add column owed_since timestamptz,
  add column owed_contact text;

comment on column public.parked_orders.owed_since is
  'Nulo = cuenta abierta del día. Con fecha = fiado: la persona se fue sin pagar. No caduca.';
comment on column public.parked_orders.owed_contact is
  'Teléfono o nota para poder cobrarle. Opcional.';

-- Parcial: la inmensa mayoría de las filas son cuentas del día y no tiene
-- sentido indexarlas aquí.
create index parked_orders_fiado_idx
  on public.parked_orders (business_id, owed_since)
  where owed_since is not null;
