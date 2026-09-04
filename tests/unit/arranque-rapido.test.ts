import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { CACHE_SHELL, FRENO_MAXIMO, decidirMensaje, frenoRefresco } from "@/lib/arranque-rapido"

/* ── La decisión de la página ante cada respuesta ──────────────────── */

describe("decidirMensaje", () => {
  it("pendiente: esperar", () => {
    expect(decidirMensaje({ tipo: "pendiente" })).toEqual({ tipo: "esperar" })
  })

  it("fresca del mismo build y la misma persona: refrescar sin recargar", () => {
    expect(decidirMensaje({ tipo: "fresco", cambioDeBuild: false, cambioDeIdentidad: false })).toEqual({
      tipo: "refrescar",
    })
  })

  it("hubo deploy o cambió quién está dentro: recargar", () => {
    expect(decidirMensaje({ tipo: "fresco", cambioDeBuild: true, cambioDeIdentidad: false })).toEqual({
      tipo: "recargar",
    })
    expect(decidirMensaje({ tipo: "fresco", cambioDeBuild: false, cambioDeIdentidad: true })).toEqual({
      tipo: "recargar",
    })
  })

  it("redirigido (sesión vencida): recargar para seguir la redirección real", () => {
    expect(decidirMensaje({ tipo: "redirigido" })).toEqual({ tipo: "recargar" })
  })

  it("el worker no sabe (se reinició): ante la duda, refrescar", () => {
    expect(decidirMensaje({ tipo: "desconocido" })).toEqual({ tipo: "refrescar" })
  })

  it("sin red o basura: nada", () => {
    expect(decidirMensaje({ tipo: "sin-red" })).toEqual({ tipo: "nada" })
    expect(decidirMensaje(null)).toEqual({ tipo: "nada" })
    expect(decidirMensaje("hola")).toEqual({ tipo: "nada" })
    expect(decidirMensaje({ tipo: "otra-cosa" })).toEqual({ tipo: "nada" })
  })
})

/* ── El freno contra el bucle de recargas ──────────────────────────── */

describe("frenoRefresco", () => {
  const ahora = 1_000_000

  it("sin intentos recientes se puede", () => {
    expect(frenoRefresco([], ahora)).toEqual({ intentos: [], puede: true })
  })

  it("con tres intentos en medio minuto ya no", () => {
    const r = frenoRefresco([ahora - 25_000, ahora - 10_000, ahora - 1_000], ahora)
    expect(r.puede).toBe(false)
    expect(r.intentos).toHaveLength(FRENO_MAXIMO)
  })

  it("los intentos viejos dejan de contar (y se limpian)", () => {
    const r = frenoRefresco([ahora - 90_000, ahora - 60_000, ahora - 5_000], ahora)
    expect(r).toEqual({ intentos: [ahora - 5_000], puede: true })
  })

  it("un reloj que se fue al futuro no bloquea para siempre", () => {
    expect(frenoRefresco([ahora + 999_999, ahora + 5_000, ahora + 1], ahora).puede).toBe(true)
  })
})

/* ── El service worker de verdad, cargado con un `self` fingido ────── */

type PosSW = {
  SHELL: string
  ESTATICO: string
  RUTA: string
  identidadDe: (html: string) => string | null
  urlsEstaticas: (html: string) => string[]
  huellaDe: (html: string) => string
  esNavegacionAlPos: (r: { method: string; mode: string; url: string }, origen: string) => boolean
  marcarDesdeCache: (html: string) => string
}

function cargarSW(): PosSW {
  const codigo = readFileSync(path.resolve(__dirname, "../../public/sw-pos.js"), "utf8")
  const self = { addEventListener: () => {}, location: { origin: "https://cafecitopos.com" } } as {
    addEventListener: () => void
    location: { origin: string }
    __pos?: PosSW
  }
  new Function("self", codigo)(self)
  if (!self.__pos) throw new Error("el service worker no expuso sus funciones")
  return self.__pos
}

const pagina = (identidad: string, chunks: string[]) =>
  `<!DOCTYPE html><html><head><meta name="pos-identidad" content="${identidad}"/>` +
  chunks.map((c) => `<script src="${c}" async=""></script>`).join("") +
  `<link rel="stylesheet" href="/_next/static/css/abc.css"/></head><body>` +
  `<script>self.__next_f.push([1,"3:[\\"$\\",\\"link\\",null,{\\"href\\":\\"/_next/static/css/abc.css\\"}]"])</script>` +
  `</body></html>`

describe("sw-pos.js", () => {
  const sw = cargarSW()

  it("usa el mismo nombre de guardado que la página borra al pasar por /login", () => {
    expect(sw.SHELL).toBe(CACHE_SHELL)
    expect(sw.RUTA).toBe("/pos")
  })

  it("lee la identidad que pone el layout y no inventa una si falta", () => {
    expect(sw.identidadDe(pagina("biz:user", []))).toBe("biz:user")
    expect(sw.identidadDe("<html><body>Error</body></html>")).toBeNull()
  })

  it("junta todo lo de /_next/static una sola vez y ordenado", () => {
    const html = pagina("b:u", ["/_next/static/chunks/webpack-1.js", "/_next/static/chunks/app/pos/page-9.js"])
    expect(sw.urlsEstaticas(html)).toEqual([
      "/_next/static/chunks/app/pos/page-9.js",
      "/_next/static/chunks/webpack-1.js",
      "/_next/static/css/abc.css",
    ])
  })

  it("la huella cambia con un deploy (otro hash) y no con los datos", () => {
    const a = pagina("b:u", ["/_next/static/chunks/webpack-1.js"])
    const mismosChunksOtrosDatos = a.replace("</body>", "<p>ventas de hoy $999</p></body>")
    const otroBuild = pagina("b:u", ["/_next/static/chunks/webpack-2.js"])
    expect(sw.huellaDe(a)).toBe(sw.huellaDe(mismosChunksOtrosDatos))
    expect(sw.huellaDe(a)).not.toBe(sw.huellaDe(otroBuild))
  })

  it("la copia servida lleva la marca «desde cache» y conserva la identidad", () => {
    const servida = sw.marcarDesdeCache(pagina("b:u", []))
    expect(servida).toContain('<meta name="pos-desde-cache" content="1"/>')
    expect(sw.identidadDe(servida)).toBe("b:u")
    // Una página sin identidad no se marca (tampoco se habría guardado).
    expect(sw.marcarDesdeCache("<html></html>")).toBe("<html></html>")
  })

  it("solo la navegación GET a /pos del mismo origen pasa por el guardado", () => {
    const origen = "https://cafecitopos.com"
    const nav = (url: string, method = "GET", mode = "navigate") => sw.esNavegacionAlPos({ method, mode, url }, origen)
    expect(nav("https://cafecitopos.com/pos")).toBe(true)
    // Las peticiones de datos de Next (router.refresh, prefetch) no son navegaciones.
    expect(nav("https://cafecitopos.com/pos", "GET", "cors")).toBe(false)
    // Las acciones del servidor son POST.
    expect(nav("https://cafecitopos.com/pos", "POST")).toBe(false)
    expect(nav("https://cafecitopos.com/pos/preparar")).toBe(false)
    expect(nav("https://cafecitopos.com/admin")).toBe(false)
    expect(nav("https://otro.com/pos")).toBe(false)
  })
})
