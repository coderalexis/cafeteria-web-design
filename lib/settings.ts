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
  /** Qué imprimir solo al cobrar, sin pasos extra del cajero. */
  autoPrint: "none" | "ticket" | "comanda" | "both"
  /** Módulo del POS: guardar pedidos a medias y retomarlos. */
  parkedOrders: boolean
  /**
   * Descuento máximo (%) que puede aplicar un cajero. 0 = solo administradores,
   * 100 = sin límite. Dueños y administradores nunca tienen techo. Lo valida el
   * RPC, no solo la pantalla.
   */
  discountMaxCashier: number
  /**
   * Nota al pie del menú público: lo que en la carta impresa va en letra chica
   * ("nuestros jarabes son libres de azúcar", "precios con IVA"). No sale en el
   * ticket — para eso está `receipt_footer`.
   */
  menuNote: string
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  lockMinutes: 0,
  dailyGoal: null,
  monthlyGoal: null,
  hideChecklist: false,
  weeklyEmail: true,
  publicMenu: false,
  autoPrint: "none",
  // Encendido por defecto: no asume hardware ni expone datos, y le sirve a
  // cualquier cafetería con fila.
  parkedOrders: true,
  // 100 = como se comportaba antes de existir el ajuste.
  discountMaxCashier: 100,
  menuNote: "",
}

/** Meta en pesos: entero positivo con tope sano. */
export function parseGoal(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(Math.round(n), 99_999_999)
}

export const LOCK_MINUTES_OPTIONS = [0, 1, 2, 5, 10, 15, 30] as const

/** Tope de las notas del menú: son letra chica, no un párrafo. */
export const MENU_NOTE_MAX = 200
export const CATEGORY_NOTE_MAX = 140

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
    if (r.auto_print === "ticket" || r.auto_print === "comanda" || r.auto_print === "both") {
      out.autoPrint = r.auto_print
    }
    out.parkedOrders = r.parked_orders !== false
    const tope = Number(r.discount_max_cashier)
    if (Number.isFinite(tope) && tope >= 0 && tope <= 100) {
      out.discountMaxCashier = Math.round(tope)
    }
    if (typeof r.menu_note === "string") out.menuNote = r.menu_note.slice(0, MENU_NOTE_MAX)
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
    auto_print: s.autoPrint,
    parked_orders: s.parkedOrders,
    discount_max_cashier: s.discountMaxCashier,
    menu_note: s.menuNote,
  }
}
