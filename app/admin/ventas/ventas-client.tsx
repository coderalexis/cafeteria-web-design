"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cancelTicket } from "@/app/actions/sales"
import { formatCurrency, formatTime, paymentLabel, PAYMENT_METHODS, type PaymentMethodKey } from "@/lib/format"
import { formatDateString } from "@/lib/dates"
import { buildTicketLines, printLines, receiptBusinessFrom, receiptFromTicket } from "@/lib/receipt"
import { useBusiness } from "@/components/business-provider"
import type { TicketRecord } from "@/lib/tickets"
import { toast } from "sonner"
import {
  Receipt,
  CreditCard,
  Ban,
  Printer,
  Clock,
  DollarSign,
  ShoppingBag,
  Calendar,
  User,
  StickyNote,
  Flame,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
} from "lucide-react"
import { VentasFiltersBar } from "./filters"
import { PAGE_SIZE, filtersToSearchParams, type SalesReport, type VentasFilters } from "./params"

/* ────────────────────────────────────────────────────── Types */

interface VentasClientProps {
  filters: VentasFilters
  report: SalesReport | null
  reportError: string | null
  tickets: TicketRecord[]
  totalCount: number
  pageCount: number
  cashiers: Array<{ id: string; name: string }>
  /** Día de operación del negocio (YYYY-MM-DD en su zona). */
  today: string
  /** Zona horaria IANA del negocio (fechas/horas de tickets). */
  timezone: string
}

/* ────────────────────────────────────────────────────── Helpers */

function PaymentIcon({ method, className }: { method: string; className?: string }) {
  const Icon = PAYMENT_METHODS[method as PaymentMethodKey]?.icon ?? CreditCard
  return <Icon className={className} />
}

function paymentColor(method: string): string {
  switch (method) {
    case "efectivo":
      return "bg-emerald-100 text-emerald-700 border-emerald-200"
    case "tarjeta_clip":
      return "bg-blue-100 text-blue-700 border-blue-200"
    case "transferencia":
      return "bg-violet-100 text-violet-700 border-violet-200"
    default:
      return "bg-stone-100 text-stone-700 border-stone-200"
  }
}

function formatDate(dateStr: string, timeZone: string): string {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  })
}

function formatDateTime(dateStr: string, timeZone: string): string {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
}

/* ────────────────────────────────────────────────────── Component */

