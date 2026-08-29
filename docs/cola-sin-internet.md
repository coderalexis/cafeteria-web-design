# Diseño: vender sin internet (cola de ventas)

> Documento de diseño. La **Fase 1 está IMPLEMENTADA** (migración 29
> `p8_hora_de_captura` + `app/pos/queue.ts`, `use-offline-queue.ts`,
> `queue-banner.tsx`, `queue-review-dialog.tsx`). Las fases 2 y 3 siguen sin
> hacerse. Escrito antes de tocar código para que las decisiones difíciles se
> tomaran en frío — y se respetaron todas al implementar.

## El problema

El sistema es 100 % nube: sin internet, el POS avisa («Sin conexión…») pero
**no puede cobrar**. En una cafetería real el internet se cae a media fila, y
hoy la única salida es apuntar en papel y capturar después. Un POS de
escritorio (SQLite local) tiene esto gratis; nosotros tenemos que ganárnoslo
sin renunciar a lo que la nube ya nos da (multi-dispositivo, reportes vivos,
cero instalación).

## La decisión de fondo

**No** vamos a hacer sincronización bidireccional (menú editable offline,
conflictos). Eso es un producto entero. Vamos a hacer una **cola de salida**:
la venta se captura en el dispositivo, se encola, y al volver la conexión se
sube en orden. Todo lo demás (menú, reportes, cortes, admin) sigue
requiriendo internet.

Lo que ya tenemos a favor:

- `create_ticket` es **idempotente** por `(business_id, client_ref)`: reenviar
  una venta encolada dos veces no la duplica. Esta pieza hace viable todo el
  diseño; ya existe y ya está probada (es la que hoy permite «vuelve a pulsar
  Cobrar cuando regrese el internet»).
- El POS ya genera `client_ref` (uuid) **antes** de intentar cobrar.
- El carrito ya sobrevive recargas (localStorage por negocio+cajero).
- Los pedidos en espera ya establecieron el patrón «datos locales por
  dispositivo, con expiración y rehidratación contra el menú vigente».

## Fases

### Fase 1 — Cola con la página viva ✅ IMPLEMENTADA

Cubre el caso real más común: el internet se cae **mientras el POS está
abierto**. No sobrevive a cerrar la pestaña sin conexión (eso es Fase 2).

**Captura.** Al pulsar Cobrar sin conexión (o si `create_ticket` falla por
red), en lugar del error actual la venta se guarda en una cola local
(`localStorage: pos-cola:<businessId>`): el `clientRef` ya generado, la hora
de captura, un número provisional (P-1, P-2…), los artículos
(variant_id + cantidad + modificadores + notas), método de pago, descuento,
propina, y **lo que el cajero cobró** calculado con los precios que el POS
tenía (`chargedTotal`).

El cajero ve confirmación normal («Venta guardada, se subirá al volver la
conexión · P-1»), el carrito se limpia y sigue cobrando. Sin folio real (los
folios son del servidor): el ticket impreso offline dice `PENDIENTE P-1` y la
reimpresión con folio queda disponible tras subir.

**Subida.** Un solo trabajador (no uno por venta): al detectar `online` —el
listener ya existe— sube la cola **en orden de captura**, una por una, con
reintentos exponenciales. Éxito → sale de la cola y se guarda
`{provisional → folio}` para reimprimir. El peor caso (subió pero la
respuesta se perdió) es inofensivo: el reenvío devuelve `duplicate: true` con
el mismo folio.

**UI.** Franja persistente mientras haya cola: «3 ventas por subir» →
«Subiendo 2 de 3…» → toast «3 ventas subidas · folios 41–43». La franja no se
puede descartar: una cola olvidada es dinero no registrado.

**Los tres problemas difíciles, con su decisión:**

1. **Precios.** `create_ticket` recalcula en el servidor con los precios
   vigentes — por diseño, el cliente nunca manda totales. Si un precio cambió
   mientras la venta esperaba, el total registrado ≠ lo cobrado en efectivo.
   *Decisión:* el servidor sigue mandando (aceptar totales del cliente
   abriría la puerta a manipulación). La cola compara el total devuelto
   contra `chargedTotal` y lo que difiere se lista al terminar: «La venta P-2
   se registró por $87 pero cobraste $85 (cambió un precio)», y queda en la
   nota del ticket para el corte. Cambiar precios con la caja abierta ya es
   mala práctica; esto la vuelve visible en vez de silenciosa.

