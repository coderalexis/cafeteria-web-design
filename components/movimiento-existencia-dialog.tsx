"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { registrarMovimiento } from "@/app/actions/existencias"
import { MOTIVOS_MERMA, validarMovimiento, type CambioExistencia, type KindManual } from "@/lib/existencias"
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

const TITULO: Record<KindManual, string> = {
  entrada: "Llegó mercancía",
  merma: "Se perdió algo",
  conteo: "Contar lo que hay",
}

/**
 * Entrada, merma o conteo de un artículo que se cuenta por pieza (P45).
 *
 * Vive fuera de /admin porque lo usan dos pantallas: Existencias (dueña,
 * admin) y el POS (la cajera registra lo que llega y lo que se pierde desde
 * ⋮, sin entrar al panel). Las reglas de quién puede qué están en el RPC;
 * aquí solo se esconde lo que no aplica (`esAdmin`) y se valida la forma.
 */
export function MovimientoDialog({
  item,
  kind,
  esAdmin = true,
  onClose,
  onDone,
}: {
  item: { variantId: string; nombre: string; qty: number }
  kind: KindManual
  /** La cajera puede meter entradas y mermas, pero no costo ni conteo. */
  esAdmin?: boolean
  onClose: () => void
  /** Lo que se hace con la existencia nueva además de refrescar (el POS la aplica en vivo). */
  onDone?: (cambios: CambioExistencia[]) => void
}) {
  const router = useRouter()
  const [qty, setQty] = useState("")
  const [motivo, setMotivo] = useState<string>("")
  const [otro, setOtro] = useState("")
  const [costo, setCosto] = useState("")
  const [nota, setNota] = useState("")
  const [isPending, startTransition] = useTransition()

  const reason =
    kind === "merma" ? (motivo === "Otro" ? otro.trim() : motivo) : kind === "conteo" ? nota.trim() : ""

  function guardar() {
    const n = qty.trim() === "" ? NaN : Number(qty)
    const unitCost = costo.trim() === "" ? undefined : Number(costo)
    const problema = validarMovimiento({ kind, qty: n, reason, unitCost: unitCost ?? null, esAdmin })
    if (problema) return toast.error(problema)
    startTransition(async () => {
      const r = await registrarMovimiento({
        variantId: item.variantId,
        kind,
        qty: n,
        reason: reason || undefined,
        unitCost,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      const quedan = (q: number) => `Queda${q === 1 ? "" : "n"} ${q}`
      if (kind === "conteo") {
        const diff = r.qtyAfter - item.qty
        toast.success(
          diff === 0
            ? `${item.nombre}: cuadra, ${r.qtyAfter}.`
            : diff < 0
              ? `${item.nombre}: faltaban ${-diff}. ${quedan(r.qtyAfter)}.`
              : `${item.nombre}: sobraban ${diff}. ${quedan(r.qtyAfter)}.`,
        )
      } else {
        toast.success(`${item.nombre}: ${quedan(r.qtyAfter).toLowerCase()}.`)
      }
      onDone?.(r.cambios)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {TITULO[kind]}: {item.nombre}
          </DialogTitle>
          <DialogDescription>
            {kind === "conteo"
              ? `El sistema cree que hay ${item.qty}. Escribe lo que hay de verdad y él anota la diferencia.`
              : `Ahora hay ${item.qty}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mov-qty" className="text-sm font-medium text-stone-700">
              {kind === "entrada"
                ? "¿Cuántas llegaron?"
                : kind === "merma"
                  ? "¿Cuántas se perdieron?"
                  : "¿Cuántas hay de verdad?"}
            </label>
            <Input
              id="mov-qty"
              autoFocus
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="blanco-comodo text-lg"
            />
          </div>

          {kind === "merma" && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-stone-700">¿Por qué?</p>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_MERMA.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMotivo(m.label)}
                    className={`blanco-comodo rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      motivo === m.label
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-stone-300 text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {motivo === "Otro" && (
                <Input
                  autoFocus
                  value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  placeholder="¿Qué pasó?"
                  maxLength={200}
                  className="blanco-comodo"
                />
              )}
            </div>
          )}

          {kind === "entrada" && esAdmin && (
            <div className="space-y-1.5">
              <label htmlFor="mov-costo" className="text-sm font-medium text-stone-700">
                ¿Cuánto te costó cada pieza? (opcional)
              </label>
              <Input
                id="mov-costo"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="$"
                className="blanco-comodo"
              />
              <p className="text-xs text-stone-400">
                Con esto el margen de este artículo deja de ser un invento. Ojo:{" "}
                <strong>no lo captures también en Gastos</strong>; ya entra a tu utilidad como costo de lo vendido.
              </p>
            </div>
          )}

          {kind === "conteo" && (
            <div className="space-y-1.5">
              <label htmlFor="mov-nota" className="text-sm font-medium text-stone-700">
                Nota (opcional)
              </label>
              <Input
                id="mov-nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="p. ej. había una caja en la bodega"
                maxLength={200}
                className="blanco-comodo"
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="blanco-comodo" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="blanco-comodo bg-amber-700 hover:bg-amber-800 text-white"
            disabled={isPending}
            onClick={guardar}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {kind === "entrada" ? "Registrar entrada" : kind === "merma" ? "Registrar merma" : "Guardar conteo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
