"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { registrarMovimiento } from "@/app/actions/existencias"
import {
  MOTIVOS_MERMA,
  UNIDADES,
  conUnidad,
  validarMovimiento,
  type CambioExistencia,
  type KindManual,
  type Unidad,
} from "@/lib/existencias"
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

export interface ItemMovimiento {
  itemId: string
  nombre: string
  qty: number
  unidad: Unidad
  /** Lo del menú se cuenta entero; un insumo admite decimales (2.5 kilos). */
  esDelMenu: boolean
}

/**
 * Entrada, merma o conteo de algo que se cuenta (P45).
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
  item: ItemMovimiento
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

  const entero = item.esDelMenu
  const unidadLabel = UNIDADES.find((u) => u.id === item.unidad)?.varios ?? "piezas"
  const cuantas = entero ? "¿Cuántas" : "¿Cuánto"
  const reason =
    kind === "merma" ? (motivo === "Otro" ? otro.trim() : motivo) : kind === "conteo" ? nota.trim() : ""

  function guardar() {
    const n = qty.trim() === "" ? NaN : Number(qty)
    const unitCost = costo.trim() === "" ? undefined : Number(costo)
    const problema = validarMovimiento({ kind, qty: n, reason, unitCost: unitCost ?? null, esAdmin, entero })
    if (problema) return toast.error(problema)
    startTransition(async () => {
      const r = await registrarMovimiento({
        itemId: item.itemId,
        kind,
        qty: n,
        reason: reason || undefined,
        unitCost,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      const quedan = conUnidad(r.qtyAfter, item.unidad)
      if (kind === "conteo") {
        const diff = r.delta
        toast.success(
          diff === 0
            ? `${item.nombre}: cuadra, ${quedan}.`
            : diff < 0
              ? `${item.nombre}: faltaban ${conUnidad(-diff, item.unidad)}. Quedan ${quedan}.`
              : `${item.nombre}: sobraban ${conUnidad(diff, item.unidad)}. Quedan ${quedan}.`,
        )
      } else {
        toast.success(`${item.nombre}: quedan ${quedan}.`)
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
              ? `El sistema cree que hay ${conUnidad(item.qty, item.unidad)}. Escribe lo que hay de verdad y él anota la diferencia.`
              : `Ahora hay ${conUnidad(item.qty, item.unidad)}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mov-qty" className="text-sm font-medium text-stone-700">
              {kind === "entrada"
                ? `${cuantas} ${entero ? "llegaron" : "llegó"}?`
                : kind === "merma"
                  ? `${cuantas} se ${entero ? "perdieron" : "perdió"}?`
                  : `${cuantas} hay de verdad?`}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="mov-qty"
                autoFocus
                type="number"
                inputMode={entero ? "numeric" : "decimal"}
                min={0}
                step={entero ? 1 : "any"}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="blanco-comodo text-lg"
              />
              <span className="shrink-0 text-sm text-stone-500">{unidadLabel}</span>
            </div>
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
                ¿Cuánto te costó cada {UNIDADES.find((u) => u.id === item.unidad)?.uno ?? "pieza"}? (opcional)
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
              {/* La regla se invierte según qué sea: lo del menú entra a la
                  utilidad al venderse; un insumo nunca se vende solo, así que
                  si no se captura en Gastos, no entra por ningún lado. */}
              <p className="text-xs text-stone-400">
                {item.esDelMenu ? (
                  <>
                    Con esto el margen de este artículo deja de ser un invento. Ojo:{" "}
                    <strong>no lo captures también en Gastos</strong>; ya entra a tu utilidad como costo de lo
                    vendido.
                  </>
                ) : (
                  <>
                    Sirve para saber cuánto se te va en insumos. Un insumo no se vende solo, así que{" "}
                    <strong>esta compra sí va en Gastos</strong> para que aparezca en tu utilidad.
                  </>
                )}
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
