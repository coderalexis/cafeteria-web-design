import { describe, expect, it } from "vitest"
import {
  cuandoLegible,
  ejemploPromo,
  empalmeLegible,
  horaLegible,
  promosEmpalmadas,
  queDaLegible,
  validarPromo,
  type BorradorPromo,
  type Promocion,
} from "@/lib/promotions"

// La regla de una promoción se le muestra al dueño «dicha en voz alta» antes
// de guardarla. Si esta traducción miente, guarda algo distinto de lo que leyó.
describe("horaLegible", () => {
  it("habla en a.m./p.m. y trata 24 como medianoche", () => {
    expect(horaLegible(0)).toBe("12 a.m.")
    expect(horaLegible(9)).toBe("9 a.m.")
    expect(horaLegible(12)).toBe("12 p.m.")
    expect(horaLegible(15)).toBe("3 p.m.")
    expect(horaLegible(24)).toBe("medianoche")
  })
})

describe("cuandoLegible", () => {
  it("resume los atajos que la gente usa", () => {
    expect(cuandoLegible({ weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: 15, endHour: 18 })).toBe(
      "Todos los días de 3 p.m. a 6 p.m.",
    )
    expect(cuandoLegible({ weekdays: [1, 2, 3, 4, 5], startHour: 8, endHour: 10 })).toBe(
      "De lunes a viernes de 8 a.m. a 10 a.m.",
    )
    expect(cuandoLegible({ weekdays: [6, 0], startHour: 12, endHour: 14 })).toBe(
      "Sábados y domingos de 12 p.m. a 2 p.m.",
    )
  })

  it("enumera días sueltos en orden, sin importar cómo se eligieron", () => {
    expect(cuandoLegible({ weekdays: [3, 2], startHour: 15, endHour: 18 })).toBe(
      "Los martes y miércoles de 3 p.m. a 6 p.m.",
    )
    expect(cuandoLegible({ weekdays: [5], startHour: 17, endHour: 19 })).toBe("Los viernes de 5 p.m. a 7 p.m.")
    expect(cuandoLegible({ weekdays: [1, 3, 5], startHour: 7, endHour: 9 })).toBe(
      "Los lunes, miércoles y viernes de 7 a.m. a 9 a.m.",
    )
  })
})

describe("queDaLegible", () => {
  it("distingue porcentaje de monto y categoría de toda la venta", () => {
    expect(queDaLegible({ kind: "porcentaje", value: 20, scope: "categoria", categoryName: "Frappés" })).toBe(
      "20% en Frappés",
    )
    expect(queDaLegible({ kind: "monto", value: 25, scope: "ticket", categoryName: null })).toBe(
      "$25.00 de toda la venta",
    )
  })

  it("no se queda mudo si la categoría aún no tiene nombre", () => {
    expect(queDaLegible({ kind: "porcentaje", value: 10, scope: "categoria", categoryName: null })).toBe(
      "10% en una categoría",
    )
  })
})

// La vista previa promete un ejemplo con precio real y avisar de empalmes.
const borrador: BorradorPromo = {
  name: "Tarde de frappés",
  kind: "porcentaje",
  value: 20,
  scope: "categoria",
  categoryId: "cat-frappes",
  weekdays: [2, 4],
  startHour: 16,
  endHour: 18,
  minTicket: 0,
}
const otra = (extra: Partial<Promocion>): Promocion => ({
  id: "p-otra",
  name: "Happy hour",
  kind: "monto",
  value: 10,
  scope: "ticket",
  categoryId: null,
  categoryName: null,
  weekdays: [2],
  startHour: 17,
  endHour: 19,
  startsOn: null,
  endsOn: null,
  minTicket: 0,
  isActive: true,
  ...extra,
})

describe("ejemploPromo", () => {
  it("habla con un producto real de la categoría", () => {
    expect(ejemploPromo(borrador, { "cat-frappes": { nombre: "Frappé de mango", precio: 65 } })).toEqual({
      sujeto: "un Frappé de mango de $65.00",
      antes: 65,
      despues: 52,
      ahorro: 13,
    })
  })
  it("sin producto de muestra no inventa; toda la venta usa $150 o la compra mínima", () => {
    expect(ejemploPromo(borrador, {})).toBeNull()
    expect(ejemploPromo({ ...borrador, scope: "ticket", kind: "monto", value: 25 }, {})).toMatchObject({
      sujeto: "una venta de $150.00",
      despues: 125,
    })
    expect(ejemploPromo({ ...borrador, scope: "ticket", minTicket: 200 }, {})).toMatchObject({ antes: 200, ahorro: 40 })
    // un monto mayor que el precio no deja el producto en negativo
    expect(ejemploPromo({ ...borrador, kind: "monto", value: 500 }, { "cat-frappes": { nombre: "Frappé", precio: 65 } })).toMatchObject({ despues: 0, ahorro: 65 })
  })
})

describe("promosEmpalmadas", () => {
  it("detecta la misma hora, el mismo día y el mismo alcance", () => {
    expect(promosEmpalmadas(borrador, [otra({})]).map((o) => o.name)).toEqual(["Happy hour"]) // toda la venta toca a todas
    expect(promosEmpalmadas(borrador, [otra({ weekdays: [1] })])).toEqual([]) // otro día
    expect(promosEmpalmadas(borrador, [otra({ startHour: 18, endHour: 20 })])).toEqual([]) // empieza cuando esta termina
    expect(promosEmpalmadas(borrador, [otra({ scope: "categoria", categoryId: "cat-otra" })])).toEqual([]) // otra categoría
    expect(promosEmpalmadas(borrador, [otra({ isActive: false })])).toEqual([]) // apagada
    expect(promosEmpalmadas({ ...borrador, id: "p-otra" }, [otra({})])).toEqual([]) // ella misma, al editar
    expect(empalmeLegible(otra({}))).toBe("«Happy hour» (los martes de 5 p.m. a 7 p.m.)")
  })
})

describe("validarPromo", () => {
  it("dice lo primero que falta, en orden", () => {
    expect(validarPromo({ ...borrador, name: " " })).toMatch(/nombre/)
    expect(validarPromo({ ...borrador, value: 0 })).toBe("Di cuánto descuenta.")
    expect(validarPromo({ ...borrador, value: 120 })).toMatch(/100 %/)
    expect(validarPromo({ ...borrador, categoryId: null })).toMatch(/categoría/)
    expect(validarPromo({ ...borrador, weekdays: [] })).toBe("Elige al menos un día.")
    expect(validarPromo({ ...borrador, startHour: 18, endHour: 18 })).toMatch(/hora final/)
    expect(validarPromo(borrador)).toBeNull()
  })
})
