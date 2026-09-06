import { describe, expect, it } from "vitest"
import { clasificarError, esErrorDeVersion, hayVersionNueva, puedeRecargar, RECARGA_VENTANA_MS } from "@/lib/version"

describe("clasificarError — qué se cura recargando, qué es falta de señal", () => {
  it("reconoce el módulo de otro build que el runtime viejo no tiene", () => {
    expect(clasificarError("Cannot read properties of undefined (reading 'call')")).toBe("version")
  })
  it("reconoce trozos de código que ya no existen y server actions de otro build", () => {
    expect(clasificarError("ChunkLoadError: Loading chunk 1436 failed.")).toBe("version")
    expect(clasificarError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js")).toBe("version")
    expect(clasificarError('Server Action "abc" was not found on the server.')).toBe("version")
  })
  it("reconoce quedarse sin señal en Chrome, Safari y Firefox", () => {
    expect(clasificarError("Failed to fetch")).toBe("red")
    expect(clasificarError("Load failed")).toBe("red")
    expect(clasificarError("NetworkError when attempting to fetch resource.")).toBe("red")
  })
  it("lo demás sí es un error de la app", () => {
    expect(clasificarError("Cannot read properties of null (reading 'total')")).toBe("otro")
    expect(clasificarError("")).toBe("otro")
    expect(clasificarError(undefined)).toBe("otro")
  })
})

describe("hayVersionNueva — el sello del servidor contra el de la pestaña", () => {
  it("solo con sellos distintos", () => {
    expect(hayVersionNueva("abc123", "abc123")).toBe(false)
    expect(hayVersionNueva("abc123", "def456")).toBe(true)
  })
  it("sin sello del servidor (acción vieja que no lo manda) no se recarga", () => {
    expect(hayVersionNueva("abc123", undefined)).toBe(false)
    expect(hayVersionNueva("abc123", "")).toBe(false)
  })
})

describe("puedeRecargar — una vez por ventana, para que un desfase raro no sea un bucle", () => {
  const ahora = 1_000_000
  it("la primera vez, sí", () => {
    expect(puedeRecargar(null, ahora)).toBe(true)
    expect(puedeRecargar(Number.NaN, ahora)).toBe(true)
  })
  it("dentro de la ventana, no; pasada la ventana, sí", () => {
    expect(puedeRecargar(ahora - 5_000, ahora)).toBe(false)
    expect(puedeRecargar(ahora - RECARGA_VENTANA_MS, ahora)).toBe(true)
    expect(puedeRecargar(ahora - 10, ahora, 5)).toBe(true)
  })
  it("con el reloj movido hacia atrás no se queda trabado", () => {
    expect(puedeRecargar(ahora + 60_000, ahora)).toBe(true)
  })
})

describe("esErrorDeVersion — lo que llega a un catch", () => {
  it("el 404 de acción desconocida que da Next tras rotar la sal", () => {
    const e = new Error('Server Action "0039" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action')
    expect(esErrorDeVersion(e)).toBe(true)
    expect(esErrorDeVersion(new Error("Failed to find Server Action \"x\". This request might be from an older or newer deployment."))).toBe(true)
  })
  it("sin señal no es versión", () => {
    expect(esErrorDeVersion(new TypeError("Failed to fetch"))).toBe(false)
    expect(esErrorDeVersion(undefined)).toBe(false)
  })
})
