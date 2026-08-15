"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { buildTicketLines, printLines, receiptFromTicket } from "@/lib/receipt"
import type { TicketRecord } from "@/lib/tickets"
import { toast } from "sonner"
import {
  Receipt,
  Banknote,
  CreditCard,
  Smartphone,
  Ban,
  Printer,
  Clock,
  DollarSign,
  ShoppingBag,
  Calendar,
  User,
  StickyNote,
  Flame,
} from "lucide-react"

/* ────────────────────────────────────────────────────── Types */

type Ticket = TicketRecord

interface VentasClientProps {
  tickets: Ticket[]
}

function PaymentIcon({ method, className }: { method: string; className?: string }) {
  const Icon = PAYMENT_METHODS[method as PaymentMethodKey]?.icon ?? CreditCard
  return <Icon className={className} />
}

/* ────────────────────────────────────────────────────── Helpers */

type DateFilter = "hoy" | "ayer" | "7dias" | "30dias" | "todo"
type PaymentFilter = "todos" | "efectivo" | "transferencia" | "tarjeta"

const dateFilterLabels: { key: DateFilter; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "7dias", label: "7 dias" },
  { key: "30dias", label: "30 dias" },
  { key: "todo", label: "Todo" },
]

const paymentFilterLabels: { key: PaymentFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transfer" },
  { key: "tarjeta", label: "Tarjeta" },
]

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/* ────────────────────────────────────────────────────── Component */

