import type { DateString } from "@/lib/dates"

/** Forma del jsonb que devuelve el RPC sales_insights (migración 12). */

export interface InsightTotals {
  tickets: number
  revenue: number
  avg_ticket: number
  items_sold: number
  discount_total: number
  /** Propinas del periodo (se cobran aparte; no son ingreso de venta). */
  tips_total: number
  cancelled_count: number
  cancelled_amount: number
}

export interface SalesInsights {
  from: DateString
  to: DateString
  days: number
  prev_from: DateString
  prev_to: DateString
  timezone: string
  current: InsightTotals
  previous: InsightTotals
  by_weekday: Array<{
    dow: number // 1 = lunes … 7 = domingo
    days: number
    tickets: number
    revenue: number
    avg_revenue_per_day: number
    avg_tickets_per_day: number
  }>
  heatmap: Array<{ dow: number; hour: number; tickets: number; revenue: number }>
  by_cashier: Array<{
    cashier_id: string
    name: string
    tickets: number
    revenue: number
    avg_ticket: number
    items_per_ticket: number
    discount_count: number
    discount_total: number
    tips: number
    cancelled_count: number
    cancelled_amount: number
  }>
  discounts: {
    count: number
    total: number
    by_reason: Array<{ reason: string; count: number; amount: number }>
    by_user: Array<{ name: string; count: number; amount: number }>
  }
  cancellations: {
    count: number
    amount: number
    by_reason: Array<{ reason: string; count: number; amount: number }>
    by_user: Array<{ name: string; count: number; amount: number }>
  }
  products: {
    active_count: number
    without_sales_count: number
    low_movement: Array<{ product_id: string; name: string; category: string; qty: number; last_sold_at: string | null }>
    top_modifiers: Array<{ name: string; times: number; qty: number }>
    combos: Array<{ a: string; b: string; tickets: number }>
  }
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
}

export const WEEKDAY_LONG: Record<number, string> = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
  7: "domingo",
}

/** Forma del jsonb que devuelve el RPC margin_report (migración 16). */
export interface MarginProduct {
  product_name: string
  variant_name: string
  size_label: string | null
  qty: number
  revenue: number
  cost?: number
  margin: number
  margin_pct: number
  unit_cost?: number
}

export interface MarginReport {
  from: string
  to: string
  totals: {
    revenue: number
    cost: number
    margin: number
    items_sold: number
    margin_pct: number
    /** Piezas vendidas de variantes sin costo capturado: inflan el margen. */
    sold_without_cost: number
  }
  by_product: MarginProduct[]
  losers: MarginProduct[]
  missing_cost: Array<{ product_name: string; variant_name: string; price: number }>
  priced_count: number
}
