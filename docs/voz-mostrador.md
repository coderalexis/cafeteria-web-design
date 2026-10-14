# Pedido por voz en el mostrador (prototipo, opción A)

Un celular o tablet junto a la caja. El cliente toca **Hacer mi pedido**, habla
con un cajero virtual que pregunta lo que falta y le confirma el total, y el
pedido llega a la **bandeja de cuentas abiertas** como «Juan (voz)», con la
nota «Pedido tomado por voz». La cajera lo revisa, lo prepara y lo cobra como
cualquier otra cuenta. **La voz nunca cobra ni pone precios.**

Se eligió el mostrador (A) antes que la mesa por QR (B) porque usa la sesión
del POS que ya existe: no abre nada al público. B reutiliza el bot, sus
herramientas y la validación; lo nuevo sería el acceso público y sus topes.

## Cómo funciona

```
[POS /pos/voz] --iniciarSesionVoz()--> [servidor] --client_secrets--> [OpenAI]
      |                                    (clave real, menú, herramientas)
      |<-------- clave temporal + menú ----------|
      |
      |==== WebRTC (audio + canal "oai-events") ====> [OpenAI Realtime]
      |   el bot llama herramientas -> el NAVEGADOR las ejecuta contra
      |   app/pos/voz/pedido.ts y le devuelve el resultado
      |
      `-- confirmar_pedido -> parkOrder() -> cuenta abierta «Nombre (voz)»
```

- **`app/actions/voz.ts`** pide a OpenAI una clave temporal (5 min) con las
  instrucciones, el menú y las herramientas **fijados en el servidor**. La
  clave de la cuenta nunca sale del servidor, y una pestaña no puede cambiarle
  el menú ni las reglas al bot.
- **`app/pos/voz/pedido.ts`** (puro, `tests/unit/voz-pedido.test.ts`): el
  motor. El bot habla con **códigos cortos** (`p12`, `e3`), no con UUID: son
  más baratos y más difíciles de copiar mal. Cada herramienta se valida contra
  el menú real con las MISMAS reglas que la hoja de extras del POS (tamaño
  obligatorio si hay varios, extras de un grupo del producto, máximo por
  grupo, opción por omisión, y un grupo obligatorio sin respuesta detiene el
  alta para preguntar). Los importes que el bot dice salen de aquí.
- **`app/pos/voz/voz-client.tsx`**: la pantalla. Conecta por WebRTC, ejecuta
  las herramientas, muestra la conversación y el pedido, y cuelga sola a los
  4 min, tras 45 s sin que nadie hable, o al despedirse después de confirmar.
- **`app/pos/menu.ts`**: el armado del menú se sacó de `app/pos/page.tsx`
  para que el POS y la voz lean exactamente el mismo menú.
- El menú se lee **al iniciar cada conversación**, y la pantalla traduce los
  códigos del bot con ese mismo menú (un cambio de menú a media conversación
  no desalinea códigos).

## Decisiones que no conviene reabrir sin datos

- **El micrófono está bloqueado en todo el sitio** (`Permissions-Policy:
  microphone=()` en `next.config.mjs`). Solo `/pos/voz` lo abre, para el mismo
  sitio. Next aplica la última regla que coincide con la misma cabecera.
- **Encendido por lista, no por módulo de Negocio**: `VOZ_CAFES` (slugs). Es
  un prototipo y cada minuto cuesta; lo enciende el operador, no cada dueño.
- **Modelo por omisión `gpt-realtime-2.1-mini`** (cambiar con
  `OPENAI_REALTIME_MODEL`). Voz `marin`, reducción de ruido `far_field` (el
  cliente habla a medio metro), turnos por `semantic_vad`. La transcripción
  (`gpt-4o-mini-transcribe`) es solo para la pantalla; el modelo escucha el
  audio directo.
- **El total que dice el bot es antes de promociones y del cargo para llevar**:
  el que vale es el que cobra la caja (`create_ticket`).

## Lo que enseñó el cliente simulado (2026-10-12)

Se probó con un «cliente» automático: Chrome sin pantalla con el micrófono
sustituido por audio grabado con la voz de Windows (es-MX), que lee lo que
contesta el bot y responde según lo que pregunta. Cinco casos: pedido completo,
sin tamaño, corrección («mejor nada más un capuchino»), producto que no existe
y cliente que se arrepiente. Dos fallos del bot salieron ahí y los arregla la
APP, no las instrucciones, porque el modelo no siempre las obedece:

1. **Dijo «ya quité un cappuccino» sin quitarlo**, y se guardaron dos. Ahora
   `confirmar_pedido` se niega si el pedido cambió desde la última vez que se
   leyó con `ver_pedido`: lo que se guarda es exactamente lo que el cliente
   oyó leer. Y `quitar_producto` acepta el código del producto, sin consultar
   antes el número de renglón (el paso que el modelo se saltaba).
2. **Preguntó el nombre y en la misma respuesta guardó a nombre de «cliente».**
   Ahora no se confirma en una respuesta que trae una pregunta, el cliente
   tiene que haber hablado después de la lectura, y se rechazan nombres
   genéricos («cliente», «sin nombre»…). Las reglas viven en
   `validarConfirmacion` (pura, con pruebas).

Además: en el menú del café de prueba «Frio» es un TAMAÑO (Chico / Grande /
Frio) y el bot lo tomaba por temperatura; se le dice explícitamente. Y una
respuesta de una sola sílaba («Ana.») puede no registrarse como turno con
reducción de ruido `far_field`; «Sí, a nombre de Ana» sí.

Con eso, en las rondas finales los pedidos completos, sin tamaño, con
corrección y con producto inexistente se guardaron con los renglones y el
total exactos, y el arrepentido no guardó nada. El bot responde en 0.4–2 s
(lo lento es cuando consulta el menú) y una conversación completa dura de 55
a 75 s, con un tope estimado de US$0.04–0.12.

Pendiente de pulir: todavía anuncia a veces lo que va a hacer («déjame
revisar tu pedido»), lo que suma un turno de ~2 s.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `OPENAI_API_KEY` | Clave de la cuenta de OpenAI. Solo servidor. Sin ella, la voz está apagada. |
| `VOZ_CAFES` | Slugs separados por coma donde se enciende, p. ej. `cafe-de-prueba`. |
| `OPENAI_REALTIME_MODEL` | Opcional; por omisión `gpt-realtime-2.1-mini`. |

## Cómo se mide

Cada conversación se guarda **en el aparato** (localStorage, últimas 30) y se
resume bajo el botón: cuántas terminaron en pedido, duración promedio,
preguntas o correcciones por pedido y un **tope estimado** de costo en
dólares (`app/pos/voz/uso.ts`: todo a tarifa de audio; la cifra real está en
el panel de uso de OpenAI). Los fallos van al canal de avisos con
`voz-sesion-fallo`, `voz-conexion`, `voz-error` y `voz-respuesta-fallo`.

Qué decidir con esos números: si ≥ 8 de 10 pedidos salen bien sin que la
cajera tenga que corregir, si la conversación dura menos que hacer la fila, y
si el costo por pedido cabe en lo que se cobraría por el módulo.

## Pendiente

- Probar con voz real en el mostrador (ruido, nombres del menú, acentos).
- Copiar el menú de un piloto al café de prueba para probar con su carta
  real (pedir permiso antes: son datos de un café real).
- Si convence: opción B (QR por mesa), con acceso público blindado y topes
  de minutos; y entonces sí guía en `/ayuda`, buscador y módulo en Negocio.
