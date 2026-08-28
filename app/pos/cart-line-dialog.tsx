"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { StickyNote } from "lucide-react"
import { formatCurrency } from "@/lib/format"
import { getLinePrice, type CartLine } from "./cart"

/**
 * Detalle de UNA línea del carrito, pedido por el usuario: en la fila el
 * nombre va truncado y los modificadores comprimidos; aquí se ve todo con
 * palabras completas — nombre, descripción, opciones, nota, y las cuentas de
 * esa línea (cantidad × precio unitario = total).
 *
 * Solo lectura a propósito: editar ya tiene sus caminos (los botones de la
 * fila, el menú ⋯ y los gestos). Duplicar la edición aquí sería una segunda
 * fuente de verdad que mantener.
 */
export function CartLineDialog({ line, onClose }: { line: CartLine | null; onClose: () => void }) {
  const unit = line ? getLinePrice(line) : 0
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        {line && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-left text-lg leading-snug text-stone-800">
                {line.product.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              {line.size && (
                <Badge variant="outline" className="border-stone-300 text-stone-600">
                  {line.size.label}
                </Badge>
              )}

              {line.product.description && (
                <p className="leading-relaxed text-stone-600">{line.product.description}</p>
              )}

              {line.modifiers.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">Con</p>
                  <ul className="space-y-0.5">
                    {line.modifiers.map((m) => (
                      <li key={m.id} className="flex items-baseline justify-between gap-3 text-stone-700">
                        <span>{m.name}</span>
                        <span className="shrink-0 text-xs text-stone-400">
                          {m.priceDelta > 0 ? `+${formatCurrency(m.priceDelta)}` : "sin costo"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {line.notes && (
                <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 italic text-amber-900">
                  <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {line.notes}
                </p>
              )}

              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Cantidad</span>
                  <span className="font-semibold text-stone-800">{line.quantity}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-stone-600">
                  <span>Precio unitario</span>
                  <span className="font-semibold text-stone-800">{formatCurrency(unit)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2">
                  <span className="font-medium text-stone-700">Total de esta línea</span>
                  <span className="text-lg font-bold text-stone-900">
                    {formatCurrency(unit * line.quantity)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
