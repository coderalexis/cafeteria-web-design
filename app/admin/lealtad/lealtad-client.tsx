"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Gift, Loader2, Search, SlidersHorizontal } from "lucide-react"
import { adjustLoyalty, type LoyaltyCustomer } from "@/app/actions/loyalty"
import { formatPhone } from "@/app/pos/loyalty-dialog"
import { formatDate } from "@/lib/format"
import { useBusiness } from "@/components/business-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function LealtadClient({
  customers,
  target,
  query,
}: {
  customers: LoyaltyCustomer[]
  target: number
  query: string
}) {
  const router = useRouter()
  const business = useBusiness()
  const [isPending, startTransition] = useTransition()
  const [ajustando, setAjustando] = useState<LoyaltyCustomer | null>(null)
  const [delta, setDelta] = useState("1")
  const [reason, setReason] = useState("")

  function aplicarAjuste() {
    if (!ajustando) return
    const n = Number(delta)
    startTransition(async () => {
      const result = await adjustLoyalty({
        customerId: ajustando.id,
        delta: n,
        reason: reason.trim(),
        label: ajustando.name || ajustando.phone,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Sellos de ${ajustando.name || formatPhone(ajustando.phone)}: ahora ${result.stamps}.`)
      setAjustando(null)
      setDelta("1")
      setReason("")
      router.refresh()
    })
  }

  return (
    <>
      {/* Buscador por GET: la URL queda compartible y el server filtra. */}
      <form action="/admin/lealtad" method="get" className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <Input
          name="q"
          defaultValue={query}
          placeholder="Buscar por teléfono o nombre…"
          className="bg-white pl-9"
        />
      </form>

      {customers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-stone-400">
            {query
              ? `Nada con «${query}».`
              : "Aún no hay clientes. Se registran desde el POS, con «Tarjeta de sellos» en la venta."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Sellos</th>
                <th className="px-4 py-2.5 font-medium">Visitas</th>
                <th className="px-4 py-2.5 font-medium">Premios</th>
                <th className="px-4 py-2.5 font-medium">Última visita</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {customers.map((c) => (
                <tr key={c.id} className="align-middle">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-stone-800">{c.name || "Sin nombre"}</p>
                    <p className="text-xs text-stone-400">{formatPhone(c.phone)}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-stone-800">
                      {c.stamps}/{target}
                    </span>
                    {c.stamps >= target && (
                      <Badge className="ml-2 gap-1 bg-emerald-600 hover:bg-emerald-600">
                        <Gift className="h-3 w-3" /> premio
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">{c.visits}</td>
                  <td className="px-4 py-2.5 text-stone-600">{c.rewardsRedeemed}</td>
                  <td className="px-4 py-2.5 text-stone-500">
                    {c.lastVisitAt ? formatDate(c.lastVisitAt, business.timezone) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setAjustando(c)}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Ajustar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={ajustando !== null} onOpenChange={(o) => !o && setAjustando(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar sellos</DialogTitle>
            <DialogDescription>
              {ajustando ? `${ajustando.name || formatPhone(ajustando.phone)} tiene ${ajustando.stamps} sellos. ` : ""}
              Para el sello olvidado o el error de caja; queda registrado en Actividad.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            {[-1, 1, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant={Number(delta) === n ? "default" : "outline"}
                size="sm"
                onClick={() => setDelta(String(n))}
              >
                {n > 0 ? `+${n}` : n}
              </Button>
            ))}
            <Input
              type="number"
              min={-99}
              max={99}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              className="w-20"
              aria-label="Cuántos sellos (negativo quita)"
            />
          </div>
          <Input
            placeholder="Motivo: «no traía su teléfono ayer»"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
          />
          <Button
            type="button"
            onClick={aplicarAjuste}
            disabled={isPending || reason.trim().length < 3 || !Number(delta)}
            className="bg-amber-700 text-white hover:bg-amber-800"
          >
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Aplicar ajuste
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
