/**
 * Cuánto costó una conversación de voz, para decidir con números si el
 * prototipo vale lo que cuesta. Puro y probado.
 *
 * Es un TOPE estimado, no la factura: OpenAI cobra el texto más barato que el
 * audio, y aquí todo se cuenta a precio de audio porque es lo único publicado
 * con certeza al escribir esto (octubre 2026). La transcripción para la
 * pantalla se cobra aparte y no entra. La cifra real está en el panel de uso
 * de OpenAI; esta sirve para comparar sesiones y modelos entre sí.
 */

export interface UsoVoz {
  entrada: number
  entradaEnCache: number
  salida: number
  respuestas: number
}

export const USO_VACIO: UsoVoz = { entrada: 0, entradaEnCache: 0, salida: 0, respuestas: 0 }

/** Dólares por millón de tokens (audio). Confirmar en la página de precios de OpenAI antes de decidir nada. */
export const TARIFAS_USD: Record<string, { entrada: number; cache: number; salida: number }> = {
  "gpt-realtime-2.1": { entrada: 32, cache: 0.4, salida: 64 },
  "gpt-realtime-2": { entrada: 32, cache: 0.4, salida: 64 },
  "gpt-realtime-2.1-mini": { entrada: 10, cache: 0.3, salida: 20 },
}

/** Suma el `usage` de un `response.done` (los campos pueden faltar: se leen con cuidado). */
export function sumarUso(acumulado: UsoVoz, usage: unknown): UsoVoz {
  if (!usage || typeof usage !== "object") return acumulado
  const u = usage as { input_tokens?: unknown; output_tokens?: unknown; input_token_details?: { cached_tokens?: unknown } }
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0)
  const entrada = num(u.input_tokens)
  const cache = Math.min(num(u.input_token_details?.cached_tokens), entrada)
  return {
    entrada: acumulado.entrada + entrada,
    entradaEnCache: acumulado.entradaEnCache + cache,
    salida: acumulado.salida + num(u.output_tokens),
    respuestas: acumulado.respuestas + 1,
  }
}

/** Tope estimado en dólares; null si no hay tarifa conocida para ese modelo. */
export function costoEstimadoUsd(uso: UsoVoz, modelo: string): number | null {
  const t = TARIFAS_USD[modelo]
  if (!t) return null
  const sinCache = uso.entrada - uso.entradaEnCache
  return (sinCache * t.entrada + uso.entradaEnCache * t.cache + uso.salida * t.salida) / 1_000_000
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
