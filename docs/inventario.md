# Diseño: inventario por pieza

> Documento de diseño y plan de acción. **Nada de esto está implementado.**
> Escrito con los datos reales de Gym Coffe delante y antes de tocar código,
> para que las decisiones difíciles se tomen en frío — como se hizo con
> `docs/cola-sin-internet.md`.

## Qué prometimos ya

La landing lleva semanas anunciándolo bajo «En desarrollo», y esa frase es el
alcance mínimo, palabra por palabra:

> Existencias de lo que se cuenta por pieza —pan, pasteles, botellas—, con
> descuento automático al vender, alertas de que se está acabando y registro
> de mermas.

La decisión de fondo ya se tomó con el usuario el 2026-08-26: **inventario por
pieza; recetas solo si alguien las pide.**

## El problema, con los números de Gym Coffe

Lo que de verdad se vende por pieza en su carta —se compra hecho y se vende
tal cual— son cuatro o cinco artículos:

| Artículo | Piezas en 30 días | Costo capturado |
|---|---|---|
| Orejitas | 5 | $10 (igual que el precio: margen 0, seguro un error de captura) |
| Panqué / Muffin | 4 | $0 |
| Agua mineral | 0 | $0 |
| Refresco | 0 | $0 |
| Copa de yogurt | 8 | $0 (se arma en el momento: dudoso) |

Tres cosas que salen de esa tabla y que mandan sobre el diseño:

1. **El volumen es mínimo: 0.1 a 0.2 piezas al día.** Una caja de 12 orejitas
   dura dos meses; se pone dura mucho antes de «acabarse». Para un café así,
   la pregunta útil no es «¿cuánto me queda?» sino **«¿cuánto se me está
   echando a perder?»** — la merma vale más que la alerta de existencias.
2. **El costo está en cero en 42 de 43 productos.** El reporte de margen que
   ya existe (`margin_report`, `profit_report`) está inflado desde que se
   construyó y lo dice él mismo («piezas vendidas sin costo capturado»). Nadie
   va a ir producto por producto a teclear costos. Pero cuando llega el pan,
   la dueña **sí sabe cuánto pagó por la caja**. Una entrada de inventario con
   costo es la única forma realista de que el costo se capture.
3. **Ningún café real ha hecho nunca un corte de caja a mano** (hallazgo del
   2026-09-08: `counted_cash` siempre null). Cualquier inventario que dependa
   de contar todos los días está muerto antes de nacer. El sistema tiene que
   llevar la cuenta solo, y el conteo tiene que ser una opción de una vez a la
   semana, de un minuto, no un ritual diario.

## Las decisiones de fondo

**Por pieza, sin recetas.** Se cuenta lo que se compra y se vende como la
misma cosa: la orejita, la botella, el muffin. Lo que se prepara (café, leche,
jarabes, el pan del sándwich) NO se cuenta: exigiría capturar gramos por
bebida y mantenerlo al día, y eso no lo hace ni una cadena. Si un día lo piden,
el diario de movimientos de este diseño es la base sobre la que se construye.

**Nunca se bloquea una venta por existencias.** Si el sistema dice que quedan
cero muffins y la cajera tiene uno en la mano, el que está mal es el sistema.
La venta pasa, la existencia queda en negativo y el siguiente conteo lo
corrige. Un POS que discute con la cajera en plena fila es un POS que se deja
de usar.

**El sistema escribe la existencia; las personas escriben lo que pasa.** Las
ventas y cancelaciones la mueven solas. Las personas registran tres cosas:
*entradas* (llegó mercancía), *mermas* (se perdió algo) y *conteos* (esto es lo
que hay de verdad). Nada más. Toda escritura pasa por RPC; **ningún cliente
escribe existencias directo**, igual que con el dinero.

**Opcional por producto y apagado por omisión.** Un café que no marque nada no
ve una sola pantalla, botón ni número nuevo. El módulo no existe hasta que el
primer producto dice «se cuenta por pieza».

**Todo movimiento deja rastro.** La pregunta que un dueño hace de verdad es
«compré 30 y tengo 3, ¿a dónde se fueron 27?». La respuesta tiene que estar en
un diario, no en un número.

## Modelo de datos

Dos tablas nuevas, ninguna columna en `menu_variants`:

