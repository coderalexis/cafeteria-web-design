/**
 * Día de operación de la cafetería en America/Mexico_City.
 *
 * El servidor (Vercel) corre en UTC; sin esto, las ventas después de las
 * 18:00 hora local caerían en el "hoy" del día siguiente. CDMX no aplica
 * horario de verano desde 2022, así que el offset -06:00 es fijo.
 */
const CDMX_UTC_OFFSET_HOURS = 6

export interface DayRange {
  /** Inicio del día de operación (00:00 CDMX) en ISO UTC, inclusivo. */
  fromIso: string
  /** Inicio del día siguiente en ISO UTC, exclusivo. */
  toIso: string
}

/** Rango UTC [from, to) del día de operación CDMX que contiene `reference`. */
export function businessDayRange(reference: Date = new Date()): DayRange {
  const cdmx = new Date(reference.getTime() - CDMX_UTC_OFFSET_HOURS * 3_600_000)
  const from = Date.UTC(
    cdmx.getUTCFullYear(),
    cdmx.getUTCMonth(),
    cdmx.getUTCDate(),
    CDMX_UTC_OFFSET_HOURS,
  )
  return {
    fromIso: new Date(from).toISOString(),
    toIso: new Date(from + 24 * 3_600_000).toISOString(),
  }
}
