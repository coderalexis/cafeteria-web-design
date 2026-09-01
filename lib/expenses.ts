/**
 * Vocabulario de los gastos, compartido entre el servidor y la pantalla.
 *
 * Vive aquí y no en `app/actions/expenses.ts` porque un módulo `"use server"`
 * solo puede exportar funciones: cualquier otra cosa llega al cliente como un
 * envoltorio inservible —una lista deja de tener `.map`— y revienta al pintar.
 */

export const CATEGORIAS_GASTO = [
  "renta",
  "sueldos",
  "servicios",
  "insumos",
  "mantenimiento",
  "publicidad",
  "impuestos",
  "otros",
] as const

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

/** Cómo se le llama a cada categoría en pantalla. */
export const ETIQUETA_CATEGORIA: Record<CategoriaGasto, string> = {
  renta: "Renta",
  sueldos: "Sueldos",
  servicios: "Luz, agua y gas",
  insumos: "Compras y suministros",
  mantenimiento: "Mantenimiento",
  publicidad: "Publicidad",
  impuestos: "Impuestos",
  otros: "Otros",
}

export const FORMAS_PAGO = ["efectivo", "transferencia", "tarjeta", "otro"] as const

export type FormaPago = (typeof FORMAS_PAGO)[number]

export interface GastoFijo {
  id: string
  name: string
  category: CategoriaGasto
  monthlyAmount: number
  isActive: boolean
}

export interface Gasto {
  id: string
  spentOn: string
  category: CategoriaGasto
  description: string
  amount: number
  paidWith: string | null
  /** Nació de una salida de caja, no se capturó a mano. */
  fromCashMovement: boolean
}
