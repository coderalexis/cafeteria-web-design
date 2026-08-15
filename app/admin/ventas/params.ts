import { PAYMENT_METHOD_KEYS, type PaymentMethodKey } from "@/lib/format"
import { cdmxDateString, parseDateString, type DateString } from "@/lib/dates"

/* ------------------------------------------------------------------ */
/*  Filtros del historial de ventas: viven en la URL para que la       */
/*  página (server), el export CSV (route handler) y los filtros       */
/*  (client) hablen el mismo idioma.                                   */
/* ------------------------------------------------------------------ */

export const PAGE_SIZE = 50
export const MAX_RANGE_DAYS = 366

export interface VentasFilters {
  from: DateString
  to: DateString
  cajero: string | null
  pago: PaymentMethodKey | null
  page: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Normaliza searchParams; valores inválidos caen al default (hoy, sin filtros, página 1). */
export function parseVentasFilters(raw: RawParams): VentasFilters {
  const today = cdmxDateString()
  let from = parseDateString(first(raw.from)) ?? today
  let to = parseDateString(first(raw.to)) ?? from
  if (to < from) [from, to] = [to, from]

  // Tope de un año, igual que el RPC.
  const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
  if (spanDays > MAX_RANGE_DAYS) from = to

  const cajeroRaw = first(raw.cajero)
  const cajero = cajeroRaw && UUID_PATTERN.test(cajeroRaw) ? cajeroRaw : null

  const pagoRaw = first(raw.pago)
  const pago = PAYMENT_METHOD_KEYS.includes(pagoRaw as PaymentMethodKey) ? (pagoRaw as PaymentMethodKey) : null

  const pageRaw = Number.parseInt(first(raw.page) ?? "1", 10)
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1

  return { from, to, cajero, pago, page }
}

/** Serializa filtros a query string (omite defaults para URLs limpias). */
export function filtersToSearchParams(filters: Partial<VentasFilters>): URLSearchParams {
  const sp = new URLSearchParams()
  if (filters.from) sp.set("from", filters.from)
  if (filters.to) sp.set("to", filters.to)
  if (filters.cajero) sp.set("cajero", filters.cajero)
  if (filters.pago) sp.set("pago", filters.pago)
  if (filters.page && filters.page > 1) sp.set("page", String(filters.page))
  return sp
}

/* ------------------------------------------------------------------ */
/*  Forma del jsonb que devuelve el RPC sales_report                   */
/* ------------------------------------------------------------------ */

export interface SalesReport {
  from: DateString
  to: DateString
  totals: {
    tickets: number
    revenue: number
    avg_ticket: number
    discount_total: number
    items_sold: number
    cancelled_count: number
    cancelled_amount: number
  }
  by_method: Array<{ method: string; tickets: number; revenue: number }>
  by_day: Array<{ day: DateString; tickets: number; revenue: number }>
  by_hour: Array<{ hour: number; tickets: number; revenue: number }>
  by_cashier: Array<{ cashier_id: string; name: string; tickets: number; revenue: number }>
  top_products: Array<{ product_name: string; variant_name: string; size_label: string | null; qty: number; revenue: number }>
}
