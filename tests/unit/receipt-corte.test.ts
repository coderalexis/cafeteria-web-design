import { describe, expect, it } from "vitest"
import { buildCorteLines, type CashSessionSummary } from "@/lib/receipt"

// El corte impreso es lo que se guarda en la carpeta: tiene que decir cómo se
// contó y cuánto quedó de fondo, y no inventar esas líneas cuando no se dijo.

const base: CashSessionSummary = {
  session_id: "s1",
  status: "cerrada",
  opened_at: "2026-09-03T14:00:00Z",
  closed_at: "2026-09-03T22:00:00Z",
  opened_by: "Lupita",
  closed_by: "Lupita",
  opening_float: 500,
  opening_notes: null,
  closing_notes: null,
  expected_cash: 580,
  counted_cash: 580,
  difference: 0,
  tickets_count: 2,
  revenue: 80,
  cash_sales: 80,
  cancelled_count: 0,
  cancelled_amount: 0,
  by_method: [{ method: "efectivo", tickets: 2, revenue: 80 }],
}
const biz = { name: "Café de Prueba", timezone: "America/Mexico_City", widthMm: 58 as const }

describe("buildCorteLines", () => {
  it("imprime el conteo y el fondo que quedó", () => {
    const lines = buildCorteLines(
      { ...base, count_detail: [{ value: 500, qty: 1 }, { value: 20, qty: 4 }], next_float: 300 },
      biz,
    )
    const texto = lines.join("\n")
    expect(texto).toMatch(/CONTEO/)
    expect(texto).toMatch(/1 x \$500\.00\s+\$500\.00/)
    expect(texto).toMatch(/4 x \$20\.00\s+\$80\.00/)
    expect(texto).toMatch(/Queda de fondo\s+\$300\.00/)
    expect(texto).toMatch(/Retiro\s+\$280\.00/)
  })

  it("sin conteo ni fondo, no inventa las líneas", () => {
    const texto = buildCorteLines(base, biz).join("\n")
    expect(texto).not.toMatch(/CONTEO|Queda de fondo|Retiro/)
    expect(texto).toMatch(/Contado\s+\$580\.00/)
  })
})
