"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { HandCoins, Phone, TriangleAlert } from "lucide-react"
import { forgiveOwed } from "@/app/actions/parked"
import { formatCurrency, formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

export function PorCobrarClient({ deudas, timezone }: { deudas: Deuda[]; timezone: string }) {
  const router = useRouter()
  const ahora = Date.now()
  const [condonando, setCondonando] = useState<Deuda | null>(null)
  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)

  const total = deudas.reduce((s, d) => s + d.total, 0)

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

  if (deudas.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <HandCoins className="mx-auto h-8 w-8 text-stone-300" />
          <p className="mt-3 font-semibold text-stone-700">Nadie te debe nada</p>
          <p className="mt-1 text-sm text-stone-500">
            Cuando alguien se vaya sin pagar, márcalo en el POS con «Se fue sin pagar» y aparecerá aquí.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex items-baseline justify-between py-4">
          <div>
            <p className="text-sm font-medium text-stone-600">Te deben en total</p>
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
            <Button variant="outline" onClick={() => setCondonando(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={guardando || motivo.trim().length < 3}
              onClick={() => void condonar()}
            >
              {guardando ? "Condonando…" : "Condonar deuda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
