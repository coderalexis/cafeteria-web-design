import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { ENCABEZADO_RUTA, esDelPos } from "@/lib/ruta"
import { continuarConCookies } from "@/lib/supabase/middleware"

describe("desde qué página llega una acción", () => {
  it("el POS y sus pantallas sí; el panel y lo que solo empieza igual, no", () => {
    expect(esDelPos("/pos")).toBe(true)
    expect(esDelPos("/pos/datos/cuentas")).toBe(true)
    expect(esDelPos("/pos/voz")).toBe(true)
    expect(esDelPos("/admin/existencias")).toBe(false)
    expect(esDelPos("/posada")).toBe(false)
    // Sin marca (no pasó por el middleware): se revalida, que es lo seguro.
    expect(esDelPos(null)).toBe(false)
    expect(esDelPos(undefined)).toBe(false)
  })

  it("la marca que pone el middleware llega a la acción, encima de lo que mande el cliente", () => {
    const req = new NextRequest("http://localhost:3999/pos", { method: "POST", headers: { [ENCABEZADO_RUTA]: "/admin" } })
    req.headers.set(ENCABEZADO_RUTA, req.nextUrl.pathname)
    const r = continuarConCookies(req, [])
    expect(r.headers.get(`x-middleware-request-${ENCABEZADO_RUTA}`)).toBe("/pos")
  })
})
