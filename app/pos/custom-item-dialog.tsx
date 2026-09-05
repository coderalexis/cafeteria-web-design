"use client"

import { useEffect, useMemo, useState } from "react"
import { Sparkles } from "lucide-react"
import { formatCurrency } from "@/lib/format"
import { parseCash } from "./cart"
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

/** Lo vendido fuera de menú últimamente: nombre, último precio y cuántas veces. */
export interface CustomRecent {
  name: string
  price: number
  n: number
}

export const CUSTOM_PRICE_MAX = 9999.99

/**
 * «Fuera de menú»: algo que no está en la carta, con el precio decidido en
 * caja. Dos campos y listo —qué es y cuánto—, porque ocurre con fila: «la
 * fruta picada pero sin yogurt». Lo que ya se vendió así antes aparece como
 * chips para repetirlo en un toque con el último precio.
 */
export function CustomItemDialog({
  open,
  onOpenChange,
  initialName,
  recientes,
  onAdd,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Lo que se buscó y no estaba: arranca con eso escrito. */
  initialName: string
  recientes: CustomRecent[]
  onAdd: (item: { name: string; price: number }) => void
}) {
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")

  useEffect(() => {
    if (open) {
      setName(initialName.trim().slice(0, 80))
      setPrice("")
    }
  }, [open, initialName])

  const precio = parseCash(price)
  const nombre = name.trim().replace(/\s+/g, " ")
  const valido = nombre.length > 0 && precio !== null && precio >= 0.01 && precio <= CUSTOM_PRICE_MAX
  const sugeridos = useMemo(() => {
    const q = nombre.toLowerCase()
    return recientes.filter((r) => !q || r.name.toLowerCase().includes(q)).slice(0, 8)
  }, [recientes, nombre])

  function agregar() {
    if (!valido || precio === null) return
    onAdd({ name: nombre.slice(0, 80), price: Math.round(precio * 100) / 100 })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-fuera-de-menu>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-700" />
            Fuera de menú
          </DialogTitle>
          <DialogDescription>
            Algo que no está en la carta: qué es y cuánto cobras. Se guarda en la venta con ese nombre y ese precio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus={!initialName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Qué es (p. ej. Fruta picada sin yogurt)"
            maxLength={80}
            className="h-11 text-base"
            data-fuera-nombre
          />
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-stone-400">$</span>
            <Input
              autoFocus={!!initialName}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Precio"
              className="h-12 pl-7 text-xl font-semibold"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  agregar()
                }
              }}
              data-fuera-precio
            />
          </div>
          {precio !== null && precio > CUSTOM_PRICE_MAX && (
            <p className="text-xs text-red-600">El tope fuera de menú es {formatCurrency(CUSTOM_PRICE_MAX)}.</p>
          )}
          {sugeridos.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-stone-500">Lo que ya vendiste así (un toque lo pone):</p>
              <div className="flex flex-wrap gap-1.5">
                {sugeridos.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => {
                      setName(r.name)
                      setPrice(String(r.price))
                    }}
                    className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    data-fuera-reciente
                  >
                    {r.name} · {formatCurrency(r.price)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={agregar} disabled={!valido} className="bg-amber-700 text-white hover:bg-amber-800" data-fuera-agregar>
            Agregar{valido && precio !== null ? ` · ${formatCurrency(precio)}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
