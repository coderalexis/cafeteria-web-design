/**
 * Ajustes por cafetería guardados en `businesses.settings` (jsonb).
 * Un solo lugar para leerlos con defaults seguros: valores raros o de
 * versiones viejas nunca deben romper la app.
 */

export interface BusinessSettings {
  /** Minutos de inactividad para bloquear el POS con PIN (0 = desactivado). */
  lockMinutes: number
  /** Meta de venta diaria en pesos (null = sin meta). */
  dailyGoal: number | null
  /** Meta de venta mensual en pesos (null = sin meta). */
  monthlyGoal: number | null
  /** El dueño ocultó la checklist de arranque del dashboard. */
  hideChecklist: boolean
  /** Resumen semanal por correo a dueños/administradores (lunes por la mañana). */
  weeklyEmail: boolean
  /** Menú público en /menu/<slug> para el QR. Apagado hasta que el dueño lo active. */
  publicMenu: boolean
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  lockMinutes: 0,
  dailyGoal: null,
  monthlyGoal: null,
  hideChecklist: false,
  weeklyEmail: true,
  publicMenu: false,
}

/** Meta en pesos: entero positivo con tope sano. */
export function parseGoal(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(Math.round(n), 99_999_999)
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
    out.dailyGoal = parseGoal(r.daily_goal)
    out.monthlyGoal = parseGoal(r.monthly_goal)
    out.hideChecklist = r.hide_checklist === true
    out.weeklyEmail = r.weekly_email !== false
    out.publicMenu = r.public_menu === true
  }
  return out
}

/** Forma persistida (claves snake_case en el jsonb). */
export function serializeBusinessSettings(s: BusinessSettings): Record<string, unknown> {
  // Claves explícitas (incluso en null): al mezclar sobre el jsonb existente,
  // borrar una meta debe borrarla de verdad, no dejar el valor viejo.
  return {
    lock_minutes: s.lockMinutes,
    daily_goal: s.dailyGoal,
    monthly_goal: s.monthlyGoal,
    hide_checklist: s.hideChecklist,
    weekly_email: s.weeklyEmail,
    public_menu: s.publicMenu,
  }
}
