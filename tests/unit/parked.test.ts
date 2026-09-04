import { describe, expect, it } from "vitest"
import {
  applyCartDelta,
  PARKED_VIEJA_MS,
  autoName,
  conflictName,
  isVieja,
  lineKey,
  waitingLabel,
} from "@/app/pos/parked"

const MIN = 60_000
const HORA = 60 * MIN

// Las cuentas abiertas viven horas y hasta días (el fiado del gym que se paga
// el lunes). Lo que la cajera lee es esta etiqueta; si miente, no sabe si la
// mesa es de hoy o de la semana pasada.
describe("waitingLabel", () => {
  it("cuenta en la unidad que una persona usaría", () => {
    const ahora = 10 * HORA * 24
    expect(waitingLabel(ahora - 20_000, ahora)).toBe("recién")
    expect(waitingLabel(ahora - 5 * MIN, ahora)).toBe("hace 5 min")
    expect(waitingLabel(ahora - 3 * HORA, ahora)).toBe("hace 3 h")
    expect(waitingLabel(ahora - 30 * HORA, ahora)).toBe("desde ayer")
    expect(waitingLabel(ahora - 3 * 24 * HORA, ahora)).toBe("hace 3 días")
  })

  it("no se va a negativo si el reloj del aparato va adelantado", () => {
    expect(waitingLabel(1000, 0)).toBe("recién")
  })
})

describe("isVieja", () => {
  it("pasa a vieja justo después del umbral", () => {
    const ahora = 1_000_000_000
    expect(isVieja(ahora - PARKED_VIEJA_MS + 1, ahora)).toBe(false)
    expect(isVieja(ahora - PARKED_VIEJA_MS - 1, ahora)).toBe(true)
  })
})

// Ante un choque entre dos aparatos no se pisa nada: la copia se guarda con
// un nombre reconocible para que quien atiende junte las dos.
describe("conflictName", () => {
  it("numera sin repetir y sin acumular paréntesis", () => {
    expect(conflictName("Mesa 1", ["Mesa 1"])).toBe("Mesa 1 (2)")
    expect(conflictName("Mesa 1", ["Mesa 1", "Mesa 1 (2)"])).toBe("Mesa 1 (3)")
    expect(conflictName("Mesa 1 (2)", ["Mesa 1", "Mesa 1 (2)"])).toBe("Mesa 1 (3)")
  })
})

// La foto de «lo ya preparado» se compara por CONTENIDO, porque restaurar un
// carrito regenera los ids internos. Dos renglones iguales deben dar la
// misma llave aunque los extras vengan en otro orden.
describe("lineKey", () => {
  it("es la misma sin importar el orden de los extras ni los espacios de la nota", () => {
    const a = lineKey({ productId: "p1", sizeLabel: "Chico", modifierIds: ["m2", "m1"], notes: " sin azúcar " })
    const b = lineKey({ productId: "p1", sizeLabel: "Chico", modifierIds: ["m1", "m2"], notes: "sin azúcar" })
    expect(a).toBe(b)
  })

  it("cambia si cambia algo que la barra tendría que preparar distinto", () => {
    const base = lineKey({ productId: "p1", sizeLabel: "Chico" })
    expect(lineKey({ productId: "p1", sizeLabel: "Grande" })).not.toBe(base)
    expect(lineKey({ productId: "p1", sizeLabel: "Chico", modifierIds: ["m1"] })).not.toBe(base)
    expect(lineKey({ productId: "p1", sizeLabel: "Chico", notes: "caliente" })).not.toBe(base)
  })
})

describe("autoName", () => {
  it("nombra por la hora con dos dígitos", () => {
    expect(autoName(new Date(2026, 8, 1, 9, 5))).toBe("Pedido 09:05")
  })
})

// Juntar en vez de clonar: cuando la cuenta cambió mientras estaba abierta
// (otro aparato, o el mismo teléfono que se reinició a media ronda), lo que
// este aparato agregó o quitó se aplica sobre la versión del servidor.
describe("applyCartDelta", () => {
  const linea = (productId: string, quantity: number, notes = "") => ({
    lineId: `l-${productId}-${notes}`,
    productId,
    sizeLabel: null,
    modifierIds: [],
    quantity,
    notes,
  })
  const cart = (lines: ReturnType<typeof linea>[], ticketNotes = "") => ({
    v: 1 as const,
    savedAt: 1,
    saleRef: "",
    paymentMethod: "efectivo" as const,
    ticketNotes,
    cashReceivedInput: "",
    discount: null,
    lines,
  })

  it("suma lo agregado y respeta lo que el otro aparato agregó", () => {
    const atOpen = cart([linea("latte", 2)])
    const mine = cart([linea("latte", 2), linea("muffin", 1)])
    const server = cart([linea("latte", 2), linea("croissant", 1)]) // el otro agregó un croissant
    const r = applyCartDelta(server, atOpen, mine)
    expect(r.lines.map((l) => [l.productId, l.quantity])).toEqual([["latte", 2], ["croissant", 1], ["muffin", 1]])
  })

  it("resta lo quitado hasta donde alcance y tira el renglón en cero", () => {
    const atOpen = cart([linea("latte", 2), linea("pan", 1)])
    const mine = cart([linea("latte", 1)]) // quitó un latte y el pan
    const server = cart([linea("latte", 3), linea("pan", 1)]) // el otro agregó un latte
    const r = applyCartDelta(server, atOpen, mine)
    expect(r.lines.map((l) => [l.productId, l.quantity])).toEqual([["latte", 2]])
  })

  it("el caso del teléfono reiniciado: el servidor ya tiene mi ronda anterior y solo entra lo nuevo", () => {
    const anterior = cart([linea("latte", 2)])
    const mine = cart([linea("latte", 2), linea("agua", 1)])
    const r = applyCartDelta(anterior, anterior, mine)
    expect(r.lines.map((l) => [l.productId, l.quantity])).toEqual([["latte", 2], ["agua", 1]])
  })

  it("sin cambios míos, el servidor queda igual; la nota mía manda si la escribí", () => {
    const base = cart([linea("latte", 1)], "sin azúcar")
    expect(applyCartDelta(base, base, base).lines).toEqual(base.lines)
    expect(applyCartDelta(base, base, { ...base, ticketNotes: "" }).ticketNotes).toBe("sin azúcar")
    expect(applyCartDelta(base, base, { ...base, ticketNotes: "para llevar" }).ticketNotes).toBe("para llevar")
  })
})
