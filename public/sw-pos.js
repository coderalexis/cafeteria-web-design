/*
 * Arranque rápido del POS (service worker).
 *
 * El problema que resuelve: en el celular, cada recarga del POS —y la mañana
 * de Diana tuvo 28— esperaba al servidor completo antes de pintar nada: el
 * middleware, el contexto, el menú, las ventas del día. Con mala señal eran
 * varios segundos de pantalla en blanco justo cuando había fila.
 *
 * La idea: la última página del POS que se recibió del servidor se guarda en
 * el dispositivo, con los archivos de código que necesita. La siguiente vez
 * que se abre /pos, se sirve ESA página al instante y, por detrás, se pide la
 * fresca. Cuando llega, la página viva pide sus datos nuevos (menú, caja,
 * ventas del día) sin recargar; si cambió el código (hubo deploy) o cambió
 * quién está dentro, se recarga sola. Sin red, se queda con lo último que se
 * sabe: la cola de ventas ya sabe qué hacer con eso.
 *
 * Cómo se entera la página de que lo que ve es lo guardado: la copia servida
 * lleva una marca (<meta name="pos-desde-cache">). Con esa marca, la página
 * PREGUNTA por el resultado de la red (mensaje «¿estado?») en vez de esperar
 * un aviso que podría llegar antes de que exista quien lo escuche.
 *
 * Lo que NO hace, a propósito: no guarda nada que no sea la página del POS
 * y su código; no toca acciones del servidor ni las peticiones de datos (esas
 * siempre van a la red); y no promete que el menú guardado sea el vigente:
 * lo vigente llega segundos después.
 *
 * Es JavaScript plano (no pasa por el build) y se sirve desde /sw-pos.js con
 * alcance /pos. `lib/arranque-rapido.ts` es su contraparte en la página.
 */

const SHELL = "pos-shell-v1" // la página de /pos: un solo registro
const ESTATICO = "pos-estatico-v1" // /_next/static/* que esa página usa
const RUTA = "/pos"
const MARCA_IDENTIDAD = '<meta name="pos-identidad"'
const MARCA_DESDE_CACHE = '<meta name="pos-desde-cache" content="1"/>'

/* ── Lectura del HTML ──────────────────────────────────────────────── */

// La marca la pone app/pos/layout.tsx: «negocio:usuario». Sin marca no es una
// página del POS con sesión (por ejemplo, un aviso de error) y no se guarda.
function identidadDe(html) {
  const m = /<meta name="pos-identidad" content="([^"]+)"/.exec(html)
  return m ? m[1] : null
}

// Todo lo que la página pide de /_next/static: chunks, CSS, fuentes. Sirve
// para dos cosas: guardarlos junto con la página, y saber si hubo deploy (los
// nombres llevan el hash del build).
function urlsEstaticas(html) {
  const vistas = new Set()
  const re = /\/_next\/static\/[A-Za-z0-9_\-./%]+/g
  let m
  while ((m = re.exec(html)) !== null) vistas.add(m[0])
  return [...vistas].sort()
}

function huellaDe(html) {
  return urlsEstaticas(html).join("\n")
}

function esNavegacionAlPos(request, origen) {
  if (request.method !== "GET" || request.mode !== "navigate") return false
  const url = new URL(request.url)
  return url.origin === origen && url.pathname === RUTA
}

// La copia que se sirve desde el guardado lleva la marca; la guardada, no.
function marcarDesdeCache(html) {
  return html.replace(MARCA_IDENTIDAD, MARCA_DESDE_CACHE + MARCA_IDENTIDAD)
}

/* ── Red ───────────────────────────────────────────────────────────── */

// Siempre con una petición propia y NUNCA reenviando la de la navegación:
// con el worker recién arrancado (la app que se vuelve a abrir), reenviar el
// objeto de la navegación falla en Chrome con «Failed to fetch». Una petición
// propia sigue las redirecciones, así que «me mandaron al login» se ve como
// `redirected`.
function pedirPos() {
  return self.fetch(RUTA, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "text/html" },
  })
}

/* ── Guardado ──────────────────────────────────────────────────────── */

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// Guarda la página con TODO su código antes de sustituir la anterior: una
// página guardada sin sus chunks sería una pantalla muerta (en Vercel, los
// chunks de un deploy viejo dejan de existir con el siguiente).
async function guardarShell(respuesta, html) {
  const estatico = await self.caches.open(ESTATICO)
  const urls = urlsEstaticas(html)
  const faltan = []
  for (const u of urls) {
    if (!(await estatico.match(u, { ignoreVary: true }))) faltan.push(u)
  }
  if (faltan.length > 0) await estatico.addAll(faltan)
  const shell = await self.caches.open(SHELL)
  await shell.put(RUTA, respuesta)
}

// Tras un deploy, lo del build anterior ya no sirve para nada.
async function podarEstatico(html) {
  const vivos = new Set(urlsEstaticas(html))
  const estatico = await self.caches.open(ESTATICO)
  for (const req of await estatico.keys()) {
    if (!vivos.has(new URL(req.url).pathname)) await estatico.delete(req)
  }
}

async function htmlGuardado() {
  const shell = await self.caches.open(SHELL)
  const r = await shell.match(RUTA, { ignoreVary: true })
  return r ? r.text() : null
}

/* ── Resultado de la red, por página ───────────────────────────────── */

// Qué pasó con la red para cada página servida desde el guardado, por id de
// cliente: «pendiente» mientras se espera, y luego el resultado. La página
// lo pregunta al arrancar; si el worker se reinició en medio y no lo sabe,
// contesta «desconocido» y la página refresca por si acaso.
const resultados = new Map()

