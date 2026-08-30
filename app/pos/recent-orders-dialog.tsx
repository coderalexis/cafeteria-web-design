"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, ChevronRight, Loader2, RefreshCw, ShoppingBag } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getRecentOrders, type KitchenOrder } from "@/app/actions/kitchen"
import { formatTime } from "@/lib/format"
import { useBusiness } from "@/components/business-provider"

/**
 * «Últimos pedidos»: los diez más recientes del día, solo para consultar.
 *
 * Responde preguntas de barra —«¿qué acabo de preparar?», «¿el folio 7
 * llevaba leche de avena?»— sin salir del punto de venta.
 *
 * NO SE MARCA NADA DESDE AQUÍ, a propósito: eso se hace en «Por preparar», y
 * dos lugares donde marcar serían dos lugares donde equivocarse. Aquí solo se
 * DICE si ya está hecho.
 *
 * Es distinto de «Tickets del día», que es la vista del dinero (totales, forma
 * de pago, reimprimir, cancelar). Esta responde qué se pidió, sin un precio a
 * la vista: se abre con las manos en la barra, no con la calculadora.
 */
export function RecentOrdersDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { timezone } = useBusiness()
  const [orders, setOrders] = useState<KitchenOrder[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const r = await getRecentOrders()
    setCargando(false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    setOrders(r.orders)
  }, [])

  // Se recarga cada vez que se abre: entre una consulta y otra pudo haber
  // ventas nuevas, y un listado viejo aquí engaña.
  useEffect(() => {
    if (open) {
      setAbierto(null)
      void cargar()
    }
  }, [open, cargar])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col p-0">
        <DialogHeader className="shrink-0 border-b border-stone-200 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="text-lg">Últimos pedidos</DialogTitle>
              <DialogDescription>
                Los más recientes de hoy. Toca uno para ver qué llevaba.
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void cargar()}
              disabled={cargando}
              title="Volver a consultar"
              className="shrink-0"
            >
              {cargando ? (
                <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
              ) : (
                <RefreshCw className="h-4 w-4 text-stone-500" />
              )}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-4">
            {orders === null ? (
              <p className="py-10 text-center text-sm text-stone-400">Consultando…</p>
            ) : orders.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-400">
                Todavía no hay ventas hoy.
              </p>
            ) : (
              orders.map((o) => {
                const desplegado = abierto === o.id
                const resumen = o.items
                  .map((i) => `${i.quantity}× ${i.label}`)
                  .join(", ")
                return (
                  <div
                    key={o.id}
                    className={`rounded-lg border transition-colors ${
                      desplegado ? "border-amber-300 bg-amber-50/40" : "border-stone-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setAbierto(desplegado ? null : o.id)}
                      className="flex w-full items-center gap-3 p-3 text-left"
                      aria-expanded={desplegado}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-bold text-stone-800">#{o.folio}</span>
                          <span className="text-xs text-stone-500">
                            {formatTime(o.createdAt, timezone)}
                          </span>
                          {o.takeout && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              <ShoppingBag className="h-2.5 w-2.5" />
                              Para llevar
                            </span>
                          )}
                          {o.prepared && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                              <Check className="h-3 w-3" />
                              Hecho
                            </span>
                          )}
                        </span>
                        {!desplegado && (
                          <span className="mt-0.5 block truncate text-sm text-stone-600">{resumen}</span>
                        )}
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-stone-300 transition-transform ${
                          desplegado ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {desplegado && (
                      <div className="border-t border-amber-200/70 px-3 py-3">
                        {o.notes && (
                          <p className="mb-2 rounded-lg bg-amber-100/70 px-2.5 py-1.5 text-sm font-medium text-amber-900">
                            📝 {o.notes}
                          </p>
                        )}
                        <ul className="space-y-2">
                          {o.items.map((it, j) => (
                            <li key={j}>
                              <p className="text-sm font-semibold leading-snug text-stone-800">
                                <span className="text-amber-700">{it.quantity}×</span> {it.label}
                              </p>
                              {it.modifiers.map((m, k) => (
                                <p key={k} className="pl-5 text-sm text-stone-600">
                                  + {m}
                                </p>
                              ))}
                              {it.notes && (
                                <p className="pl-5 text-sm font-semibold uppercase text-amber-800">
                                  * {it.notes}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
