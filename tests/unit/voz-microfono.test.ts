import { describe, expect, it } from "vitest"
import { RECARGA_MIN_MS, falloDeMicrofono, hayQueRecargar } from "@/app/pos/voz/microfono"

describe("¿recargar para que el micrófono funcione?", () => {
  const ahora = 1_800_000_000_000

  it("no recarga si el documento nació en la pantalla de voz", () => {
    expect(hayQueRecargar("/pos/voz", null, ahora)).toBe(false)
  })

  it("recarga si se llegó por navegación interna desde el POS (lo que le pasó al usuario)", () => {
    expect(hayQueRecargar("/pos", null, ahora)).toBe(true)
  })

  it("no entra en bucle: una recarga automática como mucho cada 30 s", () => {
    expect(hayQueRecargar("/pos", ahora - 5_000, ahora)).toBe(false)
    expect(hayQueRecargar("/pos", ahora - RECARGA_MIN_MS - 1, ahora)).toBe(true)
  })

  it("no adivina cuando el navegador no dice dónde nació el documento", () => {
    expect(hayQueRecargar(null, null, ahora)).toBe(false)
  })
})

describe("qué decir cuando el micrófono falla", () => {
  it("si lo bloqueó la página, dice que recargue (no que alguien negó el permiso)", () => {
    const f = falloDeMicrofono("NotAllowedError", false)
    expect(f.mensaje).toContain("Recarga la página")
    expect(f.mensaje).not.toContain("dijiste que no")
    expect(f.recargar).toBe(true)
  })

  it("si no se sabe por qué, cubre las dos causas", () => {
    expect(falloDeMicrofono("NotAllowedError", true).mensaje).toContain("si dijiste que no")
    expect(falloDeMicrofono("NotAllowedError", null).recargar).toBe(true)
  })

  it("distingue aparato sin micrófono y micrófono ocupado", () => {
    expect(falloDeMicrofono("NotFoundError", true)).toEqual({ mensaje: "No se encontró un micrófono en este aparato.", recargar: false })
    expect(falloDeMicrofono("NotReadableError", true).mensaje).toContain("otra app")
    expect(falloDeMicrofono("Rarísimo", true).recargar).toBe(true)
  })
})
