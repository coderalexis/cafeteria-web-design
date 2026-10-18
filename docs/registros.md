# Registros: qué deja rastro, dónde, y cómo investigar un día

> Escrito el 2026-09-30 después de reconstruir lo que le pasó a Diana el
> domingo 14 de septiembre. Nadie se enteró en dos semanas porque **nada
> reventó**: fueron 26 choques silenciosos al guardar una cuenta y ocho copias
> «Mesa 2 (2)». Este documento dice qué registra cada proceso hoy, qué se
> agregó ese día, y con qué consulta se reconstruye una jornada.

## Los cuatro lugares donde queda rastro

| Dónde | Qué guarda | Cuánto dura | Quién lo lee |
|---|---|---|---|
| `app_errors` (tabla) | Pantallas que truenan (error boundaries) **y, desde el PR #75, los avisos**: choques al guardar cuentas, copias «(2)», ventas que subieron tarde desde la cola, ventas que no pudieron subir, sondeos sin respuesta | `ERRORES_DIAS` (limpieza en `report_error`) | `/super` (agrupado) y el **correo de la mañana** al operador si hubo algo en 24 h |
| `audit_events` (tabla) | Lo que hace la gente con intención: cancelaciones, cambios de menú, abonos de fiado, existencias | Para siempre | Panel del dueño (bitácora), consultas a mano |
| `tickets`, `cash_sessions`, `parked_orders`, `stock_movements` | El negocio en sí. Las cuentas abiertas se borran al cobrarse; su alta queda en `account_visits` (trigger `parked_orders_record_visit`) | Para siempre (las cuentas, hasta que se cobran) | Reportes, corte, consultas a mano |
| Registros de Supabase (`query_logs`) | **Cada petición HTTP** al API: ruta, método, código, milisegundos, agente, y el query string (con los sellos de versión de `updated_at` incluidos); auth (`auth_logs`); Postgres | Al menos 16 días (comprobado: el 30 de septiembre se leyó el 14) | Solo a mano, por consulta; ventana de 24 h por consulta |

Lo que **no** queda en ningún lado: lo que el POS decidió sin ir al servidor
(un botón que no respondió, un aviso que se cerró). Por eso los avisos: cada
vez que el POS toma un camino raro, lo dice.

## Los avisos (`lib/avisos.ts`)

Van por el mismo canal que los errores, con `digest` = la clase, para que
`/super` y el correo los agrupen:

| `digest` | Cuándo | Quién lo manda |
|---|---|---|
| `cuenta-choque` | `updateParked` no afectó filas: el sello iba viejo. Dice cuántos segundos de desfase | Servidor (`app/actions/parked.ts`) |
| `cuenta-choque-falso` | El servidor tenía lo mismo que el POS y solo el sello iba viejo; se reintentó | POS (`use-parked-orders.ts`) |
| `cuenta-copia` | El choque fue de verdad y la ronda se guardó como «Mesa 2 (2)» | POS (`pos-client.tsx`) |
| `sondeo-lento` | El sondeo de cuentas lleva más de 15 s sin contestar | POS (`use-parked-orders.ts`) |
| `cola-subida` | Una venta guardada sin internet subió, y cuántos minutos esperó | POS (`use-offline-queue.ts`) |
| `cola-revision` | Una venta en cola que el servidor rechazó (lo grave) | POS (`use-offline-queue.ts`) |

Cómo se leería el 14 de septiembre con esto puesto: el correo de esa mañana
habría dicho «26× · Gym Coffe · Cuenta «Mesa 2»: el sello iba viejo (1938 s
de desfase)» y «8× · Cuenta «Mesa 2»: chocó al sumarle y se guardó como copia».
Una racha con el **mismo** desfase es el propio sello viejo del aparato; un
choque suelto con desfase corto es otro aparato de verdad.

El RPC `report_error` tiene freno: 300 renglones por hora en total. Un aviso
repetido nunca tira nada; si un día se llega al tope, lo que se pierde son
avisos, no ventas.

## Cómo reconstruir un día (la receta del 14 de septiembre)

1. **Encontrar la caja**: `cash_sessions` por negocio y fecha (`opened_at at
   time zone 'America/Mexico_City'`); de ahí salen los tickets del turno.
2. **Los tickets** de esa sesión con sus renglones: si los folios son
   consecutivos, no se perdió ninguna venta (el folio se toma dentro de la
   transacción).
3. **Las cuentas**: `account_visits` del día (nombre y hora de cada alta). Un
   mismo nombre repetido en segundos es una copia «(2)» o un botón tocado
   varias veces.
4. **`app_errors`** del día: errores y avisos.
5. **Los registros del servidor**, en ventanas de hasta 24 h (CDMX = UTC−6):

   ```sql
   -- todo lo que tocó las cuentas abiertas, con el sello que mandó el POS
   select timestamp, log_attributes['request.method'] as metodo,
          log_attributes['response.status_code'] as status,
          replaceAll(log_attributes['request.search'], '%3A', ':') as query
   from logs
   where source = 'edge_logs'
     and log_attributes['request.path'] = '/rest/v1/parked_orders'
   order by timestamp
   ```

   Un `PATCH` seguido de un `GET ?select=cart,updated_at` es un choque (el
   guardado no afectó filas y el servidor leyó lo que sí había). Si el
   `updated_at=eq.…` del `PATCH` es siempre el mismo y coincide con lo que
   devolvió el `GET` de la lista anterior, es el sello viejo del propio
   aparato, no otro aparato.

6. **Sesiones**: `auth_logs` con `refresh_token_not_found` dice qué sesión
   murió y de quién (`auth_audit_logs` trae el usuario). Ojo: en el 14 la que
   murió era la del operador, no la de Diana.

## ¿Siguió usando la app? Aperturas y pantallas de error (la receta del 16 de octubre)

1. **Cada apertura**: `auth.refresh_tokens` por `user_id` y día. Con la app
   cerrada más de una hora, abrirla renueva la sesión: muchas renovaciones en
   un día son la app abierta toda la jornada; una sola, un vistazo.
2. **Qué hizo en cada apertura**: `edge_logs` de la persona
   (`log_attributes['request.sb.jwt.authorization.payload.subject']`). Un
   armado del POS es la tanda `menu_categories`, `menu_products`,
   `top_variants`, `tickets`…; el sondeo de cuentas es `my_context` +
   `GET /rest/v1/parked_orders` (cada 30 s en celular mientras la app está a
   la vista); `tickets` + `business_members` es el Resumen del panel. Si
   después de un error no hay sondeos, nadie siguió en esa pantalla.
3. **Errores**: `app_errors` del negocio. El error de versión vieja en el
   iPhone llega como «undefined is not an object (evaluating 'e[o].call')».
4. **Deploys**: `gh pr list --state merged --json number,mergedAt`. Ese error
   cae en la primera apertura después de uno.

Hasta `continuarConCookies` (`lib/supabase/middleware.ts`), cada apertura con
la sesión vencida dejaba DOS armados del POS seguidos, el segundo pegado al
primer sondeo de cuentas: la acción traía la página entera. Si eso vuelve a
verse, algo volvió a mandar cookies por `x-middleware-set-cookie`.

## Lo que sigue faltando (y por qué no se hizo hoy)

- **Un aviso cuando una server action falla sin señal** (`mensajeDeFallo`):
  no se puede reportar sin red, y reportarlo después exigiría una cola aparte.
  Se ve indirectamente: los reintentos aparecen en los registros del servidor.
- **Alertas en tiempo real** (un mensaje al operador en el momento): con dos
  cafés, el correo de la mañana alcanza; una alerta cada vez que algo chocara
  sería ruido.