```
stock_items          -- una fila por variante que se cuenta
  variant_id  uuid  primary key → menu_variants (on delete cascade)
  business_id uuid  not null default current_business_id()
  qty         integer not null default 0      -- puede ser negativo, a propósito
  min_qty     integer not null default 0      -- 0 = sin alerta
  updated_at  timestamptz

stock_movements      -- el diario; qty es el CAMBIO, con signo
  id            uuid
  business_id   uuid
  variant_id    uuid → menu_variants
  kind          text check (kind in ('entrada','venta','cancelacion','merma','conteo'))
  qty           integer not null          -- +12 entrada, −1 venta, −3 merma, ±n conteo
  qty_after     integer not null          -- la existencia que quedó: el diario se lee sin sumar
  unit_cost     numeric(10,2)             -- solo en entradas; lo que costó cada pieza
  reason        text                      -- merma: por qué; conteo: nota
  ticket_id     uuid → tickets            -- en venta/cancelación
  actor_id      uuid → profiles
  created_at    timestamptz
```

Por qué así y no de otra forma:

- **Por variante, no por producto.** Lo que se vende es `ticket_items.variant_id`;
  «Panqué / Muffin» de chocolate y de vainilla son dos cosas que se cuentan
  aparte. En la práctica todo lo que se cuenta por pieza en Gym Coffe tiene una
  sola variante («Único»), así que en pantalla se ve como el producto y la
  variante no aparece. Si un producto tiene varias, se cuentan por separado y
  se ve por qué.
- **Tabla aparte y no columnas en `menu_variants`.** Las tablas del menú las
  escribe el cliente por RLS (así edita precios el dueño): una columna `stock`
  ahí sería editable por PostgREST y el diario dejaría de ser la verdad. Con
  tabla propia SIN políticas de escritura, la única puerta son los RPC.
  Bonificación: `clone_menu` no tiene que saber que existe (una plantilla no
  lleva existencias) y el módulo entero se puede tirar con dos `drop table`.
- **`kind` como texto con `check`, no enum**, como `expenses.category`: un
  valor nuevo de enum exige su propia migración y este catálogo va a crecer
  (por ejemplo «cortesía» o «consumo del personal» si las mermas se
  desglosan).
- **`qty_after` en cada renglón.** Es redundante y se guarda a propósito: el
  historial se lee como estado de cuenta («llegaron 12 → 12; vendí 1 → 11;
  merma 3 → 8») sin sumar, y sirve para detectar si alguien tocó `qty` por
  fuera.
- **`unit_cost` en la entrada** es la puerta por la que el costo real entra al
  sistema (ver «Entrada» abajo).
- **Negativos permitidos** por la decisión de nunca bloquear. Se muestran en
  rojo y con el mensaje «vendiste más de lo que el sistema creía que había:
  cuéntalo».

Ambas tablas: RLS `select` para el negocio activo (la cajera necesita ver
existencias en el POS), **sin insert/update/delete de clientes**, `business_id`
por default de `current_business_id()`, y **entran en `delete_business`** (regla
del repo). El PostgREST del POS embebe `menu_variants → stock_items` (relación
nueva entre dos tablas que no se embebían antes: no rompe nada).

## Lo que pasa en cada momento

**Venta.** `create_ticket` ya recorre los renglones para fotografiar precio y
costo; ahí mismo, por cada renglón con `variant_id` que tenga fila en
`stock_items`, resta `quantity` y escribe el movimiento `venta` con el
`ticket_id`. Renglones fuera de menú (`variant_id` null) no cuentan. Se hace
**parcheando la definición viva** con un ancla dentro del bucle (patrón de las
migraciones 40 y 51), no retipeando la función. Como todo va en la misma
transacción, la idempotencia por `client_ref` protege también las existencias:
un reintento de la cola sin internet no descuenta dos veces. Una venta que
esperó en la cola descuenta cuando llega, con la hora de captura en el ticket.

**Cuentas abiertas no descuentan.** Lo que está en una mesa sin cobrar no se
vendió; se descuenta al cobrar. Es lo mismo que ya pasa con el dinero.

