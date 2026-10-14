# Cafecito POS — guía para arrancar una sesión

Punto de venta para cafeterías pequeñas, multi-cafetería, en producción en
https://cafecitopos.com (Vercel, despliega cada merge a `main`) con Supabase
(proyecto `pavcbvkwypdiwaaishjt`, us-west-2; Vercel fijado en `pdx1`). Todo
el producto, los comentarios, los commits y las pruebas están **en español**.
Los usuarios reales son dueños de cafetería que cobran con el teléfono en
plena fila: cada decisión de UI se mide en toques y segundos.

Este archivo es el punto de entrada para CUALQUIER sesión nueva: qué es el
sistema, cómo funciona, dónde vive, cómo se despliega, cómo se opera y qué
reglas puso el usuario. Lo que no cabe aquí tiene su archivo (tabla de abajo)
y los ids, fechas y estado del momento viven en la memoria del asistente.

## Dónde leer más (en este orden, solo lo que haga falta)

| Necesito… | Leer |
|---|---|
| Esquema, lista de migraciones 01–59, cómo escribe la app, pruebas SQL, correo y respaldos | `docs/supabase/README.md` |
| Qué hace cada pantalla y cada regla, en palabras del usuario | `app/ayuda/ayuda-client.tsx` (guía `/ayuda`; es la fuente de verdad funcional) |
| Qué puede hacer cada rol (reglas reales del servidor) | `app/admin/equipo/role-legend.tsx` |
| Índice del buscador del panel (Ctrl+K) | `lib/admin-search.ts` |
| Diseño de la cola sin internet | `docs/cola-sin-internet.md` |
| Diseño del inventario (insumos + reventa), fases 2 y 3 pendientes | `docs/inventario.md` |
| Qué deja rastro y dónde, los avisos, y cómo reconstruir un día con los registros | `docs/registros.md` |
| Pedido por voz en el mostrador (prototipo con OpenAI Realtime): diseño, reglas y lo que enseñaron las pruebas | `docs/voz-mostrador.md` |
| Historial de fases, decisiones con el usuario, gotchas, estado y pendientes | memoria del asistente (`MEMORY.md` → `estado-actual.md`) |

No hace falta leer el POS entero para tocar una pieza: `docs/supabase/README.md`
sección D describe qué archivo hace qué.

## Cómo funciona el producto (vista general)

**Quiénes.** Tres niveles de gente, derivados SIEMPRE de la sesión, nunca del
cliente:

- **Operador de la plataforma** (`profiles.is_platform_admin`, una sola
  cuenta: el usuario de este repo). Entra a `/super`: lista de cafeterías,
  alta/suspensión/borrado, «entrar como dueño», errores y avisos agrupados,
  resumen semanal a mano.
- **Dueño / administrador** (`business_members.role` = `owner` | `admin`).
  Panel `/admin`: resumen, productos, categorías, modificadores, promociones,
  lealtad, existencias, gastos, ventas, cortes, por cobrar (fiados), análisis,
  equipo, actividad (bitácora), negocio (ajustes). Cobra también desde `/pos`.
- **Cajero** (`cajero`). Solo `/pos`. Entra con **usuario + contraseña** (el
  usuario es único por cafetería; por debajo es un correo sintético
  `usuario@slug.<SYNTHETIC_EMAIL_DOMAIN>` que nunca se muestra). Los dueños
  entran con correo real.

Una persona puede pertenecer a varias cafeterías (`profiles.active_business_id`
+ selector `/seleccionar-negocio`).

**Zonas de la app.** `/` portada pública (landing); `/login`; `/registro`
auto-registro con prueba gratis de 7 días (`/registro/confirmar` es un Route
Handler que valida el correo); `/pos`; `/admin/*`; `/super`; `/ayuda` guía
pública con interruptor Celular · Tablet · Computadora; `/menu/[slug]` menú
público (QR) si el café lo enciende; `/t/...` recibo público; `/cuenta`
(mi contraseña y PIN); `/olvide-contrasena` + `/restablecer`; `/suspendido`.
El `middleware.ts` solo comprueba que haya sesión (firma del JWT, sin viaje a
la base); los permisos por rol los aplica el layout de cada zona.

