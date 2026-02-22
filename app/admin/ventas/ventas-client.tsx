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
import { deleteTicket } from "@/app/actions/sales"
import { toast } from "sonner"
import {
  Receipt,
  Banknote,
  CreditCard,
  Trash2,
  Clock,
  DollarSign,
  ShoppingBag,
  Calendar,
  User,
} from "lucide-react"

/* ────────────────────────────────────────────────────── Types */

interface TicketItem {
  id: string
  quantity: number
  unitPrice: number
  lineTotal: number
  notes: string
  productName: string
  variantName: string
  sizeLabel: string
}

interface Ticket {
  id: string
  paymentMethod: string
  subtotal: number
  total: number
  notes: string
  createdAt: string
  cashierName: string
  items: TicketItem[]
}

interface VentasClientProps {
  tickets: Ticket[]
}

/* ────────────────────────────────────────────────────── Helpers */

type DateFilter = "hoy" | "ayer" | "7dias" | "30dias" | "todo"
type PaymentFilter = "todos" | "efectivo" | "tarjeta"

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
  { key: "tarjeta", label: "Tarjeta" },
]

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function paymentLabel(method: string): string {
  switch (method) {
    case "efectivo":
      return "Efectivo"
    case "transferencia":
      return "Transferencia"
    case "tarjeta_clip":
      return "Tarjeta"
    default:
      return method
  }
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

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  })
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
  const [deleting, setDeleting] = useState(false)

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
    if (
      paymentFilter === "tarjeta" &&
      ticket.paymentMethod !== "tarjeta_clip" &&
      ticket.paymentMethod !== "transferencia"
    ) {
      return false
    }

    return true
  })

  /* ── Stats ────────────────────────────────────────── */

  const todayStart = startOfDay(new Date())
  const todayTickets = tickets.filter(
    (t) => new Date(t.createdAt) >= todayStart
  )
  const todayCount = todayTickets.length
  const todayRevenue = todayTickets.reduce((sum, t) => sum + t.total, 0)
  const avgTicket = todayCount > 0 ? todayRevenue / todayCount : 0

  /* ── Handlers ─────────────────────────────────────── */

  function openTicket(ticket: Ticket) {
    setSelectedTicket(ticket)
    setSheetOpen(true)
  }

  async function handleDelete() {
    if (!selectedTicket) return

    const confirmed = window.confirm(
      `¿Estás seguro de eliminar el ticket #${selectedTicket.id.slice(0, 8)}? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return

    setDeleting(true)
    const fd = new FormData()
    fd.set("id", selectedTicket.id)

    const result = await deleteTicket(fd)

    if (result.error) {
      toast.error(result.error)
      setDeleting(false)
      return
    }

    toast.success("Ticket eliminado correctamente")
    setSheetOpen(false)
    setSelectedTicket(null)
    setDeleting(false)
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
            {tickets.length} ventas registradas en total
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

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
                      ID
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
                      className="border-b border-stone-100 last:border-0 cursor-pointer hover:bg-amber-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-stone-500">
                        {ticket.id.slice(0, 8)}
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
                        {ticket.items.length}{" "}
                        {ticket.items.length === 1 ? "item" : "items"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-stone-800">
                        {formatCurrency(ticket.total)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-xs ${paymentColor(ticket.paymentMethod)}`}
                        >
                          {ticket.paymentMethod === "efectivo" ? (
                            <Banknote className="h-3 w-3 mr-1" />
                          ) : (
                            <CreditCard className="h-3 w-3 mr-1" />
                          )}
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
                  Ticket #{selectedTicket.id.slice(0, 8)}
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
                  <p className="text-sm text-stone-500">Metodo de pago</p>
                  <Badge
                    variant="outline"
                    className={`text-xs ${paymentColor(selectedTicket.paymentMethod)}`}
                  >
                    {selectedTicket.paymentMethod === "efectivo" ? (
                      <Banknote className="h-3 w-3 mr-1" />
                    ) : (
                      <CreditCard className="h-3 w-3 mr-1" />
                    )}
                    {paymentLabel(selectedTicket.paymentMethod)}
                  </Badge>
                </div>

                <Separator />

                {/* Delete */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? "Eliminando..." : "Eliminar ticket"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
