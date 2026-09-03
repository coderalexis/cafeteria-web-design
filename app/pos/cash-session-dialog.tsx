"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Lock, Unlock, Printer, Wallet, ArrowDownToLine, ArrowUpFromLine, Plus, AlertTriangle } from "lucide-react"
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
import { addCashMovement, closeCashSession, getCashSessionSummary, openCashSession } from "@/app/actions/cash"
import { formatCurrency, formatTime, paymentLabel } from "@/lib/format"
import { buildCorteLines, printLines, receiptBusinessFrom, type CashSessionSummary } from "@/lib/receipt"
import {
  DENOMINACIONES,
  conteoVacio,
  detalleConteo,
  explicarDiferencia,
  hayConteo,
  retiro,
  totalConteo,
  validarFondo,
  type Conteo,
} from "@/lib/conteo-caja"
import { useBusiness } from "@/components/business-provider"

export interface OpenSession {
  id: string
  openedAt: string
  openingFloat: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: OpenSession | null
  /** Lo que se dejó de fondo en el último corte: se sugiere al abrir (P27). */
  suggestedFloat?: number | null
  /** Cuentas abiertas sin cobrar, solo para avisar al cerrar. */
  parkedCount?: number
  /**
   * Las que ya llevan horas o días. Van por su nombre y no como un número:
   * «tienes 3 cuentas abiertas» todas las noches se vuelve ruido que nadie
   * lee, y ahí es donde se pierde el café del viernes que nadie pagó.
   */
  parkedOld?: string[]
  /** Comisión de la terminal (%): solo para mostrar el neto de tarjeta. */
  cardFeePct?: number
  /** Ventas capturadas sin internet que aún no llegan al servidor. */
  pendingUploads?: number
}

const FLOAT_PRESETS = [0, 200, 500, 1000]

function parseMoney(value: string): number | null {
  const n = Number(value.replace(",", "."))
  return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n
}

