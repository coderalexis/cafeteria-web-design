/**
 * Cuántas opciones de un grupo puede elegir el cajero.
 *
 * En la base son tres columnas (`min_select`, `max_select`, `is_required`) que
 * codifican UNA sola decisión, y que además se pisan: `is_required` no es más
 * que «el mínimo es al menos 1» — el POS hace `max(min_select, required?1:0)`.
 * Pedirle eso a quien administra una cafetería es pedirle que traduzca de la
 * base de datos. Aquí vive la traducción, en los dos sentidos.
 */

export interface ChoiceRule {
  min: number
  max: number | null
}

export type ChoiceKey = "una-obligatoria" | "una-opcional" | "varias" | "hasta" | "exacto" | "al-menos"

export interface ChoicePreset {
  key: ChoiceKey
  label: string
  hint: string
  /** Necesita que además se escriba un número. */
  needsNumber?: boolean
}

export const CHOICE_PRESETS: ChoicePreset[] = [
  {
    key: "una-obligatoria",
    label: "Una, y es obligatoria",
    hint: "No se puede cobrar sin elegir. Para «¿con pollo o con huevo?».",
  },
  {
    key: "una-opcional",
    label: "Una, o ninguna",
    hint: "Puede elegir una o saltárselo. Para «¿tipo de leche?».",
  },
  {
    key: "varias",
    label: "Las que quiera, o ninguna",
    hint: "Sin tope. Para extras que se pueden acumular.",
  },
  { key: "hasta", label: "Hasta cierto número", hint: "Varias, pero no más de las que digas.", needsNumber: true },
  { key: "exacto", label: "Un número exacto", hint: "Ni más ni menos. Para «elige 2 ingredientes».", needsNumber: true },
  { key: "al-menos", label: "Al menos cierto número", hint: "Un mínimo, sin tope arriba.", needsNumber: true },
]

/** Regla → clave del preset (y el número que lo acompaña, si aplica). */
export function ruleToChoice(rule: ChoiceRule): { key: ChoiceKey; count: number } {
  const min = Math.max(0, rule.min)
  const max = rule.max
  if (max === 1) return { key: min >= 1 ? "una-obligatoria" : "una-opcional", count: 1 }
  if (max === null) return min >= 1 ? { key: "al-menos", count: min } : { key: "varias", count: 2 }
  if (min === max) return { key: "exacto", count: max }
  if (min <= 0) return { key: "hasta", count: max }
  // Un rango de verdad (de 1 a 3) no tiene preset propio: se aproxima al tope,
  // que es la mitad que de verdad limita lo que se puede cobrar.
  return { key: "hasta", count: max }
}

/** Clave del preset + número → regla. */
export function choiceToRule(key: ChoiceKey, count: number): ChoiceRule {
  const n = Math.min(20, Math.max(1, Math.round(count) || 1))
  switch (key) {
    case "una-obligatoria":
      return { min: 1, max: 1 }
    case "una-opcional":
      return { min: 0, max: 1 }
    case "varias":
      return { min: 0, max: null }
    case "hasta":
      return { min: 0, max: n }
    case "exacto":
      return { min: n, max: n }
    case "al-menos":
      return { min: n, max: null }
  }
}

/**
 * El texto EXACTO que el POS muestra bajo el nombre del grupo. Vive aquí para
 * que la vista previa del panel y la pantalla de cobro no puedan separarse.
 */
export function choiceHint(rule: ChoiceRule): string {
  const { min, max } = rule
  if (max === 1 && min >= 1) return "Elige una"
  if (max === 1) return "Elige una (opcional)"
  if (min > 0 && min === max) return `Elige ${min}`
  if (min > 0 && max) return `Elige de ${min} a ${max}`
  if (min > 0) return `Elige al menos ${min}`
  if (max) return `Hasta ${max} (opcional)`
  return "Opcional"
}
