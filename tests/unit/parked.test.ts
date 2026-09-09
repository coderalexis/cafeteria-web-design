import { describe, expect, it } from "vitest"
import type { CartLine, PersistedCart, Product } from "@/app/pos/cart"
import {
  applyCartDelta,
  PARKED_VIEJA_MS,
  autoName,
  avisoRecuperada,
  detalleRecuperada,
  conflictName,
  isVieja,
  lineKey,
  suggestAccountNames,
  cuentasParaSumar,
  nombreConHora,
  waitingLabel,
  repartirCuenta,
  cambiosPendientes,
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

// «Quién suele venir a esta hora»: Juan pasa después de entrenar entre 8 y
// 10; a las 9 su nombre tiene que estar a un toque, y a las 4 de la tarde no.
describe("suggestAccountNames", () => {
  const visitas = [
    { name: "Juan", hour: 8, n: 4 },
    { name: "Juan", hour: 9, n: 3 },
    { name: "Ana", hour: 9, n: 2 },
    { name: "Ana", hour: 16, n: 5 },
    { name: "Mesa 1", hour: 9, n: 9 },
    { name: "Para llevar", hour: 9, n: 7 },
    { name: "Pedido 09:12", hour: 9, n: 3 },
    { name: "Luis (2)", hour: 10, n: 1 },
    { name: "Noche", hour: 23, n: 2 },
  ]
  it("junta la franja de dos horas y ordena por frecuencia", () => {
    expect(suggestAccountNames(visitas, 9, ["Mesa 1", "Mesa 2", "Barra", "Para llevar"])).toEqual(["Juan", "Ana", "Luis"])
    expect(suggestAccountNames(visitas, 16, [])).toEqual(["Ana"])
  })
  it("los chips fijos y los nombres automáticos no son personas", () => {
    expect(suggestAccountNames(visitas, 9, [])).not.toContain("Pedido 09:12")
    expect(suggestAccountNames(visitas, 9, [])).not.toContain("Mesa 1")
    expect(suggestAccountNames(visitas, 9, ["Para llevar"])).not.toContain("Para llevar")
  })
  it("la medianoche es un círculo y hay un tope", () => {
    expect(suggestAccountNames(visitas, 0, [])).toEqual(["Noche"])
    expect(suggestAccountNames(visitas, 9, [], 1)).toEqual(["Juan"])
  })
})

// Al abrir una cuenta, lo que se lee un instante: qué volvió y cuánto.
describe("avisoRecuperada", () => {
  it("nombra la cuenta y cuenta artículos en singular y plural", () => {
    expect(avisoRecuperada("Mesa 3", 3)).toBe("«Mesa 3» recuperada · 3 artículos")
    expect(avisoRecuperada("Juan", 1)).toBe("«Juan» recuperada · 1 artículo")
  })
  it("no se rompe con cantidades raras", () => {
    expect(avisoRecuperada("X", 2.7)).toBe("«X» recuperada · 2 artículos")
    expect(avisoRecuperada("X", -1)).toBe("«X» recuperada · 0 artículos")
  })
})

// Fuera de menú: dos renglones son «lo mismo» por nombre y precio, no por el id sintético.
describe("lineKey fuera de menú", () => {
  it("mismo nombre y precio → misma llave; distinto precio → otra", () => {
    const a = lineKey({ productId: "custom:1", custom: { name: "Charola", price: 100 } })
    const b = lineKey({ productId: "custom:2", custom: { name: " charola ", price: 100 } })
    const c = lineKey({ productId: "custom:3", custom: { name: "Charola", price: 120 } })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe("cuentasParaSumar — qué cuentas abiertas se ofrecen al abrir otra", () => {
  const c = (name: string, total: number, at: number) => ({ name, total, at })

  it("ofrece los nombres tecleados, con la ronda más reciente primero", () => {
    const r = cuentasParaSumar([c("Juan", 85, 100), c("Sra. suéter rojo", 40, 300), c("Ana", 60, 200)])
    expect(r.map((x) => x.name)).toEqual(["Sra. suéter rojo", "Ana", "Juan"])
    expect(r[0].total).toBe(40)
  })

  it("deja fuera las que ya están como chip fijo: ahí se marcan solas", () => {
    const r = cuentasParaSumar([c("Mesa 1", 50, 300), c("Juan", 85, 200)], ["Mesa 1", "Mesa 2", "Para llevar"])
    expect(r.map((x) => x.name)).toEqual(["Juan"])
  })

  it("compara sin distinguir mayúsculas ni espacios de sobra", () => {
    const r = cuentasParaSumar([c("  mesa 1  ", 50, 300), c("JUAN", 85, 200)], ["Mesa 1"])
    expect(r.map((x) => x.name)).toEqual(["JUAN"])
  })

  it("no repite el mismo nombre dos veces ni ofrece vacíos", () => {
    const r = cuentasParaSumar([c("Juan", 85, 300), c("juan", 20, 200), c("   ", 10, 100)])
    expect(r).toHaveLength(1)
    expect(r[0].total).toBe(85)
  })

  it("con muchas cuentas abiertas corta en el tope y respeta el orden", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => c("Cliente " + i, i, i))
    expect(cuentasParaSumar(muchas)).toHaveLength(6)
    expect(cuentasParaSumar(muchas, [], 3).map((x) => x.name)).toEqual(["Cliente 11", "Cliente 10", "Cliente 9"])
  })

  it("sin cuentas abiertas no ofrece nada", () => {
    expect(cuentasParaSumar([], ["Mesa 1"])).toEqual([])
  })
})

describe("nombreConHora — distinguir dos personas que se llaman igual", () => {
  const alas = (h: number, m: number) => new Date(2026, 8, 7, h, m)

  it("pega la hora al nombre", () => {
    expect(nombreConHora("Juan", alas(14, 40))).toBe("Juan 14:40")
    expect(nombreConHora("  alexis  ", alas(9, 5))).toBe("alexis 09:05")
  })

  it("no encadena horas: la reemplaza", () => {
    expect(nombreConHora("Juan 14:40", alas(15, 10))).toBe("Juan 15:10")
    expect(nombreConHora(nombreConHora("Juan", alas(14, 40)), alas(15, 10))).toBe("Juan 15:10")
  })

  it("recorta el nombre, nunca la hora", () => {
    const largo = "Sra. del suéter rojo con el perro chihuahua"
    const r = nombreConHora(largo, alas(8, 0))
    expect(r.length).toBeLessThanOrEqual(40)
    expect(r.endsWith(" 08:00")).toBe(true)
  })

  it("sin nombre queda solo la hora", () => {
    expect(nombreConHora("   ", alas(23, 59))).toBe("23:59")
  })
})

describe("detalleRecuperada — qué volvió, en una línea", () => {
  const linea = (name: string, quantity: number) => ({ product: { name }, quantity })
  // Solo se usan `product.name` y `quantity`; el resto de CartLine no pinta aquí.
  const lineas = (...xs: { product: { name: string }; quantity: number }[]) =>
    xs as unknown as Parameters<typeof detalleRecuperada>[0]

  it("nombra los artículos cuando son pocos", () => {
    expect(detalleRecuperada(lineas(linea("Latte", 1), linea("Americano", 1)))).toBe("Latte, Americano")
  })

  it("dice la cantidad solo cuando es más de uno", () => {
    expect(detalleRecuperada(lineas(linea("Latte", 2), linea("Americano", 1)))).toBe("2× Latte, Americano")
  })

  it("con muchos, nombra los primeros y cuenta el resto", () => {
    const r = detalleRecuperada(lineas(linea("Latte", 1), linea("Americano", 1), linea("Croissant", 1), linea("Jugo", 1)))
    expect(r).toBe("Latte, Americano y 2 más")
  })

  it("respeta cuántos se nombran", () => {
    const r = detalleRecuperada(lineas(linea("Latte", 1), linea("Americano", 1), linea("Croissant", 1)), 1)
    expect(r).toBe("Latte y 2 más")
  })

  it("sin líneas no dice nada", () => {
    expect(detalleRecuperada(lineas())).toBe("")
  })
})

// Separar una mesa: «somos dos, cada quien lo suyo». Es lo que más pasa, y
// NO es un pago mixto: son dos ventas, cada una con su método.
describe("repartirCuenta", () => {
  const producto = (id: string): Product => ({ id, name: id, price: 50, category: "c", subcategory: "s" })
  const linea = (lineId: string, quantity: number): CartLine => ({
    lineId,
    product: producto("p-" + lineId),
    modifiers: [],
    quantity,
    notes: "",
  })
  /** Ids predecibles para poder afirmar sobre la parte que se queda. */
  const contador = () => {
    let n = 0
    return () => `nuevo-${++n}`
  }

  it("sin nada elegido no se cobra nada y la cuenta queda igual", () => {
    const lineas = [linea("a", 2), linea("b", 1)]
    const r = repartirCuenta(lineas, {}, contador())
    expect(r.cobrar).toEqual([])
    expect(r.queda).toEqual(lineas)
  })

  it("una línea entera se va completa, sin clonar nada", () => {
    const r = repartirCuenta([linea("a", 3), linea("b", 1)], { a: 3 }, contador())
    expect(r.cobrar.map((l) => [l.lineId, l.quantity])).toEqual([["a", 3]])
    expect(r.queda.map((l) => [l.lineId, l.quantity])).toEqual([["b", 1]])
  })

  it("«dos de los tres lattes» parte la línea y la parte que se queda lleva id nuevo", () => {
    const r = repartirCuenta([linea("a", 3)], { a: 2 }, contador())
    expect(r.cobrar.map((l) => [l.lineId, l.quantity])).toEqual([["a", 2]])
    expect(r.queda.map((l) => [l.lineId, l.quantity])).toEqual([["nuevo-1", 3 - 2]])
  })

  it("no se pierde ni se inventa una sola pieza", () => {
    const lineas = [linea("a", 3), linea("b", 2), linea("c", 1)]
    const r = repartirCuenta(lineas, { a: 1, b: 2 }, contador())
    const piezas = (ls: CartLine[]) => ls.reduce((s, l) => s + l.quantity, 0)
    expect(piezas(r.cobrar) + piezas(r.queda)).toBe(piezas(lineas))
    expect(piezas(r.cobrar)).toBe(3)
  })

  it("ningún renglón queda en cero", () => {
    const r = repartirCuenta([linea("a", 2), linea("b", 2)], { a: 2, b: 1 }, contador())
    for (const l of [...r.cobrar, ...r.queda]) expect(l.quantity).toBeGreaterThan(0)
  })

  it("se aguanta basura: negativos, de más, decimales y líneas que no existen", () => {
    const r = repartirCuenta([linea("a", 2)], { a: -5, fantasma: 9 }, contador())
    expect(r.cobrar).toEqual([])
    expect(r.queda.map((l) => l.quantity)).toEqual([2])

    const r2 = repartirCuenta([linea("a", 2)], { a: 99 }, contador())
    expect(r2.cobrar.map((l) => l.quantity)).toEqual([2])
    expect(r2.queda).toEqual([])

    const r3 = repartirCuenta([linea("a", 3)], { a: 1.9 }, contador())
    expect(r3.cobrar.map((l) => l.quantity)).toEqual([1])
    expect(r3.queda.map((l) => l.quantity)).toEqual([2])
  })

  it("no toca los originales", () => {
    const lineas = [linea("a", 3)]
    const copia = JSON.parse(JSON.stringify(lineas))
    repartirCuenta(lineas, { a: 1 }, contador())
    expect(JSON.parse(JSON.stringify(lineas))).toEqual(copia)
  })
})

// Antes de cambiarse de mesa hay que saber si lo que está en pantalla ya se
// guardó. Preguntar siempre sería ruido; no preguntar nunca pierde rondas.
describe("cambiosPendientes", () => {
  const cart = (lineas: Array<[string, number]>, extra: Record<string, unknown> = {}): PersistedCart =>
    ({
      v: 3,
      savedAt: 0,
      saleRef: "r",
      paymentMethod: "efectivo",
      ticketNotes: "",
      cashReceivedInput: "",
      discount: null,
      lines: lineas.map(([productId, quantity], i) => ({
        lineId: `l${i}`,
        productId,
        sizeLabel: null,
        modifierIds: [],
        quantity,
        notes: "",
      })),
      ...extra,
    }) as unknown as PersistedCart

  it("sin tocar nada, no hay nada que preguntar", () => {
    const a = cart([["p1", 2], ["p2", 1]])
    expect(cambiosPendientes(a, cart([["p1", 2], ["p2", 1]])).hay).toBe(false)
  })

  it("el orden de los renglones no es un cambio", () => {
    expect(cambiosPendientes(cart([["p1", 2], ["p2", 1]]), cart([["p2", 1], ["p1", 2]])).hay).toBe(false)
  })

  it("dos renglones del mismo producto son lo mismo que uno con la suma", () => {
    // Es lo que pasa al separar una cuenta: la línea se parte en dos.
    expect(cambiosPendientes(cart([["p1", 3]]), cart([["p1", 1], ["p1", 2]])).hay).toBe(false)
  })

  it("agregar, quitar y cambiar la cantidad SÍ se preguntan", () => {
    const base = cart([["p1", 2]])
    expect(cambiosPendientes(base, cart([["p1", 3]])).hay).toBe(true)
    expect(cambiosPendientes(base, cart([["p1", 1]])).hay).toBe(true)
    expect(cambiosPendientes(base, cart([["p1", 2], ["p2", 1]])).hay).toBe(true)
    expect(cambiosPendientes(base, cart([])).hay).toBe(true)
  })

  it("cambiar de producto con la misma cantidad también cuenta", () => {
    expect(cambiosPendientes(cart([["p1", 2]]), cart([["p2", 2]])).hay).toBe(true)
  })

  it("dice cuántas piezas había y cuántas hay, para poder contarlo en el aviso", () => {
    const r = cambiosPendientes(cart([["p1", 3]]), cart([["p1", 1], ["p2", 4]]))
    expect(r.piezasGuardadas).toBe(3)
    expect(r.piezasAhora).toBe(5)
  })

  it("sin referencia de lo guardado, solo hay cambios si hay algo en pantalla", () => {
    expect(cambiosPendientes(null, cart([["p1", 1]])).hay).toBe(true)
    expect(cambiosPendientes(undefined, cart([])).hay).toBe(false)
  })
})