export default function VentasClient({ tickets }: VentasClientProps) {
  const router = useRouter()
  const [dateFilter, setDateFilter] = useState<DateFilter>("hoy")
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("todos")
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  /* ── Filter tickets ───────────────────────────────── */

  const filteredTickets = tickets.filter((ticket) => {
    // Date filter
    const ticketDate = new Date(ticket.createdAt)
    const now = new Date()
    const todayStart = startOfDay(now)

    if (dateFilter === "hoy") {
      if (ticketDate < todayStart) return false
    } else if (dateFilter === "ayer") {
      const yesterdayStart = new Date(todayStart)
      yesterdayStart.setDate(yesterdayStart.getDate() - 1)
      if (ticketDate < yesterdayStart || ticketDate >= todayStart) return false
    } else if (dateFilter === "7dias") {
      const weekAgo = new Date(todayStart)
      weekAgo.setDate(weekAgo.getDate() - 7)
      if (ticketDate < weekAgo) return false
    } else if (dateFilter === "30dias") {
      const monthAgo = new Date(todayStart)
      monthAgo.setDate(monthAgo.getDate() - 30)
      if (ticketDate < monthAgo) return false
    }

    // Payment filter
    if (paymentFilter === "efectivo" && ticket.paymentMethod !== "efectivo") {
      return false
    }
    if (paymentFilter === "transferencia" && ticket.paymentMethod !== "transferencia") {
      return false
    }
    if (paymentFilter === "tarjeta" && ticket.paymentMethod !== "tarjeta_clip") {
      return false
    }

    return true
  })

  /* ── Stats (solo ventas completadas) ──────────────── */

  const todayStart = startOfDay(new Date())
  const todayTickets = tickets.filter(
    (t) => t.status === "completado" && new Date(t.createdAt) >= todayStart
  )
  const todayCancelled = tickets.filter(
    (t) => t.status === "cancelado" && new Date(t.createdAt) >= todayStart
  )
  const todayCount = todayTickets.length
  const todayRevenue = todayTickets.reduce((sum, t) => sum + t.total, 0)
  const avgTicket = todayCount > 0 ? todayRevenue / todayCount : 0
  const todayItemsSold = todayTickets.reduce(
    (sum, ticket) => sum + ticket.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  )

  const salesByHour = Array.from({ length: 24 }, (_, hour) => {
    const hourTickets = todayTickets.filter(
      (ticket) => new Date(ticket.createdAt).getHours() === hour
    )
    const revenue = hourTickets.reduce((sum, ticket) => sum + ticket.total, 0)

    return {
      hour,
      count: hourTickets.length,
      revenue,
    }
  })

  const topHour = salesByHour.reduce(
    (best, current) => (current.revenue > best.revenue ? current : best),
    { hour: 0, count: 0, revenue: 0 }
  )

  const methodTotals = {
    efectivo: todayTickets
      .filter((ticket) => ticket.paymentMethod === "efectivo")
      .reduce((sum, ticket) => sum + ticket.total, 0),
    transferencia: todayTickets
      .filter((ticket) => ticket.paymentMethod === "transferencia")
      .reduce((sum, ticket) => sum + ticket.total, 0),
    tarjeta: todayTickets
      .filter((ticket) => ticket.paymentMethod === "tarjeta_clip")
      .reduce((sum, ticket) => sum + ticket.total, 0),
  }

  const productSales = new Map<string, { quantity: number; revenue: number }>()

  todayTickets.forEach((ticket) => {
    ticket.items.forEach((item) => {
      const key = `${item.productName} ${item.sizeLabel || item.variantName}`.trim()
      const current = productSales.get(key) || { quantity: 0, revenue: 0 }

      productSales.set(key, {
        quantity: current.quantity + item.quantity,
        revenue: current.revenue + item.lineTotal,
      })
    })
  })

  const topProducts = Array.from(productSales.entries())
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  /* ── Handlers ─────────────────────────────────────── */

  function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket)
    setSheetOpen(true)
  }

  function handleReprint() {
    if (!selectedTicket) return
    if (!printLines(buildTicketLines(receiptFromTicket(selectedTicket, true)), `Ticket ${selectedTicket.folio}`)) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-amber-600" />
            Historial de Ventas
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {tickets.filter((t) => t.status === "completado").length} ventas registradas en total
            {todayCancelled.length > 0 && ` · ${todayCancelled.length} cancelada${todayCancelled.length === 1 ? "" : "s"} hoy`}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-500">
                  Ventas de Hoy
                </p>
                <p className="text-3xl font-bold text-stone-800 mt-1">
                  {todayCount}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-50">
                <ShoppingBag className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-500">
                  Ingresos de Hoy
                </p>
                <p className="text-3xl font-bold text-stone-800 mt-1">
                  {formatCurrency(todayRevenue)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50">
                <DollarSign className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-500">
                  Ticket Promedio
                </p>
                <p className="text-3xl font-bold text-stone-800 mt-1">
                  {formatCurrency(avgTicket)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50">
                <Receipt className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-stone-500">
                  Items Vendidos Hoy
                </p>
                <p className="text-3xl font-bold text-stone-800 mt-1">
                  {todayItemsSold}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-violet-50">
                <ShoppingBag className="h-6 w-6 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-700">Ventas por metodo (hoy)</p>
              <p className="text-xs text-stone-400">Total: {formatCurrency(todayRevenue)}</p>
            </div>
            <div className="space-y-3">
              {[
                { label: "Efectivo", value: methodTotals.efectivo, icon: Banknote },
                { label: "Transferencia", value: methodTotals.transferencia, icon: Smartphone },
                { label: "Tarjeta", value: methodTotals.tarjeta, icon: CreditCard },
              ].map(({ label, value, icon: Icon }) => {
                const percentage = todayRevenue > 0 ? (value / todayRevenue) * 100 : 0
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1.5 text-sm">
                      <div className="flex items-center gap-2 text-stone-700">
                        <Icon className="h-4 w-4 text-stone-500" />
                        {label}
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

        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold text-stone-700">Hora pico (hoy)</p>
            <div>
              <p className="text-3xl font-bold text-stone-800">
                {`${topHour.hour.toString().padStart(2, "0")}:00`}
              </p>
              <p className="text-sm text-stone-500 mt-1">
                {topHour.count} ventas · {formatCurrency(topHour.revenue)}
              </p>
            </div>
            <p className="text-xs text-stone-400">
              Basado en la hora con mayor ingreso acumulado del dia.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-600" />
              Productos top del dia
            </h2>
          </div>

          {topProducts.length === 0 ? (
            <p className="text-sm text-stone-500">Aun no hay ventas registradas hoy.</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold flex items-center justify-center shrink-0">
                      #{index + 1}
                    </div>
                    <p className="text-sm text-stone-700 truncate">{product.name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-semibold text-stone-800">{product.quantity} uds</p>
                    <p className="text-xs text-stone-500">{formatCurrency(product.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Date filters */}
        <div className="flex gap-1.5 flex-wrap">
          {dateFilterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dateFilter === key
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Payment filters */}
        <div className="flex gap-1.5 flex-wrap sm:ml-auto">
          {paymentFilterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPaymentFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                paymentFilter === key
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filteredTickets.length === 0 ? (
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
                    <th className="text-left px-4 py-3 font-medium text-stone-500">
                      Folio
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">
                      Hora
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">
                      Items
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-stone-500">
                      Total
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">
                      Pago
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">
                      Cajero
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
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
                          {formatTime(ticket.createdAt)}
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {formatDate(ticket.createdAt)}
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
                    {formatDateTime(selectedTicket.createdAt)}
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
                      {selectedTicket.cancelledAt ? ` · ${formatDateTime(selectedTicket.cancelledAt)}` : ""}
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

                {/* Total */}
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-stone-800">
                    Total
                  </p>
                  <p className="text-xl font-bold text-stone-800">
                    {formatCurrency(selectedTicket.total)}
                  </p>
                </div>

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
