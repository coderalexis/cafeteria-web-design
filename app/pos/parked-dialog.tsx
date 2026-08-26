"use client"

import { useState } from "react"
import { PauseCircle, Play, Trash2, TriangleAlert } from "lucide-react"
import { formatCurrency } from "@/lib/format"
import { parkedSummary, waitingLabel, type ParkedOrder } from "./parked"
import type { Product } from "./cart"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Nombres de un toque: lo que más se usa en una cafetería con mesas. */
const CHIPS = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Para llevar", "Mostrador"]

/* ── Guardar el pedido actual ─────────────────────────────────────── */
export function ParkDialog({
  open,
  onOpenChange,
  sugerido,
  onPark,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  sugerido: string
  onPark: (name: string) => void
}) {
  const [nombre, setNombre] = useState("")

  const guardar = (valor: string) => {
    onPark(valor.trim() || sugerido)
    setNombre("")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setNombre("")
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Guardar pedido</DialogTitle>
          <DialogDescription>
            El carrito queda libre para cobrarle a alguien más. Nadie paga nada todavía.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => guardar(c)}
                className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:border-amber-400 hover:text-amber-700"
              >
                {c}
              </button>
            ))}
          </div>
          <Input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={sugerido}
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                guardar(nombre)
              }
            }}
          />
          <p className="text-xs text-stone-400">
            Un nombre ayuda a reconocerlo después. Si lo dejas vacío se llamará «{sugerido}».
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => guardar(nombre)}>
            Guardar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Bandeja: retomar o descartar ─────────────────────────────────── */
export function ParkedTrayDialog({
  open,
  onOpenChange,
  orders,
  products,
  cartHasLines,
  onResume,
  onRemove,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  orders: ParkedOrder[]
  products: Product[]
  /** Si hay algo en el carrito, retomar guardará ese primero (no se pierde). */
  cartHasLines: boolean
  onResume: (order: ParkedOrder) => void
  onRemove: (id: string) => void
}) {
  const ahora = Date.now()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-700" />
            Pedidos en espera ({orders.length})
          </DialogTitle>
          <DialogDescription>
            {cartHasLines
              ? "Al retomar uno, el pedido que tienes en el carrito se guarda solo para que no se pierda."
              : "Toca uno para regresarlo al carrito y cobrarlo."}
          </DialogDescription>
        </DialogHeader>

        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-400">
            No hay pedidos en espera. Usa «Guardar pedido» cuando alguien se tarde en decidir.
          </p>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {orders.map((o) => {
              const r = parkedSummary(o, products, ahora)
              return (
                <div
                  key={o.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    r.ok ? "border-stone-200 bg-white" : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate font-semibold text-stone-800">{o.name}</p>
                      <span className="shrink-0 text-xs text-stone-400">{waitingLabel(o.savedAt, ahora)}</span>
                    </div>
                    {r.ok ? (
                      <p className="truncate text-xs text-stone-500">
                        {r.count} artículo{r.count === 1 ? "" : "s"} · {formatCurrency(r.total)} · {r.label}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs font-medium text-amber-800">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        {r.expired ? "Caducado (más de 12 h)" : "Algún producto ya no está en el menú"}
                      </p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={!r.ok}
                    onClick={() => onResume(o)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Retomar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-stone-300 hover:bg-red-50 hover:text-red-600"
                    title={`Descartar «${o.name}»`}
                    aria-label={`Descartar ${o.name}`}
                    onClick={() => {
                      if (window.confirm(`¿Descartar el pedido «${o.name}»? No se puede recuperar.`)) onRemove(o.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
