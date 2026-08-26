/**
 * Reglas del auto-registro (/registro). Puras y probables aparte: son la puerta
 * más expuesta del sistema, la única que cualquiera en internet puede empujar.
 */

/** Prueba gratuita al registrarse por cuenta propia. */
export const TRIAL_DAYS = 7

/**
 * Freno de emergencia, NO la defensa principal. Un tope bajo se vuelve un arma:
 * quien cree 3 cafeterías basura de madrugada dejaría fuera a los clientes
 * legítimos de todo el día. Lo que filtra bots de verdad es exigir correo
 * verificado y una cafetería por cuenta; esto solo evita una avalancha.
 */
export const MAX_SELF_SIGNUPS_PER_DAY = 25

/** Slugs que nadie debe poder apartarse desde el registro público. */
const RESERVADOS = new Set([
  "admin", "super", "api", "app", "pos", "login", "registro", "menu", "ayuda",
  "cuenta", "cafecito", "cafecitopos", "soporte", "test", "demo", "plantilla",
  "plantilla-cafeteria", "www", "root", "null", "undefined",
])

export function isReservedSlug(slug: string): boolean {
  return RESERVADOS.has(slug)
}

/**
 * Slug libre a partir del nombre del café. Si está tomado o reservado, prueba
 * -2, -3… El operador puede renombrarlo después; el dueño no.
 */
export function pickSlug(base: string, taken: Set<string>): string | null {
  const raíz = base.slice(0, 40) || "cafeteria"
  for (let i = 1; i <= 50; i++) {
    const intento = i === 1 ? raíz : `${raíz}-${i}`.slice(0, 50)
    if (!taken.has(intento) && !isReservedSlug(intento)) return intento
  }
  return null
}

/** Fin de la prueba a partir del alta. */
export function trialEndsAt(from: Date): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + TRIAL_DAYS)
  return d
}

export type TrialState = "none" | "running" | "last-day" | "ending-soon" | "expired"

/**
 * En qué punto de la prueba está. `lastDay` es el que dispara la alerta roja:
 * el objetivo es que a nadie le caiga el vencimiento con la caja abierta.
 */
export function trialState(
  trialEndsAt: string | null,
  now: Date = new Date(),
): { state: TrialState; daysLeft: number } {
  if (!trialEndsAt) return { state: "none", daysLeft: 0 }
  const fin = new Date(trialEndsAt).getTime()
  const ms = fin - now.getTime()
  if (ms <= 0) return { state: "expired", daysLeft: 0 }
  const daysLeft = Math.ceil(ms / 86_400_000)
  if (daysLeft <= 1) return { state: "last-day", daysLeft: 1 }
  if (daysLeft <= 2) return { state: "ending-soon", daysLeft }
  return { state: "running", daysLeft }
}
