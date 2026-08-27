/**
 * Tamaño de letra del POS, por dispositivo.
 *
 * No es un ajuste del negocio: la tablet del mostrador y la laptop del dueño
 * son pantallas distintas, y quien atiende puede necesitar letra más grande
 * que quien administra. Por eso vive en el navegador y no en la base.
 *
 * Se aplica moviendo el tamaño de letra RAÍZ del documento. Todo el sistema
 * mide en `rem` (Tailwind incluido), así que escalan también los botones, los
 * espacios y las ventanas emergentes — no solo el texto. Un ajuste que solo
 * encogiera la letra dejaría los mismos huecos y no daría espacio de verdad.
 */

export const TEXT_SIZES = [
  { key: "compacto", label: "Compacto", hint: "Cabe más en pantalla", px: 14 },
  { key: "normal", label: "Normal", hint: "El de siempre", px: 16 },
  { key: "grande", label: "Grande", hint: "Más fácil de leer", px: 18 },
  { key: "extra", label: "Muy grande", hint: "Para vista cansada", px: 20 },
] as const

export type TextSizeKey = (typeof TEXT_SIZES)[number]["key"]

export const DEFAULT_TEXT_SIZE: TextSizeKey = "normal"
export const TEXT_SIZE_STORAGE_KEY = "pos-text-size"

export function isTextSizeKey(value: unknown): value is TextSizeKey {
  return typeof value === "string" && TEXT_SIZES.some((s) => s.key === value)
}

export function textSizePx(key: TextSizeKey): number {
  return TEXT_SIZES.find((s) => s.key === key)?.px ?? 16
}

/** Siguiente/anterior tamaño, para los botones A− y A+. */
export function stepTextSize(key: TextSizeKey, direction: 1 | -1): TextSizeKey {
  const i = TEXT_SIZES.findIndex((s) => s.key === key)
  const next = Math.min(TEXT_SIZES.length - 1, Math.max(0, (i === -1 ? 1 : i) + direction))
  return TEXT_SIZES[next].key
}

export function readTextSize(): TextSizeKey {
  try {
    const stored = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)
    return isTextSizeKey(stored) ? stored : DEFAULT_TEXT_SIZE
  } catch {
    return DEFAULT_TEXT_SIZE
  }
}

export function storeTextSize(key: TextSizeKey): void {
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, key)
  } catch {
    /* sin almacenamiento: vale solo para esta sesión */
  }
}
