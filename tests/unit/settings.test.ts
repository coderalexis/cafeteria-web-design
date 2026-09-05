import { describe, expect, it } from "vitest"
import {
  KITCHEN_POLL_HIDDEN_MAX,
  KITCHEN_POLL_MAX,
  KITCHEN_POLL_MIN,
  parseAccountLabels,
  parseBusinessSettings,
  parseGoal,
  printableWidthMm,
  serializeBusinessSettings,
  sinNoticiasMs,
} from "@/lib/settings"

// `settings` es un jsonb libre que edita el dueño desde una pantalla. Todo lo
// que sale de ahí se sanea aquí; si esto se relaja, basura en la base se
// vuelve un POS que no carga.
describe("parseBusinessSettings", () => {
  it("con nada, todo queda en su valor por omisión", () => {
    const s = parseBusinessSettings(null)
    expect(s.dailyGoal).toBeNull()
    expect(s.monthlyGoal).toBeNull()
    expect(s.kitchenPollSeconds).toBe(4)
    expect(s.kitchenPollHiddenSeconds).toBe(30)
    expect(s.publicReceipt).toBe(true) // la nota por QR viene encendida
    expect(s.publicMenu).toBe(false) // la carta pública no: publica el negocio
    expect(s.receiptWidthMm).toBe(58)
    expect(s.parkedOrders).toBe(true) // las cuentas abiertas vienen encendidas
    expect(s.credit).toBe(false) // fiar es decisión del dueño: apagado
  })

  it("ignora basura sin reventar y acota lo que se sale de rango", () => {
    const s = parseBusinessSettings({
      daily_goal: "no es número",
      kitchen_poll_seconds: 0,
      kitchen_poll_hidden_seconds: 99999,
      receipt_width_mm: 73,
      public_receipt: "quizás",
    })
    expect(s.dailyGoal).toBeNull()
    expect(s.kitchenPollSeconds).toBeGreaterThanOrEqual(KITCHEN_POLL_MIN)
    expect(s.kitchenPollSeconds).toBeLessThanOrEqual(KITCHEN_POLL_MAX)
    expect(s.kitchenPollHiddenSeconds).toBeLessThanOrEqual(KITCHEN_POLL_HIDDEN_MAX)
    expect([58, 80]).toContain(s.receiptWidthMm)
    expect(typeof s.publicReceipt).toBe("boolean")
  })

  it("lo que se serializa se vuelve a leer igual", () => {
    const original = parseBusinessSettings({ daily_goal: 5900, monthly_goal: 183000, table_count: 3 })
    const otraVez = parseBusinessSettings(serializeBusinessSettings(original))
    expect(otraVez.dailyGoal).toBe(5900)
    expect(otraVez.monthlyGoal).toBe(183000)
    expect(otraVez.tableCount).toBe(3)
  })
})

describe("metas", () => {
  it("acepta números positivos y descarta lo demás", () => {
    expect(parseGoal(5900)).toBe(5900)
    expect(parseGoal("5900")).toBe(5900)
    expect(parseGoal(0)).toBeNull()
    expect(parseGoal(-1)).toBeNull()
    expect(parseGoal("abc")).toBeNull()
    expect(parseGoal(null)).toBeNull()
  })
})

describe("etiquetas de cuentas", () => {
  it("limpia, deduplica y respeta el tope", () => {
    const etiquetas = parseAccountLabels(["Barra", " barra ", "Para llevar", "", "Terraza"])
    expect(etiquetas).toContain("Barra")
    expect(etiquetas).toContain("Para llevar")
    expect(etiquetas).toContain("Terraza")
    expect(etiquetas.filter((e) => e.toLowerCase() === "barra")).toHaveLength(1)
    // El formulario manda texto separado por comas, y eso también vale
    expect(parseAccountLabels("Barra, Terraza")).toEqual(["Barra", "Terraza"])
    expect(parseAccountLabels(42)).toEqual([])
  })
})

describe("papel y sondeo", () => {
  it("el ancho imprimible depende del papel", () => {
    expect(printableWidthMm(58)).toBe(48)
    expect(printableWidthMm(80)).toBe(72)
  })

  it("«sin noticias» espera tres sondeos, y nunca menos de 20 s", () => {
    expect(sinNoticiasMs(4)).toBe(20_000) // 12 s se sube al piso
    expect(sinNoticiasMs(30)).toBe(90_000)
  })
})
