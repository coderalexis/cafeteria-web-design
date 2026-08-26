/**
 * Color por categoría (`menu_categories.color`). Las clases se escriben
 * completas porque Tailwind no puede resolver nombres construidos al vuelo.
 */

export const CATEGORY_COLORS = [
  "amber",
  "orange",
  "rose",
  "pink",
  "violet",
  "indigo",
  "sky",
  "teal",
  "emerald",
  "lime",
  "stone",
] as const

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

export interface ColorClasses {
  /** Nombre para la UI de administración. */
  label: string
  /** Chip de categoría seleccionado. */
  chipActive: string
  /** Chip de categoría sin seleccionar. */
  chip: string
  /** Franja lateral de la tarjeta de producto. */
  accent: string
  /** Punto de color (selector). */
  dot: string
}

export const COLOR_CLASSES: Record<CategoryColor, ColorClasses> = {
  amber: {
    label: "Ámbar",
    chipActive: "bg-amber-600 hover:bg-amber-700 text-white border-amber-600",
    chip: "border-amber-300 text-amber-800 hover:bg-amber-50",
    accent: "bg-amber-400",
    dot: "bg-amber-500",
  },
  orange: {
    label: "Naranja",
    chipActive: "bg-orange-600 hover:bg-orange-700 text-white border-orange-600",
    chip: "border-orange-300 text-orange-800 hover:bg-orange-50",
    accent: "bg-orange-400",
    dot: "bg-orange-500",
  },
  rose: {
    label: "Rojo",
    chipActive: "bg-rose-600 hover:bg-rose-700 text-white border-rose-600",
    chip: "border-rose-300 text-rose-800 hover:bg-rose-50",
    accent: "bg-rose-400",
    dot: "bg-rose-500",
  },
  pink: {
    label: "Rosa",
    chipActive: "bg-pink-600 hover:bg-pink-700 text-white border-pink-600",
    chip: "border-pink-300 text-pink-800 hover:bg-pink-50",
    accent: "bg-pink-400",
    dot: "bg-pink-500",
  },
  violet: {
    label: "Morado",
    chipActive: "bg-violet-600 hover:bg-violet-700 text-white border-violet-600",
    chip: "border-violet-300 text-violet-800 hover:bg-violet-50",
    accent: "bg-violet-400",
    dot: "bg-violet-500",
  },
  indigo: {
    label: "Azul marino",
    chipActive: "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600",
    chip: "border-indigo-300 text-indigo-800 hover:bg-indigo-50",
    accent: "bg-indigo-400",
    dot: "bg-indigo-500",
  },
  sky: {
    label: "Azul cielo",
    chipActive: "bg-sky-600 hover:bg-sky-700 text-white border-sky-600",
    chip: "border-sky-300 text-sky-800 hover:bg-sky-50",
    accent: "bg-sky-400",
    dot: "bg-sky-500",
  },
  teal: {
    label: "Turquesa",
    chipActive: "bg-teal-600 hover:bg-teal-700 text-white border-teal-600",
    chip: "border-teal-300 text-teal-800 hover:bg-teal-50",
    accent: "bg-teal-400",
    dot: "bg-teal-500",
  },
  emerald: {
    label: "Verde",
    chipActive: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
    chip: "border-emerald-300 text-emerald-800 hover:bg-emerald-50",
    accent: "bg-emerald-400",
    dot: "bg-emerald-500",
  },
  lime: {
    label: "Verde limón",
    chipActive: "bg-lime-600 hover:bg-lime-700 text-white border-lime-600",
    chip: "border-lime-300 text-lime-800 hover:bg-lime-50",
    accent: "bg-lime-400",
    dot: "bg-lime-500",
  },
  stone: {
    label: "Gris",
    chipActive: "bg-stone-600 hover:bg-stone-700 text-white border-stone-600",
    chip: "border-stone-300 text-stone-700 hover:bg-stone-100",
    accent: "bg-stone-400",
    dot: "bg-stone-500",
  },
}

/** Clases por defecto (categoría sin color asignado): el ámbar de la marca. */
export const DEFAULT_CHIP_ACTIVE = "bg-amber-700 hover:bg-amber-800 text-white border-amber-700"
export const DEFAULT_CHIP = "border-stone-300 text-stone-600 hover:bg-stone-100"

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && (CATEGORY_COLORS as readonly string[]).includes(value)
}

export function colorClasses(color: string | null | undefined): ColorClasses | null {
  return isCategoryColor(color) ? COLOR_CLASSES[color] : null
}
