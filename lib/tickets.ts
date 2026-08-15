/**
 * Forma serializable de un ticket para componentes cliente (POS y admin).
 * La construyen las server actions / server components desde las filas de
 * Supabase; los nombres de producto vienen de los snapshots de ticket_items.
 */

export type TicketStatus = "completado" | "cancelado"

export interface TicketItemModifierRecord {
  id: string
  name: string
  price: number
}

export interface TicketItemRecord {
  id: string
  quantity: number
  unitPrice: number
  lineTotal: number
  notes: string
  productName: string
  variantName: string
  sizeLabel: string
  modifiers: TicketItemModifierRecord[]
}

export interface TicketRecord {
  id: string
  folio: number
  paymentMethod: string
  subtotal: number
  discountTotal: number
  discountReason: string | null
  total: number
  notes: string
  createdAt: string
  cashierId: string
  cashierName: string
  status: TicketStatus
  cancelledAt: string | null
  cancelReason: string | null
  cancelledByName: string | null
  cashReceived: number | null
  changeDue: number | null
  items: TicketItemRecord[]
}

/** Columnas que necesita `serializeTicket`; usar en los `.select()`. */
export const TICKET_SELECT = `
  id, folio, payment_method, subtotal, discount_total, discount_reason, total, notes, created_at, cashier_id,
  status, cancelled_at, cancelled_by, cancel_reason, cash_received, change_due,
  ticket_items(
    id, quantity, unit_price, line_total, notes, product_name, variant_name, size_label,
    ticket_item_modifiers(id, modifier_name, modifier_price)
  )
` as const

/** Forma mínima de la fila que devuelve `TICKET_SELECT`. */
export interface TicketRow {
  id: string
  folio: number
  payment_method: string
  subtotal: number
  discount_total: number
  discount_reason: string | null
  total: number
  notes: string | null
  created_at: string
  cashier_id: string
  status: TicketStatus
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  cash_received: number | null
  change_due: number | null
  ticket_items: Array<{
    id: string
    quantity: number
    unit_price: number
    line_total: number
    notes: string | null
    product_name: string
    variant_name: string
    size_label: string | null
    ticket_item_modifiers?: Array<{ id: string; modifier_name: string; modifier_price: number }> | null
  }>
}

/** Mapa id → nombre para mostrar; usa full_name o username. */
export type ProfileNameMap = Record<string, string>

export function buildProfileNameMap(
  profiles: Array<{ id: string; full_name: string | null; username: string | null }> | null | undefined,
): ProfileNameMap {
  const map: ProfileNameMap = {}
  for (const p of profiles ?? []) {
    map[p.id] = p.full_name || p.username || "Desconocido"
  }
  return map
}

export function serializeTicket(row: TicketRow, names: ProfileNameMap): TicketRecord {
  return {
    id: row.id,
    folio: row.folio,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal,
    discountTotal: row.discount_total ?? 0,
    discountReason: row.discount_reason ?? null,
    total: row.total,
    notes: row.notes || "",
    createdAt: row.created_at,
    cashierId: row.cashier_id,
    cashierName: names[row.cashier_id] ?? "Desconocido",
    status: row.status,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    cancelledByName: row.cancelled_by ? (names[row.cancelled_by] ?? "Desconocido") : null,
    cashReceived: row.cash_received,
    changeDue: row.change_due,
    items: (row.ticket_items ?? []).map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
      notes: item.notes || "",
      productName: item.product_name,
      variantName: item.variant_name,
      sizeLabel: item.size_label || "",
      modifiers: (item.ticket_item_modifiers ?? []).map((m) => ({
        id: m.id,
        name: m.modifier_name,
        price: m.modifier_price,
      })),
    })),
  }
}

/** Etiqueta de línea: "Latte (Grande)" o solo "Brownie" si es variante única. */
export function ticketItemLabel(item: TicketItemRecord): string {
  return item.variantName && item.variantName !== "Único"
    ? `${item.productName} (${item.variantName})`
    : item.productName
}