**Una venta, de punta a punta.** El POS carga menú + favoritos + cuentas
abiertas + existencias (`app/pos/page.tsx`, todo en un `Promise.all` que
además hace el barrido de cajas olvidadas). Para cobrar hace falta **caja
abierta** (`cash_sessions`, una por negocio, con fondo inicial). El carrito
vive en el cliente (`cart.ts`); el cliente manda `variant_id`, cantidad,
extras, descuento, propina, método de pago y un `client_ref`; **`create_ticket`
(RPC) recalcula todo**, toma el folio de `business_counters`, descuenta
existencias y guarda ticket + renglones + extras en una transacción. Sin
señal, la venta entra a la **cola sin internet** (`queue.ts`, localStorage) y
sube sola al volver la red, idempotente por `client_ref`. Cancelar
(`cancel_ticket`) y corregir (`correct_ticket`, nace un ticket nuevo) son las
únicas «bajas». El **corte** (`close_cash_session`) compara efectivo esperado
contra contado; si nadie corta, el barrido cierra la caja sola tras el
horario del café (`closing_time` + gracia) y el POS lo avisa.

**Cuentas abiertas** (`parked_orders`, módulo `parked_orders`): mesas o
nombres con carrito guardado en el servidor, con sello `updated_at` de
versión; el POS las sondea cada 10 s (30 s en celular) y **reconcilia** la
lista (`reconciliarLista`), nunca la pisa. Un choque de versión con contenido
idéntico es falso y se reintenta; uno real guarda la ronda aparte como
«Nombre (2)». «Separar la cuenta» reparte piezas en dos ventas (no hay pago
mixto a propósito).

**Módulos por cafetería** (`businesses.settings`, saneado en `lib/settings.ts`):
candado del POS por inactividad con PIN (`lock_minutes`), cuentas abiertas,
fiados (`credit`: `credit_customers` + abonos en `credit_payments`, se cobran
en `/admin/por-cobrar`), lealtad (`loyalty`: sellos y
recompensa), renglones fuera de menú (`custom_items`), menú público
(`public_menu` + nota al pie), recibo público, impresión automática y ancho
del rollo, para llevar (`takeout_fee`), comisión de tarjeta, metas diaria y
mensual, tope de descuento del cajero, horario de cierre, correo semanal,
pantalla de cocina (`/pos/preparar`, con sondeo configurable). Promociones y
gastos son pantallas propias con sus tablas. Inventario: `supplies` (insumos
con unidad) y `stock_items`/`stock_movements` (diario con `seq`), se descuenta
en la venta y se ajusta desde `/admin/existencias` o el ⋮ del POS.

**Lo que corre solo.** Dos crons de Vercel (`vercel.json`, con `CRON_SECRET`):
`/api/pruebas` todos los días a las 10:00 UTC = 04:00 CDMX (avisa a quien
termina su prueba, suspende las vencidas salvo que tengan caja abierta, cierra
cajas olvidadas y manda el **correo de errores y avisos** del día al
operador) y `/api/resumen-semanal` los lunes 14:00 UTC (resumen por correo a
cada café que lo tenga encendido). Respaldo diario de la base por GitHub
Actions (`backup.yml`, 09:00 UTC).

**Errores y avisos.** El cliente y las actions reportan por el RPC
`report_error` (anti-tormenta 300/h) a `app_errors`; `/super` los agrupa y el
cron los manda por correo. Por el mismo canal van los **avisos** que no
revientan pero delatan algo (`lib/avisos.ts`: `cuenta-choque`,
`cuenta-choque-falso`, `cuenta-copia`, `sondeo-lento`, `cola-subida`,
`cola-revision`). `audit_events` es la bitácora de negocio (menú, equipo,
caja, cancelaciones) que ve `/admin/actividad`. Para reconstruir un incidente,
`docs/registros.md`.

