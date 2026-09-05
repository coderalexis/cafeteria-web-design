"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { HandCoins, Loader2 } from "lucide-react"
import { payCredit } from "@/app/actions/credit"
import { formatCurrency, PAYMENT_METHODS } from "@/lib/format"
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

/** Con qué se abona: todo menos «fiado» (un fiado no se paga fiando). */
const METODOS_ABONO = ["efectivo", "transferencia", "tarjeta_clip"] as const
type MetodoAbono = (typeof METODOS_ABONO)[number]

/**
 * Registrar un abono a una cuenta de fiado. La misma ventana en el POS (⋮ →
 * Fiados y abonos) y en el panel (Por cobrar): quien recibe el dinero es
 * quien lo registra, sea cajero o dueño. El monto arranca en lo que debe
 * —lo más común es liquidar— y no deja pasar de ahí.
 */
export function AbonarDialog({
  cuenta,
  onOpenChange,
  onDone,
}: {
  /** A quién se le abona; null = cerrado. */
  cuenta: { id: string; name: string; balance: number } | null
  onOpenChange: (open: boolean) => void
  /** Se registró: saldo que queda. */
  onDone: (r: { name: string; amount: number; balance: number }) => void
}) {
  const [monto, setMonto] = useState("")
  const [metodo, setMetodo] = useState<MetodoAbono>("efectivo")
  const [nota, setNota] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (cuenta) {
      setMonto(String(cuenta.balance))
      setMetodo("efectivo")
      setNota("")
    }
  }, [cuenta])

  const cantidad = Number(String(monto).replace(/,/g, ""))
  const valido = cuenta !== null && Number.isFinite(cantidad) && cantidad > 0 && cantidad <= cuenta.balance + 0.001

  async function abonar() {
    if (!cuenta || !valido || guardando) return
    setGuardando(true)
    const r = await payCredit({ customerId: cuenta.id, amount: Math.round(cantidad * 100) / 100, method: metodo, notes: nota || undefined })
    setGuardando(false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    onDone({ name: r.name, amount: r.amount, balance: r.balance })
    onOpenChange(false)
  }

  return (
    <Dialog open={cuenta !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-abonar>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-rose-700" />
            Abonar a «{cuenta?.name}»
          </DialogTitle>
          <DialogDescription>
            Debe <strong className="text-stone-800">{formatCurrency(cuenta?.balance ?? 0)}</strong>. Puede pagar todo o
            una parte; en efectivo, el dinero entra a la caja del turno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="abono-monto" className="text-xs font-medium text-stone-600">
              Cuánto abona
            </label>
            <Input
              id="abono-monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="mt-1 h-11 text-lg font-semibold"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void abonar()
                }
              }}
            />
            {cuenta && Number.isFinite(cantidad) && cantidad > cuenta.balance + 0.001 && (
              <p className="mt-1 text-xs text-red-600">Solo debe {formatCurrency(cuenta.balance)}.</p>
            )}
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Con qué paga">
            {METODOS_ABONO.map((m) => {
              const info = PAYMENT_METHODS[m]
              const Icon = info.icon
              const activo = metodo === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setMetodo(m)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2 text-sm font-semibold ${
                    activo ? "border-rose-500 bg-rose-50 text-rose-800" : "border-stone-200 bg-white text-stone-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {info.shortLabel}
                </button>
              )
            })}
          </div>
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional): quincena, parte 1 de 2…"
            maxLength={120}
            className="h-9 text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void abonar()} disabled={!valido || guardando} className="bg-rose-700 text-white hover:bg-rose-800" data-abonar-confirmar>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Registrar abono de {formatCurrency(Number.isFinite(cantidad) ? cantidad : 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