**Cancelación.** `cancel_ticket` recorre los renglones del ticket y devuelve las
piezas con un movimiento `cancelacion`. **Corregir una venta sale gratis:**
`correct_ticket` ya cancela y vuelve a cobrar, así que devuelve y descuenta lo
correcto sin una línea nueva.

**Entrada.** «Llegaron 12 muffins a $18». RPC `stock_move('entrada', …)`.
Además de sumar, **si trae costo, actualiza `menu_variants.cost`** (último
costo de compra). Con eso el margen de esa variante deja de ser inventado a
partir de la siguiente venta, sin que nadie abra la pantalla de productos. Y
una regla que hay que decir en el propio diálogo, porque el error se comete
ahí: **una entrada con costo NO se captura también en Gastos** — ese dinero ya
entra a la utilidad como costo de lo vendido (`unit_cost`) y anotarlo dos veces
lo descontaría dos veces. Es la misma advertencia que ya lleva la categoría
«Compras y suministros».

**Merma.** «Se cayeron 2» / «caducaron 3». RPC `stock_move('merma', …)` con
motivo obligatorio de una lista corta (se cayó · caducó · cortesía · consumo
del personal · otro). Lo puede registrar la cajera: las mermas pasan en la
barra, y si hay que pedirle al dueño se dejan de registrar. Queda en
`audit_events` desde el RPC (el patrón de la bitácora del lado del cajero, que
no puede usar `log_audit`).

**Conteo.** Es el arqueo de las piezas, y se diseña sabiendo que el arqueo de
efectivo nadie lo hace. Una sola pantalla: lista de lo que se cuenta, el número
que cree el sistema, y un campo por artículo para lo que hay de verdad. Lo que
se deja vacío no cambia. Al guardar, cada diferencia es un movimiento `conteo`
con la nota que se escriba, y la pantalla dice **«faltaron 3 muffins, sobró 1
agua»** — que es el dato que interesa, no el nuevo total. Solo dueño o admin.

## Pantallas

- **Productos** (ya existe): en la variante, un interruptor **«Se cuenta por
  pieza»**; al encenderlo pide existencia inicial y mínimo (opcional). Ese
  interruptor es el único punto de entrada al módulo.
- **Existencias** (`/admin/existencias`, grupo «Tu menú» junto a Productos):
  la lista de lo que se cuenta con su número, en rojo lo que está en o bajo el
  mínimo y lo negativo; botones **Entrada** y **Merma** en cada renglón y
  **Contar** arriba; al tocar un renglón, su historial como estado de cuenta.
- **POS**: en la tarjeta del producto, una esquina con **«quedan 3»** cuando
  está en o bajo el mínimo y **«agotado»** en 0 o menos. **Nunca bloquea**: la
  tarjeta sigue vendiendo. En el menú ⋮ del POS, «Registrar merma» para la
  cajera.
- **Resumen** (`/admin`): tarjeta **«Se está acabando»** solo cuando haya algo
  que decir; si no hay nada, no existe.
- **Correo semanal**: una línea con lo que quedó bajo mínimo y las mermas de la
  semana con su valor al costo.
- **Análisis**: **mermas del mes** valuadas al costo, por motivo. Es el número
  que convierte «se me echa a perder pan» en «se te van $340 al mes en pan».
- **Menú público**: lo agotado se marca «agotado» en vez de esconderse (que el
  cliente no pida lo que no hay, pero que la carta no parezca más corta).

## Permisos

| | Cajero | Admin | Dueño |
|---|---|---|---|
| Ver existencias en el POS | Sí | Sí | Sí |
| Registrar merma | Sí, con motivo | Sí | Sí |
| Registrar entrada | **Decidir** (ver abajo) | Sí | Sí |
| Contar | No | Sí | Sí |
| Marcar qué se cuenta, mínimos | No | Sí | Sí |
| Ver mermas valuadas | No | Sí | Sí |

Decisión pendiente para el usuario: si la cajera puede registrar **entradas**.
A favor: en un café chico es ella quien recibe el pan a las 7 de la mañana.
En contra: la entrada con costo toca el margen. Propuesta: **sí puede, pero sin
costo**; el costo solo lo pone admin o dueño. Y como ya aplica en todo el
sistema, estas reglas van en el RPC, no en la pantalla, y en `role-legend.tsx`.

