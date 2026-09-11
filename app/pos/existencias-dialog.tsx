"use client"

import { useMemo, useState } from "react"
import { ArrowDownToLine, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MovimientoDialog } from "@/components/movimiento-existencia-dialog"
import {
  estadoExistencia,
  type CambioExistencia,
  type Existencia,
  type KindManual,
} from "@/lib/existencias"
import { findVariant, type Product } from "./cart"

/**
 * Existencias desde el POS (P45): lo que se cuenta por pieza, con Entrada y
 * Merma al alcance de la cajera. Es la misma lista que la pantalla del panel
 * pero sin decidir nada: qué se cuenta y cuánto vale se decide en /admin.
 */
export function ExistenciasPosDialog({
  open,
  onOpenChange,
  products,
  existencias,
  isAdmin,
  onCambios,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  existencias: Record<string, Existencia>
  isAdmin: boolean
  onCambios: (cambios: CambioExistencia[]) => void
}) {
  const [mov, setMov] = useState<{ item: { variantId: string; nombre: string; qty: number }; kind: KindManual } | null>(
    null,
  )

  const items = useMemo(
    () =>
      Object.entries(existencias)
        .flatMap(([variantId, e]) => {
          const f = findVariant(products, variantId)
          if (!f) return []
          const nombre = f.size ? `${f.product.name} · ${f.size.label}` : f.product.name
          return [{ variantId, nombre, qty: e.qty, minQty: e.minQty }]
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [existencias, products],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-y-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Existencias</DialogTitle>
            <DialogDescription>
              Lo que se cuenta por pieza. Bajan solas al cobrar; aquí anotas lo que llega y lo que se pierde.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
            {items.length === 0 && (
              <li className="py-8 text-center text-sm text-stone-400">Nada por contar.</li>
            )}
            {items.map((item) => {
              const estado = estadoExistencia(item.qty, item.minQty)
              const color =
                estado === "ok" ? "text-stone-800" : estado === "bajo" ? "text-amber-700" : "text-red-700"
              return (
                <li key={item.variantId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800">{item.nombre}</p>
                    {estado !== "ok" && (
                      <p className={`text-xs ${color}`}>
                        {estado === "bajo" ? "Se está acabando" : estado === "agotado" ? "Agotado" : "Vendiste más de lo que había"}
                      </p>
                    )}
                  </div>
                  <p className={`w-10 shrink-0 text-right text-xl font-bold tabular-nums ${color}`}>{item.qty}</p>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="blanco-comodo"
                      aria-label={`Entrada de ${item.nombre}`}
                      onClick={() => setMov({ item, kind: "entrada" })}
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="blanco-comodo"
                      aria-label={`Merma de ${item.nombre}`}
                      onClick={() => setMov({ item, kind: "merma" })}
                    >
                      <TriangleAlert className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-stone-400">
            Flecha hacia abajo = llegó mercancía · triángulo = se perdió algo.
          </p>
        </DialogContent>
      </Dialog>
      {mov && (
        <MovimientoDialog
          item={mov.item}
          kind={mov.kind}
          esAdmin={isAdmin}
          onClose={() => setMov(null)}
          onDone={onCambios}
        />
      )}
    </>
  )
}
