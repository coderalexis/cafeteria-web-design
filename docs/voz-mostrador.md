# Pedido por voz en el mostrador (prototipo, opción A)

Un celular o tablet junto a la caja. El cliente toca **Hacer mi pedido**, habla
con un cajero virtual que pregunta lo que falta y le confirma el total, y el
pedido llega a la **bandeja de cuentas abiertas** como «Juan (voz)», con la
nota «Pedido tomado por voz». La cajera lo revisa, lo prepara y lo cobra como
cualquier otra cuenta. **La voz nunca cobra ni pone precios.**

Se eligió el mostrador (A) antes que la mesa por QR (B) porque usa la sesión
del POS que ya existe: no abre nada al público. B reutiliza el bot, sus
herramientas y la validación; lo nuevo sería el acceso público y sus topes.

## Los dos modos (2026-10-14, a pedido del usuario)

- **Modo cajero** (`/pos/voz`, ⋮ → «Voz: modo cajero»): el CLIENTE habla con el
  bot en un aparato del mostrador. Lo de abajo describe este modo. El usuario
  lo probó en su teléfono y su queja fue «habla demasiado»: las instrucciones
  ahora fijan una frase de menos de 10 palabras por turno y dan frases modelo
  («Va. ¿Algo más?», «¿Chico o grande?»). Medido con el cliente simulado: de
  14.1 a 7.7 palabras por turno en promedio (el 10 % más largo, de 26 a 14) y
  de 67 a ~52 s por pedido.
- **Modo ayudante** (botón de micrófono en el encabezado del POS): el CAJERO
  dicta y lo dictado entra directo a SU carrito. El bot no habla ni pregunta
  (la sesión es solo texto: `output_modalities: ["text"]`, sin audio de
  salida, que es lo caro). Lo completo entra con `addLineas` (el mismo camino
  que un toque); lo que llega sin tamaño queda como pendiente con botones de
  tamaño, y sin un extra obligatorio abre la MISMA hoja de extras que un
  toque; lo que no está en el menú se enseña como «No encontré…». Se apaga
  solo a los 20 s sin voz. Código: `use-dictado.ts`, `dictado-panel.tsx`.
  Medido: lo dictado aparece en el carrito ~1–1.6 s después de terminar de
  hablar; una sesión de ~40 s cuesta un tope estimado de US$0.03–0.06.

Lo que comparten: el motor (`resolver` en `pedido.ts`, con las reglas de la
hoja de extras), el menú del servidor, el micrófono y la conexión
(`conexion.ts`), y los candados de dinero.

**El nombre verifica el código.** En el ayudante el modelo oyó «panqué de
limón» (la transcripción lo dice) y mandó p75, el panqué de MANZANA del
renglón de al lado. Cada llamada trae ahora también el nombre: si no
corresponde al código, se usa el producto que sí corresponde; si hay empate
(un Taro caliente y uno en frappé), se rechaza para que lo revise
(`verificarProducto`).

**«Mejor nada más uno» tiene herramienta propia** (`cambiar_cantidad`). Con
las instrucciones breves el bot a veces decía «va, lo ajusto» sin quitar nada
y, al final, LEYÓ en voz alta «un cappuccino» cuando el pedido tenía dos: se
guardaron dos. Los candados no pueden saber qué dijo el bot en voz alta, solo
qué devolvió la herramienta; con `cambiar_cantidad` el modelo ya no tiene que
hacer cuentas, y la corrección salió bien 3 de 3. La pantalla «Tu pedido» del
mostrador es la otra red: el cliente ve lo que se va a guardar.

## Cómo funciona (modo cajero)

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
- **Se entra con navegación completa.** La cabecera que abre el micrófono es
  del documento: entrando con un `<Link>` desde el POS el documento seguía
  siendo el de `/pos` y el navegador negaba el micrófono sin preguntar. El ⋮
  usa un `<a>`, y la pantalla se recarga sola (una vez cada 30 s como mucho)
  si detecta que el documento nació en otra ruta (`microfono.ts`). Los fallos
  del micrófono dicen la causa real y dejan aviso `voz-microfono`.
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

En la primera prueba en un teléfono real (2026-10-14) salió otra fuga: el
cliente pidió leche deslactosada en un mocha, el menú no ofrece ese extra
($8) para el mocha, y el bot lo puso como NOTA, que la barra prepara y la
caja no cobra. Ahora una nota que nombra un extra del menú se rechaza: si el
extra aplica al producto, hay que mandarlo como extra (y se cobra); si es un
extra con costo que no aplica, el bot le dice al cliente que no está
disponible y le ofrece el producto sin él. Probado con el bot real: el mocha
se guardó sin la nota.

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
- Al bot aún se le escapan anuncios («déjame revisar tu pedido») antes de
  usar una herramienta, aunque se le pide que no.
- En el ayudante, el modelo a veces calla algo que no está en el menú en vez
  de avisar con `no_entendi`, o se salta una nota («sin azúcar»).
- **Para probar con el cliente simulado**, el micrófono falso tiene que
  mandar ruido de fondo constante, como uno real: sin él, una respuesta de una
  sola palabra («Chico», «Ana») nunca cerraba el turno, y con `server_vad` el
  dictado no terminaba nunca. Por eso el ayudante usa `semantic_vad`.
- Turnos partidos: si el cliente hace pausa a media frase («Ah, bueno…
  entonces así, normal»), `semantic_vad` con `eagerness: "medium"` a veces
  corta el turno, la segunda mitad se pierde y la sesión termina por
  silencio. Probar `eagerness: "low"` midiendo cuánto sube la latencia.
- Copiar el menú de un piloto al café de prueba para probar con su carta
  real (pedir permiso antes: son datos de un café real).
- Si convence: opción B (QR por mesa), con acceso público blindado y topes
  de minutos; y entonces sí guía en `/ayuda`, buscador y módulo en Negocio.
