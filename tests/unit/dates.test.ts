import { describe, expect, it } from "vitest"
import {
  addDays,
  dateStringInTz,
  daysBetween,
  hourInTz,
  isValidTimeZone,
  parseDateString,
  startOfMonth,
  zonedMidnightUtc,
} from "@/lib/dates"

// Las fechas del negocio se calculan en SU zona, no en la del servidor (que
// está en UTC en Vercel). Un error aquí manda una venta de las 11 pm al día
// siguiente y descuadra el corte.
describe("dateStringInTz", () => {
  it("una venta a las 11 pm en la Ciudad de México sigue siendo del mismo día", () => {
    // 2026-03-15 23:30 en CDMX (UTC−6) = 2026-03-16 05:30 UTC
    const instante = new Date("2026-03-16T05:30:00Z")
    expect(dateStringInTz("America/Mexico_City", instante)).toBe("2026-03-15")
    expect(dateStringInTz("UTC", instante)).toBe("2026-03-16")
  })

  it("respeta el horario de verano de Tijuana", () => {
    // Julio: Tijuana está en UTC−7
    const instante = new Date("2026-07-10T06:30:00Z")
    expect(dateStringInTz("America/Tijuana", instante)).toBe("2026-07-09")
    expect(hourInTz("America/Tijuana", instante)).toBe(23)
  })
})

describe("zonedMidnightUtc", () => {
  it("la medianoche local se traduce al instante UTC correcto", () => {
    expect(zonedMidnightUtc("America/Mexico_City", "2026-03-15").toISOString()).toBe("2026-03-15T06:00:00.000Z")
  })
})

describe("aritmética de días", () => {
  it("suma y resta sin tocar zonas horarias", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29") // bisiesto
  })

  it("primer día del mes y distancia entre fechas", () => {
    expect(startOfMonth("2026-08-31")).toBe("2026-08-01")
    expect(daysBetween("2026-08-01", "2026-08-31")).toBe(30)
  })
})

describe("validación", () => {
  it("acepta solo AAAA-MM-DD y zonas reales", () => {
    expect(parseDateString("2026-09-01")).toBe("2026-09-01")
    expect(parseDateString("01/09/2026")).toBeNull()
    expect(parseDateString(undefined)).toBeNull()
    expect(isValidTimeZone("America/Mexico_City")).toBe(true)
    expect(isValidTimeZone("America/Nowhere")).toBe(false)
  })
})
