import { dateStringInTz, zonedMidnightUtc } from "./dates"

/**
 * Cuándo una caja abierta deja de ser «un turno en curso» y pasa a ser un
 * olvido.
 *
 * Importa por dos razones distintas: un corte que abarca varios días vuelve el
 * arqueo imposible de cuadrar (el efectivo del cajón contra las ventas de tres
 * días no dice nada), y mientras haya caja abierta el negocio no puede abrir la
 * del día siguiente ni registrar su fondo inicial.
 *
 * Con hora de cierre configurada la respuesta es del negocio: su cierre más una
 * gracia corta. Sin configurar hay que suponer, y 12 h ya cubre la jornada de
 * cualquier cafetería.
 */

/** Gracia después de la hora de cierre declarada por el negocio. */
export const GRACIA_HORAS = 3
/** Sin hora de cierre configurada: tope desde que se abrió la caja. */
export const HORAS_SIN_HORARIO = 12
/** Techo absoluto, pase lo que pase (una caja abierta a las 11 pm de un
 *  negocio que cierra a las 10 pm no puede esperar hasta mañana). */
export const TECHO_HORAS = 24

const HORA = 3_600_000

/** "HH:MM" válida (00:00–23:59), o null. */
export function parseClosingTime(value: string | null | undefined): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return { h, m }
}

/** Normaliza a "HH:MM" para guardar; "" si no es válida. */
export function normalizeClosingTime(value: string | null | undefined): string {
  const parsed = parseClosingTime(value)
  return parsed ? `${String(parsed.h).padStart(2, "0")}:${String(parsed.m).padStart(2, "0")}` : ""
}

/**
 * Momento a partir del cual la caja se considera olvidada.
 *
 * Con horario: el PRIMER cierre posterior a la apertura, más la gracia. Se
 * busca el primero posterior y no «el de ese día» porque una caja abierta a
 * las 11 pm ya dejó atrás el cierre de las 10 pm.
 */
export function staleDeadline(
  openedAt: Date,
  timezone: string,
  closingTime: string | null | undefined,
): Date {
  const cierre = parseClosingTime(closingTime)
  if (!cierre) return new Date(openedAt.getTime() + HORAS_SIN_HORARIO * HORA)

  const dia = dateStringInTz(timezone, openedAt)
  const medianoche = zonedMidnightUtc(timezone, dia).getTime()
  let limite = medianoche + (cierre.h * 60 + cierre.m) * 60_000
  // Si el cierre de ese día ya pasó cuando se abrió, el siguiente es mañana.
  if (limite <= openedAt.getTime()) limite += 24 * HORA

  return new Date(Math.min(limite + GRACIA_HORAS * HORA, openedAt.getTime() + TECHO_HORAS * HORA))
}

export interface SessionState {
  /** Ya pasó el límite: la caja se cierra sola. */
  stale: boolean
  /** Horas que lleva abierta (redondeadas a una décima). */
  hoursOpen: number
  /** A partir de cuándo se cierra sola. */
  deadline: Date
  /** Se abrió en un día de operación anterior al de ahora. */
  fromEarlierDay: boolean
}

export function sessionState(
  openedAt: Date,
  timezone: string,
  closingTime: string | null | undefined,
  now: Date = new Date(),
): SessionState {
  const deadline = staleDeadline(openedAt, timezone, closingTime)
  return {
    stale: now.getTime() >= deadline.getTime(),
    hoursOpen: Math.round(((now.getTime() - openedAt.getTime()) / HORA) * 10) / 10,
    deadline,
    fromEarlierDay: dateStringInTz(timezone, openedAt) !== dateStringInTz(timezone, now),
  }
}

/** Motivo que queda escrito en el corte automático. */
export function autoCloseReason(hoursOpen: number, closingTime: string | null | undefined): string {
  const base = `Cerrada automáticamente: la caja llevaba ${hoursOpen} h abierta`
  return parseClosingTime(closingTime)
    ? `${base} (cierre configurado ${normalizeClosingTime(closingTime)} + ${GRACIA_HORAS} h de gracia). Sin arqueo: nadie contó el efectivo.`
    : `${base} (tope de ${HORAS_SIN_HORARIO} h sin horario configurado). Sin arqueo: nadie contó el efectivo.`
}
