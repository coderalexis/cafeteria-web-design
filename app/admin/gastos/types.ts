/** Lo que devuelve el RPC `profit_report` (migración 35). */
export interface ReporteUtilidad {
  month: string
  is_current_month: boolean
  revenue: number
  cost_of_goods: number
  gross_margin: number
  margin_pct: number
  /** Piezas vendidas sin costo capturado: el margen se ve inflado por ellas. */
  sold_without_cost: number
  fixed_total: number
  variable_total: number
  expenses_total: number
  net_profit: number
  break_even: {
    /** Venta mensual necesaria para cubrir los fijos. Null si aún no hay margen. */
    monthly: number | null
    daily: number | null
    days_open: number
    margin_pct: number | null
  }
  /** Día en que el margen acumulado cubrió TODOS los gastos del mes. */
  covered_on: string | null
  by_category: Array<{ category: string; amount: number; kind: "fijo" | "variable" }>
}
