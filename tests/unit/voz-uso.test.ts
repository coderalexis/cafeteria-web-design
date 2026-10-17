import { describe, expect, it } from "vitest"
import { USO_VACIO, costoEstimadoUsd, sumarUso } from "@/app/pos/voz/uso"

/** Un `usage` como lo manda OpenAI en `response.done`. */
const usage = (textoEnt: number, textoCache: number, audioEnt: number, audioCache: number, textoSal: number, audioSal: number) => ({
  input_tokens: textoEnt + audioEnt,
  output_tokens: textoSal + audioSal,
  input_token_details: { text_tokens: textoEnt, audio_tokens: audioEnt, cached_tokens: textoCache + audioCache, cached_tokens_details: { text_tokens: textoCache, audio_tokens: audioCache } },
  output_token_details: { text_tokens: textoSal, audio_tokens: audioSal },
})

describe("uso de una conversación de voz", () => {
  it("separa texto y audio, y lo nuevo de lo que vino de caché", () => {
    // usage(texto, de ese texto en caché, audio, de ese audio en caché, salida texto, salida audio)
    let uso = sumarUso(USO_VACIO, usage(3000, 2500, 120, 0, 40, 200))
    uso = sumarUso(uso, usage(3100, 3000, 200, 120, 30, 150))
    expect(uso).toEqual({
      entradaTexto: 500 + 100,
      cacheTexto: 2500 + 3000,
      entradaAudio: 120 + 80,
      cacheAudio: 0 + 120,
      salidaTexto: 70,
      salidaAudio: 350,
      respuestas: 2,
    })
  })

  it("ignora un uso que no llegó o viene raro, y nunca cuenta más caché que entrada", () => {
    expect(sumarUso(USO_VACIO, null)).toBe(USO_VACIO)
    expect(sumarUso(USO_VACIO, { input_token_details: { text_tokens: "mucho", cached_tokens_details: { text_tokens: 50 } } })).toEqual({ ...USO_VACIO, respuestas: 1 })
  })

  it("cobra cada tipo de token a su tarifa oficial (gpt-realtime-2.1-mini)", () => {
    const uso = { entradaTexto: 1_000_000, cacheTexto: 1_000_000, entradaAudio: 0, cacheAudio: 1_000_000, salidaTexto: 1_000_000, salidaAudio: 1_000_000, respuestas: 1 }
    // 0.60 + 0.06 + 0 + 0.30 + 2.40 + 20
    expect(costoEstimadoUsd(uso, "gpt-realtime-2.1-mini")).toBeCloseTo(23.36, 6)
    expect(costoEstimadoUsd(uso, "modelo-desconocido")).toBeNull()
  })

  it("suma la transcripción de los segundos que habló la persona", () => {
    // 600 tokens de audio nuevo: $0.006 de modelo; 60 s de voz: $0.003 de transcripción
    const uso = { ...USO_VACIO, entradaAudio: 600 }
    expect(costoEstimadoUsd(uso, "gpt-realtime-2.1-mini", 60)).toBeCloseTo(0.006 + 0.003, 6)
    expect(costoEstimadoUsd(uso, "gpt-realtime-2.1-mini")).toBeCloseTo(0.006, 6)
  })

  it("con el consumo medido de un pedido del modo cajero da ~2 centavos de dólar, no 4 a 12", () => {
    const pedido = { entradaTexto: 11872, cacheTexto: 27584, entradaAudio: 469, cacheAudio: 320, salidaTexto: 574, salidaAudio: 410, respuestas: 10 }
    const usd = costoEstimadoUsd(pedido, "gpt-realtime-2.1-mini")!
    expect(usd).toBeGreaterThan(0.02)
    expect(usd).toBeLessThan(0.03)
  })
})
