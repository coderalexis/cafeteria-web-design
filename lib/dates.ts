/**
 * Día de operación de cada cafetería en SU zona horaria (`businesses.timezone`).
 *
 * El servidor (Vercel) corre en UTC; sin esto, las ventas después de las
 * 18:00 hora local caerían en el "hoy" del día siguiente. México tiene
 * varias zonas (Centro, Pacífico, Noroeste con horario de verano…), así que
 * todo se calcula con Intl a partir de un nombre IANA, sin offsets fijos.
 * Sin dependencias de servidor: se usa en server components, actions y cliente.
 */

export const DEFAULT_TIMEZONE = "America/Mexico_City"
const DAY_MS = 24 * 3_600_000

/** Fecha en formato YYYY-MM-DD (día calendario en la zona del negocio). */
export type DateString = string

export const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface DayRange {
  /** Inicio del día de operación (00:00 local) en ISO UTC, inclusivo. */
  fromIso: string
  /** Inicio del día siguiente en ISO UTC, exclusivo. */
  toIso: string
}

/* ------------------------------------------------------------------ */
/*  Zonas horarias                                                     */
/* ------------------------------------------------------------------ */

/** Zonas de México (etiqueta para la UI). Cualquier IANA válida se acepta igualmente. */
export const MEXICO_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Mexico_City", label: "Centro — Ciudad de México, Guadalajara, Puebla, León (UTC−6)" },
  { value: "America/Monterrey", label: "Centro — Monterrey (UTC−6)" },
  { value: "America/Merida", label: "Centro — Mérida, Campeche (UTC−6)" },
  { value: "America/Bahia_Banderas", label: "Centro — Bahía de Banderas (UTC−6)" },
  { value: "America/Cancun", label: "Sureste — Cancún, Quintana Roo (UTC−5)" },
  { value: "America/Chihuahua", label: "Centro — Chihuahua (UTC−6)" },
  { value: "America/Ojinaga", label: "Frontera — Ojinaga (con horario de verano)" },
  { value: "America/Ciudad_Juarez", label: "Frontera — Ciudad Juárez (con horario de verano)" },
  { value: "America/Matamoros", label: "Frontera — Matamoros, Reynosa, Nuevo Laredo (con horario de verano)" },
  { value: "America/Mazatlan", label: "Pacífico — Mazatlán, La Paz, Culiacán (UTC−7)" },
  { value: "America/Hermosillo", label: "Pacífico — Hermosillo, Sonora (UTC−7)" },
  { value: "America/Tijuana", label: "Noroeste — Tijuana, Mexicali, Ensenada (con horario de verano)" },
]

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    formatterCache.set(tz, f)
  }
  return f
}

/** ¿Es un nombre de zona IANA que el runtime reconoce? */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

interface ZonedParts {
  y: number
  m: number
  d: number
  hh: number
  mm: number
  ss: number
}

/** Componentes de fecha/hora "de reloj de pared" de un instante en `tz`. */
function zonedParts(instant: Date, tz: string): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  // hourCycle h23 puede devolver "24" en algunos motores para medianoche
  const hh = get("hour") % 24
  return { y: get("year"), m: get("month"), d: get("day"), hh, mm: get("minute"), ss: get("second") }
}

/** Offset (ms) de `tz` respecto a UTC en ese instante: local = utc + offset. */
function tzOffsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** Día calendario (YYYY-MM-DD) en `tz` que contiene `reference`. */
export function dateStringInTz(tz: string, reference: Date = new Date()): DateString {
  const p = zonedParts(reference, tz)
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
}

/**
 * Instante UTC de la medianoche local de `date` en `tz`. Correcto también en
 * los cambios de horario de verano (se recalcula el offset en el resultado).
 */
export function zonedMidnightUtc(tz: string, date: DateString): Date {
  const [y, m, d] = date.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0)
  const off1 = tzOffsetMs(new Date(guess), tz)
  let result = guess - off1
  const off2 = tzOffsetMs(new Date(result), tz)
  if (off2 !== off1) result = guess - off2
  return new Date(result)
}

/**
 * Límites UTC [from 00:00 local, (to + 1 día) 00:00 local) para consultar
 * tickets por `created_at` en un rango de días de operación inclusivo.
 */
export function daysToUtcRange(tz: string, from: DateString, to: DateString): DayRange {
  return {
    fromIso: zonedMidnightUtc(tz, from).toISOString(),
    toIso: zonedMidnightUtc(tz, addDays(to, 1)).toISOString(),
  }
}

/** Rango UTC [from, to) del día de operación en `tz` que contiene `reference`. */
export function businessDayRange(tz: string, reference: Date = new Date()): DayRange {
  const today = dateStringInTz(tz, reference)
  return daysToUtcRange(tz, today, today)
}

/* ------------------------------------------------------------------ */
/*  Aritmética de YYYY-MM-DD (independiente de zona)                   */
/* ------------------------------------------------------------------ */

/** Hora local (0-23) en la zona dada; para comparar "a esta hora" entre dias. */
export function hourInTz(tz: string, reference: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(reference),
  )
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

/** Días entre dos fechas YYYY-MM-DD (b - a). */
export function daysBetween(a: DateString, b: DateString): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / DAY_MS)
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

/** Rango del preset relativo a `today` (el día de operación del negocio). */
export function presetRange(preset: RangePreset, today: DateString): { from: DateString; to: DateString } {
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
export function matchPreset(from: DateString, to: DateString, today: DateString): RangePreset | null {
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