## Fases, en PR entregables

Tamaños: S (una sesión), M (dos o tres), L (varias). Cada PR con su humo en
el café de prueba, su viñeta en `/ayuda` y su entrada en `lib/admin-search.ts`.

### Fase 0 — Decidir qué se cuenta (sin código)

Con Diana: confirmar la lista de arriba y aclarar los dudosos (la copa de
yogurt se arma en el momento, ¿se cuenta el yogurt o no se cuenta nada?). Y
las dos decisiones abiertas: entradas por cajera, y si se quiere «consumo del
personal» como motivo desde el día uno. Sin esto el resto se diseña a ciegas.

### Fase 1 — El núcleo · **M**

Migración `57_p45_inventario.sql`: las dos tablas, RLS de solo lectura, RPC
`stock_track(variant, on/off, qty_inicial, min)`, `stock_move(kind, variant,
qty, reason, unit_cost)`, `stock_report()`; parche anclado en `create_ticket`
y en `cancel_ticket`; `delete_business` aprende las dos tablas. Prueba SQL
`t_20_inventario.sql`: la venta descuenta, la cancelación devuelve, corregir
deja el saldo correcto, fuera de menú no toca nada, el negativo se permite, la
entrada con costo actualiza `cost`, la cajera no puede escribir las tablas, y
borrar el café se lleva todo. Después, en PR aparte: el interruptor en
Productos y la pantalla de Existencias con entrada, merma e historial. Y en
otro: el POS (esquina «quedan n» / «agotado», merma desde ⋮).

Con esto se cumple, completa, la frase de la landing menos las alertas.

### Fase 2 — Conteo y alertas · **S**

Pantalla de conteo con «faltaron / sobraron»; mínimos; tarjeta «Se está
acabando» en Resumen; la línea del correo semanal; «agotado» en el menú
público. Todo sobre `stock_report()`, sin migración salvo el RPC `stock_count`.

### Fase 3 — Compras y merma en dinero · **S**

**Lista de compras**: lo que está bajo mínimo con cuánto falta para llegar al
mínimo — la «lista del súper» que hoy se hace de memoria. **Pagado de la caja**:
al registrar una entrada, opción de «lo pagué de la caja» que crea la salida en
`cash_movements` para que el corte cuadre (el mismo patrón con el que un abono
de fiado crea una entrada de caja, migración 50). **Mermas valuadas** en
Análisis, por motivo.

### Después, y solo si lo piden

- **Recetas** (insumos por bebida: café, leche, jarabes). El diario ya está;
  faltaría la tabla de recetas y descontar por fórmula. Se descartó dos veces
  por la misma razón: nadie mantiene los gramos.
- **Consumo por extras** («leche deslactosada» descontando cartones). Es una
  receta chica; misma respuesta.
- **Proveedores, órdenes de compra, códigos de barras, varios almacenes.** Son
  otro producto.

## Riesgos y trampas ya vistas

- `create_ticket` se parchea con ancla **dentro del bucle de renglones**; si el
  ancla no está, la migración falla en vez de seguir (regla del repo).
- La cola sin internet: el descuento ocurre al sincronizar, no al capturar. El
  POS no intenta llevar existencias locales — dos dispositivos vendiendo el
  mismo muffin sin internet se resuelven con el negativo y el conteo, no con
  sincronización.
- Las alertas por «días que quedan» (velocidad de venta) **no se hacen**: con
  0.2 piezas al día el número es ruido. Mínimo fijo por artículo y ya.
- Un producto que se desactiva o se borra: `on delete cascade` en
  `stock_items` y el diario se queda (el ticket lo referencia). Borrar la
  variante con existencias pide confirmación, como ya lo pide borrar un
  producto con ventas.
- El humo tiene que probar el camino completo con la cuenta temporal del café
  de prueba: marcar, entrada con costo, vender desde el POS, cancelar, merma
  como cajera, contar, y leer el historial — y **borrar los movimientos al
  terminar**, que el café de prueba conserva datos entre corridas.
- En cuanto Fase 1 esté en producción, la tarjeta «Inventario» sale de «En
  desarrollo» en la landing el mismo día: esconder lo que ya existe desinforma
  igual que prometer lo que no (lección de la lealtad, 2026-08-31).