function recordar(clienteId, mensaje) {
  if (!clienteId) return
  resultados.set(clienteId, mensaje)
  if (resultados.size > 20) resultados.delete(resultados.keys().next().value)
}

// Además de recordarlo, se le manda a la página por si ya está escuchando.
// La página que acaba de nacer tarda un poco en existir como cliente; se
// reintenta. Si el navegador no dice cuál es (resultingClientId vacío), se
// avisa a todas las ventanas del POS: en un celular es una sola.
async function avisar(clienteId, mensaje) {
  recordar(clienteId, mensaje)
  for (let i = 0; i < 40; i++) {
    if (clienteId) {
      const c = await self.clients.get(clienteId)
      if (c) {
        c.postMessage(mensaje)
        return
      }
    } else {
      const todos = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const delPos = todos.filter((c) => new URL(c.url).pathname === RUTA)
      if (delPos.length > 0) {
        for (const c of delPos) c.postMessage(mensaje)
        return
      }
    }
    await dormir(250)
  }
}

self.addEventListener("message", (evento) => {
  const fuente = evento.source
  if (!fuente || !evento.data || evento.data.tipo !== "¿estado?") return
  fuente.postMessage(resultados.get(fuente.id) || { tipo: "desconocido" })
})

/* ── Navegación a /pos ─────────────────────────────────────────────── */

// Pide la fresca, la guarda si procede y le cuenta a la página qué pasó.
// Devuelve la respuesta de la red (para servirla cuando no había guardado).
async function actualizarDesdeRed(clienteId, habiaGuardado) {
  let respuesta
  try {
    respuesta = await pedirPos()
  } catch (e) {
    if (habiaGuardado) await avisar(clienteId, { tipo: "sin-red" })
    throw e
  }

  // Redirigido (sesión vencida, negocio suspendido…): la página guardada ya
  // no representa a nadie. Se borra y la página viva se recarga para seguir
  // la redirección de verdad.
  if (respuesta.redirected) {
    await self.caches.delete(SHELL)
    if (habiaGuardado) await avisar(clienteId, { tipo: "redirigido" })
    return respuesta
  }
  const tipo = respuesta.headers.get("content-type") || ""
  if (!respuesta.ok || !tipo.includes("text/html")) {
    if (habiaGuardado) await avisar(clienteId, { tipo: "sin-red" })
    return respuesta
  }

  const html = await respuesta.clone().text()
  const identidad = identidadDe(html)
  if (!identidad) {
    if (habiaGuardado) await avisar(clienteId, { tipo: "sin-red" })
    return respuesta
  }

  const anterior = await htmlGuardado()
  const cambioDeBuild = anterior != null && huellaDe(anterior) !== huellaDe(html)
  const cambioDeIdentidad = anterior != null && identidadDe(anterior) !== identidad
  try {
    await guardarShell(respuesta.clone(), html)
    if (cambioDeBuild) await podarEstatico(html)
  } catch {
    // No se pudo completar el guardado (p. ej. un chunk no bajó): se queda la
    // página anterior, que sí está completa. La siguiente visita reintenta.
    if (habiaGuardado) await avisar(clienteId, { tipo: "sin-red" })
    return respuesta
  }
  if (habiaGuardado) await avisar(clienteId, { tipo: "fresco", cambioDeBuild, cambioDeIdentidad })
  return respuesta
}

async function navegar(evento) {
  const shell = await self.caches.open(SHELL)
  const guardado = await shell.match(RUTA, { ignoreVary: true })
  const clienteId = evento.resultingClientId
  const desdeRed = actualizarDesdeRed(clienteId, !!guardado)
  if (guardado) {
    recordar(clienteId, { tipo: "pendiente" })
    evento.waitUntil(desdeRed.catch(() => {}))
    const html = await guardado.text()
    return new Response(marcarDesdeCache(html), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }
  // Sin guardado: la primera vez se sirve lo que llegó de la red. Una
  // respuesta que ya siguió una redirección no se puede entregar a una
  // navegación; se le pide al navegador que la siga él.
  const respuesta = await desdeRed
  return respuesta.redirected ? Response.redirect(respuesta.url, 303) : respuesta
}

/* ── /_next/static: nunca cambia, así que primero el guardado ──────── */

async function estatico(request) {
  const cache = await self.caches.open(ESTATICO)
  const guardado = await cache.match(request, { ignoreVary: true })
  if (guardado) return guardado
  const respuesta = await self.fetch(request)
  if (respuesta.ok) await cache.put(request, respuesta.clone())
  return respuesta
}

/* ── Ciclo de vida ─────────────────────────────────────────────────── */

// Al instalarse ya guarda la página, para que la SEGUNDA apertura sea la
// rápida y no la tercera. Si no hay sesión (redirige) no guarda nada.
async function precargar() {
  try {
    const respuesta = await pedirPos()
    if (respuesta.redirected || !respuesta.ok) return
    const html = await respuesta.clone().text()
    if (!identidadDe(html)) return
    await guardarShell(respuesta, html)
  } catch {
    // Sin red al instalar: no pasa nada, se guarda en la primera visita.
  }
}

self.addEventListener("install", (evento) => {
  self.skipWaiting()
  evento.waitUntil(precargar())
})

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (evento) => {
  const request = evento.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(estatico(request))
    return
  }
  if (esNavegacionAlPos(request, self.location.origin)) {
    evento.respondWith(navegar(evento))
  }
})

// Para las pruebas unitarias, que cargan este archivo con un `self` fingido.
self.__pos = { SHELL, ESTATICO, RUTA, identidadDe, urlsEstaticas, huellaDe, esNavegacionAlPos, marcarDesdeCache }
