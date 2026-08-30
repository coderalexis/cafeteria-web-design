"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Receipt,
  DollarSign,
  ShoppingBag,
  Percent,
  HandCoins,
  Coins,
  TriangleAlert,
  Ban,
  Users,
  CalendarDays,
  Flame,
  PackageX,
  SlidersHorizontal,
  Link2,
  AlertTriangle,
} from "lucide-react"
import { PeriodPicker } from "@/components/period-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/format"
import { formatDateString, type DateString } from "@/lib/dates"

/** Igual que en Ventas: la gráfica (~100 KB de recharts) llega después de la página. */
const RevenueBarChart = dynamic(() => import("@/components/revenue-bar-chart"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-stone-100" />,
})
import { WEEKDAY_LABELS, WEEKDAY_LONG, type MarginReport, type SalesInsights } from "./types"

interface Props {
  insights: SalesInsights | null
  margin: MarginReport | null
  error: string | null
  from: DateString
  to: DateString
  today: DateString
  timezone: string
}

/* ────────────────────────────────────────────────────── helpers */

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const pct = pctChange(current, previous)
  if (pct === null) {
    return <span className="text-xs text-stone-400">sin base de comparación</span>
  }
  const rounded = Math.round(pct)
  const good = invert ? rounded < 0 : rounded > 0
  const bad = invert ? rounded > 0 : rounded < 0
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        good ? "text-green-700" : bad ? "text-red-600" : "text-stone-500"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {rounded > 0 ? "+" : ""}
      {rounded}% vs. periodo anterior
    </span>
  )
}

function KpiCard({
  label,
  value,
  previous,
  current,
  invert,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: string
  previous: number
  current: number
  invert?: boolean
  icon: typeof Receipt
  color: string
  bg: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-stone-800 truncate">{value}</p>
            <div className="mt-1">
              <Delta current={current} previous={previous} invert={invert} />
            </div>
          </div>
          <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function WeekdayTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: { dow?: number; avg?: number; tickets?: number; days?: number } }>
}) {
  const d = payload?.[0]?.payload
  if (!active || !d?.dow) return null
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-stone-700 capitalize">{WEEKDAY_LONG[d.dow]}</p>
      <p className="text-stone-500">
        promedio <span className="font-semibold text-stone-800">{formatCurrency(d.avg ?? 0)}</span> por día
      </p>
      <p className="text-stone-400">
        {d.tickets ?? 0} ventas en {d.days ?? 0} {d.days === 1 ? "día" : "días"}
      </p>
    </div>
  )
}

function heatColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return "bg-stone-100"
  const r = value / max
  if (r > 0.8) return "bg-amber-600 text-white"
  if (r > 0.6) return "bg-amber-500 text-white"
  if (r > 0.4) return "bg-amber-400"
  if (r > 0.2) return "bg-amber-300"
  return "bg-amber-200"
}

/* ────────────────────────────────────────────────────── component */

