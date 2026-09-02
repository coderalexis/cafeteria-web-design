/**
 * Ayudas chicas y constantes del POS que comparten la pantalla principal y
 * sus piezas (carrito, encabezado, atajos). Sin React y sin red: todo aquí es
 * puro o toca solo APIs del navegador.
 */
export const CASH_QUICK_AMOUNTS = [50, 100, 200, 500]

/**
 * Billetes probables para ESTE total (una cuenta de $87 se paga con $90, $100
 * o $200 — no con $50). Redondeos típicos hacia arriba, sin repetidos.
 */
export function cashSuggestions(due: number): number[] {
  if (due <= 0) return CASH_QUICK_AMOUNTS.slice(0, 3)
  const up = (m: number) => Math.ceil(due / m) * m
  const out: number[] = []
  for (const c of [up(10), up(20), up(50), up(100), up(200), up(500)]) {
    if (c > due && !out.includes(c)) out.push(c)
    if (out.length === 3) break
  }
  return out
}

/** Vibración corta si el aparato puede: confirma el toque sin mirar. */
export function vibra(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* sin soporte */
  }
}

/** Notas rápidas de un toque; el texto libre sigue disponible. */
export const QUICK_NOTES = ["Para llevar", "Aquí"]

/** Si el plegable de "Más opciones" queda abierto, por dispositivo. */
export const MORE_OPTIONS_KEY = "pos-more-options"

/** Cuánto hay que arrastrar una línea del carrito para que cuente el gesto.
 *  90px: un tirón franco. Menos y el scroll diagonal disparaba acciones. */
export const UMBRAL_GESTO = 90
/** Mantener presionado este tiempo abre la nota de la línea. */
export const PRESION_LARGA_MS = 500

/**
 * ¿El evento nació DE VERDAD dentro de la tarjeta, y no sobre un control?
 *
 * Dos trampas que ya mordieron:
 * - Los eventos de React ATRAVIESAN los portales: tocar una opción del menú ⋯
 *   (que vive en un portal del body) burbujea por el árbol de React hasta la
 *   tarjeta. contains() lo descarta, porque en el DOM esa opción no es hija
 *   de la tarjeta.
 * - Las opciones de Radix son div[role="menuitem"], no <button>: la lista de
 *   exclusión debe nombrarlas.
 */
export function gestoEnTarjeta(e: { currentTarget: EventTarget & Element; target: EventTarget }): boolean {
  const t = e.target as HTMLElement
  return e.currentTarget.contains(t) && !t.closest("button, input, a, [role='menuitem']")
}

/** Opciones de propina: porcentaje del total, "sin propina" o monto libre. */
export type TipChoice = number | "otro"
export const TIP_OPTIONS: TipChoice[] = [0, 5, 10, 15, "otro"]

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
}
