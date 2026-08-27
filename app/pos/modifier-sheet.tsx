"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { choiceHint } from "@/lib/modifiers"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import type { ModifierGroup, ModifierOption, Product, SizeOption } from "./cart"

interface Props {
  pending: {
    product: Product
    size?: SizeOption
    /** Opciones ya elegidas (al editar una línea del carrito). */
    initial?: ModifierOption[]
    /** true = está corrigiendo una línea, no agregando una nueva. */
    editing?: boolean
  } | null
  onClose: () => void
  onConfirm: (product: Product, size: SizeOption | undefined, modifiers: ModifierOption[]) => void
}

/** Estado de selección: ids elegidos por grupo. */
type Selection = Record<string, string[]>

/** El texto vive en lib/modifiers.ts: el panel enseña una vista previa con
 *  esta misma función, y así no pueden decir cosas distintas. */
function groupHint(g: ModifierGroup): string {
  return choiceHint({ min: g.minSelect, max: g.maxSelect })
}

export function ModifierSheet({ pending, onClose, onConfirm }: Props) {
  const [selection, setSelection] = useState<Selection>({})

  // Al abrir: en blanco para un producto nuevo, o sembrada con lo ya elegido
  // cuando se edita una línea del carrito.
  useEffect(() => {
    if (!pending?.initial?.length) {
      setSelection({})
      return
    }
    const semilla: Selection = {}
    for (const g of pending.product.modifierGroups ?? []) {
      const ids = pending.initial.filter((m) => g.options.some((o) => o.id === m.id)).map((m) => m.id)
      if (ids.length > 0) semilla[g.id] = ids
    }
    setSelection(semilla)
  }, [pending])

  const groups = useMemo<ModifierGroup[]>(() => pending?.product.modifierGroups ?? [], [pending])
  const basePrice = pending ? (pending.size ? pending.size.price : pending.product.price ?? 0) : 0

  const chosen = useMemo<ModifierOption[]>(() => {
    const out: ModifierOption[] = []
    for (const g of groups) {
      for (const id of selection[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === id)
        if (opt) out.push(opt)
      }
    }
    return out
  }, [groups, selection])

  const extra = chosen.reduce((s, m) => s + m.priceDelta, 0)
  const unitPrice = basePrice + extra

  const invalidGroups = groups.filter((g) => {
    const n = (selection[g.id] ?? []).length
    return n < g.minSelect || (g.maxSelect !== null && n > g.maxSelect)
  })
  const canConfirm = invalidGroups.length === 0

  const toggle = (g: ModifierGroup, optionId: string) => {
    setSelection((prev) => {
      const current = prev[g.id] ?? []
      if (current.includes(optionId)) {
        return { ...prev, [g.id]: current.filter((id) => id !== optionId) }
      }
      // Grupo de una sola opción: reemplaza (comportamiento tipo radio)
      if (g.maxSelect === 1) {
        return { ...prev, [g.id]: [optionId] }
      }
      if (g.maxSelect !== null && current.length >= g.maxSelect) {
        return prev
      }
      return { ...prev, [g.id]: [...current, optionId] }
    })
  }

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {pending && (
          <>
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-stone-200">
              <DialogTitle className="flex items-center gap-2 text-stone-800">
                <SlidersHorizontal className="h-4 w-4 text-amber-700" />
                {pending.product.name}
                {pending.size && (
                  <span className="text-sm font-normal text-stone-500">· {pending.size.label}</span>
                )}
              </DialogTitle>
              <DialogDescription>
                Base {formatCurrency(basePrice)} · elige las opciones del cliente
              </DialogDescription>
            </DialogHeader>

            <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {groups.map((g) => {
                const selected = selection[g.id] ?? []
                const invalid = invalidGroups.includes(g)
                const full = g.maxSelect !== null && selected.length >= g.maxSelect
                return (
                  <div key={g.id}>
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-sm font-semibold text-stone-800">{g.name}</p>
                      <p className={`text-xs ${invalid ? "text-red-600 font-medium" : "text-stone-400"}`}>
                        {groupHint(g)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {g.options.map((opt) => {
                        const isOn = selected.includes(opt.id)
                        const disabled = !isOn && full && g.maxSelect !== 1
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggle(g, opt.id)}
                            disabled={disabled}
                            className={`flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 ${
                              isOn
                                ? "border-amber-500 bg-amber-50 text-amber-900"
                                : "border-stone-200 bg-white text-stone-700 hover:border-amber-300"
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                                  isOn ? "border-amber-600 bg-amber-600" : "border-stone-300"
                                }`}
                              >
                                {isOn && <Check className="h-3 w-3 text-white" />}
                              </span>
                              <span className="truncate font-medium">{opt.name}</span>
                            </span>
                            <span className={`text-xs shrink-0 ${opt.priceDelta > 0 ? "text-amber-700" : "text-stone-400"}`}>
                              {opt.priceDelta > 0
                                ? `+${formatCurrency(opt.priceDelta)}`
                                : opt.priceDelta < 0
                                ? `-${formatCurrency(-opt.priceDelta)}`
                                : "sin costo"}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-5 py-4 border-t border-stone-200 bg-stone-50 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-stone-500">Precio unitario</p>
                <p className="text-lg font-bold text-stone-800">
                  {formatCurrency(unitPrice)}
                  {extra > 0 && (
                    <span className="text-xs font-normal text-stone-400 ml-1">
                      ({formatCurrency(basePrice)} + {formatCurrency(extra)})
                    </span>
                  )}
                </p>
              </div>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!canConfirm}
                onClick={() => onConfirm(pending.product, pending.size, chosen)}
              >
                {pending.editing ? "Guardar" : "Agregar"} {formatCurrency(unitPrice)}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
