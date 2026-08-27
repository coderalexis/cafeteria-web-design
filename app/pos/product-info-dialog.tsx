"use client"

import { Info } from "lucide-react"
import type { Product } from "./cart"
import { formatCurrency } from "@/lib/format"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * "¿Qué lleva?" — lo que el cajero necesita contestar sin buscar la carta.
 *
 * En la tarjeta la descripción cabe en un renglón y se corta; aquí sale
 * completa, con los precios por tamaño y las opciones que se pueden pedir.
 * Es solo de consulta: no agrega nada al carrito, para que abrirla por
 * curiosidad nunca cobre de más.
 */
export function ProductInfoDialog({
  product,
  onClose,
}: {
  product: Product | null
  onClose: () => void
}) {
  return (
    <Dialog open={product !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                {product.name}
              </DialogTitle>
            </DialogHeader>

            {product.description && (
              <p className="text-[15px] leading-relaxed text-stone-700">{product.description}</p>
            )}

            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Precio</p>
              {product.sizes && product.sizes.length > 0 ? (
                <ul className="mt-1.5 space-y-1 text-sm">
                  {product.sizes.map((size) => (
                    <li key={size.variantId} className="flex justify-between gap-3">
                      <span className="text-stone-600">
                        {size.label}
                        {size.oz ? ` · ${size.oz}` : ""}
                      </span>
                      <span className="font-semibold text-stone-800">{formatCurrency(size.price)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-lg font-bold text-stone-800">{formatCurrency(product.price ?? 0)}</p>
              )}
            </div>

            {product.modifierGroups && product.modifierGroups.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Se puede pedir con</p>
                {product.modifierGroups.map((group) => (
                  <div key={group.id} className="text-sm">
                    <p className="font-medium text-stone-700">{group.name}</p>
                    <p className="text-stone-500">
                      {group.options
                        .map((o) => (o.priceDelta > 0 ? `${o.name} (+${formatCurrency(o.priceDelta)})` : o.name))
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