**Pedido por voz (prototipo), dos modos.** *Cajero* (`/pos/voz`): un aparato
en el mostrador donde el cliente pide hablando con un bot (OpenAI Realtime por
WebRTC). *Ayudante* (micrófono en el encabezado del POS): el cajero dicta y
entra directo a su carrito, sin que el bot hable. El bot usa
códigos cortos que `app/pos/voz/pedido.ts` valida contra el menú real; el
pedido se guarda como cuenta abierta «Nombre (voz)» y la cajera lo cobra. La
app, no el modelo, decide cuándo se puede confirmar (`validarConfirmacion`).
Solo existe donde `VOZ_CAFES` lo nombra y hay `OPENAI_API_KEY`; `/pos` y
`/pos/voz` son las únicas rutas que abren el micrófono (`Permissions-Policy` en
`next.config.mjs`).

**Arranque instantáneo del POS.** `public/sw-pos.js` + `lib/arranque-rapido.ts`:
service worker con alcance `/pos` que guarda la página y sus chunks; la
segunda apertura la responde el worker y luego se refresca. Los POST de las
actions NO se interceptan. Al tocar `sw-pos.js` hay que subir el número del
nombre del guardado (`pos-shell-vN`). `lib/version.ts` lleva el sello del
build (= commit) para que las pestañas viejas se recarguen tras un deploy.

## Infraestructura y cuentas

- **GitHub**: `coderalexis/cafeteria-web-design` (repo **público**: por eso
  nunca entran correos, claves ni datos de personas). Rama `main` = producción.
  Workflows: `ci.yml` (en `push` a `main` y en `pull_request`) y `backup.yml`.
  Secrets del repo: `SUPABASE_DB_URL` (cadena «Session pooler») y
  `BACKUP_PASSPHRASE`; restaurar un respaldo está en el README de Supabase §E.
- **Vercel**: integración GitHub, **cada push a `main` despliega producción**
  (no hay carpeta `.vercel` ni deploy manual). Funciones fijadas en `pdx1`
  (Portland, junto a us-west-2): si Supabase cambiara de región hay que mover
  esto también o vuelven los 504 del login. Dominio `cafecitopos.com`; URL de
  control y de emergencia `cafeteria-web-design.vercel.app` (misma app, DNS
  de Vercel). Variables de entorno (valores solo en Vercel y en `.env.local`,
  plantilla en `docs/supabase/env.example.txt`): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SYNTHETIC_EMAIL_DOMAIN`, `RESEND_API_KEY`, `CRON_SECRET`, `OPERATOR_EMAIL`
  (a quién llegan el aviso de café nuevo y el correo de errores),
  `NEXT_PUBLIC_SITE_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (fija la sal de
  las server actions entre builds), `OPENAI_API_KEY` + `VOZ_CAFES` (pedido por
  voz; hoy solo `cafe-de-prueba`) y opcional `OPENAI_REALTIME_MODEL`. `NEXT_PUBLIC_BUILD_ID` lo pone
  `next.config.mjs` desde el commit.
- **Supabase**: proyecto `pavcbvkwypdiwaaishjt` (us-west-2), Postgres con RLS
  `TO authenticated` y RPCs `SECURITY DEFINER`; Auth firma con ES256 (por eso
  el middleware verifica sin viajar); SMTP de Auth por **Resend**
  (`no-reply@cafecitopos.com`, plantillas en `docs/supabase/email-templates/`);
  Storage bucket público `logos`. Plan free (se pausa por inactividad y no
  tiene respaldos propios: de ahí `backup.yml`). Se opera desde el **conector
  MCP de Supabase**: `execute_sql` para ensayos y consultas, `apply_migration`
  para migraciones (nombre `pX_nombre`), `query_logs` para registros
  (fuentes `edge_logs`, `postgrest_logs`, `auth_logs`, `auth_audit_logs`;
  ventana de 24 h por consulta; CDMX = UTC−6), `get_advisors` para el linter.
  Pendientes del usuario en el panel: apagar `pg_graphql`, activar la
  protección de contraseñas filtradas, Supabase Pro antes de más cafés reales.
- **DNS**: `cafecitopos.com` en Cloudflare en nube gris (solo resuelve; el
  tráfico va directo a Vercel). Supabase sí va detrás de Cloudflare.
- **Cafeterías**: dos pilotos reales (una en iPhone con la app instalada en
  pantalla de inicio; la del usuario), el café base/demo del operador
  (`el-cafecito`), la plantilla `plantilla-cafeteria` y el café de pruebas
  `cafe-de-prueba`. Los ids están en la memoria (`estado-actual.md`).

