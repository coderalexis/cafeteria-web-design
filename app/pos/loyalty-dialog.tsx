"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Gift, Loader2, Search, Stamp, UserRound } from "lucide-react"
import { lookupLoyaltyCustomer, registerLoyaltyCustomer, type LoyaltyCustomer } from "@/app/actions/loyalty"
import type { CartLine } from "./cart"
import { getLinePrice } from "./cart"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/** Teléfono como lo diría el cliente: 55 1234 5678. */
export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 2)} ${phone.slice(2, 6)} ${phone.slice(6)}` : phone
}

/**
 * «¿Me das tu número?» — adjuntar la tarjeta de sellos a la venta.
 *
 * Búsqueda y alta en el mismo lugar: si el teléfono no está, el mismo flujo
 * lo registra (el nombre es opcional; en caja nadie deletrea apellidos).
 */
export function LoyaltyDialog({
  open,
  onOpenChange,
  target,
  onAttach,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  target: number
  onAttach: (customer: LoyaltyCustomer) => void
}) {
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<LoyaltyCustomer | null | "nuevo">(null)

  const digits = phone.replace(/\D/g, "")
  const phoneOk = digits.length >= 10

  function cerrar(o: boolean) {
    if (!o) {
      setPhone("")
      setName("")
      setFound(null)
    }
    onOpenChange(o)
  }

  async function buscar() {
    if (!phoneOk || busy) return
    setBusy(true)
    const result = await lookupLoyaltyCustomer(phone)
    setBusy(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setFound(result.customer ?? "nuevo")
  }

  async function registrarYAdjuntar() {
    setBusy(true)
    const result = await registerLoyaltyCustomer(phone, name)
    setBusy(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    onAttach(result.customer)
    cerrar(false)
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stamp className="h-5 w-5 text-amber-700" />
            Tarjeta de sellos
          </DialogTitle>
          <DialogDescription>
            Pide el teléfono del cliente. Cada visita suma un sello; al juntar {target}, su premio.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            type="tel"
            inputMode="numeric"
            placeholder="55 1234 5678"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setFound(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void buscar()
              }
            }}
            className="h-11 text-base tracking-wide"
          />
          <Button
            type="button"
            onClick={() => void buscar()}
            disabled={!phoneOk || busy}
            className="h-11 gap-1.5 bg-amber-700 text-white hover:bg-amber-800"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </Button>
        </div>
        {!phoneOk && phone.length > 0 && (
          <p className="text-xs text-stone-400">Faltan dígitos: son 10 (como se marca).</p>
        )}

        {found !== null && found !== "nuevo" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="font-semibold text-stone-800">{found.name || formatPhone(found.phone)}</p>
            <p className="text-sm text-stone-500">
              {formatPhone(found.phone)} · {found.visits} {found.visits === 1 ? "visita" : "visitas"}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-amber-800">
              {found.stamps >= target ? (
                <span className="inline-flex items-center gap-1">
                  <Gift className="h-4 w-4" /> ¡Tiene premio por canjear! ({found.stamps} sellos)
                </span>
              ) : (
                `Sellos: ${found.stamps} de ${target}`
              )}
            </p>
            <Button
              type="button"
              onClick={() => {
                onAttach(found)
                cerrar(false)
              }}
              className="mt-3 w-full bg-amber-700 text-white hover:bg-amber-800"
            >
              Asignar a esta venta
            </Button>
          </div>
        )}

        {found === "nuevo" && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
              <UserRound className="h-4 w-4 text-stone-400" />
              Cliente nuevo
            </p>
            <Input
              placeholder="Nombre (opcional): «Lupita»"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="mt-2 bg-white"
            />
            <Button
              type="button"
              onClick={() => void registrarYAdjuntar()}
              disabled={busy}
              className="mt-3 w-full gap-1.5 bg-amber-700 text-white hover:bg-amber-800"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar y asignar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Canje: el cajero elige QUÉ artículo sale gratis (una unidad). El monto viaja
 * como descuento fijo y el servidor lo revalida (≤ el artículo más caro).
 */
export function RedeemDialog({
  open,
  onOpenChange,
  lines,
  reward,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lines: CartLine[]
  reward: string
  onPick: (unitPrice: number, label: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-600" />
            Canjear premio
          </DialogTitle>
          <DialogDescription>
            {reward ? `${reward} — elige` : "Elige"} qué artículo sale gratis (una unidad).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {lines.map((line) => {
            const unit = getLinePrice(line)
            const label = `${line.product.name}${line.size ? ` · ${line.size.label}` : ""}`
            return (
              <button
                key={line.lineId}
                type="button"
                onClick={() => {
                  onPick(unit, label)
                  onOpenChange(false)
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                <span className="min-w-0 truncate text-sm font-medium text-stone-700">{label}</span>
                <span className="shrink-0 text-sm font-semibold text-emerald-700">−{formatCurrency(unit)}</span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
