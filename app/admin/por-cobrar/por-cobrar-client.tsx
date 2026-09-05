"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { HandCoins, Loader2, Phone, TriangleAlert } from "lucide-react"
import { forgiveOwed } from "@/app/actions/parked"
import { getCreditStatement, type CreditAccount, type CreditStatement } from "@/app/actions/credit"
import { AbonarDialog } from "@/components/abonar-dialog"
import { formatCurrency, formatDate, formatDateTime, paymentLabel } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface Deuda {
  id: string
  name: string
  contact: string | null
  owedSince: string
  openedAt: string
  total: number
  articulos: number
  /** Renglones cuyo producto ya no está en el menú: no se pueden cobrar. */
  sinPrecio: number
}

/** "3 días" — cuánto lleva debiendo. */
function diasDebiendo(desde: string, ahora: number): string {
  const d = Math.floor((ahora - new Date(desde).getTime()) / 86400_000)
  if (d < 1) return "hoy"
  if (d === 1) return "1 día"
  return `${d} días`
}

export function PorCobrarClient({
  deudas,
  cuentas,
  creditEnabled,
  timezone,
}: {
  deudas: Deuda[]
  cuentas: CreditAccount[]
  creditEnabled: boolean
  timezone: string
}) {
  const router = useRouter()
  const ahora = Date.now()
  const [condonando, setCondonando] = useState<Deuda | null>(null)
  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)

  // ── Fiados por persona ──
  const [verTodas, setVerTodas] = useState(false)
  const [abonando, setAbonando] = useState<{ id: string; name: string; balance: number } | null>(null)
  const [estado, setEstado] = useState<CreditStatement | null>(null)
  const [cargandoEstado, setCargandoEstado] = useState<string | null>(null)

  const deudores = cuentas.filter((c) => c.balance > 0)
  const visibles = verTodas ? cuentas : deudores
  const totalFiado = deudores.reduce((s, c) => s + c.balance, 0)
  const total = deudas.reduce((s, d) => s + d.total, 0)

  const abrirEstado = async (c: CreditAccount) => {
    setCargandoEstado(c.id)
    const r = await getCreditStatement(c.id)
    setCargandoEstado(null)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    setEstado(r.statement)
  }

  const condonar = async () => {
    if (!condonando || guardando) return
    setGuardando(true)
    const r = await forgiveOwed({ id: condonando.id, reason: motivo.trim() })
    setGuardando(false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    toast.success(`Se condonó la deuda de «${condonando.name}».`)
    setCondonando(null)
    setMotivo("")
    router.refresh()
  }

  return (
    <>
      {/* ── Fiados por persona (P38) ── */}
      {creditEnabled && (
        <section className="space-y-3" data-fiados-panel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-stone-800">Fiados por persona</h2>
            {cuentas.length > deudores.length && (
              <button
                type="button"
                onClick={() => setVerTodas((v) => !v)}
                className="text-sm font-medium text-amber-700 hover:underline"
              >
                {verTodas ? "Solo quienes deben" : `Ver todas (${cuentas.length})`}
              </button>
            )}
          </div>
          <Card className={deudores.length > 0 ? "border-rose-200 bg-rose-50/50" : ""}>
            <CardContent className="flex items-baseline justify-between py-4">
              <div>
                <p className="text-sm font-medium text-stone-600">Te deben en fiados</p>
                <p className="text-xs text-stone-500">
                  {deudores.length === 0
                    ? "Nadie debe nada"
                    : `${deudores.length} persona${deudores.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <p className="text-3xl font-bold tabular-nums text-rose-700" data-fiados-total>
                {formatCurrency(totalFiado)}
              </p>
            </CardContent>
          </Card>
          {visibles.length === 0 ? (
            <p className="text-sm text-stone-500">
              Cuando cobres con <strong>Fiado</strong> en el POS a nombre de alguien, aparecerá aquí con lo que debe.
            </p>
          ) : (
            <div className="space-y-2">
              {visibles.map((c) => (
                <Card key={c.id} data-fiado-cuenta>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-stone-800">{c.name}</p>
                      <p className="text-sm text-stone-500">
                        {c.tickets} venta{c.tickets === 1 ? "" : "s"} fiada{c.tickets === 1 ? "" : "s"}
                        {c.lastChargeAt ? ` · última ${formatDate(new Date(c.lastChargeAt), timezone)}` : ""}
                        {c.paid > 0 ? ` · ha abonado ${formatCurrency(c.paid)}` : ""}
                      </p>
                      {c.phone && (
                        <a
                          href={`tel:${c.phone.replace(/\s/g, "")}`}
                          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {c.phone}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`text-xl font-bold tabular-nums ${c.balance > 0 ? "text-rose-700" : "text-stone-400"}`}>
                        {formatCurrency(c.balance)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-stone-600"
                        onClick={() => void abrirEstado(c)}
                        disabled={cargandoEstado === c.id}
                        data-estado-de
                      >
                        {cargandoEstado === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Estado de cuenta"}
                      </Button>
                      {c.balance > 0 && (
                        <Button
                          size="sm"
                          className="bg-rose-700 text-white hover:bg-rose-800"
                          onClick={() => setAbonando({ id: c.id, name: c.name, balance: c.balance })}
                          data-abonar-a
                        >
                          Abonar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Cuentas que se fueron sin pagar (P11c) ── */}
      <section className="space-y-3">
        {creditEnabled && <h2 className="text-lg font-bold text-stone-800">Cuentas que se fueron sin pagar</h2>}
        {deudas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <HandCoins className="mx-auto h-8 w-8 text-stone-300" />
              <p className="mt-3 font-semibold text-stone-700">Nadie se ha ido sin pagar</p>
              <p className="mt-1 text-sm text-stone-500">
                Cuando alguien se vaya sin pagar, márcalo en el POS con «Se fue sin pagar» y aparecerá aquí.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="flex items-baseline justify-between py-4">
                <div>
                  <p className="text-sm font-medium text-stone-600">Te deben en cuentas sin cobrar</p>
                  <p className="text-xs text-stone-500">
                    {deudas.length} cuenta{deudas.length === 1 ? "" : "s"} sin pagar
                  </p>
                </div>
                <p className="text-3xl font-bold tabular-nums text-red-700">{formatCurrency(total)}</p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {deudas.map((d) => (
                <Card key={d.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-stone-800">{d.name}</p>
                      <p className="text-sm text-stone-500">
                        Debe desde hace <strong className="text-red-700">{diasDebiendo(d.owedSince, ahora)}</strong> ·{" "}
                        {formatDate(new Date(d.owedSince), timezone)} · {d.articulos} artículo
                        {d.articulos === 1 ? "" : "s"}
                      </p>
                      {d.contact && (
                        <a
                          href={`tel:${d.contact.replace(/\s/g, "")}`}
                          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {d.contact}
                        </a>
                      )}
                      {d.sinPrecio > 0 && (
                        <p className="mt-1 flex items-start gap-1 text-xs font-medium text-amber-800">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {d.sinPrecio === 1 ? "1 artículo ya no está" : `${d.sinPrecio} artículos ya no están`} en el
                            menú, así que no suma{d.sinPrecio === 1 ? "" : "n"} aquí ni se podrá
                            {d.sinPrecio === 1 ? "" : "n"} cobrar hasta reactivarlo
                            {d.sinPrecio === 1 ? "" : "s"}.
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-bold tabular-nums text-stone-800">{formatCurrency(d.total)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-stone-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setCondonando(d)}
                      >
                        Condonar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="text-sm text-stone-500">
              Para cobrar una de estas, ábrela desde el POS en <strong>Cuentas → Por cobrar</strong> y cóbrala como
              cualquier venta.
            </p>
          </>
        )}
        {!creditEnabled && (
          <p className="text-sm text-stone-500">
            ¿Alguien te pide a crédito y paga después? Enciende <strong>Fiados</strong> en{" "}
            <Link href="/admin/negocio#modulos" className="font-medium text-amber-700 hover:underline">
              Datos y ajustes → Módulos
            </Link>
            : el POS gana el método «Fiado» a nombre de alguien, con saldo por persona y abonos.
          </p>
        )}
      </section>

      {/* Abonar desde el panel: la misma ventana que en el POS. */}
      <AbonarDialog
        cuenta={abonando}
        onOpenChange={(o) => !o && setAbonando(null)}
        onDone={(r) => {
          toast.success(
            r.balance > 0
              ? `Abono de ${formatCurrency(r.amount)} de ${r.name} · aún debe ${formatCurrency(r.balance)}`
              : `${r.name} quedó al corriente.`,
          )
          router.refresh()
        }}
      />

      {/* Estado de cuenta: cargos y abonos, del más reciente al más viejo. */}
      <Dialog open={estado !== null} onOpenChange={(o) => !o && setEstado(null)}>
        <DialogContent className="max-w-lg p-0" data-estado-cuenta>
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle>Estado de cuenta · {estado?.customer.name}</DialogTitle>
            <DialogDescription>
              {estado && estado.customer.balance > 0
                ? `Debe ${formatCurrency(estado.customer.balance)}.`
                : "Al corriente."}
              {estado?.customer.phone ? ` · Tel. ${estado.customer.phone}` : ""}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1 px-5 pb-5">
              {estado?.entries.map((e) => (
                <div
                  key={e.kind === "cargo" ? e.ticketId : e.paymentId}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
                    e.kind === "abono"
                      ? "border-emerald-200 bg-emerald-50/60"
                      : e.status === "cancelado"
                        ? "border-stone-200 bg-stone-50 text-stone-400"
                        : "border-stone-200"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {e.kind === "abono"
                        ? `Abono · ${paymentLabel(e.method)}${e.by ? ` · ${e.by}` : ""}`
                        : `Venta #${e.folio}${e.status === "cancelado" ? " · cancelada" : ""}`}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {formatDateTime(new Date(e.at), timezone)}
                      {e.kind === "cargo" && e.items ? ` · ${e.items}` : ""}
                      {e.kind === "abono" && e.notes ? ` · ${e.notes}` : ""}
                      {e.kind === "cargo" && e.cancelReason ? ` · ${e.cancelReason}` : ""}
                    </p>
                  </div>
                  <p className={`shrink-0 font-bold tabular-nums ${e.kind === "abono" ? "text-emerald-700" : e.status === "cancelado" ? "line-through" : "text-stone-800"}`}>
                    {e.kind === "abono" ? "−" : "+"}
                    {formatCurrency(e.amount)}
                  </p>
                </div>
              ))}
              {estado && estado.entries.length === 0 && (
                <p className="py-6 text-center text-sm text-stone-400">Sin movimientos todavía.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Condonar es la única forma de que algo servido desaparezca sin entrar
          a la caja, así que pide motivo y queda en Actividad — igual que una
          cancelación de venta. */}
      <Dialog
        open={!!condonando}
        onOpenChange={(v) => {
          if (!v) {
            setCondonando(null)
            setMotivo("")
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Perdonar esta deuda?</DialogTitle>
            <DialogDescription>
              «{condonando?.name}» debe {condonando && formatCurrency(condonando.total)}. Al condonar, la cuenta se
              borra y ya no se podrá cobrar. Queda registrado en Actividad quién lo hizo y por qué.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (ej. cortesía, se resolvió aparte)"
              maxLength={120}
            />
            <p className="text-xs text-stone-400">Obligatorio, mínimo 3 letras.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCondonando(null)} disabled={guardando}>
              Volver
            </Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={condonar} disabled={motivo.trim().length < 3 || guardando}>
              {guardando ? "Condonando…" : "Condonar deuda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
