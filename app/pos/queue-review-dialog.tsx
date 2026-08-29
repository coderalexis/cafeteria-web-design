"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatTime } from "@/lib/format"
import { useBusiness } from "@/components/business-provider"
import type { QueueState } from "./queue"

/**
 * Ventas que el servidor rechazó por su contenido (un producto que se
 * desactivó mientras esperaban, un turno que ya cerró). No se pueden
 * arreglar solas: aquí el cajero ve QUÉ se cobró y por qué falló, para
 * recapturarlas a mano y quitarlas de la cola.
 *
 * No hay botón de «forzar»: inventar un camino que salte las validaciones del
 * servidor sería abrir un hoyo por donde entraría cualquier cosa.
 */
export function QueueReviewDialog({
  open,
  onOpenChange,
  state,
  onQuitar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: QueueState
  onQuitar: (clientRef: string) => void
}) {
  const revisar = state.sales.filter((s) => s.status === "revisar")
  // La hora de captura se muestra en la zona de la CAFETERÍA: es la hora a la
  // que el cajero cobró, y con ella va a buscar la venta en su turno.
  const { timezone } = useBusiness()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ventas que necesitan tu revisión</DialogTitle>
          <DialogDescription>
            El sistema no pudo registrarlas tal como se capturaron. Cóbralas de nuevo desde el POS y quítalas de aquí.
          </DialogDescription>
        </DialogHeader>

        {revisar.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">No hay ventas por revisar.</p>
        ) : (
          <div className="max-h-[55vh] space-y-3 overflow-y-auto">
            {revisar.map((s) => (
              <div key={s.clientRef} className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-stone-800">{s.provisional}</span>
                  <span className="text-xs text-stone-500">{formatTime(new Date(s.capturedAt), timezone)}</span>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-sm text-stone-700">
                  {s.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {l.quantity}× {l.name}
                      </span>
                      <span className="shrink-0 text-stone-500">{formatCurrency(l.unitPrice * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-red-200 pt-2">
                  <span className="text-sm font-bold text-stone-800">Cobraste {formatCurrency(s.chargedTotal)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    onClick={() => onQuitar(s.clientRef)}
                  >
                    Ya la recobré
                  </Button>
                </div>
                {s.error && <p className="mt-1.5 text-xs text-red-700">{s.error}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