export function CashSessionDialog({ open, onOpenChange, session, suggestedFloat = null, parkedCount = 0, parkedOld = [], cardFeePct = 0, pendingUploads = 0 }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {session ? (
          <CloseSessionForm session={session} parkedCount={parkedCount} parkedOld={parkedOld} cardFeePct={cardFeePct} pendingUploads={pendingUploads} onDone={() => onOpenChange(false)} />
        ) : (
          <OpenSessionForm onDone={() => onOpenChange(false)} suggestedFloat={suggestedFloat} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Abrir caja                                                         */
/* ------------------------------------------------------------------ */
function OpenSessionForm({ onDone, suggestedFloat }: { onDone: () => void; suggestedFloat: number | null }) {
  const router = useRouter()
  const business = useBusiness()
  // Arranca con lo que se dejó anoche: casi siempre es exactamente eso.
  const [floatValue, setFloatValue] = useState(suggestedFloat != null ? String(suggestedFloat) : "")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const amount = parseMoney(floatValue)

  const submit = async () => {
    if (amount === null || isSubmitting) return
    setIsSubmitting(true)
    const result = await openCashSession({
      openingFloat: amount,
      notes: notes.trim() || undefined,
      expectedBusinessId: business.id,
    })
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

        {suggestedFloat != null && (
          <p className="text-xs text-stone-500" data-fondo-sugerido>
            Sugerido: {formatCurrency(suggestedFloat)}, lo que se dejó de fondo en el último corte.
          </p>
        )}

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
function CloseSessionForm({
  session,
  parkedCount,
  parkedOld,
  cardFeePct = 0,
  pendingUploads = 0,
  onDone,
}: {
  session: OpenSession
  parkedCount: number
  parkedOld: string[]
  cardFeePct?: number
  pendingUploads?: number
  onDone: () => void
}) {
  const router = useRouter()
  const business = useBusiness()
  const [summary, setSummary] = useState<CashSessionSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [countedValue, setCountedValue] = useState("")
  // ── Contar billete por billete ──
  // El número «efectivo contado» sale de contar, no de adivinar: por omisión
  // se cuenta por denominación y el total se arma solo; «Escribir el total»
  // queda para quien ya lo sumó.
  const [modoConteo, setModoConteo] = useState<"contar" | "total">("contar")
  const [conteo, setConteo] = useState<Conteo>(conteoVacio)
  const ajustarConteo = (key: string, delta: number) =>
    setConteo((c) => ({ ...c, [key]: Math.max(0, (c[key] ?? 0) + delta) }))
  const fijarConteo = (key: string, valor: string) =>
    setConteo((c) => ({ ...c, [key]: Math.max(0, Math.floor(Number(valor) || 0)) }))
  // Lo que se deja de fondo para el siguiente turno: por omisión, lo mismo
  // con lo que abrió hoy.
  const [fondoValue, setFondoValue] = useState(String(session.openingFloat))
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Movimiento de efectivo en captura
  const [movementKind, setMovementKind] = useState<"entrada" | "salida" | null>(null)
  const [movementAmount, setMovementAmount] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [isSavingMovement, setIsSavingMovement] = useState(false)

  const loadSummary = useCallback(async () => {
    const result = await getCashSessionSummary(session.id)
    if (result.success) setSummary(result.summary)
    else setLoadError(result.error)
  }, [session.id])

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

  const movIn = summary?.movements_in ?? 0
  const movOut = summary?.movements_out ?? 0
  // Las propinas no son venta, pero las que se pagaron en efectivo sí están
  // físicamente en la caja: cuentan para el esperado (igual que en el RPC).
  const cashTips = summary?.cash_tips ?? 0
  const expected = summary ? summary.opening_float + summary.cash_sales + cashTips + movIn - movOut : null
  const counted = modoConteo === "contar" ? (hayConteo(conteo) ? totalConteo(conteo) : null) : parseMoney(countedValue)
  const fondo = fondoValue.trim() === "" ? null : parseMoney(fondoValue)
  const fondoInvalido = fondoValue.trim() !== "" && fondo === null
  const errorFondo = fondoInvalido
    ? "Escribe un monto válido o déjalo vacío."
    : counted !== null
      ? validarFondo(fondo, counted)
      : null
  const explicacion = expected !== null && counted !== null ? explicarDiferencia(expected, counted) : null

  const movementAmountNum = parseMoney(movementAmount)
  const canSaveMovement =
    movementKind !== null && movementAmountNum !== null && movementAmountNum > 0 && movementReason.trim().length >= 2

  const saveMovement = async () => {
    if (!canSaveMovement || movementKind === null || movementAmountNum === null || isSavingMovement) return
    setIsSavingMovement(true)
    const result = await addCashMovement({
      kind: movementKind,
      amount: movementAmountNum,
      reason: movementReason.trim(),
      expectedBusinessId: business.id,
    })
    setIsSavingMovement(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`${movementKind === "entrada" ? "Entrada" : "Salida"} de ${formatCurrency(result.amount)} registrada`)
    setMovementKind(null)
    setMovementAmount("")
    setMovementReason("")
    await loadSummary()
  }

  const submit = async (print: boolean) => {
    if (counted === null || isSubmitting) return
    setIsSubmitting(true)
    if (errorFondo) return
    const result = await closeCashSession({
      countedCash: counted,
      notes: notes.trim() || undefined,
      countDetail: modoConteo === "contar" ? detalleConteo(conteo) : undefined,
      nextFloat: fondo ?? undefined,
      expectedBusinessId: business.id,
    })
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
    if (print && !printLines(buildCorteLines(result.summary, receiptBusinessFrom(business)), "Corte de caja", receiptBusinessFrom(business).widthMm)) {
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
          Abierta desde las {formatTime(session.openedAt, business.timezone)} con fondo de{" "}
          {formatCurrency(session.openingFloat)}. Aquí
          también registras entradas y salidas de efectivo del turno.
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
              <div key={m.method}>
                <div className="flex justify-between">
                  <span className="text-stone-600">
                    {paymentLabel(m.method)} <span className="text-stone-400">({m.tickets})</span>
                  </span>
                  <span className="font-medium text-stone-800">{formatCurrency(m.revenue)}</span>
                </div>
                {/* Lo que la terminal se queda: ESTIMADO con el % de los
                    ajustes. No toca el arqueo (la tarjeta no pasa por el
                    cajón); es para saber el neto de hoy. */}
                {m.method === "tarjeta_clip" && cardFeePct > 0 && m.revenue > 0 && (
                  <div className="flex justify-between text-xs text-stone-400">
                    <span>Comisión terminal ≈ {cardFeePct}%</span>
                    <span>
                      −{formatCurrency((m.revenue * cardFeePct) / 100)} · neto{" "}
                      {formatCurrency(m.revenue - (m.revenue * cardFeePct) / 100)}
                    </span>
                  </div>
                )}
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
            {(summary.tips_total ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Propinas (aparte de la venta)</span>
                <span>{formatCurrency(summary.tips_total ?? 0)}</span>
              </div>
            )}
          </div>

          {/* Movimientos de efectivo del turno */}
          <div className="rounded-lg border border-stone-200 p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Movimientos de efectivo</p>
              {movementKind === null && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => setMovementKind("entrada")}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Entrada
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-red-700 border-red-200 hover:bg-red-50"
                    onClick={() => setMovementKind("salida")}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" /> Salida
                  </Button>
                </div>
              )}
            </div>

            {movementKind !== null && (
              <div
                className={`rounded-md border p-2 space-y-2 ${
                  movementKind === "entrada" ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
                }`}
              >
                <p className="text-xs font-medium text-stone-700">
                  {movementKind === "entrada" ? "Entrada de efectivo a la caja" : "Salida de efectivo de la caja"}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="Monto"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    className="h-9 w-28 bg-white font-semibold"
                    autoFocus
                  />
                  <Input
                    placeholder={movementKind === "entrada" ? "Motivo (ej. cambio en monedas)" : "Motivo (ej. compra de leche)"}
                    value={movementReason}
                    onChange={(e) => setMovementReason(e.target.value)}
                    maxLength={200}
                    className="h-9 bg-white"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        saveMovement()
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setMovementKind(null)} disabled={isSavingMovement}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={movementKind === "entrada" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                    disabled={!canSaveMovement || isSavingMovement}
                    onClick={saveMovement}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {isSavingMovement ? "Guardando..." : "Registrar"}
                  </Button>
                </div>
              </div>
            )}

            {(summary.movements ?? []).length === 0 ? (
              <p className="text-xs text-stone-400">Sin entradas ni salidas en este turno.</p>
            ) : (
              <ul className="space-y-1">
                {(summary.movements ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-stone-600">
                      <span className="text-stone-400 text-xs">{formatTime(m.created_at, business.timezone)}</span>{" "}
                      {m.reason}
                    </span>
                    <span className={`shrink-0 font-medium ${m.kind === "entrada" ? "text-emerald-700" : "text-red-700"}`}>
                      {m.kind === "entrada" ? "+" : "-"}
                      {formatCurrency(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
            {cashTips > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>+ Propinas en efectivo</span>
                <span>{formatCurrency(cashTips)}</span>
              </div>
            )}
            {movIn > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>+ Entradas</span>
                <span>{formatCurrency(movIn)}</span>
              </div>
            )}
            {movOut > 0 && (
              <div className="flex justify-between text-red-700">
                <span>− Salidas</span>
                <span>{formatCurrency(movOut)}</span>
              </div>
            )}
            <Separator className="my-1 bg-amber-200" />
            <div className="flex justify-between font-bold text-amber-900">
              <span>Efectivo esperado</span>
              <span>{formatCurrency(expected ?? 0)}</span>
            </div>
          </div>

          {parkedCount > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p>
                Tienes {parkedCount} cuenta{parkedCount === 1 ? "" : "s"} abierta{parkedCount === 1 ? "" : "s"} sin
                cobrar. No son ventas ni afectan este corte: siguen ahí para el turno que entre, en este aparato o en
                cualquier otro.
              </p>
              {/* Las viejas por su nombre y con su edad. Un conteo genérico
                  cada noche se vuelve ruido, y es justo ahí donde se pierde
                  el café que alguien pidió el viernes y nunca pagó. */}
              {parkedOld.length > 0 && (
                <div className="font-semibold">
                  <p>Revisa antes de irte, {parkedOld.length === 1 ? "esta lleva" : "estas llevan"} rato sin cobrarse:</p>
                  <ul className="mt-1 list-disc pl-5 font-normal">
                    {parkedOld.map((linea) => (
                      <li key={linea}>{linea}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 1 · Contar. Por omisión billete por billete: el total se arma
              solo y queda guardado con el corte, que es lo que permite
              explicar una diferencia después. «Escribir el total» queda para
              quien ya lo sumó. */}
          <div className="space-y-2" data-corte-paso="1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-bold text-stone-800">1 · Cuenta lo que hay en la caja</Label>
              <div className="flex rounded-lg border border-stone-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setModoConteo("contar")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${modoConteo === "contar" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}
                >
                  Billete por billete
                </button>
                <button
                  type="button"
                  onClick={() => setModoConteo("total")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${modoConteo === "total" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}
                >
                  Escribir el total
                </button>
              </div>
            </div>
            {modoConteo === "contar" ? (
              <div className="rounded-lg border border-stone-200 bg-white">
                <p className="px-3 pt-2 text-xs text-stone-500">Escribe cuántos hay de cada uno; el total sale solo.</p>
                <div className="px-3 py-2">
                  {(["billete", "moneda"] as const).map((tipo) => (
                    <div key={tipo}>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        {tipo === "billete" ? "Billetes" : "Monedas"}
                      </p>
                      {DENOMINACIONES.filter((d) => d.tipo === tipo).map((d) => {
                        const qty = conteo[d.key] ?? 0
                        return (
                          <div key={d.key} className="flex items-center gap-2 py-1">
                            <span className="w-20 shrink-0 text-sm font-semibold text-stone-700">{formatCurrency(d.valor)}</span>
                            <button
                              type="button"
                              aria-label={`Un ${d.tipo} de ${formatCurrency(d.valor)} menos`}
                              onClick={() => ajustarConteo(d.key, -1)}
                              disabled={qty === 0}
                              className="h-8 w-8 shrink-0 rounded-md border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                            >
                              −
                            </button>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={qty === 0 ? "" : String(qty)}
                              onChange={(e) => fijarConteo(d.key, e.target.value)}
                              aria-label={`Cuántos de ${formatCurrency(d.valor)} (${d.tipo})`}
                              className="h-8 w-16 text-center text-sm font-semibold"
                            />
                            <button
                              type="button"
                              aria-label={`Un ${d.tipo} de ${formatCurrency(d.valor)} más`}
                              onClick={() => ajustarConteo(d.key, 1)}
                              className="h-8 w-8 shrink-0 rounded-md border border-stone-200 text-stone-600 hover:bg-stone-100"
                            >
                              +
                            </button>
                            <span className="ml-auto text-sm tabular-nums text-stone-500">{qty > 0 ? formatCurrency(qty * d.valor) : ""}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-stone-200 px-3 py-2">
                  <span className="text-sm font-medium text-stone-600">Total contado</span>
                  <span className="text-xl font-bold text-stone-900" data-corte-total>
                    {formatCurrency(counted ?? 0)}
                  </span>
                </div>
              </div>
            ) : (
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
            )}
          </div>

          {/* 2 · ¿Cuadra? En palabras, y con qué revisar antes de cerrar. */}
          {explicacion && (
            <div
              data-corte-paso="2"
              className={`rounded-lg border px-3 py-2 text-sm ${
                explicacion.tono === "ok"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : explicacion.tono === "sobra"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <p className="font-bold">2 · {explicacion.titulo}</p>
              <p className="mt-0.5 text-xs opacity-90">{explicacion.texto}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="closing-notes">
              {explicacion && explicacion.tono !== "ok" ? "¿Sabes por qué? Anótalo (opcional)" : "Nota de cierre (opcional)"}
            </Label>
            <Input
              id="closing-notes"
              placeholder="ej. Faltó cambio de $50 que se prestó"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
            />
          </div>

          {/* 3 · El fondo de mañana sale de lo contado; lo demás se retira.
              Guardarlo hace que la apertura siguiente ya lo sugiera. */}
          {counted !== null && (
            <div className="space-y-2" data-corte-paso="3">
              <Label htmlFor="next-float" className="text-sm font-bold text-stone-800">
                3 · ¿Cuánto dejas de fondo para el siguiente turno?
              </Label>
              <div className="flex gap-2">
                <Input
                  id="next-float"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={fondoValue}
                  onChange={(e) => setFondoValue(e.target.value)}
                  className={`h-11 text-lg font-semibold ${errorFondo ? "border-red-400" : ""}`}
                />
                <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setFondoValue(String(session.openingFloat))}>
                  Lo de hoy
                </Button>
                <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setFondoValue("0")}>
                  Nada
                </Button>
              </div>
              {errorFondo ? (
                <p className="text-sm text-red-600">{errorFondo}</p>
              ) : (
                <p className="text-sm text-stone-600" data-corte-retiro>
                  {fondo === null ? (
                    "Si lo dejas vacío, no se guarda cuánto quedó."
                  ) : (
                    <>
                      Te llevas <strong>{formatCurrency(retiro(counted, fondo) ?? 0)}</strong> y en el cajón quedan{" "}
                      {formatCurrency(fondo)} para empezar el siguiente turno.
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Con ventas sin subir el corte se BLOQUEA: si se cerrara ahora,
              esas ventas caerían en el turno siguiente y este corte quedaría
              corto contra el efectivo que sí está en el cajón. Una regla
              simple en vez de un problema de conciliación. */}
          {pendingUploads > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                <strong>
                  Hay {pendingUploads} venta{pendingUploads === 1 ? "" : "s"} sin subir.
                </strong>{" "}
                Súbelas antes de cerrar: si no, entrarían al turno siguiente y este corte no cuadraría con el efectivo
                del cajón.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11"
              disabled={counted === null || errorFondo !== null || isSubmitting || pendingUploads > 0}
              onClick={() => submit(false)}
            >
              Cerrar sin imprimir
            </Button>
            <Button
              className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white gap-2"
              disabled={counted === null || errorFondo !== null || isSubmitting || pendingUploads > 0}
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
