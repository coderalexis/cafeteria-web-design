/**
 * Pedido por voz en el mostrador (prototipo). Solo servidor: lee variables de
 * entorno que el navegador nunca debe ver.
 *
 * Está apagado salvo para los cafés que se nombren en `VOZ_CAFES` (slugs
 * separados por coma) y solo si hay `OPENAI_API_KEY`. No es un módulo de
 * Negocio a propósito: mientras sea prototipo, encenderlo es decisión del
 * operador, no de cada dueño, porque cada minuto de voz cuesta dinero real.
 */

/** Modelo de voz a voz. El mini cuesta alrededor de un tercio del principal. */
export const VOZ_MODELO = process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1-mini"

/** Cuánto vive la clave temporal que recibe el navegador para conectarse. */
export const VOZ_CLAVE_SEGUNDOS = 300

export function vozHabilitada(slug: string): boolean {
  if (!process.env.OPENAI_API_KEY) return false
  const cafes = (process.env.VOZ_CAFES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return cafes.includes(slug.toLowerCase())
}
