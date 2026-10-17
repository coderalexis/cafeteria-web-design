/**
 * Cuánto costó una conversación de voz, para decidir con números si el
 * prototipo vale lo que cuesta. Puro y probado.
 *
 * Se cuenta por MODALIDAD (texto o audio) y por caché, como cobra OpenAI. La
 * primera versión lo cobraba todo a precio de audio porque no se tenían las
 * tarifas de texto, y exageraba de 2 a 5 veces: una conversación del modo
 * cajero que de verdad cuesta ~US$0.02 aparecía como US$0.04–0.12. Las
 * instrucciones y el menú (texto, casi todo en caché) son la mayor parte de
 * los tokens y los más baratos; lo caro es la voz del bot.
 *
 * La cifra sigue siendo una estimación: la factura está en el panel de uso
 * de OpenAI (que se actualiza con retraso).
 */

export interface UsoVoz {
  entradaTexto: number
  cacheTexto: number
  entradaAudio: number
  cacheAudio: number
  salidaTexto: number
  salidaAudio: number
  respuestas: number
}

export const USO_VACIO: UsoVoz = {
  entradaTexto: 0,
  cacheTexto: 0,
  entradaAudio: 0,
  cacheAudio: 0,
  salidaTexto: 0,
  salidaAudio: 0,
  respuestas: 0,
}

interface Tarifa {
  entrada: number
  cache: number
  salida: number
}

/**
 * Dólares por millón de tokens, de developers.openai.com/api/docs/pricing
 * (consultado el 2026-10-14). Si OpenAI cambia precios, aquí se actualizan.
 */
export const TARIFAS_USD: Record<string, { texto: Tarifa; audio: Tarifa }> = {
  "gpt-realtime-2.1-mini": { texto: { entrada: 0.6, cache: 0.06, salida: 2.4 }, audio: { entrada: 10, cache: 0.3, salida: 20 } },
  "gpt-realtime-mini": { texto: { entrada: 0.6, cache: 0.06, salida: 2.4 }, audio: { entrada: 10, cache: 0.3, salida: 20 } },
  "gpt-realtime-2.1": { texto: { entrada: 4, cache: 0.4, salida: 24 }, audio: { entrada: 32, cache: 0.4, salida: 64 } },
  "gpt-realtime": { texto: { entrada: 4, cache: 0.4, salida: 16 }, audio: { entrada: 32, cache: 0.4, salida: 64 } },
}

/** La transcripción para la pantalla («Oí: …», gpt-4o-mini-transcribe), por minuto de voz del cliente. */
export const TRANSCRIPCION_USD_MIN = 0.003

/** Suma el `usage` de un `response.done` (los campos pueden faltar: se leen con cuidado). */
export function sumarUso(acumulado: UsoVoz, usage: unknown): UsoVoz {
  if (!usage || typeof usage !== "object") return acumulado
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0)
  const u = usage as {
    input_token_details?: { text_tokens?: unknown; audio_tokens?: unknown; cached_tokens_details?: { text_tokens?: unknown; audio_tokens?: unknown } }
    output_token_details?: { text_tokens?: unknown; audio_tokens?: unknown }
  }
  const ent = u.input_token_details ?? {}
  const cache = ent.cached_tokens_details ?? {}
  const sal = u.output_token_details ?? {}
  const cacheTexto = Math.min(num(cache.text_tokens), num(ent.text_tokens))
  const cacheAudio = Math.min(num(cache.audio_tokens), num(ent.audio_tokens))
  return {
    entradaTexto: acumulado.entradaTexto + num(ent.text_tokens) - cacheTexto,
    cacheTexto: acumulado.cacheTexto + cacheTexto,
    entradaAudio: acumulado.entradaAudio + num(ent.audio_tokens) - cacheAudio,
    cacheAudio: acumulado.cacheAudio + cacheAudio,
    salidaTexto: acumulado.salidaTexto + num(sal.text_tokens),
    salidaAudio: acumulado.salidaAudio + num(sal.audio_tokens),
    respuestas: acumulado.respuestas + 1,
  }
}

/**
 * Costo estimado en dólares: modelo (por modalidad y caché) más la
 * transcripción de los segundos que habló la persona (los mide la pantalla
 * con el detector de voz; el audio de entrada NO sirve para eso porque
 * incluye la voz del propio bot releída en la conversación). null si no hay
 * tarifa para ese modelo.
 */
export function costoEstimadoUsd(uso: UsoVoz, modelo: string, segundosDeVoz = 0): number | null {
  const t = TARIFAS_USD[modelo]
  if (!t) return null
  const modeloUsd =
    (uso.entradaTexto * t.texto.entrada +
      uso.cacheTexto * t.texto.cache +
      uso.salidaTexto * t.texto.salida +
      uso.entradaAudio * t.audio.entrada +
      uso.cacheAudio * t.audio.cache +
      uso.salidaAudio * t.audio.salida) /
    1_000_000
  return modeloUsd + (Math.max(0, segundosDeVoz) / 60) * TRANSCRIPCION_USD_MIN
}

/** Lo que se guarda de cada conversación en el aparato, para comparar después. */
export interface SesionMedida {
  /** Cuándo empezó (ms). */
  inicio: number
  segundos: number
  modelo: string
  resultado: "confirmado" | "cancelado" | "sin-pedido" | "tiempo" | "error"
  articulos: number
  total: number
  herramientas: number
  /** Herramientas que contestaron «falta un dato» o «no existe»: cuántas veces se equivocó o preguntó. */
  rechazos: number
  uso: UsoVoz
  costoUsd: number | null
}

export const SESIONES_GUARDADAS = 30
