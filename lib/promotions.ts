/**
 * Vocabulario de las promociones, compartido entre el servidor y la pantalla.
 *
 * Vive aquí y no en `app/actions/promotions.ts` por la misma razón que los
 * gastos: un módulo `"use server"` solo puede exportar funciones, y cualquier
 * otra cosa llega al cliente como un envoltorio inservible.
 */

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
