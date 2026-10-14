import { describe, expect, it } from "vitest"
import { USO_VACIO, costoEstimadoUsd, sumarUso } from "@/app/pos/voz/uso"

describe("uso de una conversación de voz", () => {
  it("suma el uso de cada respuesta y no cuenta más caché que entrada", () => {
    let uso = sumarUso(USO_VACIO, { input_tokens: 4000, output_tokens: 200, input_token_details: { cached_tokens: 3500 } })
    uso = sumarUso(uso, { input_tokens: 100, output_tokens: 50, input_token_details: { cached_tokens: 900 } })
    expect(uso).toEqual({ entrada: 4100, entradaEnCache: 3600, salida: 250, respuestas: 2 })
  })

  it("ignora un uso que no llegó o viene raro", () => {
    expect(sumarUso(USO_VACIO, null)).toBe(USO_VACIO)
    expect(sumarUso(USO_VACIO, { input_tokens: "mucho", output_tokens: -3 })).toEqual({ ...USO_VACIO, respuestas: 1 })
  })

  it("estima el tope en dólares con la tarifa del modelo", () => {
    const uso = { entrada: 1_000_000, entradaEnCache: 500_000, salida: 100_000, respuestas: 1 }
    // 500k × $10 + 500k × $0.30 + 100k × $20, por millón
    expect(costoEstimadoUsd(uso, "gpt-realtime-2.1-mini")).toBeCloseTo(5 + 0.15 + 2, 6)
    expect(costoEstimadoUsd(uso, "modelo-desconocido")).toBeNull()
  })
})
