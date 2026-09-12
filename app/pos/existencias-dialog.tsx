"use client"

import { useMemo, useState } from "react"
import { ArrowDownToLine, Coffee, Package, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MovimientoDialog, type ItemMovimiento } from "@/components/movimiento-existencia-dialog"
import {
  UNIDADES,
  estadoExistencia,
  formatCantidad,
  type CambioExistencia,
  type ItemExistencia,
  type KindManual,
} from "@/lib/existencias"

/**
 * Existencias desde el POS (P45): lo que el café cuenta, con Entrada y Merma
 * al alcance de la cajera — que es quien recibe el pan a las 7 y quien ve
 * caerse el último vaso. Es la misma lista del panel pero sin decidir nada:
 * qué se cuenta y cuánto cuesta se decide en /admin.
 */
export function ExistenciasPosDialog({
  open,
  onOpenChange,
  existencias,
  isAdmin,
  onCambios,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existencias: ItemExistencia[]
  isAdmin: boolean
  onCambios: (cambios: CambioExistencia[]) => void
}) {
  const [mov, setMov] = useState<{ item: ItemMovimiento; kind: KindManual } | null>(null)

  // Los insumos primero: es lo que más se anota en plena barra.
  const items = useMemo(
    () =>
      [...existencias].sort(
        (a, b) =>
          Number(!!a.variantId) - Number(!!b.variantId) || a.nombre.localeCompare(b.nombre, "es"),
      ),
    [existencias],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="overflow-y-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Existencias</DialogTitle>
            <DialogDescription>
              Lo que se acaba. Lo del menú baja solo al cobrar; aquí anotas lo que llega y lo que se pierde.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
            {items.length === 0 && <li className="py-8 text-center text-sm text-stone-400">Nada por contar.</li>}
            {items.map((item) => {
              const estado = estadoExistencia(item.qty, item.minQty)
              const color = estado === "ok" ? "text-stone-800" : estado === "bajo" ? "text-amber-700" : "text-red-700"
              const unidad = UNIDADES.find((u) => u.id === item.unidad)?.varios ?? "piezas"
              const paraMover: ItemMovimiento = {
                itemId: item.itemId,
                nombre: item.nombre,
                qty: item.qty,
                unidad: item.unidad,
                esDelMenu: !!item.variantId,
              }
              return (
                <li key={item.itemId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-stone-800">
                      {item.variantId ? (
                        <Coffee className="h-3.5 w-3.5 shrink-0 text-stone-300" aria-label="De tu menú" />
                      ) : (
                        <Package className="h-3.5 w-3.5 shrink-0 text-stone-300" aria-label="Insumo" />
                      )}
                      {item.nombre}
                    </p>
                    <p className={`text-xs ${estado === "ok" ? "text-stone-400" : color}`}>
                      {estado === "bajo"
                        ? "Se está acabando"
                        : estado === "agotado"
                          ? "Se acabó"
                          : estado === "negativo"
                            ? "Salió más de lo que había"
                            : unidad}
                    </p>
                  </div>
                  <p className={`w-12 shrink-0 text-right text-xl font-bold tabular-nums ${color}`}>
                    {formatCantidad(item.qty)}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="blanco-comodo"
                      aria-label={`Entrada de ${item.nombre}`}
                      onClick={() => setMov({ item: paraMover, kind: "entrada" })}
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="blanco-comodo"
                      aria-label={`Merma de ${item.nombre}`}
                      onClick={() => setMov({ item: paraMover, kind: "merma" })}
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
