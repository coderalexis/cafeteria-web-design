import { describe, expect, it } from "vitest"
import { TRIAL_DAYS, isReservedSlug, pickSlug, trialEndsAt, trialState } from "@/lib/signup"

// Estas reglas deciden qué cafeterías se avisan y cuáles se SUSPENDEN cada
// madrugada (lib/trials.ts). Un día de más o de menos es una cafetería en
// pausa con la fila esperando.

const HORA = 3_600_000
const DIA = 24 * HORA
const ahora = new Date("2026-11-05T10:00:00Z")
const finEn = (ms: number) => new Date(ahora.getTime() + ms).toISOString()

describe("en qué punto va la prueba gratis", () => {
  it("sin fecha de fin no hay prueba (café que ya paga, o creado por el operador)", () => {
    expect(trialState(null, ahora)).toEqual({ state: "none", daysLeft: 0 })
  })

  it("con días de sobra corre sin avisos", () => {
    expect(trialState(finEn(5 * DIA), ahora)).toEqual({ state: "running", daysLeft: 5 })
  })

  it("a dos días avisa que se acaba", () => {
    expect(trialState(finEn(2 * DIA), ahora)).toEqual({ state: "ending-soon", daysLeft: 2 })
    expect(trialState(finEn(DIA + HORA), ahora)).toEqual({ state: "ending-soon", daysLeft: 2 })
  })

  it("en las últimas 24 horas es el último día, aunque falten minutos", () => {
    expect(trialState(finEn(DIA), ahora)).toEqual({ state: "last-day", daysLeft: 1 })
    expect(trialState(finEn(60_000), ahora)).toEqual({ state: "last-day", daysLeft: 1 })
  })

  it("vence justo al llegar la hora, no un día después", () => {
    expect(trialState(finEn(0), ahora)).toEqual({ state: "expired", daysLeft: 0 })
    expect(trialState(finEn(-HORA), ahora)).toEqual({ state: "expired", daysLeft: 0 })
  })

  it("dura los días anunciados desde el alta", () => {
    const alta = new Date("2026-11-01T15:30:00Z")
    expect(trialEndsAt(alta).getTime() - alta.getTime()).toBe(TRIAL_DAYS * DIA)
    // El mismo instante, como lo verá el cron al revisar.
    expect(trialState(trialEndsAt(alta).toISOString(), alta).state).toBe("running")
  })
})

describe("el identificador de un café nuevo", () => {
  it("usa el nombre si está libre y si no le pone -2, -3…", () => {
    expect(pickSlug("la-esquina", new Set())).toBe("la-esquina")
    expect(pickSlug("la-esquina", new Set(["la-esquina"]))).toBe("la-esquina-2")
    expect(pickSlug("la-esquina", new Set(["la-esquina", "la-esquina-2"]))).toBe("la-esquina-3")
  })

  it("nadie se aparta una ruta del sistema", () => {
    expect(isReservedSlug("admin")).toBe(true)
    expect(isReservedSlug("pos")).toBe(true)
    expect(pickSlug("admin", new Set())).toBe("admin-2")
    expect(isReservedSlug("la-esquina")).toBe(false)
  })

  it("sin nombre usa uno genérico, y se rinde tras 50 intentos", () => {
    expect(pickSlug("", new Set())).toBe("cafeteria")
    const ocupados = new Set(["x", ...Array.from({ length: 49 }, (_, i) => `x-${i + 2}`)])
    expect(pickSlug("x", ocupados)).toBeNull()
  })
})
