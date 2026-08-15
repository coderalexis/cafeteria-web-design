/**
 * Día de operación de la cafetería en America/Mexico_City.
 *
 * El servidor (Vercel) corre en UTC; sin esto, las ventas después de las
 * 18:00 hora local caerían en el "hoy" del día siguiente. CDMX no aplica
 * horario de verano desde 2022, así que el offset -06:00 es fijo.
 */
const CDMX_UTC_OFFSET_HOURS = 6
const CDMX_OFFSET_SUFFIX = "-06:00"
const DAY_MS = 24 * 3_600_000

/** Fecha en formato YYYY-MM-DD (día calendario CDMX). */
export type DateString = string

export const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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
    toIso: new Date(from + DAY_MS).toISOString(),
  }
}

/** Día de operación CDMX (YYYY-MM-DD) que contiene `reference`. */
export function cdmxDateString(reference: Date = new Date()): DateString {
  return new Date(reference.getTime() - CDMX_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10)
}

/** Suma `days` (puede ser negativo) a una fecha YYYY-MM-DD. */
export function addDays(date: DateString, days: number): DateString {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Primer día del mes de una fecha YYYY-MM-DD. */
export function startOfMonth(date: DateString): DateString {
  return `${date.slice(0, 7)}-01`
}

/** Valida y normaliza una fecha YYYY-MM-DD; devuelve null si es inválida. */
export function parseDateString(value: string | undefined | null): DateString | null {
  if (!value || !DATE_STRING_PATTERN.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value
}

/**
 * Límites UTC [from 00:00 CDMX, (to + 1 día) 00:00 CDMX) para consultar
 * tickets por `created_at` en un rango de días de operación inclusivo.
 */
export function cdmxDaysToUtcRange(from: DateString, to: DateString): DayRange {
  return {
    fromIso: new Date(`${from}T00:00:00${CDMX_OFFSET_SUFFIX}`).toISOString(),
    toIso: new Date(`${addDays(to, 1)}T00:00:00${CDMX_OFFSET_SUFFIX}`).toISOString(),
  }
}

/** Convierte YYYY-MM-DD a Date local (mediodía, para evitar saltos de zona en calendarios). */
export function dateStringToLocalDate(date: DateString): Date {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d, 12)
}

/** Convierte un Date local (del calendario) a YYYY-MM-DD según sus componentes locales. */
export function localDateToDateString(date: Date): DateString {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/* ------------------------------------------------------------------ */
/*  Presets de rango para reportes                                     */
/* ------------------------------------------------------------------ */

export type RangePreset = "hoy" | "ayer" | "7dias" | "30dias" | "mes"

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "7dias", label: "7 días" },
  { key: "30dias", label: "30 días" },
  { key: "mes", label: "Este mes" },
]

export function presetRange(preset: RangePreset, today: DateString = cdmxDateString()): { from: DateString; to: DateString } {
  switch (preset) {
    case "hoy":
      return { from: today, to: today }
    case "ayer": {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case "7dias":
      return { from: addDays(today, -6), to: today }
    case "30dias":
      return { from: addDays(today, -29), to: today }
    case "mes":
      return { from: startOfMonth(today), to: today }
  }
}

/** Devuelve el preset que coincide exactamente con el rango, si hay. */
export function matchPreset(from: DateString, to: DateString, today: DateString = cdmxDateString()): RangePreset | null {
  for (const { key } of RANGE_PRESETS) {
    const r = presetRange(key, today)
    if (r.from === from && r.to === to) return key
  }
  return null
}

/** "15 ago 2026" en es-MX a partir de YYYY-MM-DD, sin depender de la zona del navegador. */
export function formatDateString(date: DateString, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return dateStringToLocalDate(date).toLocaleDateString("es-MX", options)
}
