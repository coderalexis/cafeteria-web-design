"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowUpDown, BadgeDollarSign, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { bulkUpdatePrices, reorderProducts } from "@/app/actions/menu"
import { computeBulkPrice, ROUNDING_LABELS, type BulkPricesInput } from "@/lib/pricing"
import { formatCurrency } from "@/lib/format"
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

/* ------------------------------------------------------------------ */
/*  Precios en lote                                                    */
/* ------------------------------------------------------------------ */

interface PriceVariant {
  id: string
  price: number
  label: string
  categoryId: string
}

export function BulkPricesButton({
  categories,
  variants,
}: {
  categories: Array<{ id: string; name: string }>
  variants: PriceVariant[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [categoryId, setCategoryId] = useState<string>("")
  const [direction, setDirection] = useState<BulkPricesInput["direction"]>("subir")
  const [kind, setKind] = useState<BulkPricesInput["kind"]>("percent")
  const [valueInput, setValueInput] = useState("")
  const [rounding, setRounding] = useState<BulkPricesInput["rounding"]>("peso")

  const value = Number.parseFloat(valueInput)
  const input: BulkPricesInput | null =
    Number.isFinite(value) && value > 0 && value <= 500
      ? { categoryId: categoryId || null, direction, kind, value, rounding }
      : null

  // Vista previa con el MISMO cálculo del servidor (lib/pricing).
  const preview = useMemo(() => {
    if (!input) return null
    const scoped = variants.filter((v) => !input.categoryId || v.categoryId === input.categoryId)
    const changed = scoped
      .map((v) => ({ ...v, next: computeBulkPrice(v.price, input) }))
      .filter((v) => v.next !== v.price)
    return { total: scoped.length, changed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, categoryId, direction, kind, value, rounding])

  const apply = () => {
    if (!input || isPending) return
    startTransition(async () => {
      const result = await bulkUpdatePrices(input)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Se actualizaron ${result.updated} precio${result.updated === 1 ? "" : "s"}.`)
      setOpen(false)
      setValueInput("")
      router.refresh()
    })
  }

  const selectClass = "h-9 rounded-md border border-stone-200 bg-white px-2.5 text-sm w-full"

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <BadgeDollarSign className="h-4 w-4" />
        Precios en lote
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar precios en lote</DialogTitle>
            <DialogDescription>
              Sube o baja los precios de una categoría (o de todo el menú) de un jalón. Incluye productos ocultos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-stone-700">Alcance</span>
                <select className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Todo el menú</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-stone-700">Dirección</span>
                <select
                  className={selectClass}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as BulkPricesInput["direction"])}
                >
                  <option value="subir">Subir</option>
                  <option value="bajar">Bajar</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-stone-700">Cuánto</span>
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    step={0.5}
                    max={500}
                    placeholder={kind === "percent" ? "10" : "5"}
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    className="h-9"
                  />
                  <select
                    className="h-9 rounded-md border border-stone-200 bg-white px-2 text-sm"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as BulkPricesInput["kind"])}
                    aria-label="Tipo de cambio"
                  >
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                </div>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-stone-700">Redondeo</span>
                <select
                  className={selectClass}
                  value={rounding}
                  onChange={(e) => setRounding(e.target.value as BulkPricesInput["rounding"])}
                >
                  {(Object.keys(ROUNDING_LABELS) as Array<BulkPricesInput["rounding"]>).map((r) => (
                    <option key={r} value={r}>
                      {ROUNDING_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {preview && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm space-y-1.5">
                <p className="text-stone-600">
                  Cambian <strong>{preview.changed.length}</strong> de {preview.total} precios.
                </p>
                {preview.changed.slice(0, 4).map((v) => (
                  <p key={v.id} className="text-xs text-stone-500 truncate">
                    {v.label}: {formatCurrency(v.price)} →{" "}
                    <span className="font-semibold text-stone-700">{formatCurrency(v.next)}</span>
                  </p>
                ))}
                {preview.changed.length > 4 && (
                  <p className="text-xs text-stone-400">… y {preview.changed.length - 4} más.</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!preview || preview.changed.length === 0 || isPending}
              onClick={apply}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aplicar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Ordenar productos de una categoría                                 */
/* ------------------------------------------------------------------ */

export function ReorderButton({
  categoryId,
  categoryName,
  products,
}: {
  categoryId: string
  categoryName: string
  products: Array<{ id: string; name: string; isActive: boolean }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [order, setOrder] = useState<string[]>([])

  const openDialog = () => {
    setOrder(products.map((p) => p.id))
    setOpen(true)
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    setOrder((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const byId = new Map(products.map((p) => [p.id, p]))
  const dirty = order.some((id, i) => products[i]?.id !== id)

  const save = () => {
    if (isPending) return
    startTransition(async () => {
      const result = await reorderProducts({ categoryId, orderedIds: order })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Orden guardado.")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title={`Ordenar los productos de ${categoryName}`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-stone-400 hover:bg-stone-100 hover:text-stone-600"
      >
        <ArrowUpDown className="h-3 w-3" />
        Ordenar
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ordenar «{categoryName}»</DialogTitle>
            <DialogDescription>Este orden es el que ven los cajeros en el POS.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
            {order.map((id, index) => {
              const product = byId.get(id)
              if (!product) return null
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"
                >
                  <span className="w-5 text-center text-xs font-bold text-stone-400">{index + 1}</span>
                  <span
                    className={`flex-1 truncate text-sm ${product.isActive ? "text-stone-800" : "text-stone-400 line-through"}`}
                  >
                    {product.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Subir"
                    className="flex h-7 w-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    title="Bajar"
                    className="flex h-7 w-7 items-center justify-center rounded text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!dirty || isPending} onClick={save}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
