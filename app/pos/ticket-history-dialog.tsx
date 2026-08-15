"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Ban, Printer, Receipt, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cancelTicket, getTodayTickets } from "@/app/actions/sales"
import { formatCurrency, formatTime, PAYMENT_METHODS, type PaymentMethodKey } from "@/lib/format"
import { buildTicketLines, printLines, receiptFromTicket } from "@/lib/receipt"
import { ticketItemLabel, type TicketRecord } from "@/lib/tickets"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
}

export function TicketHistoryDialog({ open, onOpenChange, isAdmin }: Props) {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketRecord[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [toCancel, setToCancel] = useState<TicketRecord | null>(null)
  const [reason, setReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await getTodayTickets()
    setIsLoading(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setTickets(result.tickets)
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const reprint = (ticket: TicketRecord) => {
    if (!printLines(buildTicketLines(receiptFromTicket(ticket, true)), `Ticket ${ticket.folio}`)) {
      toast.error("El navegador bloqueó la ventana de impresión.")
    }
  }

  const confirmCancel = async () => {
    if (!toCancel || isCancelling) return
    setIsCancelling(true)
    const result = await cancelTicket({ ticketId: toCancel.id, reason: reason.trim() })
    setIsCancelling(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`Ticket #${result.folio} cancelado`)
    setToCancel(null)
    setReason("")
    await load()
    router.refresh()
  }

  const totalCompletado = (tickets ?? [])
    .filter((t) => t.status === "completado")
    .reduce((s, t) => s + t.total, 0)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-stone-200">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-700" />
              Tickets de hoy
            </DialogTitle>
            <DialogDescription className="flex items-center justify-between">
              <span>
                {tickets
                  ? `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} · ${formatCurrency(totalCompletado)} vendidos`
                  : "Cargando..."}
                {isAdmin && " · viendo todos los cajeros"}
              </span>
              <Button variant="ghost" size="sm" onClick={load} disabled={isLoading} className="gap-1.5 -mr-2">
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-2">
              {tickets && tickets.length === 0 && (
                <p className="text-sm text-stone-400 text-center py-10">Aún no hay ventas hoy.</p>
              )}
              {tickets?.map((ticket) => {
                const info = PAYMENT_METHODS[ticket.paymentMethod as PaymentMethodKey]
                const Icon = info?.icon
                const cancelled = ticket.status === "cancelado"
                return (
                  <div
                    key={ticket.id}
                    className={`rounded-lg border p-3 ${
                      cancelled ? "border-red-200 bg-red-50/40" : "border-stone-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-stone-800">#{ticket.folio}</span>
                          <span className="text-xs text-stone-400">{formatTime(ticket.createdAt)}</span>
                          {Icon && (
                            <span className="flex items-center gap-1 text-xs text-stone-500">
                              <Icon className={`h-3.5 w-3.5 ${info.iconColor}`} />
                              {info.label}
                            </span>
                          )}
                          {isAdmin && (
                            <span className="text-xs text-stone-400">· {ticket.cashierName}</span>
                          )}
                          {cancelled && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-[10px]">
                              Cancelado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-1 truncate">
                          {ticket.items
                            .map(
                              (i) =>
                                `${i.quantity}x ${ticketItemLabel(i)}${
                                  i.modifiers.length > 0 ? ` (+${i.modifiers.map((m) => m.name).join(", ")})` : ""
                                }`,
                            )
                            .join(", ")}
                          {ticket.discountTotal > 0 && (
                            <span className="text-amber-700"> · desc. -{formatCurrency(ticket.discountTotal)}</span>
                          )}
                        </p>
                        {cancelled && ticket.cancelReason && (
                          <p className="text-xs text-red-600 mt-1">Motivo: {ticket.cancelReason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-bold ${cancelled ? "text-stone-400 line-through" : "text-stone-800"}`}>
                          {formatCurrency(ticket.total)}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Reimprimir"
                          onClick={() => reprint(ticket)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                          title={cancelled ? "Ya cancelado" : "Cancelar venta"}
                          disabled={cancelled}
                          onClick={() => {
                            setReason("")
                            setToCancel(ticket)
                          }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirmación de cancelación con motivo */}
      <AlertDialog open={toCancel !== null} onOpenChange={(o) => !o && setToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar ticket #{toCancel?.folio}</AlertDialogTitle>
            <AlertDialogDescription>
              La venta de {toCancel ? formatCurrency(toCancel.total) : ""} dejará de contar en los totales y en el
              corte de caja. Queda registrada como cancelada, con motivo y quién la canceló.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo de la cancelación (obligatorio)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={reason.trim().length < 3 || isCancelling}
              onClick={(e) => {
                e.preventDefault()
                confirmCancel()
              }}
            >
              {isCancelling ? "Cancelando..." : "Cancelar venta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
