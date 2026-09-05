# Cafecito POS — guía para arrancar una sesión

Punto de venta para cafeterías pequeñas, multi-cafetería, en producción en
https://cafecitopos.com (Vercel, despliega cada merge a `main`) con Supabase
(proyecto `pavcbvkwypdiwaaishjt`, us-west-2; Vercel fijado en `pdx1`). Todo
el producto, los comentarios, los commits y las pruebas están **en español**.
Los usuarios reales son dueños de cafetería que cobran con el teléfono en
plena fila: cada decisión de UI se mide en toques y segundos.

## Dónde leer más (en este orden, solo lo que haga falta)

| Necesito… | Leer |
|---|---|
| Esquema, lista de migraciones 01–51, cómo escribe la app, pruebas SQL | `docs/supabase/README.md` |
| Qué hace cada pantalla y cada regla, en palabras del usuario | `app/ayuda/ayuda-client.tsx` (guía `/ayuda`; es la fuente de verdad funcional) |
| Qué puede hacer cada rol (reglas reales del servidor) | `app/admin/equipo/role-legend.tsx` |
| Índice del buscador del panel (Ctrl+K) | `lib/admin-search.ts` |
| Diseño de la cola sin internet | `docs/cola-sin-internet.md` |
| Historial de fases, decisiones con el usuario, gotchas, estado y pendientes | memoria del asistente (`MEMORY.md` → `estado-actual.md`) |

No hace falta leer el POS entero para tocar una pieza: `docs/supabase/README.md`
sección D describe qué archivo hace qué.

## Stack y comandos

Next.js 15.5 App Router, React 19, TypeScript, Tailwind, shadcn/ui, sonner,
framer-motion, Vitest. Supabase con RLS `TO authenticated` y RPCs
`SECURITY DEFINER` que derivan el negocio de `member_ctx()`.

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build   # lo mismo que el CI
```

`pnpm test:sql` necesita `DATABASE_URL` y Docker; en esta máquina no arranca,
así que la suite SQL se itera abriendo un PR (corre en `pull_request`).
Servidores de prueba en `.claude/launch.json`: `dev` (3000) y `prod`
(`next start -p 3999`, necesario para el service worker).

## Mapa del repo

- `app/pos/` POS. `pos-client.tsx` es el estado; lo puro y probado vive en
  `cart.ts`, `queue.ts`, `parked.ts`. `public/sw-pos.js` + `lib/arranque-rapido.ts`
  es el arranque instantáneo (service worker, alcance `/pos`).
- `app/admin/` panel del dueño; `app/super/` panel del operador de la plataforma;
  `app/registro/` auto-registro con prueba de 7 días; `app/menu/[slug]` menú público.
- `app/actions/` server actions (zod + `ActionResult`); `lib/` reglas puras,
  formato, fechas por zona del negocio, recibos, ajustes (`lib/settings.ts`).
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
- Nada de contraseñas, claves ni correos personales en el repo ni en la memoria.

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
   `execute`, ver migraciones 40 y 51): retipear la función entera es la forma
   fácil de revertir un arreglo sin darse cuenta.
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
   README de migraciones, y la memoria (`estado-actual.md`).

## Gotchas que ya costaron horas

- **Tailwind purga clases construidas en `lib/`**: las clases de color tienen
  que aparecer literales en un archivo que Tailwind escanee.
- `menu_categories.color` guarda NOMBRES (`amber`, `sky`…) de
  `lib/category-colors.ts`, no hex.
- `log_audit` exige admin: las bitácoras del lado del cajero se insertan
  directo en `audit_events` dentro del RPC.
- RLS en las pruebas SQL: la cajera solo ve sus tickets y solo los admins leen
  `audit_events`; las sumas se afirman como dueño o como `postgres`.
- JSX: comillas dobles literales rompen `react/no-unescaped-entities`
  (`&quot;`). La sangría de las listas de la guía varía (10 o 12 espacios).
- Herramientas de edición: `\uXXXX` y `\\` se convierten al escribir; para
  BOM o escapes en JS usar `String.fromCharCode`. Scripts largos se escriben
  con Write, no con heredocs (se truncan ~6 KB).
- Humo headless en Windows: `--user-data-dir` con ruta CORTA, `Browser.close`
  por CDP antes de matar Chrome, puerto de depuración aleatorio, portales de
  Radix al final del DOM, IntersectionObserver no dispara con el panel oculto.
- Service worker: nunca reenviar `event.request` de una navegación (falla en
  arranque en frío); un `postMessage` a una página recién nacida se pierde,
  por eso la página pregunta «¿estado?» al ver la marca en el HTML.
- Con `pg_get_functiondef` los anclajes del `replace` son el texto exacto de la
  migración anterior: si no se encuentra, la migración debe fallar, no seguir.
