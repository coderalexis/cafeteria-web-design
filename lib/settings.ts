import { normalizeClosingTime } from "./cash-session"

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
  /** Módulo del POS: cuentas abiertas (se les suma cada ronda y se cobran al final). */
  parkedOrders: boolean
  /**
   * Descuento máximo (%) que puede aplicar un cajero. 0 = solo administradores,
   * 100 = sin límite. Dueños y administradores nunca tienen techo. Lo valida el
   * RPC, no solo la pantalla.
   */
  discountMaxCashier: number
  /**
   * Hora a la que cierra la cafetería ("HH:MM"), o "" si no la configuró.
   * Con ella, la caja olvidada se cierra sola a esa hora + gracia; sin ella,
   * a las 12 h de abierta. Ver `lib/cash-session.ts`.
   */
  closingTime: string
  /**
   * Cargo por «Para llevar» ($): se suma al total cuando la venta se marca
   * así. 0 = sin cargo. El MONTO lo aplica el servidor desde estos ajustes;
   * el POS solo manda la bandera.
   */
  takeoutFee: number
  /**
   * Comisión de la terminal de tarjeta (%), p. ej. Mercado Pago ≈ 4. SOLO
   * para reportes: al cliente no se le cobra de más — ventas y cortes
   * muestran la comisión estimada y el neto del negocio.
   */
  cardFeePct: number
  /** Lealtad con sellos: tarjeta digital por teléfono. Apagado por defecto —
   *  guardar teléfonos de clientes es una decisión del dueño. */
  loyalty: boolean
  /** Sellos necesarios para el premio (2–30). */
  loyaltyTarget: number
  /** Qué es el premio, en palabras del negocio («Bebida gratis»). */
  loyaltyReward: string
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
  closingTime: "",
  takeoutFee: 0,
  cardFeePct: 0,
  loyalty: false,
  loyaltyTarget: 10,
  loyaltyReward: "Bebida gratis",
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
    if (typeof r.closing_time === "string") out.closingTime = normalizeClosingTime(r.closing_time)
    const cargo = Number(r.takeout_fee)
    if (Number.isFinite(cargo) && cargo > 0) out.takeoutFee = Math.min(Math.round(cargo * 100) / 100, 100)
    const comision = Number(r.card_fee_pct)
    if (Number.isFinite(comision) && comision > 0) out.cardFeePct = Math.min(Math.round(comision * 100) / 100, 20)
    out.loyalty = r.loyalty === true
    const meta = Number(r.loyalty_target)
    if (Number.isFinite(meta) && meta >= 2 && meta <= 30) out.loyaltyTarget = Math.round(meta)
    if (typeof r.loyalty_reward === "string" && r.loyalty_reward.trim()) {
      out.loyaltyReward = r.loyalty_reward.trim().slice(0, 60)
    }
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
    closing_time: s.closingTime,
    takeout_fee: s.takeoutFee,
    card_fee_pct: s.cardFeePct,
    loyalty: s.loyalty,
    loyalty_target: s.loyaltyTarget,
    loyalty_reward: s.loyaltyReward,
  }
}