export default function VentasClient({
  filters,
  report,
  reportError,
  tickets,
  totalCount,
  pageCount,
  cashiers,
  today,
  timezone,
}: VentasClientProps) {
  const router = useRouter()
  const business = useBusiness()
  const pathname = usePathname()
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  const isSingleDay = filters.from === filters.to
  const periodLabel = isSingleDay
    ? formatDateString(filters.from, { weekday: "long", day: "numeric", month: "long" })
    : `${formatDateString(filters.from, { day: "numeric", month: "short" })} – ${formatDateString(filters.to)}`

  const totals = report?.totals
  const revenue = totals?.revenue ?? 0
  const topHour = (report?.by_hour ?? []).reduce<{ hour: number; tickets: number; revenue: number } | null>(
    (best, h) => (!best || h.revenue > best.revenue ? h : best),
    null,
  )
  const chartData = (report?.by_day ?? []).map((d) => ({
    day: d.day,
    label: formatDateString(d.day, { day: "numeric", month: "short" }),
    revenue: d.revenue,
    tickets: d.tickets,
  }))

  /* ── Handlers ─────────────────────────────────────── */

  function goToPage(page: number) {
    const qs = filtersToSearchParams({ ...filters, page }).toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function openTicket(ticket: TicketRecord) {
    setSelectedTicket(ticket)
    setSheetOpen(true)
  }

  function handleReprint() {
    if (!selectedTicket) return
    if (!printLines(buildTicketLines(receiptFromTicket(selectedTicket, true), receiptBusinessFrom(business)), `Ticket ${selectedTicket.folio}`)) {
      toast.error("El navegador bloqueó la ventana de impresión.")
    }
  }

  async function handleCancel() {
    if (!selectedTicket || cancelling) return
    setCancelling(true)
    const result = await cancelTicket({ ticketId: selectedTicket.id, reason: cancelReason.trim() })
    setCancelling(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(`Ticket #${result.folio} cancelado`)
    setCancelOpen(false)
    setCancelReason("")
    setSheetOpen(false)
    setSelectedTicket(null)
    router.refresh()
  }

  /* ── Render ───────────────────────────────────────── */

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
          <Receipt className="h-6 w-6 text-amber-600" />
          Historial de Ventas
        </h1>
        <p className="text-sm text-stone-500 mt-1 capitalize">{periodLabel}</p>
      </div>

      {/* Filters */}
      <VentasFiltersBar filters={filters} cashiers={cashiers} today={today} />

      {reportError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No se pudo calcular el reporte: {reportError}
        </div>
      )}

      {/* Stats row — del rango filtrado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Ventas"
          value={String(totals?.tickets ?? 0)}
          hint={totals && totals.cancelled_count > 0 ? `${totals.cancelled_count} cancelada${totals.cancelled_count === 1 ? "" : "s"}` : undefined}
          icon={ShoppingBag}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          label="Ingresos"
          value={formatCurrency(revenue)}
          hint={
            [
              totals && totals.cancelled_amount > 0 ? `${formatCurrency(totals.cancelled_amount)} en canceladas` : null,
              totals && (totals.tips_total ?? 0) > 0 ? `+${formatCurrency(totals.tips_total)} en propinas` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          icon={DollarSign}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <StatCard
          label="Ticket promedio"
          value={formatCurrency(totals?.avg_ticket ?? 0)}
          icon={Receipt}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Artículos vendidos"
          value={String(totals?.items_sold ?? 0)}
          icon={ShoppingBag}
          color="text-violet-600"
          bg="bg-violet-50"
        />
      </div>

      {/* Chart por día (solo si el rango tiene más de un día) */}
      {chartData.length > 1 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-stone-700">Ingresos por día</p>
              <p className="text-xs text-stone-400">{chartData.length} días</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#78716c" }}
                    tickLine={false}
                    axisLine={false}
                    interval={chartData.length > 14 ? Math.ceil(chartData.length / 10) - 1 : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#78716c" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v}`)}
                  />
                  <Tooltip cursor={{ fill: "#fef3c7", opacity: 0.5 }} content={<DayTooltip />} />
                  <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Por método */}
        <Card className="xl:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-700">Ventas por método</p>
              <p className="text-xs text-stone-400">Total: {formatCurrency(revenue)}</p>
            </div>
            <div className="space-y-3">
              {(["efectivo", "transferencia", "tarjeta_clip"] as PaymentMethodKey[]).map((key) => {
                const row = report?.by_method.find((m) => m.method === key)
                const value = row?.revenue ?? 0
                const percentage = revenue > 0 ? (value / revenue) * 100 : 0
                const Icon = PAYMENT_METHODS[key].icon
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5 text-sm">
                      <div className="flex items-center gap-2 text-stone-700">
                        <Icon className={`h-4 w-4 ${PAYMENT_METHODS[key].iconColor}`} />
                        {PAYMENT_METHODS[key].label}
                        <span className="text-xs text-stone-400">({row?.tickets ?? 0})</span>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-stone-800">{formatCurrency(value)}</p>
                        <p className="text-xs text-stone-500">{percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Hora pico + cajeros */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className="text-sm font-semibold text-stone-700">Hora pico</p>
              {topHour ? (
                <div>
                  <p className="text-3xl font-bold text-stone-800">
                    {`${String(topHour.hour).padStart(2, "0")}:00`}
                  </p>
                  <p className="text-sm text-stone-500 mt-1">
                    {topHour.tickets} ventas · {formatCurrency(topHour.revenue)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-stone-400">Sin ventas en el periodo.</p>
              )}
              <p className="text-xs text-stone-400">Hora con mayor ingreso acumulado del periodo (hora de México).</p>
            </CardContent>
          </Card>

          {report && report.by_cashier.length > 0 && !filters.cajero && (
            <Card>
              <CardContent className="p-5 space-y-2">
                <p className="text-sm font-semibold text-stone-700 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-stone-400" /> Por cajero
                </p>
                <div className="space-y-1.5">
                  {report.by_cashier.map((c) => (
                    <div key={c.cashier_id} className="flex items-center justify-between text-sm">
                      <span className="text-stone-600 truncate">
                        {c.name} <span className="text-xs text-stone-400">({c.tickets})</span>
                      </span>
                      <span className="font-medium text-stone-800 ml-2">
                        {formatCurrency(c.revenue)}
                        {(c.tips ?? 0) > 0 && (
                          <span className="text-xs font-normal text-emerald-700"> +{formatCurrency(c.tips)}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Top productos */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-600" />
              Productos más vendidos
            </h2>
          </div>

          {!report || report.top_products.length === 0 ? (
            <p className="text-sm text-stone-500">Aún no hay ventas en el periodo.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {report.top_products.map((product, index) => {
                const label =
                  product.variant_name && product.variant_name !== "Único"
                    ? `${product.product_name} · ${product.variant_name}${product.size_label ? ` (${product.size_label})` : ""}`
                    : product.product_name
                return (
                  <div
                    key={`${product.product_name}-${product.variant_name}-${product.size_label ?? ""}`}
                    className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold flex items-center justify-center shrink-0">
                        #{index + 1}
                      </div>
                      <p className="text-sm text-stone-700 truncate">{label}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-stone-800">{product.qty} uds</p>
                      <p className="text-xs text-stone-500">{formatCurrency(product.revenue)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
            <p className="text-sm font-semibold text-stone-700">
              Tickets{" "}
              <span className="font-normal text-stone-400">
                ({totalCount.toLocaleString("es-MX")}
                {totalCount > PAGE_SIZE && ` · mostrando ${(filters.page - 1) * PAGE_SIZE + 1}–${Math.min(filters.page * PAGE_SIZE, totalCount)}`})
              </span>
            </p>
            {pageCount > 1 && (
              <Pager page={filters.page} pageCount={pageCount} onChange={goToPage} />
            )}
          </div>

          {tickets.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="h-10 w-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm text-stone-400">
                No hay ventas para los filtros seleccionados
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50">
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Folio</th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Hora</th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Items</th>
                    <th className="text-right px-4 py-3 font-medium text-stone-500">Total</th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Pago</th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Cajero</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicket(ticket)}
                      className={`border-b border-stone-100 last:border-0 cursor-pointer transition-colors ${
                        ticket.status === "cancelado"
                          ? "bg-red-50/40 hover:bg-red-50 text-stone-400"
                          : "hover:bg-amber-50/50"
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-stone-700">
                        <div className="flex items-center gap-2">
                          #{ticket.folio}
                          {ticket.status === "cancelado" && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-[10px]">
                              Cancelado
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-stone-400" />
                          {formatTime(ticket.createdAt, timezone)}
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {formatDate(ticket.createdAt, timezone)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-stone-700">
                        <span>
                          {ticket.items.length}{" "}
                          {ticket.items.length === 1 ? "item" : "items"}
                        </span>
                        {ticket.notes && (
                          <span className="ml-1.5 inline-flex" title={ticket.notes}>
                            <StickyNote className="h-3 w-3 text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          ticket.status === "cancelado" ? "line-through text-stone-400" : "text-stone-800"
                        }`}
                      >
                        {formatCurrency(ticket.total)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs ${paymentColor(ticket.paymentMethod)}`}
                        >
                          <PaymentIcon method={ticket.paymentMethod} className="h-3 w-3 mr-1" />
                          {paymentLabel(ticket.paymentMethod)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {ticket.cashierName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex justify-end px-4 py-3 border-t border-stone-200">
              <Pager page={filters.page} pageCount={pageCount} onChange={goToPage} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-lg p-0">
          {selectedTicket && (
            <div className="flex flex-col h-full">
              {/* Sheet header */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-stone-200">
                <SheetTitle className="flex items-center gap-2 text-stone-800">
                  <Receipt className="h-5 w-5 text-amber-600" />
                  Ticket #{selectedTicket.folio}
                  {selectedTicket.status === "cancelado" && (
                    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 ml-1">
                      Cancelado
                    </Badge>
                  )}
                </SheetTitle>
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDateTime(selectedTicket.createdAt, timezone)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <User className="h-3.5 w-3.5" />
                    Cajero: {selectedTicket.cashierName}
                  </div>
                </div>
                {selectedTicket.status === "cancelado" && (
                  <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 space-y-0.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Ban className="h-3.5 w-3.5" /> Venta cancelada
                    </p>
                    {selectedTicket.cancelReason && <p>Motivo: {selectedTicket.cancelReason}</p>}
                    <p className="text-xs text-red-600/80">
                      {selectedTicket.cancelledByName ? `Por ${selectedTicket.cancelledByName}` : ""}
                      {selectedTicket.cancelledAt ? ` · ${formatDateTime(selectedTicket.cancelledAt, timezone)}` : ""}
                    </p>
                  </div>
                )}
              </SheetHeader>

              {/* Items list */}
              <ScrollArea className="flex-1 px-6">
                <div className="py-4 space-y-3">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Productos
                  </p>
                  {selectedTicket.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between py-2 border-b border-stone-100 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800">
                          {item.productName}
                        </p>
                        {(item.variantName || item.sizeLabel) && (
                          <p className="text-xs text-stone-400 mt-0.5">
                            {[item.variantName, item.sizeLabel]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        )}
                        {item.modifiers.length > 0 && (
                          <p className="text-xs text-amber-700 mt-0.5">
                            {item.modifiers
                              .map((m) => `+ ${m.name}${m.price > 0 ? ` (${formatCurrency(m.price)})` : ""}`)
                              .join(", ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-amber-600 mt-0.5 italic">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-sm font-medium text-stone-800">
                          {formatCurrency(item.lineTotal)}
                        </p>
                        <p className="text-xs text-stone-400">
                          {item.quantity} x {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {selectedTicket.notes && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                          Notas
                        </p>
                        <p className="text-sm text-stone-600 italic">
                          {selectedTicket.notes}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>

              {/* Footer */}
              <div className="border-t border-stone-200 px-6 py-4 space-y-4">
                <Separator />

                {/* Subtotal / descuento / total */}
                {selectedTicket.discountTotal > 0 && (
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between text-stone-500">
                      <p>Subtotal</p>
                      <p>{formatCurrency(selectedTicket.subtotal)}</p>
                    </div>
                    <div className="flex items-center justify-between text-amber-700">
                      <p>Descuento{selectedTicket.discountReason ? ` · ${selectedTicket.discountReason}` : ""}</p>
                      <p>-{formatCurrency(selectedTicket.discountTotal)}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-stone-800">
                    Total
                  </p>
                  <p className="text-xl font-bold text-stone-800">
                    {formatCurrency(selectedTicket.total)}
                  </p>
                </div>

                {/* Propina: se cobró encima del total, no cuenta como venta */}
                {selectedTicket.tip > 0 && (
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between text-emerald-700">
                      <p>Propina</p>
                      <p>+{formatCurrency(selectedTicket.tip)}</p>
                    </div>
                    <div className="flex items-center justify-between text-stone-500">
                      <p>Cobrado al cliente</p>
                      <p className="font-medium text-stone-700">
                        {formatCurrency(selectedTicket.total + selectedTicket.tip)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment badge */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-stone-500">Método de pago</p>
                  <Badge
                    variant="outline"
                    className={`text-xs ${paymentColor(selectedTicket.paymentMethod)}`}
                  >
                    <PaymentIcon method={selectedTicket.paymentMethod} className="h-3 w-3 mr-1" />
                    {paymentLabel(selectedTicket.paymentMethod)}
                  </Badge>
                </div>

                {/* Efectivo recibido / cambio */}
                {selectedTicket.paymentMethod === "efectivo" && selectedTicket.cashReceived != null && (
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-stone-500">
                      Recibido {formatCurrency(selectedTicket.cashReceived)}
                    </p>
                    <p className="font-medium text-emerald-700">
                      Cambio {formatCurrency(selectedTicket.changeDue ?? 0)}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleReprint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Reimprimir
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    disabled={selectedTicket.status === "cancelado"}
                    onClick={() => {
                      setCancelReason("")
                      setCancelOpen(true)
                    }}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    {selectedTicket.status === "cancelado" ? "Ya cancelado" : "Cancelar venta"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmación de cancelación con motivo */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar ticket #{selectedTicket?.folio}</AlertDialogTitle>
            <AlertDialogDescription>
              La venta de {selectedTicket ? formatCurrency(selectedTicket.total) : ""} dejará de contar en
              ingresos y cortes de caja. Queda registrada como cancelada, con motivo, quién y cuándo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo de la cancelación (obligatorio)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={300}
            rows={3}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={cancelReason.trim().length < 3 || cancelling}
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
            >
              {cancelling ? "Cancelando..." : "Cancelar venta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ────────────────────────────────────────────────────── Subcomponentes */

function DayTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: { day?: string; revenue?: number; tickets?: number } }>
}) {
  const d = payload?.[0]?.payload
  if (!active || !d?.day) return null
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-stone-700 capitalize">
        {formatDateString(d.day, { weekday: "short", day: "numeric", month: "short" })}
      </p>
      <p className="text-stone-500">
        {d.tickets ?? 0} ventas · <span className="font-semibold text-stone-800">{formatCurrency(d.revenue ?? 0)}</span>
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-500">{label}</p>
            <p className="text-3xl font-bold text-stone-800 mt-1 truncate">{value}</p>
            {hint && <p className="text-xs text-stone-400 mt-0.5">{hint}</p>}
          </div>
          <div className={`p-3 rounded-xl ${bg} shrink-0`}>
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-stone-500 tabular-nums">
        Página {page} de {pageCount}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
