"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Lock, Unlock, Printer, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { closeCashSession, getCashSessionSummary, openCashSession } from "@/app/actions/cash"
import { formatCurrency, formatTime, paymentLabel } from "@/lib/format"
import { buildCorteLines, printLines, type CashSessionSummary } from "@/lib/receipt"

export interface OpenSession {
  id: string
  openedAt: string
  openingFloat: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: OpenSession | null
}

const FLOAT_PRESETS = [0, 200, 500, 1000]

function parseMoney(value: string): number | null {
  const n = Number(value.replace(",", "."))
  return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n
}

export function CashSessionDialog({ open, onOpenChange, session }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {session ? (
          <CloseSessionForm session={session} onDone={() => onOpenChange(false)} />
        ) : (
          <OpenSessionForm onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Abrir caja                                                         */
/* ------------------------------------------------------------------ */
function OpenSessionForm({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [floatValue, setFloatValue] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const amount = parseMoney(floatValue)

  const submit = async () => {
    if (amount === null || isSubmitting) return
    setIsSubmitting(true)
    const result = await openCashSession({ openingFloat: amount, notes: notes.trim() || undefined })
    setIsSubmitting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`Caja abierta con fondo de ${formatCurrency(amount)}`)
    onDone()
    router.refresh()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Unlock className="h-5 w-5 text-green-600" />
          Abrir caja
        </DialogTitle>
        <DialogDescription>
          Registra el efectivo con el que inicia el turno. Sin caja abierta no se puede cobrar.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="opening-float">Fondo inicial (efectivo en caja)</Label>
          <Input
            id="opening-float"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={floatValue}
            onChange={(e) => setFloatValue(e.target.value)}
            className="text-lg font-semibold h-11"
            autoFocus
          />
          <div className="flex gap-2 flex-wrap">
            {FLOAT_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFloatValue(String(preset))}
                className="rounded-full"
              >
                {formatCurrency(preset)}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="opening-notes">Nota (opcional)</Label>
          <Input
            id="opening-notes"
            placeholder="ej. Turno mañana"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
          />
        </div>

        <Button
          className="w-full bg-green-600 hover:bg-green-700 text-white h-11 text-base"
          disabled={amount === null || isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? "Abriendo..." : "Abrir caja"}
        </Button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Cerrar caja (corte)                                                */
/* ------------------------------------------------------------------ */
function CloseSessionForm({ session, onDone }: { session: OpenSession; onDone: () => void }) {
  const router = useRouter()
  const [summary, setSummary] = useState<CashSessionSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [countedValue, setCountedValue] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCashSessionSummary(session.id).then((result) => {
      if (cancelled) return
      if (result.success) setSummary(result.summary)
      else setLoadError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [session.id])

  const expected = summary ? summary.opening_float + summary.cash_sales : null
  const counted = parseMoney(countedValue)
  const difference = expected !== null && counted !== null ? counted - expected : null

  const submit = async (print: boolean) => {
    if (counted === null || isSubmitting) return
    setIsSubmitting(true)
    const result = await closeCashSession({ countedCash: counted, notes: notes.trim() || undefined })
    setIsSubmitting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    const diff = result.summary.difference ?? 0
    toast.success(
      diff === 0
        ? "Caja cerrada. El efectivo cuadró."
        : `Caja cerrada. Diferencia: ${diff > 0 ? "+" : ""}${formatCurrency(diff)}`,
    )
    if (print && !printLines(buildCorteLines(result.summary), "Corte de caja")) {
      toast.warning("El navegador bloqueó la ventana de impresión. Puedes reimprimir el corte desde Administrar → Cortes.")
    }
    onDone()
    router.refresh()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-red-600" />
          Cerrar caja
        </DialogTitle>
        <DialogDescription>
          Abierta desde las {formatTime(session.openedAt)} con fondo de {formatCurrency(session.openingFloat)}.
        </DialogDescription>
      </DialogHeader>

      {loadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{loadError}</p>
      )}

      {!summary && !loadError && <p className="text-sm text-stone-400 py-6 text-center">Calculando el corte...</p>}

      {summary && (
        <div className="space-y-4 pt-1">
          {/* Resumen de ventas */}
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-stone-500 text-xs font-semibold uppercase tracking-wide">
              <Wallet className="h-3.5 w-3.5" /> Ventas del turno
            </div>
            {summary.by_method.length === 0 && <p className="text-stone-400">Sin ventas en este turno.</p>}
            {summary.by_method.map((m) => (
              <div key={m.method} className="flex justify-between">
                <span className="text-stone-600">
                  {paymentLabel(m.method)} <span className="text-stone-400">({m.tickets})</span>
                </span>
                <span className="font-medium text-stone-800">{formatCurrency(m.revenue)}</span>
              </div>
            ))}
            {summary.cancelled_count > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Canceladas ({summary.cancelled_count})</span>
                <span>{formatCurrency(summary.cancelled_amount)}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <span className="text-stone-700">Total ventas ({summary.tickets_count})</span>
              <span className="text-stone-900">{formatCurrency(summary.revenue)}</span>
            </div>
          </div>

          {/* Efectivo esperado */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>Fondo inicial</span>
              <span>{formatCurrency(summary.opening_float)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>+ Ventas en efectivo</span>
              <span>{formatCurrency(summary.cash_sales)}</span>
            </div>
            <Separator className="my-1 bg-amber-200" />
            <div className="flex justify-between font-bold text-amber-900">
              <span>Efectivo esperado</span>
              <span>{formatCurrency(expected ?? 0)}</span>
            </div>
          </div>

          {/* Conteo */}
          <div className="space-y-2">
            <Label htmlFor="counted-cash">Efectivo contado en caja</Label>
            <div className="flex gap-2">
              <Input
                id="counted-cash"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={countedValue}
                onChange={(e) => setCountedValue(e.target.value)}
                className="text-lg font-semibold h-11"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={() => setCountedValue(String(expected ?? 0))}
              >
                = Esperado
              </Button>
            </div>
            {difference !== null && (
              <p
                className={`text-sm font-semibold rounded-md px-3 py-2 ${
                  difference === 0
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : difference > 0
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {difference === 0
                  ? "Cuadra exacto"
                  : difference > 0
                  ? `Sobrante: ${formatCurrency(difference)}`
                  : `Faltante: ${formatCurrency(-difference)}`}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="closing-notes">Nota de cierre (opcional)</Label>
            <Input
              id="closing-notes"
              placeholder="ej. Faltó cambio de $50 que se prestó"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11"
              disabled={counted === null || isSubmitting}
              onClick={() => submit(false)}
            >
              Cerrar sin imprimir
            </Button>
            <Button
              className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white gap-2"
              disabled={counted === null || isSubmitting}
              onClick={() => submit(true)}
            >
              <Printer className="h-4 w-4" />
              {isSubmitting ? "Cerrando..." : "Cerrar e imprimir"}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