export default function AnalisisClient({ insights, margin, error, from, to, today, timezone }: Props) {
  const weekdayData = useMemo(
    () =>
      (insights?.by_weekday ?? []).map((w) => ({
        dow: w.dow,
        label: WEEKDAY_LABELS[w.dow],
        avg: w.avg_revenue_per_day,
        tickets: w.tickets,
        days: w.days,
      })),
    [insights],
  )

  const heat = useMemo(() => {
    const cells = new Map<string, { tickets: number; revenue: number }>()
    let max = 0
    let minHour = 24
    let maxHour = -1
    for (const h of insights?.heatmap ?? []) {
      cells.set(`${h.dow}-${h.hour}`, { tickets: h.tickets, revenue: h.revenue })
      max = Math.max(max, h.revenue)
      minHour = Math.min(minHour, h.hour)
      maxHour = Math.max(maxHour, h.hour)
    }
    // Ventana de horas: la que tenga datos, con margen, mínimo 7:00–22:00
    const start = Math.min(minHour === 24 ? 7 : Math.max(0, minHour - 1), 7)
    const end = Math.max(maxHour < 0 ? 22 : Math.min(23, maxHour + 1), 22)
    const hours: number[] = []
    for (let h = start; h <= end; h++) hours.push(h)
    return { cells, max, hours }
  }, [insights])

  const bestDay = useMemo(() => {
    const withData = weekdayData.filter((w) => w.tickets > 0)
    if (withData.length < 2) return null
    const sorted = [...withData].sort((a, b) => b.avg - a.avg)
    return { best: sorted[0], worst: sorted[sorted.length - 1] }
  }, [weekdayData])

  const peak = useMemo(() => {
    let top: { dow: number; hour: number; tickets: number; revenue: number } | null = null
    for (const h of insights?.heatmap ?? []) {
      if (!top || h.revenue > top.revenue) top = h
    }
    return top
  }, [insights])

  const rangeLabel =
    from === to
      ? formatDateString(from)
      : `${formatDateString(from, { day: "numeric", month: "short" })} – ${formatDateString(to)}`

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Encabezado + periodo */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-700" />
            Análisis
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {rangeLabel}
            {insights && (
              <>
                {" "}
                · comparado con {formatDateString(insights.prev_from, { day: "numeric", month: "short" })} –{" "}
                {formatDateString(insights.prev_to)}
              </>
            )}
          </p>
        </div>
        <PeriodPicker from={from} to={to} today={today} />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}

      {insights && (
        <>
          {/* ── Comparativo ─────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Ingresos"
                value={formatCurrency(insights.current.revenue)}
                current={insights.current.revenue}
                previous={insights.previous.revenue}
                icon={DollarSign}
                color="text-green-700"
                bg="bg-green-100"
              />
              <KpiCard
                label="Ventas"
                value={String(insights.current.tickets)}
                current={insights.current.tickets}
                previous={insights.previous.tickets}
                icon={Receipt}
                color="text-amber-700"
                bg="bg-amber-100"
              />
              <KpiCard
                label="Ticket promedio"
                value={formatCurrency(insights.current.avg_ticket)}
                current={insights.current.avg_ticket}
                previous={insights.previous.avg_ticket}
                icon={ShoppingBag}
                color="text-blue-700"
                bg="bg-blue-100"
              />
              <KpiCard
                label="Artículos vendidos"
                value={String(insights.current.items_sold)}
                current={insights.current.items_sold}
                previous={insights.previous.items_sold}
                icon={ShoppingBag}
                color="text-violet-700"
                bg="bg-violet-100"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard
                label="Propinas"
                value={formatCurrency(insights.current.tips_total ?? 0)}
                current={insights.current.tips_total ?? 0}
                previous={insights.previous.tips_total ?? 0}
                icon={HandCoins}
                color="text-emerald-700"
                bg="bg-emerald-100"
              />
              <KpiCard
                label="Descuentos aplicados"
                value={formatCurrency(insights.current.discount_total)}
                current={insights.current.discount_total}
                previous={insights.previous.discount_total}
                invert
                icon={Percent}
                color="text-orange-700"
                bg="bg-orange-100"
              />
              <KpiCard
                label="Cancelaciones"
                value={`${insights.current.cancelled_count} · ${formatCurrency(insights.current.cancelled_amount)}`}
                current={insights.current.cancelled_count}
                previous={insights.previous.cancelled_count}
                invert
                icon={Ban}
                color="text-red-700"
                bg="bg-red-100"
              />
            </div>
          </section>

          {/* ── Día de la semana + mapa de calor ─────────────────── */}
          <section className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-amber-700" />
                  Ingresos por día de la semana
                </CardTitle>
                <CardDescription>
                  Promedio por día (el periodo abarca {insights.days} {insights.days === 1 ? "día" : "días"}).
                  {bestDay && (
                    <>
                      {" "}
                      Mejor: <strong className="text-stone-700 capitalize">{WEEKDAY_LONG[bestDay.best.dow]}</strong>{" "}
                      ({formatCurrency(bestDay.best.avg)}) · más flojo:{" "}
                      <strong className="text-stone-700 capitalize">{WEEKDAY_LONG[bestDay.worst.dow]}</strong> (
                      {formatCurrency(bestDay.worst.avg)}).
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <RevenueBarChart
                    data={weekdayData}
                    dataKey="avg"
                    tooltip={<WeekdayTooltip />}
                    maxBarSize={44}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-700" />
                  Mapa de calor: día × hora
                </CardTitle>
                <CardDescription>
                  Ingresos por hora local ({timezone}). Útil para horarios del personal y promociones en horas flojas.
                  {peak && (
                    <>
                      {" "}
                      Pico: <strong className="text-stone-700 capitalize">{WEEKDAY_LONG[peak.dow]}</strong> a las{" "}
                      <strong className="text-stone-700">{String(peak.hour).padStart(2, "0")}:00</strong> (
                      {formatCurrency(peak.revenue)}).
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {heat.max === 0 ? (
                  <p className="text-sm text-stone-400 py-6 text-center">Sin ventas en el periodo.</p>
                ) : (
                  <table className="text-[11px] border-separate border-spacing-0.5">
                    <thead>
                      <tr>
                        <th className="w-8" />
                        {heat.hours.map((h) => (
                          <th key={h} className="w-7 font-normal text-stone-400 text-center">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                        <tr key={dow}>
                          <td className="pr-1 text-stone-500 font-medium">{WEEKDAY_LABELS[dow]}</td>
                          {heat.hours.map((h) => {
                            const c = heat.cells.get(`${dow}-${h}`)
                            return (
                              <td
                                key={h}
                                title={`${WEEKDAY_LONG[dow]} ${String(h).padStart(2, "0")}:00 — ${c?.tickets ?? 0} ventas · ${formatCurrency(c?.revenue ?? 0)}`}
                                className={`h-6 w-7 rounded-sm text-center ${heatColor(c?.revenue ?? 0, heat.max)}`}
                              >
                                {c && c.tickets > 0 ? c.tickets : ""}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── Cajeros ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-700" />
                Por cajero
              </CardTitle>
              <CardDescription>Ventas, ticket promedio, artículos por ticket, descuentos y cancelaciones de cada quien.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {insights.by_cashier.length === 0 ? (
                <p className="text-sm text-stone-400 py-6 text-center">Sin ventas en el periodo.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-xs text-stone-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Cajero</th>
                      <th className="text-right font-medium px-3 py-2">Ventas</th>
                      <th className="text-right font-medium px-3 py-2">Ingresos</th>
                      <th className="text-right font-medium px-3 py-2">Ticket prom.</th>
                      <th className="text-right font-medium px-3 py-2">Art./ticket</th>
                      <th className="text-right font-medium px-3 py-2">Propinas</th>
                      <th className="text-right font-medium px-3 py-2">Descuentos</th>
                      <th className="text-right font-medium px-4 py-2">Canceladas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {insights.by_cashier.map((c) => (
                      <tr key={c.cashier_id}>
                        <td className="px-4 py-2 font-medium text-stone-800">{c.name}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{c.tickets}</td>
                        <td className="px-3 py-2 text-right font-semibold text-stone-800">{formatCurrency(c.revenue)}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{formatCurrency(c.avg_ticket)}</td>
                        <td className="px-3 py-2 text-right text-stone-700">{c.items_per_ticket}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">
                          {(c.tips ?? 0) > 0 ? formatCurrency(c.tips) : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-stone-700">
                          {c.discount_count > 0 ? `${c.discount_count} · ${formatCurrency(c.discount_total)}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-stone-700">
                          {c.cancelled_count > 0 ? `${c.cancelled_count} · ${formatCurrency(c.cancelled_amount)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* ── Costos y margen ──────────────────────────────────── */}
          {margin && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Coins className="h-4 w-4 text-emerald-700" />
                  Costos y margen
                </CardTitle>
                <CardDescription>
                  Cuánto queda después de pagar los insumos. Usa el costo con el que se vendió cada artículo, así que
                  subir un costo hoy no cambia el margen de días ya cerrados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-stone-200 p-3">
                    <p className="text-xs text-stone-500">Ventas</p>
                    <p className="text-xl font-bold text-stone-800">{formatCurrency(margin.totals.revenue)}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-3">
                    <p className="text-xs text-stone-500">Costo de lo vendido</p>
                    <p className="text-xl font-bold text-stone-800">{formatCurrency(margin.totals.cost)}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-xs text-emerald-800">Margen bruto</p>
                    <p className="text-xl font-bold text-emerald-800">
                      {formatCurrency(margin.totals.margin)}{" "}
                      <span className="text-sm font-medium">({margin.totals.margin_pct}%)</span>
                    </p>
                  </div>
                </div>

                {margin.missing_cost.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {margin.missing_cost.length} de {margin.priced_count} variantes no tienen costo capturado.
                      </p>
                      <p className="text-xs mt-0.5">
                        El margen de arriba está inflado
                        {margin.totals.sold_without_cost > 0
                          ? ` (${margin.totals.sold_without_cost} pieza${margin.totals.sold_without_cost === 1 ? "" : "s"} vendida${margin.totals.sold_without_cost === 1 ? "" : "s"} sin costo)`
                          : ""}
                        . Captúralo en Productos:{" "}
                        {margin.missing_cost
                          .slice(0, 3)
                          .map((m) => `${m.product_name} · ${m.variant_name}`)
                          .join(", ")}
                        {margin.missing_cost.length > 3 ? `, y ${margin.missing_cost.length - 3} más` : ""}.
                      </p>
                    </div>
                  </div>
                )}

                {margin.by_product.length === 0 ? (
                  <p className="text-sm text-stone-400 py-4 text-center">Sin ventas en el periodo.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-stone-50 text-xs text-stone-500">
                        <tr>
                          <th className="text-left font-medium px-4 py-2">Los que más dejan</th>
                          <th className="text-right font-medium px-3 py-2">Uds</th>
                          <th className="text-right font-medium px-3 py-2">Venta</th>
                          <th className="text-right font-medium px-3 py-2">Costo</th>
                          <th className="text-right font-medium px-4 py-2">Margen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {margin.by_product.map((m, i) => {
                          const label =
                            m.variant_name && m.variant_name !== "Único"
                              ? `${m.product_name} · ${m.variant_name}`
                              : m.product_name
                          const sinCosto = !m.unit_cost
                          return (
                            <tr key={`${label}-${i}`}>
                              <td className="px-4 py-2 font-medium text-stone-800">{label}</td>
                              <td className="px-3 py-2 text-right text-stone-700">{m.qty}</td>
                              <td className="px-3 py-2 text-right text-stone-700">{formatCurrency(m.revenue)}</td>
                              <td className="px-3 py-2 text-right text-stone-500">
                                {sinCosto ? <span className="text-stone-300">—</span> : formatCurrency(m.cost ?? 0)}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {sinCosto ? (
                                  <Badge variant="outline" className="border-amber-300 text-amber-800">
                                    sin costo
                                  </Badge>
                                ) : (
                                  <span className="font-semibold text-emerald-700">
                                    {formatCurrency(m.margin)}{" "}
                                    <span className="text-xs font-normal text-stone-500">({m.margin_pct}%)</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {margin.losers.length > 0 && (
                  <div className="rounded-lg border border-stone-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                      Margen bajo (menos del 40%)
                    </p>
                    <div className="space-y-1">
                      {margin.losers.map((m, i) => {
                        const label =
                          m.variant_name && m.variant_name !== "Único"
                            ? `${m.product_name} · ${m.variant_name}`
                            : m.product_name
                        return (
                          <div key={`${label}-${i}`} className="flex items-center justify-between text-sm">
                            <span className="text-stone-600 truncate">{label}</span>
                            <span
                              className={`font-medium ml-2 shrink-0 ${m.margin < 0 ? "text-red-600" : "text-amber-700"}`}
                            >
                              {formatCurrency(m.margin)} ({m.margin_pct}%)
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-stone-400 mt-2">
                      Súbeles el precio o baja su costo; si son gancho para vender otra cosa, déjalos a propósito.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Descuentos y cancelaciones ───────────────────────── */}
          <section className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent className="h-4 w-4 text-orange-600" />
                  Descuentos
                </CardTitle>
                <CardDescription>
                  {insights.discounts.count} tickets con descuento · {formatCurrency(insights.discounts.total)} en total
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <ReasonList title="Por motivo" rows={insights.discounts.by_reason.map((r) => ({ label: r.reason, count: r.count, amount: r.amount }))} />
                <ReasonList title="Por quién lo aplicó" rows={insights.discounts.by_user.map((r) => ({ label: r.name, count: r.count, amount: r.amount }))} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Ban className="h-4 w-4 text-red-600" />
                  Cancelaciones
                </CardTitle>
                <CardDescription>
                  {insights.cancellations.count} tickets cancelados · {formatCurrency(insights.cancellations.amount)}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <ReasonList title="Por motivo" rows={insights.cancellations.by_reason.map((r) => ({ label: r.reason, count: r.count, amount: r.amount }))} />
                <ReasonList title="Por quién canceló" rows={insights.cancellations.by_user.map((r) => ({ label: r.name, count: r.count, amount: r.amount }))} />
              </CardContent>
            </Card>
          </section>

          {/* ── Productos ───────────────────────────────────────── */}
          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PackageX className="h-4 w-4 text-stone-500" />
                  Sin movimiento
                </CardTitle>
                <CardDescription>
                  {insights.products.without_sales_count} de {insights.products.active_count} productos activos no vendieron en el
                  periodo. Candidatos a revisar o retirar del menú.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {insights.products.low_movement.length === 0 ? (
                  <p className="text-sm text-stone-400 py-6 text-center">Todo el menú se vendió. 🎉</p>
                ) : (
                  <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
                    {insights.products.low_movement.map((p) => (
                      <li key={p.product_id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-stone-800 truncate">{p.name}</p>
                          <p className="text-xs text-stone-400 truncate">
                            {p.category}
                            {p.last_sold_at ? ` · última venta ${formatDate(p.last_sold_at, timezone)}` : " · nunca vendido"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={p.qty === 0 ? "border-red-200 text-red-700 bg-red-50" : "border-amber-200 text-amber-800 bg-amber-50"}
                        >
                          {p.qty === 0 ? "0" : `${p.qty}`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-stone-500" />
                  Opciones y extras más pedidos
                </CardTitle>
                <CardDescription>Para compras e inventario (leches, extras).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {insights.products.top_modifiers.length === 0 ? (
                  <p className="text-sm text-stone-400 py-6 text-center">Sin modificadores en el periodo.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {insights.products.top_modifiers.map((m) => (
                      <li key={m.name} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="text-stone-800 truncate">{m.name}</span>
                        <span className="text-stone-500 shrink-0">
                          {m.qty} {m.qty === 1 ? "vez" : "veces"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-stone-500" />
                  Se compran juntos
                </CardTitle>
                <CardDescription>Parejas de productos frecuentes en el mismo ticket: ideas para combos.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {insights.products.combos.length === 0 ? (
                  <p className="text-sm text-stone-400 py-6 text-center">Aún no hay parejas repetidas.</p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {insights.products.combos.map((c) => (
                      <li key={`${c.a}|${c.b}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                        <span className="text-stone-800 truncate">
                          {c.a} <span className="text-stone-400">+</span> {c.b}
                        </span>
                        <span className="text-stone-500 shrink-0">{c.tickets} tickets</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}

function ReasonList({ title, rows }: { title: string; rows: Array<{ label: string; count: number; amount: number }> }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-400">Ninguno.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-stone-700 truncate capitalize">{r.label}</span>
              <span className="text-stone-500 shrink-0">
                {r.count} · {formatCurrency(r.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
