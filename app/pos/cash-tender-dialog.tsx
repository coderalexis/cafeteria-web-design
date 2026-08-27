"use client"

import type { Dispatch, SetStateAction } from "react"
import { Banknote, Delete } from "lucide-react"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Cuánto efectivo entregó el cliente.
 *
 * Vivía dentro del carrito y se llevaba ~130 px fijos con teclas de 12 px de
 * alto. En una tablet acostada ese espacio se lo quitaba a la lista de lo que
 * se está cobrando, y las teclas quedaban chicas justo donde se teclea con el
 * dedo. Aquí las teclas son grandes y el carrito recupera el espacio.
 */
export function CashTenderDialog({
  open,
  onOpenChange,
  due,
  value,
  onChange,
  suggestions,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  due: number
  value: string
  /** Actualizador de React, no un simple setter: dos toques seguidos deben
   *  encadenarse. Con `(valor + tecla)` el segundo podía leer el valor viejo y
   *  «5» seguido de «0» quedaba en «0». */
  onChange: Dispatch<SetStateAction<string>>
  suggestions: number[]
}) {
  const recibido = Number(value)
  const valido = value !== "" && Number.isFinite(recibido)
  const falta = valido && recibido < due ? due - recibido : 0
  const cambio = valido && recibido >= due ? recibido - due : null

  function teclear(key: string) {
    onChange((prev) => (prev + key).replace(/^0+(?=\d)/, "").slice(0, 7))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-green-700" />
            Efectivo recibido
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-green-200 bg-green-50/60 p-4 text-center">
          <p className="text-xs font-medium text-green-800">A cobrar {formatCurrency(due)}</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-green-900">
            {value === "" ? "—" : formatCurrency(recibido)}
          </p>
          <p
            className={`mt-1 text-sm font-semibold ${
              falta > 0 ? "text-red-600" : cambio !== null ? "text-green-700" : "text-stone-400"
            }`}
            aria-live="polite"
          >
            {falta > 0
              ? `Faltan ${formatCurrency(falta)}`
              : cambio !== null
                ? `Cambio ${formatCurrency(cambio)}`
                : "Cambio —"}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange(due > 0 ? String(due) : "")}
            className="flex-1 rounded-lg border border-green-300 bg-white py-2 text-sm font-semibold text-green-800 hover:bg-green-50"
          >
            Exacto
          </button>
          {suggestions.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => onChange(String(amount))}
              disabled={amount < due}
              className="flex-1 rounded-lg border border-green-300 bg-white py-2 text-sm font-semibold text-green-800 hover:bg-green-50 disabled:opacity-40"
            >
              ${amount}
            </button>
          ))}
        </div>

        {/* Teclas grandes: se pican con el dedo, no con el cursor. */}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => teclear(key)}
              className="rounded-lg border border-stone-200 bg-white py-4 text-xl font-semibold text-stone-800 hover:bg-stone-50 active:bg-stone-100"
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange((prev) => prev.slice(0, -1))}
            aria-label="Borrar el último dígito"
            className="flex items-center justify-center rounded-lg border border-stone-200 bg-white py-4 text-stone-600 hover:bg-stone-50 active:bg-stone-100"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onChange("")}>
            Limpiar
          </Button>
          <Button
            className="flex-1 bg-green-600 text-white hover:bg-green-700"
            onClick={() => onOpenChange(false)}
          >
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
