"use client"

import { useEffect, useMemo, useState } from "react"
import { Minus, Plus, SplitSquareHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatCurrency } from "@/lib/format"
import { getLineLabel, getLinePrice, type CartLine } from "./cart"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lo que hay en la cuenta abierta (que es lo que hay en el carrito). */
  lines: CartLine[]
  accountName: string
  /** Piezas a cobrar ahora, por `lineId`. */
  onConfirm: (elegido: Record<string, number>) => void
}

/**
 * Separar una mesa: se elige qué se cobra AHORA y el resto sigue abierto.
 *
 * Se cuenta en piezas y no en renglones porque «dos de los tres lattes» es el
 * caso normal. Y se enseñan los dos totales a la vez —lo que se cobra y lo que
 * queda— porque la pregunta del cliente nunca es «¿cuánto llevo?», es «¿cuánto
 * me toca a mí?».
 */
export function DividirCuentaDialog({ open, onOpenChange, lines, accountName, onConfirm }: Props) {
  const [elegido, setElegido] = useState<Record<string, number>>({})

  // Cada vez que se abre se empieza de cero: arrastrar la selección de la mesa
  // anterior es la forma más fácil de cobrarle a alguien lo que no pidió.
  useEffect(() => {
    if (open) setElegido({})
  }, [open])

  const poner = (lineId: string, n: number, tope: number) =>
    setElegido((prev) => ({ ...prev, [lineId]: Math.max(0, Math.min(tope, n)) }))

  const { cobra, queda, piezas } = useMemo(() => {
    let cobra = 0
    let queda = 0
    let piezas = 0
    for (const l of lines) {
      const n = Math.max(0, Math.min(l.quantity, elegido[l.lineId] ?? 0))
      const precio = getLinePrice(l)
      cobra += precio * n
      queda += precio * (l.quantity - n)
      piezas += n
    }
    return { cobra, queda, piezas }
  }, [lines, elegido])

  const totalPiezas = lines.reduce((s, l) => s + l.quantity, 0)
  // Elegirlo TODO no es separar la cuenta: es cobrarla, y para eso ya está el
  // botón de siempre. Se bloquea para no dejar una cuenta vacía dando vueltas.
  const todo = piezas === totalPiezas
  const puede = piezas > 0 && !todo

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SplitSquareHorizontal className="h-5 w-5 text-amber-700" />
            Separar «{accountName}»
          </DialogTitle>
          <DialogDescription>
            Elige qué se cobra ahora. Lo demás se queda en la cuenta, abierta.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[45vh]">
          <div className="space-y-1.5 pr-3">
            {lines.map((l) => {
              const n = Math.max(0, Math.min(l.quantity, elegido[l.lineId] ?? 0))
              return (
                <div
                  key={l.lineId}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    n > 0 ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-800">{getLineLabel(l)}</p>
                    <p className="text-xs text-stone-500">
                      {l.quantity} × {formatCurrency(getLinePrice(l))}
                      {l.notes.trim() ? ` · ${l.notes.trim()}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => poner(l.lineId, n - 1, l.quantity)}
                      disabled={n === 0}
                      aria-label={`Quitar uno de ${getLineLabel(l)}`}
                      className="blanco-comodo flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 disabled:opacity-30"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-stone-800">{n}</span>
                    <button
                      type="button"
                      onClick={() => poner(l.lineId, n + 1, l.quantity)}
                      disabled={n === l.quantity}
                      aria-label={`Agregar uno de ${getLineLabel(l)}`}
                      className="blanco-comodo flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 disabled:opacity-30"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-2.5 text-sm">
          <div>
            <p className="text-xs text-stone-500">Se cobra ahora</p>
            <p className="text-lg font-bold tabular-nums text-emerald-700">{formatCurrency(cobra)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">Queda en la cuenta</p>
            <p className="text-lg font-bold tabular-nums text-stone-700">{formatCurrency(queda)}</p>
          </div>
        </div>

        {todo && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Eso es toda la cuenta: ciérrala con <strong>Cobrar</strong>, sin separarla.
          </p>
        )}

        <Button
          className="w-full py-6 text-base font-bold"
          disabled={!puede}
          onClick={() => {
            onConfirm(elegido)
            onOpenChange(false)
          }}
        >
          {piezas === 0
            ? "Elige qué se cobra"
            : `Cobrar ${piezas} ${piezas === 1 ? "artículo" : "artículos"} · ${formatCurrency(cobra)}`}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
