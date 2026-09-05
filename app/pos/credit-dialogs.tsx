"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { HandCoins, Loader2, Plus, Search } from "lucide-react"
import { getCreditBalances, upsertCreditCustomer, type CreditAccount } from "@/app/actions/credit"
import { AbonarDialog } from "@/components/abonar-dialog"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type CuentaFiado = { id: string; name: string; balance: number }

/** Filtra por nombre sin importar mayúsculas ni acentos. */
function coincide(nombre: string, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  return norm(nombre).includes(norm(q.trim()))
}

/**
 * «¿A nombre de quién?» al elegir Fiado en el carrito: se escribe el nombre;
 * si ya existe aparece con lo que debe, y si no, un toque lo da de alta.
 * Nada de teléfonos obligatorios: la gente que fía es la de confianza y ya
 * se conoce; el teléfono se puede agregar después en Por cobrar.
 */
export function CreditPickerDialog({
  open,
  onOpenChange,
  cuentas,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  cuentas: CreditAccount[]
  onPick: (c: CuentaFiado) => void
}) {
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setQ("")
  }, [open])

  const lista = useMemo(() => {
    const vivas = cuentas.filter((c) => c.isActive)
    const filtradas = q.trim() ? vivas.filter((c) => coincide(c.name, q)) : vivas
    // Primero quien más debe: es a quien más probablemente se le sigue fiando.
    return [...filtradas].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "es"))
  }, [cuentas, q])
  const exacta = q.trim() ? lista.find((c) => c.name.toLowerCase() === q.trim().toLowerCase()) : undefined

  async function crear() {
    const nombre = q.trim()
    if (!nombre || busy) return
    setBusy(true)
    const r = await upsertCreditCustomer({ name: nombre })
    setBusy(false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    onPick({ id: r.customer.id, name: r.customer.name, balance: r.customer.balance })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0" data-fiado-picker>
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-rose-700" />
            ¿A nombre de quién se fía?
          </DialogTitle>
          <DialogDescription>Escribe el nombre. Si ya tiene cuenta, sale con lo que debe.</DialogDescription>
        </DialogHeader>
        <div className="px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre (p. ej. Beto entrenador)"
              className="h-11 pl-9 text-base"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (exacta) onPick({ id: exacta.id, name: exacta.name, balance: exacta.balance })
                  else void crear()
                }
              }}
              data-fiado-nombre
            />
          </div>
        </div>
        <ScrollArea className="max-h-72">
          <div className="space-y-1 px-5 pb-5 pt-3">
            {q.trim() && !exacta && (
              <button
                type="button"
                onClick={() => void crear()}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-rose-300 px-3 py-2.5 text-left text-sm font-semibold text-rose-800 hover:bg-rose-50"
                data-fiado-nuevo
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Nueva cuenta: «{q.trim()}»
              </button>
            )}
            {lista.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick({ id: c.id, name: c.name, balance: c.balance })}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5 text-left hover:border-rose-300 hover:bg-rose-50"
                data-fiado-cuenta
              >
                <span className="min-w-0 truncate font-medium text-stone-800">{c.name}</span>
                <span className={`shrink-0 text-sm font-semibold ${c.balance > 0 ? "text-rose-700" : "text-stone-400"}`}>
                  {c.balance > 0 ? `debe ${formatCurrency(c.balance)}` : "al corriente"}
                </span>
              </button>
            ))}
            {lista.length === 0 && !q.trim() && (
              <p className="py-6 text-center text-sm text-stone-400">Todavía no hay cuentas. Escribe un nombre para abrir la primera.</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

/**
 * ⋮ → Fiados y abonos: quién debe cuánto y registrar un abono ahí mismo,
 * sin ir al panel. Lo que se ve es lo que devuelve el servidor; después de
 * un abono se vuelve a pedir.
 */
export function CreditAccountsDialog({
  open,
  onOpenChange,
  cuentas,
  onChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  cuentas: CreditAccount[]
  /** Hubo un abono: quien tenga las cuentas en props debe refrescarlas. */
  onChanged: () => void
}) {
  const [lista, setLista] = useState<CreditAccount[]>(cuentas)
  const [abonando, setAbonando] = useState<CuentaFiado | null>(null)
  const [cargando, setCargando] = useState(false)
  useEffect(() => setLista(cuentas), [cuentas])

  async function recargar() {
    setCargando(true)
    const r = await getCreditBalances()
    setCargando(false)
    if (r.success) setLista(r.accounts)
  }

  const deudores = lista.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance)
  const total = deudores.reduce((s, c) => s + c.balance, 0)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0" data-fiados>
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-rose-700" />
              Fiados y abonos
            </DialogTitle>
            <DialogDescription>
              {deudores.length === 0
                ? "Nadie debe nada."
                : `${deudores.length} persona${deudores.length === 1 ? "" : "s"} deben ${formatCurrency(total)} en total.`}
              {cargando && " · actualizando…"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1.5 px-5 pb-5">
              {deudores.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5" data-fiado-deudor>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-800">{c.name}</p>
                    <p className="text-xs text-stone-500">
                      {c.tickets} venta{c.tickets === 1 ? "" : "s"} fiada{c.tickets === 1 ? "" : "s"}
                      {c.paid > 0 ? ` · ya abonó ${formatCurrency(c.paid)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-base font-bold tabular-nums text-rose-700">{formatCurrency(c.balance)}</span>
                    <Button size="sm" className="bg-rose-700 text-white hover:bg-rose-800" onClick={() => setAbonando({ id: c.id, name: c.name, balance: c.balance })} data-abonar-a>
                      Abonar
                    </Button>
                  </div>
                </div>
              ))}
              {deudores.length === 0 && (
                <p className="py-8 text-center text-sm text-stone-400">
                  Cuando cobres con «Fiado» a nombre de alguien, aquí verás cuánto debe y podrás abonarle.
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <AbonarDialog
        cuenta={abonando}
        onOpenChange={(o) => !o && setAbonando(null)}
        onDone={(r) => {
          toast.success(
            r.balance > 0
              ? `Abono de ${formatCurrency(r.amount)} de ${r.name} · aún debe ${formatCurrency(r.balance)}`
              : `${r.name} quedó al corriente: abonó ${formatCurrency(r.amount)}.`,
            { duration: 7000 },
          )
          void recargar()
          onChanged()
        }}
      />
    </>
  )
}