2. **Caja.** Una venta necesita caja abierta. Si el corte se hiciera con
   ventas sin subir, esas caerían en el turno siguiente y el corte anterior
   quedaría corto contra el efectivo real. *Decisión:* el POS **bloquea el
   corte mientras haya cola pendiente** en ese dispositivo («Sube 3 ventas
   antes de cerrar la caja» — sin internet no se puede cortar de todos modos:
   el corte es un RPC). Una regla simple en lugar de un problema de
   conciliación.

3. **Artículos que ya no existen.** Si un producto se desactivó mientras la
   venta esperaba, el servidor la rechaza entera. *Decisión:* esa venta se
   marca «necesita revisión» y NO bloquea a las siguientes (cada una es
   independiente). El cajero la abre, el POS la rehidrata contra el menú
   vigente (el mecanismo de los pedidos en espera) y se recobra a mano. No
   inventamos un «forzar» del lado del servidor.

**Límites duros (a propósito):** máximo ~30 ventas en cola — después el POS
se niega: capturar cientos de ventas a ciegas es acumular riesgo, no
resolverlo. Sin cancelaciones offline. Sin abrir/cerrar caja offline. Sin
canje de lealtad offline (los sellos son saldo compartido entre dispositivos;
la venta encolada puede llevar cliente adjunto y el sello se aplica al subir).

### Fase 2 — Sobrevivir a la recarga (service worker)

La Fase 1 muere si la tablet se recarga sin red: la cola en sí ya está en
localStorage (sobrevive), pero **la app no carga**. Fase 2 = PWA de verdad:
un service worker que cachea el shell y el último menú conocido, para abrir
el POS sin internet en modo «solo cobrar» (menú de solo lectura + cola). El
manifest ya existe; falta el SW. Es un proyecto propio —caché del build de
Next, invalidación por deploy, y probarlo en iPad de verdad (Safari tiene sus
mañas)— y no se empieza hasta que la Fase 1 lleve semanas operando bien.

### Fase 3 — (probablemente nunca) sincronización real

Menú editable offline, varios dispositivos fusionando cambios. Ningún piloto
lo necesita. Documentado solo para decir explícitamente que **no** es el plan.

## Qué cambia en el servidor

Casi nada — esa es la gracia:

- `create_ticket`: **sin cambios**. La idempotencia ya está.
- `p_captured_at timestamptz` — HECHO (migración 29, `create_ticket` v12): el
  ticket registre la hora real de la venta y no la de la subida — el reporte
  por horas y el día de operación lo agradecen. Validado: no futuro, no más
  de 24 h atrás, dentro del turno de la caja abierta. Default null =
  compatible con todo lo existente.

## Plan de verificación (cuando se implemente)

DevTools → Network → Offline sobre el fixture de siempre: capturar 3 ventas
offline (una con descuento, una con propina); volver online → suben en orden
con folios consecutivos. Matar la pestaña a media subida y reabrir → la cola
retoma sin duplicar (verificar por `client_ref` en la base). Cambiar un
precio con cola pendiente → aparece en la lista de diferencias. Desactivar un
producto → esa venta queda «necesita revisión» y las demás pasan. Intentar el
corte con cola → bloqueado. Venta 31 → rechazada con mensaje claro.


---

## Lo que cambió al implementar (2026-08-28)

Se respetaron las cuatro decisiones del diseño. Dos precisiones que solo
aparecen al escribir el código:

- **`chargedTotal` es el total SIN propina.** Comparar contra `due`
  (total + propina) marcaba como «cambió un precio» cualquier venta con
  propina — un falso positivo que habría enseñado al cajero a ignorar el
  aviso. Lo cazó la verificación, no el diseño.
- **Los folios provisionales cuentan también los ya subidos.** Si se reusara
  P-1 tras subir el primero, dos tickets impresos distintos llevarían el
  mismo número y cuadrar sería imposible.
- **Distinguir error de RED de error de CONTENIDO** (`isNetworkError`) resultó
  ser la pieza que evita los dos desastres opuestos: reintentar en bucle algo
  que el servidor siempre rechazará (cola atorada para siempre) o mandar a
  revisión manual lo que era un bache de señal (trabajo de a gratis).

**Verificado** con el plan de arriba: 4 ventas capturadas con la red caída
subieron solas y en orden al reconectar (folios 1–4, cero duplicados por
`client_ref`, y cada una con la HORA DE SU CAPTURA, no la de la subida);
cambiar un precio con cola pendiente produjo el aviso de diferencia
(cobró $20, registró $25); una venta con la variante desactivada quedó en
«necesita revisión» con el motivo del servidor y sin frenar a las demás; y el
corte quedó bloqueado con los dos botones deshabilitados y su explicación.
