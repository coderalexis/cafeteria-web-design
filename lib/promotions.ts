/**
 * Vocabulario de las promociones, compartido entre el servidor y la pantalla.
 *
 * Vive aquí y no en `app/actions/promotions.ts` por la misma razón que los
 * gastos: un módulo `"use server"` solo puede exportar funciones, y cualquier
 * otra cosa llega al cliente como un envoltorio inservible.
 */

import { formatCurrency } from "@/lib/format"

export const TIPOS_PROMO = ["porcentaje", "monto"] as const
export type TipoPromo = (typeof TIPOS_PROMO)[number]

export const AMBITOS_PROMO = ["ticket", "categoria"] as const
export type AmbitoPromo = (typeof AMBITOS_PROMO)[number]

/** 0 = domingo, igual que `extract(dow)` en Postgres. */
export const DIAS = [
  { valor: 0, corto: "D", largo: "domingo" },
  { valor: 1, corto: "L", largo: "lunes" },
  { valor: 2, corto: "M", largo: "martes" },
  { valor: 3, corto: "M", largo: "miércoles" },
  { valor: 4, corto: "J", largo: "jueves" },
  { valor: 5, corto: "V", largo: "viernes" },
  { valor: 6, corto: "S", largo: "sábado" },
] as const

export interface Promocion {
  id: string
  name: string
  kind: TipoPromo
  value: number
  scope: AmbitoPromo
  categoryId: string | null
  categoryName: string | null
  weekdays: number[]
  startHour: number
  endHour: number
  startsOn: string | null
  endsOn: string | null
  minTicket: number
  isActive: boolean
}

/** «14» → «2 p.m.»; 24 es la medianoche del día siguiente. */
export function horaLegible(h: number): string {
  if (h === 24) return "medianoche"
  if (h === 0) return "12 a.m."
  if (h === 12) return "12 p.m."
  return h < 12 ? `${h} a.m.` : `${h - 12} p.m.`
}

/** «Lunes y martes de 3 p.m. a 6 p.m.» — la regla dicha como la diría una persona. */
export function cuandoLegible(p: Pick<Promocion, "weekdays" | "startHour" | "endHour">): string {
  const dias = [...p.weekdays].sort((a, b) => a - b)
  let cuando: string
  if (dias.length === 7) {
    cuando = "Todos los días"
  } else if (dias.length === 5 && [1, 2, 3, 4, 5].every((d) => dias.includes(d))) {
    cuando = "De lunes a viernes"
  } else if (dias.length === 2 && dias.includes(0) && dias.includes(6)) {
    cuando = "Sábados y domingos"
  } else {
    const nombres = dias.map((d) => DIAS[d]?.largo ?? "").filter(Boolean)
    cuando =
      nombres.length === 1
        ? `Los ${nombres[0]}`
        : `Los ${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`
  }
  return `${cuando} de ${horaLegible(p.startHour)} a ${horaLegible(p.endHour)}`
}

/** «20 % en Frappés» / «$25 de toda la venta». */
export function queDaLegible(p: Pick<Promocion, "kind" | "value" | "scope" | "categoryName">): string {
  const cuanto = p.kind === "porcentaje" ? `${p.value}%` : `$${p.value.toFixed(2)}`
  return p.scope === "categoria" ? `${cuanto} en ${p.categoryName ?? "una categoría"}` : `${cuanto} de toda la venta`
}

/* ------------------------------------------------------------------ */
/*  Vista previa: la regla con un ejemplo real, los empalmes y lo que  */
/*  falta, ANTES de guardar. Nadie se imagina «20 % en Frappés los     */
/*  martes de 4 a 6»; sí se imagina «un Frappé de mango de $65 quedará */
/*  en $52».                                                           */
/* ------------------------------------------------------------------ */

export interface BorradorPromo {
  id?: string
  name: string
  kind: TipoPromo
  value: number
  scope: AmbitoPromo
  categoryId: string | null
  weekdays: number[]
  startHour: number
  endHour: number
  minTicket: number
}

/** Un producto de muestra de una categoría, con su precio más bajo. */
export interface EjemploProducto {
  nombre: string
  precio: number
}

const VENTA_DE_MUESTRA = 150

/**
 * «Un Frappé de mango de $65 quedará en $52 (ahorra $13)». Para toda la venta
 * se usa una venta de muestra de $150, o la compra mínima si es mayor. Sin
 * producto de muestra en la categoría, no hay ejemplo (y no se inventa).
 */
export function ejemploPromo(
  p: Pick<BorradorPromo, "kind" | "value" | "scope" | "categoryId" | "minTicket">,
  ejemplos: Record<string, EjemploProducto>,
): { sujeto: string; antes: number; despues: number; ahorro: number } | null {
  if (!(p.value > 0)) return null
  let sujeto: string
  let antes: number
  if (p.scope === "categoria") {
    const e = p.categoryId ? ejemplos[p.categoryId] : undefined
    if (!e) return null
    sujeto = `un ${e.nombre} de ${formatCurrency(e.precio)}`
    antes = e.precio
  } else {
    antes = Math.max(VENTA_DE_MUESTRA, p.minTicket || 0)
    sujeto = `una venta de ${formatCurrency(antes)}`
  }
  const bruto = p.kind === "porcentaje" ? (antes * p.value) / 100 : p.value
  const ahorro = Math.round(Math.min(bruto, antes) * 100) / 100
  return { sujeto, antes, despues: Math.round((antes - ahorro) * 100) / 100, ahorro }
}

/**
 * Las promociones vivas que caen a la misma hora que esta y tocan lo mismo
 * (toda la venta toca a todas; una categoría solo a la suya). No se acumulan,
 * así que hay que decirlo antes de guardar, no descubrirlo en caja.
 */
export function promosEmpalmadas(p: BorradorPromo, otras: Promocion[]): Promocion[] {
  return otras.filter(
    (o) =>
      o.isActive &&
      o.id !== p.id &&
      o.weekdays.some((d) => p.weekdays.includes(d)) &&
      p.startHour < o.endHour &&
      o.startHour < p.endHour &&
      (p.scope === "ticket" || o.scope === "ticket" || o.categoryId === p.categoryId),
  )
}

/** «Tarde de frappés» (los martes de 4 p.m. a 6 p.m.) */
export function empalmeLegible(o: Promocion): string {
  return `«${o.name}» (${cuandoLegible(o).toLowerCase()})`
}

/** Un solo mensaje con lo primero que falta, o null si ya se puede guardar. */
export function validarPromo(p: BorradorPromo): string | null {
  if (p.name.trim().length < 2) return "Ponle un nombre: el cliente lo verá en su ticket."
  if (!(p.value > 0)) return "Di cuánto descuenta."
  if (p.kind === "porcentaje" && p.value > 100) return "Más de 100 % sería regalar dinero. Ponle un porcentaje menor."
  if (p.scope === "categoria" && !p.categoryId) return "Elige la categoría a la que aplica."
  if (p.weekdays.length === 0) return "Elige al menos un día."
  if (p.endHour <= p.startHour) return "La hora final tiene que ser después de la inicial."
  return null
}
