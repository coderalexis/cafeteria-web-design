import { describe, expect, it } from "vitest"
import {
  correoDeInvitacion,
  estadoInvitacion,
  hashDelToken,
  mensajeDeEstado,
  nuevoToken,
  pareceToken,
} from "@/lib/invitaciones"

// Invitaciones al equipo (migración 61): el enlace lleva un token al azar y la
// base solo guarda su sha256; la invitación vive 7 días o hasta que se usa.

describe("el token del enlace", () => {
  it("es largo, al azar y cabe en una URL", () => {
    const a = nuevoToken()
    const b = nuevoToken()
    expect(a).not.toBe(b)
    expect(pareceToken(a)).toBe(true)
    expect(encodeURIComponent(a)).toBe(a)
  })

  it("se guarda como sha256: 64 hex, siempre igual para el mismo token", () => {
    const t = nuevoToken()
    expect(hashDelToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashDelToken(t)).toBe(hashDelToken(t))
    expect(hashDelToken(t)).not.toBe(hashDelToken(nuevoToken()))
  })

  it("un enlace mal copiado no parece token (y no llega a la base)", () => {
    const t = nuevoToken()
    expect(pareceToken(t.slice(0, 40))).toBe(false)
    expect(pareceToken(t + "x")).toBe(false)
    expect(pareceToken("../../etc/passwd")).toBe(false)
    expect(pareceToken("")).toBe(false)
  })
})

describe("el estado de una invitación", () => {
  const ahora = new Date("2026-11-05T12:00:00Z")
  const base = { expires_at: "2026-11-10T12:00:00Z", accepted_at: null, revoked_at: null }

  it("viva mientras no venza, no se use y no se cancele", () => {
    expect(estadoInvitacion(base, ahora)).toBe("viva")
  })
  it("vencida al llegar su hora", () => {
    expect(estadoInvitacion({ ...base, expires_at: "2026-11-05T12:00:00Z" }, ahora)).toBe("vencida")
  })
  it("aceptada gana a todo: lo que pasó, pasó", () => {
    expect(estadoInvitacion({ ...base, accepted_at: "2026-11-04T00:00:00Z", expires_at: "2026-11-01T00:00:00Z" }, ahora)).toBe("aceptada")
  })
  it("cancelada aunque siga en fecha", () => {
    expect(estadoInvitacion({ ...base, revoked_at: "2026-11-05T11:00:00Z" }, ahora)).toBe("cancelada")
  })
  it("cada estado que no sirve dice qué hacer", () => {
    for (const e of ["aceptada", "cancelada", "vencida", "no-existe"] as const) {
      expect(mensajeDeEstado(e).length).toBeGreaterThan(20)
    }
  })
})

describe("el correo de la invitación", () => {
  it("dice quién invita, a qué café, con qué rol, y lleva el enlace", () => {
    const c = correoDeInvitacion({ cafe: "Gym Coffe", quienInvita: "Diana", rol: "admin", enlace: "https://cafecitopos.com/invitacion/abc" })
    expect(c.asunto).toContain("Gym Coffe")
    expect(c.texto).toContain("Diana te invitó a Gym Coffe como administrador.")
    expect(c.texto).toContain("https://cafecitopos.com/invitacion/abc")
    expect(c.html).toContain('href="https://cafecitopos.com/invitacion/abc"')
  })

  it("lo que escribió la gente va escapado en el HTML", () => {
    const c = correoDeInvitacion({ cafe: '<script>x</script>"', quienInvita: "<b>Eva</b>", rol: "cajero", enlace: "https://x/y" })
    expect(c.html).not.toContain("<script>")
    expect(c.html).not.toContain("<b>Eva</b>")
    expect(c.html).toContain("&lt;script&gt;")
  })

  it("sin nombre de quien invita, no queda un hueco", () => {
    const c = correoDeInvitacion({ cafe: "Café", quienInvita: "  ", rol: "owner", enlace: "https://x/y" })
    expect(c.texto.startsWith("El equipo te invitó a Café como dueño.")).toBe(true)
  })
})
