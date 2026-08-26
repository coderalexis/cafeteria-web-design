/**
 * Cambio de precios en lote (P3). El cálculo vive aquí para que el diálogo
 * (vista previa en el cliente) y la server action apliquen exactamente lo mismo.
 */

export interface BulkPricesInput {
  /** null = todo el menú. */
  categoryId: string | null
  direction: "subir" | "bajar"
  kind: "percent" | "amount"
  value: number
  rounding: "peso" | "cincuenta" | "exacto"
}

export const ROUNDING_LABELS: Record<BulkPricesInput["rounding"], string> = {
  peso: "Al peso ($66)",
  cincuenta: "A los 50 centavos ($65.50)",
  exacto: "Sin redondeo",
}

export function computeBulkPrice(price: number, input: BulkPricesInput): number {
  const sign = input.direction === "subir" ? 1 : -1
  const raw = input.kind === "percent" ? price * (1 + (sign * input.value) / 100) : price + sign * input.value
  const rounded =
    input.rounding === "peso"
      ? Math.round(raw)
      : input.rounding === "cincuenta"
      ? Math.round(raw * 2) / 2
      : Math.round(raw * 100) / 100
  return Math.max(1, rounded)
}