## Stack y comandos

Next.js 15.5 App Router, React 19, TypeScript, Tailwind, shadcn/ui, sonner,
framer-motion, Vitest. Supabase con RLS `TO authenticated` y RPCs
`SECURITY DEFINER` que derivan el negocio de `member_ctx()`.

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build   # lo mismo que el CI
```

`pnpm test:sql` necesita `DATABASE_URL` y Docker; en esta máquina no arranca,
así que la suite SQL se itera abriendo un PR (corre en `pull_request`).
`pnpm types:check` / `types:write` generan los tipos contra una base
(`scripts/verificar-tipos.mjs`, usa el CLI de Supabase y la imagen
`postgres-meta`). Servidores de prueba en `.claude/launch.json`: `dev` (3000)
y `prod` (`next start -p 3999`, necesario para el service worker); se
levantan con `preview_start`, nunca con Bash. **Nunca `pnpm build` con
`next dev` levantado** (los dos escriben `.next/`).

**CI (`.github/workflows/ci.yml`)**, dos jobs: `check` (tsc, lint, Vitest,
build con claves dummy) y `sql` (Postgres 17 recién nacido + shim + las 59
migraciones en orden + `tests/sql/t_*.sql`, y después el paso **«Tipos al
día»**, que genera `database.types.ts` contra esa base y exige igualdad byte
a byte). Ese último paso depende de bajar la imagen `postgres-meta`: va en
caché de Actions con plan B desde Docker Hub; si aun así sale
`toomanyrequests`, se relanza el job. Un correo «Run failed: CI - main» se
lee mirando QUÉ paso falló: la suite y los tipos son pasos distintos.

## Mapa del repo

- `app/pos/` POS. `pos-client.tsx` es el estado; lo puro y probado vive en
  `cart.ts`, `queue.ts`, `parked.ts`. `public/sw-pos.js` + `lib/arranque-rapido.ts`
  es el arranque instantáneo (service worker, alcance `/pos`).
- `app/admin/` panel del dueño; `app/super/` panel del operador de la plataforma;
  `app/registro/` auto-registro con prueba de 7 días; `app/menu/[slug]` menú público;
  `app/api/` crons (`pruebas`, `resumen-semanal`) y `sesion` (la guía pregunta quién lee).
- `app/actions/` server actions (zod + `ActionResult`); `lib/` reglas puras,
  formato, fechas por zona del negocio, recibos, ajustes (`lib/settings.ts`),
  avisos (`lib/avisos.ts`), versión (`lib/version.ts`), existencias
  (`lib/existencias.ts`); `lib/supabase/` clientes `server`/`client`/`admin`
  (service role, solo servidor) y `middleware`.
- `components/` piezas compartidas (shadcn en `components/ui`); `docs/`
  diseños; `scripts/verificar-tipos.mjs`.
- `docs/supabase/NN_*.sql` migraciones, **el CI las reproduce desde cero** sobre
  `postgres:17` y luego corre `tests/sql/t_*.sql` (cada una en BEGIN/ROLLBACK).
- `tests/unit/` Vitest solo para lo puro; nada que toque la base se prueba con mocks.
- `lib/supabase/database.types.ts` tipos generados; el CI comprueba que coinciden
  con el esquema real.

## Reglas que no se negocian

- **El servidor pone los precios.** El cliente manda `variant_id`, cantidad y
  extras; `create_ticket` recalcula todo. Única excepción: renglones «fuera de
  menú» (`{custom: {name, price}}`), acotados en el RPC ($0.01–$9,999.99, sin
  extras, módulo `settings.custom_items`, marcados `is_custom`).
- **El negocio nunca viene del cliente.** Toda tabla lleva `business_id default
  current_business_id()`; toda RPC arranca con `member_ctx()`. Con `service_role`
  ese default es null: pasar `business_id` explícito.
- **Toda tabla nueva con `business_id` entra en `delete_business`** (las FK son
  `on delete restrict`; si falta, borrar una cafetería revienta).
- **Nunca sobrecargar la firma de una RPC.** PostgREST no resuelve sobrecargas:
  `drop function` de la vieja y crear la nueva. Un cambio de tipo de retorno
  también exige `drop` (no basta `create or replace`).
- **Nunca una FK nueva entre dos tablas que ya se embeben** en un `select` de
  PostgREST: la relación se vuelve ambigua y rompe consultas existentes.
- **Un valor nuevo de enum va en su propia migración** (no se puede usar en la
  misma transacción que lo crea).
- **Una migración que no se reproduzca desde cero pone el CI en rojo**: lo que
  se aplique por el conector queda completo en su archivo, tal cual.
- **Nunca bloquear una venta por existencias** (negativos permitidos; el conteo
  corrige). Un diario se ordena y se sella por `seq`, nunca por hora
  (`now()` es igual dentro de una transacción).
- Nada de contraseñas, claves ni correos personales en el repo ni en la memoria.

## Reglas que puso el usuario (operación)

- **El usuario decide cuándo se despliega.** Un PR listo se deja abierto con
  CI verde hasta que diga «súbelo»; las migraciones también se aplican solo
  con su visto bueno (una migración es un cambio de BASE, no solo de código:
  decirlo cuando pregunte).
- **Antes de desplegar, comprobar que el piloto del iPhone lleve >2 h sin
  actividad**: ventas Y toques a cuentas abiertas (puede estar anotando una
  mesa sin cobrar). Si vuelve a vender a mitad de la validación, se detiene.
  Horario de ese café: abre 7:00, cierra 21:00–22:00.
- **Nunca tocar datos de un café real sin pedirlo** (ni leerlos para
  «probar»: se consultan solo para diagnosticar lo que el usuario pidió).
- **Nunca entrar con la cuenta de un usuario real para probar nada.** Las
  pruebas van con una **cuenta temporal** en `cafe-de-prueba`, creada con
  service role, y al terminar se **limpia todo**: tickets, cajas, existencias
  y bitácora de la prueba; la cuenta se queda sin membresías y con la
  contraseña rotada (no se puede borrar de verdad: tiene FK a tickets viejos).
  Antes de cerrar caja ahí, revisar `trial_ends_at` (si venció, el cierre
  pausa el café). Cerrar la caja ANTES de quitar la membresía.
- Cuando algo falla en producción, primero reconstruir con los registros
  (`docs/registros.md`) y luego dejar suficiente rastro para que la siguiente
  vez se vea en el correo de la mañana.

## Flujo de trabajo de un cambio

1. **Entregar en partes controladas**: una función = una rama, un PR, CI verde,
   merge (= deploy). Commits en español y explicando el **porqué**, no el qué.
2. **Migración** (si hay): archivo `docs/supabase/NN_pX_nombre.sql` con un
   comentario de cabecera que cuente el problema y la decisión; **ensayo** en un
   solo `execute_sql` dentro de una transacción que termina en
   `raise exception 'ENSAYO …'` con los resultados; luego `apply_migration` con
   el nombre `pX_nombre`; entrada en `docs/supabase/README.md`; prueba
   `tests/sql/t_NN_*.sql`. Para cambiar `create_ticket` se usa el patrón de
   **parchear la definición viva** (`pg_get_functiondef` + `replace` anclado +
   `execute`, ver migraciones 40, 51 y 58): retipear la función entera es la
   forma fácil de revertir un arreglo sin darse cuenta. Una migración que crea
   funciones termina con la autocomprobación `md5(prosrc)` (ver la 59).
3. **El código que llama a una RPC nueva se fusiona DESPUÉS de aplicar la
   migración** (si no, producción rompe entre el deploy y la migración).
4. **Tipos**: si el job «Tipos al día» falla, bajar el artefacto
   `database.types.generated` del run (`gh run download <id> -R
   coderalexis/cafeteria-web-design -D <dir>`), copiarlo a
   `lib/supabase/database.types.ts`, restaurar el bloque
   `__InternalSupabase: { PostgrestVersion: "14.1" }` y commit «chore(tipos): …».
5. **Verificar**: tsc/lint/test/build, y un humo con navegador headless contra
   `dev` o `prod` (y, si tocó dinero, también contra producción) usando una
   **cuenta temporal** creada con service role en el café de prueba
   `cafe-de-prueba`, que se **borra siempre al terminar** junto con sus tickets
   y cajas. Antes de un humo que cierre caja ahí, revisar `trial_ends_at` (si
   venció, el cierre pausa el café).
6. **Al terminar una función, cerrar el círculo**: guía `/ayuda` (sección o
   viñeta), `lib/admin-search.ts`, `role-legend.tsx` si cambió un permiso,
   README de migraciones, y la memoria (`estado-actual.md`). Al cambiar un
   FLUJO, barrer la app entera buscando la instrucción vieja (textos de
   error, Equipo, guía), no solo la sección que lo motivó.
7. **Comprobar que el deploy está vivo** sin iniciar sesión: `/login` y
   `/ayuda` son públicas; bajar el CSS que referencian y buscar una regla o un
   texto que solo exista en el cambio. El sello del build no sale en el HTML.

## Cómo se investiga un incidente (resumen; detalle en `docs/registros.md`)

- `app_errors` (`/super` o SQL): errores del cliente y avisos, con `route`,
  `message`, `digest`, `user_agent`.
- `query_logs` del conector: `edge_logs` (cada petición HTTP con ruta,
  método, estado, cuerpo PATCH incluido el sello `updated_at` de
  `parked_orders`), `auth_logs`/`auth_audit_logs` (login, logout,
  `token_refreshed`, «Refresh Token Not Found»; `user_agent` «node» = server
  action). 24 h por consulta; se conservan al menos 16 días.
- `audit_events`, `tickets` (folios consecutivos: un hueco es una venta
  perdida), `account_visits` (trigger de `parked_orders`: cada cuenta creada,
  incluidas las copias «(2)»), `cash_sessions.closing_notes` (motivo de un
  cierre automático).
- `auth.sessions` / `auth.refresh_tokens` por `user_id` dicen qué sesiones
  viven. `signOut` es `{ scope: "local" }` a propósito: uno global tumbó a
  una dueña de su iPhone.

## Gotchas que ya costaron horas

- **Tailwind purga clases construidas en `lib/`**: las clases de color tienen
  que aparecer literales en un archivo que Tailwind escanee.
- **Una clase propia de `globals.css` EMPATA con las utilidades de Tailwind**
  (`.md:py-2`, `.mb-3`, `.md:inline`) y el orden de la hoja no está de
  nuestro lado: la regla propia se ignora **en silencio**. Hay que calificarla
  con el elemento (`button.sitio-atajo`, `span.oculto-si-bajo`). Ya vive ahí:
  `sitio-atajo` (hueco para el atajo, solo `pointer:fine`), `blanco-comodo`
  (44 px con `pointer:coarse`) y `compacto-si-bajo`/`oculto-si-bajo`/
  `una-fila-si-bajo` (`max-height:700px`).
- **Los cortes de Tailwind solo miran el ANCHO**, así que trataban una tablet
  de 10.4" acostada (1000×600) como a un monitor: `md:` encogía los blancos
  justo donde se toca con el dedo. Lo que depende de cómo se toca va por
  `(pointer: coarse|fine)`, y lo que depende del alto por `max-height`.
  Medidas de referencia: 10.4" = 1000×600 / 600×1000; iPad = 1180×820 /
  810×1080. Ojo: `useIsMobile` es `ancho<768 || alto<500`, así que una tablet
  **cambia de POS al rotar**.
- `menu_categories.color` guarda NOMBRES (`amber`, `sky`…) de
  `lib/category-colors.ts`, no hex.
- `log_audit` exige admin: las bitácoras del lado del cajero se insertan
  directo en `audit_events` dentro del RPC.
- RLS en las pruebas SQL: la cajera solo ve sus tickets y solo los admins leen
  `audit_events`; las sumas se afirman como dueño o como `postgres`.
- JSX: comillas dobles literales rompen `react/no-unescaped-entities`
  (`&quot;`). La sangría de las listas de la guía varía (10 o 12 espacios).
- **Un salto de línea entre texto y una expresión `{…}` NO deja espacio**
  (entre dos textos, sí). Al cambiar palabras por expresiones en `/ayuda`
  salieron «al hacer clic enCobrar» y «un segundoclic»; hace falta `{" "}`
  explícito. No lo caza tsc, ni lint, ni una prueba: la única forma de verlo
  es **renderizar y leer el texto resultante**.
- Herramientas de edición: `\uXXXX` y `\\` se convierten al escribir; para
  BOM o escapes en JS usar `String.fromCharCode`. Scripts largos se escriben
  con Write, no con heredocs (se truncan ~6 KB). En el bash de esta máquina
  **no existe `jq`**: un monitor con `jq` gira en silencio para siempre;
  esperar con `until gh pr checks N | grep -qE '^check[[:space:]]+(pass|fail)'`.
- **En el pane del navegador no hay pintado**, y de ahí salen dos falsos
  negativos: `requestAnimationFrame` no corre (el desplazamiento *suave* se
  queda quieto: medir con `scrollBehavior = "auto"`) y **desplazarse por script
  NO dispara el evento `scroll`** (mueve `scrollY` y nada más). Lo que reaccione
  al desplazamiento se prueba lanzando el evento a mano
  (`window.dispatchEvent(new Event("scroll"))`): el manejador lee `scrollY`, así
  que se ejercita la lógica de verdad. Más trampas del pane: los menús y
  diálogos de Radix cerrados **no se desmontan** (filtrar por
  `data-state=open`); el ⋮ del POS se abre fiable con foco + Enter; `/pos`
  llega del service worker y se refresca solo después; los diálogos se miden
  a escala 0.95; `resize_window` con medidas propias NO emula puntero grueso
  (solo el preset `mobile`, y tras cambiar hay que recargar); las capturas no
  sirven para juzgar layout, se mide con JS.
- Humo headless en Windows: `--user-data-dir` con ruta CORTA, `Browser.close`
  por CDP antes de matar Chrome, puerto de depuración aleatorio, portales de
  Radix al final del DOM, IntersectionObserver no dispara con el panel oculto.
- Service worker: nunca reenviar `event.request` de una navegación (falla en
  arranque en frío); un `postMessage` a una página recién nacida se pierde,
  por eso la página pregunta «¿estado?» al ver la marca en el HTML.
- **Diálogos y listas en celular**: el diálogo base ya acota su alto
  (`max-h-dialogo`, con reserva `vh` para Safari anterior a iOS 16.4) y se
  desplaza solo; quien traiga su propia zona desplazable pasa
  `overflow-y-hidden`. El visor de `ScrollArea` va con `flex-1 min-h-0`,
  NUNCA con `h-full`: un porcentaje contra un padre que solo tiene `max-h`
  —lo normal dentro de un diálogo— no se resuelve, el visor crece hasta su
  contenido y no queda NADA que desplazar. Así se quedó una dueña sin poder
  bajar por sus tickets ni cerrar la caja desde el iPhone.
  **Corolario:** si un diálogo lleva `overflow-y-hidden`, TODOS sus pasos
  necesitan su propia zona desplazable, no solo el que la motivó. Uno de dos
  pasos (buscar / llenar el formulario) donde solo el buscador desplaza recorta
  el formulario **en silencio** y deja el botón de guardar fuera de la
  pantalla. Se ve con el teléfono ACOSTADO (812×375) o en la tablet de 10.4"
  (1000×600), nunca con el celular de pie. El patrón bueno: cuerpo con
  `flex-1 min-h-0 overflow-y-auto` y el `DialogFooter` FUERA de él, para que
  los botones no se vayan con el desplazamiento.
- **Deploy con pestañas abiertas**: una server action que revalida devuelve
  el árbol de la página del build nuevo y la pestaña vieja truena con
  «reading 'call'»; y si Vercel no reutilizó la caché de build, la sal de las
  acciones rota y TODAS dan 404 («Failed to find Server Action»). `lib/version.ts`
  cubre ambos; el sello del build tiene que ser determinista (commit), porque
  `next.config.mjs` se evalúa varias veces por build.
- **Un sondeo que sobreescribe estado puede deshacer una escritura ya
  confirmada** cuando la red va lenta: la respuesta del sondeo (vieja) llega
  DESPUÉS de la respuesta del guardado (nueva) y la pisa. En las cuentas
  abiertas eso dejaba el sello de versión viejo y cada guardado «chocaba»
  contra el guardado anterior del mismo teléfono (Gym Coffe, 2026-09-14: 26
  choques y 8 copias «Mesa 2 (2)» en dos minutos). Regla: lo que llega de un
  sondeo se RECONCILIA por versión (`reconciliarLista`), nunca se aplica a
  ciegas; y un choque cuyo contenido en el servidor es idéntico al local es un
  choque FALSO que se reintenta con el sello del servidor (`mismoCarrito`).
- **Una server action dentro de `startTransition(async …)` que rechaza (sin
  señal, deploy a medias) tumba la pantalla ENTERA al error boundary**: React 19
  trata ese rechazo como error de render. En el POS eso es quedarse sin caja a
  media fila por anotar una merma. Dentro de una transición, la acción va
  SIEMPRE con `try/catch` y `mensajeDeFallo(e)` (`lib/version.ts`); y tras una
  acción que ya revalida la ruta, NO va `router.refresh()`: la respuesta del
  POST ya trae la página nueva y pedirla otra vez era descargarla dos veces.
- `ActionResult`: la rama de error es `{ error: string }` y `""` es falso,
  así que `if (r?.error)` NO acota para TypeScript; usar `if (!r.success)`.
  Un archivo «use server» solo exporta funciones async (una constante
  exportada rompe el build, no tsc).
- Con `pg_get_functiondef` los anclajes del `replace` son el texto exacto de la
  migración anterior: si no se encuentra, la migración debe fallar, no seguir.
  **Y lo que se pega en el conector es el archivo ENTERO, byte a byte** (nada
  de «versión sin comentarios» para ahorrar): la 58 quedó distinta en
  producción por eso. Una migración que crea funciones se autocomprueba al
  final con `md5(prosrc)` contra los cuerpos del archivo (ver la 59).
- **`Permissions-Policy` es del DOCUMENTO, no de la pantalla.** El sitio
  prohíbe micrófono y cámara, y `/pos/voz` abre el micrófono por cabecera. Pero
  un `<Link>` de Next cambia de pantalla sin cargar documento nuevo: quien
  entraba desde el ⋮ del POS seguía con la cabecera de `/pos` y el navegador
  negaba el micrófono SIN PREGUNTAR (el usuario, 2026-10-14: «solo funciona si
  recargo»). A una pantalla que necesita un permiso distinto se entra con `<a>`
  normal, y la pantalla se protege recargándose si el documento nació en otra
  ruta (`performance.getEntriesByType("navigation")[0].name`; ver
  `app/pos/voz/microfono.ts`). Se reproduce con Chrome headless y
  `--use-fake-device-for-media-stream` sin sustituir `getUserMedia`.
- **La suite SQL reproduce las migraciones sobre un Postgres pelón**, así que una
  migración que toque un esquema que Supabase trae puesto (`auth`, `storage`…)
  pone el CI en rojo hasta que `tests/sql/00_supabase_shim.sql` finja ese esquema.
  Ya finge `auth` (users, uid/role/jwt) y `storage` (buckets, objects, foldername).

## Estado al 2026-10-14 y pendientes

- Producción = `main` hasta el PR #77 (pedido por voz, encendido solo en
  `cafe-de-prueba`); migraciones aplicadas hasta la **59**
  (`p45_insumos_ajustes`). Inventario Fase 1 vivo (insumos + reventa); cuentas
  abiertas con reconciliación de sellos; avisos silenciosos en el correo de
  la mañana; CI con la imagen `postgres-meta` en caché.
- Siguiente, cuando el usuario lo pida: inventario Fase 2 (conteo en una
  pantalla, «se está acabando» en Resumen y correo semanal, «agotado» en el
  menú público) y Fase 3 (lista de compras, «lo pagué de la caja», mermas en
  pesos). Plan en `docs/inventario.md`.
- Del lado del usuario (paneles, no código): Supabase Pro antes de más cafés
  reales, apagar `pg_graphql`, protección de contraseñas filtradas, Redirect
  URL `/registro/confirmar` y plantilla «Confirm signup» en Supabase Auth,
  probar el service worker en un iPhone real.
- El detalle de cada fase, los ids de los cafés y las decisiones tomadas con
  el usuario están en la memoria del asistente (`estado-actual.md`).
