/**
 * Ajustes por cafetería guardados en `businesses.settings` (jsonb).
 * Un solo lugar para leerlos con defaults seguros: valores raros o de
 * versiones viejas nunca deben romper la app.
 */

export interface BusinessSettings {
  /** Minutos de inactividad para bloquear el POS con PIN (0 = desactivado). */
  lockMinutes: number
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  lockMinutes: 0,
}

export const LOCK_MINUTES_OPTIONS = [0, 1, 2, 5, 10, 15, 30] as const

export function parseBusinessSettings(raw: unknown): BusinessSettings {
  const out = { ...DEFAULT_SETTINGS }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>
    const lock = Number(r.lock_minutes)
    if (Number.isFinite(lock) && lock >= 0 && lock <= 120) {
      out.lockMinutes = Math.round(lock)
    }
  }
  return out
}

/** Forma persistida (claves snake_case en el jsonb). */
export function serializeBusinessSettings(s: BusinessSettings): Record<string, unknown> {
  return { lock_minutes: s.lockMinutes }
}
