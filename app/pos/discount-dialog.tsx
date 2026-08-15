"use client"

import { useEffect, useState } from "react"
import { Percent, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import type { TicketDiscount } from "./pos-client"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  subtotal: number
  current: TicketDiscount | null
  onApply: (discount: TicketDiscount | null) => void
}

const PERCENT_PRESETS = [5, 10, 15, 20]

function parseAmount(value: string): number | null {
  const n = Number(value.replace(",", "."))
  return value.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n
}

export function DiscountDialog({ open, onOpenChange, subtotal, current, onApply }: Props) {
  const [type, setType] = useState<"percent" | "amount">("percent")
  const [value, setValue] = useState("")
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (open) {
      setType(current?.type ?? "percent")
      setValue(current ? String(current.value) : "")
      setReason(current?.reason ?? "")
    }
  }, [open, current])

  const numeric = parseAmount(value)
  const tooBig = numeric !== null && (type === "percent" ? numeric > 100 : numeric > subtotal)
  const preview =
    numeric !== null && !tooBig
      ? type === "percent"
        ? Math.round(subtotal * numeric) / 100
        : Math.round(numeric * 100) / 100
      : null
  const canApply = numeric !== null && !tooBig && reason.trim().length >= 3

  const apply = () => {
    if (!canApply || numeric === null) return
    onApply({ type, value: numeric, reason: reason.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-amber-700" />
            Descuento al ticket
          </DialogTitle>
          <DialogDescription>
            Se aplica sobre el subtotal de {formatCurrency(subtotal)} y queda registrado con su motivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            {(["percent", "amount"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t)
                  setValue("")
                }}
                className={`py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                  type === t
                    ? "border-amber-500 bg-amber-50 text-amber-800"
                    : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                }`}
              >
                {t === "percent" ? "Porcentaje %" : "Monto fijo $"}
              </button>
            ))}
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label htmlFor="discount-value">{type === "percent" ? "Porcentaje" : "Monto"}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                {type === "percent" ? "%" : "$"}
              </span>
              <Input
                id="discount-value"
                type="number"
                inputMode="decimal"
                min="0"
                step={type === "percent" ? "1" : "0.01"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={`pl-7 h-11 text-lg font-semibold ${tooBig ? "border-red-400" : ""}`}
                autoFocus
              />
            </div>
            {type === "percent" && (
              <div className="flex gap-2">
                {PERCENT_PRESETS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full"
                    onClick={() => setValue(String(p))}
                  >
                    {p}%
                  </Button>
                ))}
              </div>
            )}
            {tooBig && (
              <p className="text-xs text-red-600">
                {type === "percent" ? "El porcentaje no puede pasar de 100." : "El monto no puede ser mayor que el subtotal."}
              </p>
            )}
            {preview !== null && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Descuento: <strong>-{formatCurrency(preview)}</strong> → total{" "}
                <strong>{formatCurrency(Math.max(0, subtotal - preview))}</strong>
              </p>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label htmlFor="discount-reason">Motivo (obligatorio)</Label>
            <Input
              id="discount-reason"
              placeholder="ej. Cliente frecuente, promoción, cortesía"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex gap-2">
            {current && (
              <Button
                variant="outline"
                className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  onApply(null)
                  onOpenChange(false)
                }}
              >
                <Trash2 className="h-4 w-4" />
                Quitar
              </Button>
            )}
            <Button
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!canApply}
              onClick={apply}
            >
              {current ? "Actualizar descuento" : "Aplicar descuento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
