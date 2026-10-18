import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { continuarConCookies } from "@/lib/supabase/middleware"

const peticion = () =>
  new NextRequest("http://localhost:3999/pos", {
    method: "POST",
    headers: { cookie: "sb-x-auth-token.0=viejo0; sb-x-auth-token.1=viejo1; otra=1", "next-action": "abc" },
  })

describe("la sesión renovada en el middleware", () => {
  it("llega a la acción por la petición y al navegador por Set-Cookie, nunca por x-middleware-set-cookie", () => {
    // Con x-middleware-set-cookie, Next toma la renovación como «la acción cambió
    // cookies» y manda la página entera pegada a la respuesta: una copia vieja
    // del POS (abierta desde el service worker tras un deploy) truena con ella.
    const r = continuarConCookies(peticion(), [
      { name: "sb-x-auth-token", value: "nuevo", options: { path: "/", maxAge: 400 } },
      { name: "sb-x-auth-token.0", value: "", options: { path: "/", maxAge: 0 } },
      { name: "sb-x-auth-token.1", value: "", options: { path: "/", maxAge: 0 } },
    ])
    expect(r.headers.get("x-middleware-set-cookie")).toBeNull()

    const haciaLaAccion = r.headers.get("x-middleware-request-cookie") ?? ""
    expect(r.headers.get("x-middleware-override-headers")?.split(",")).toContain("cookie")
    expect(haciaLaAccion).toContain("sb-x-auth-token=nuevo")
    expect(haciaLaAccion).toContain("otra=1")
    expect(haciaLaAccion).not.toContain("viejo")
    // El resto de la petición sigue igual.
    expect(r.headers.get("x-middleware-request-next-action")).toBe("abc")

    const alNavegador = r.headers.getSetCookie()
    expect(alNavegador.find((c) => c.startsWith("sb-x-auth-token="))).toMatch(/Max-Age=400/)
    expect(alNavegador.find((c) => c.startsWith("sb-x-auth-token.0="))).toMatch(/Max-Age=0/)
  })

  it("pasa los encabezados que pide Supabase para que nadie guarde en caché la sesión", () => {
    const r = continuarConCookies(peticion(), [{ name: "sb-x-auth-token", value: "nuevo", options: { path: "/" } }], {
      "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    })
    expect(r.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0")
  })

  it("sin renovación no toca cookies: la petición sigue con las suyas", () => {
    const r = continuarConCookies(peticion(), [])
    expect(r.headers.getSetCookie()).toEqual([])
    expect(r.headers.get("x-middleware-set-cookie")).toBeNull()
    expect(r.headers.get("x-middleware-request-cookie")).toBe("sb-x-auth-token.0=viejo0; sb-x-auth-token.1=viejo1; otra=1")
  })
})
