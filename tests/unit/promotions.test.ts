import { describe, expect, it } from "vitest"
import { cuandoLegible, horaLegible, queDaLegible } from "@/lib/promotions"

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
