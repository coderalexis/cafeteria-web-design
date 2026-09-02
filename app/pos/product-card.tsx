"use client"

import { memo } from "react"
import { AnimatePresence, m } from "framer-motion"
import { Info, SlidersHorizontal } from "lucide-react"
import { Kbd } from "@/components/kbd"
import { getDisplayPrice, type Product, type SizeOption } from "./cart"

/**
 * Una tarjeta de producto de la rejilla, memoizada.
 *
 * La rejilla tiene ~90 tarjetas y el POS redibuja el componente entero en cada
 * toque del carrito: agregar algo, subir una cantidad, escribir una nota. Sin
 * `memo`, cada uno de esos toques volvía a construir las noventa. En una
 * laptop no se nota; en el Android de una cafetería es la diferencia entre
 * fluido y trabado, y justo encima corre la animación de vuelo al carrito.
 *
 * Para que el `memo` sirva de algo, TODAS las props tienen que ser estables:
 * `product` viene del servidor y no cambia de referencia, `accent` y
 * `subcategory` son textos, `abierto` es un booleano (así solo se redibuja la
 * tarjeta cuyo selector de tamaño se abre), y las tres funciones están
 * envueltas en `useCallback` arriba. Si alguna dejara de serlo, esto seguiría
 * funcionando pero dejaría de ahorrar nada.
 */
export const ProductCard = memo(function ProductCard({
  product,
  accent,
  subcategory,
  abierto,
  onInfo,
  onMarcarOrigen,
  onElegir,
  onElegirTamano,
}: {
  product: Product
  accent: string | undefined
  subcategory: string
  abierto: boolean
  onInfo: (p: Product) => void
  onMarcarOrigen: (e: React.MouseEvent<HTMLElement>) => void
  onElegir: (p: Product) => void
  onElegirTamano: (p: Product, size?: SizeOption) => void
}) {
  return (
    <div className="relative">
      {/* La "i" va FUERA del botón del producto —un botón dentro de otro no es
          HTML válido— y encima de él con z-10, así que tocarla no agrega el
          producto. */}
      {product.description && (
        <button
          type="button"
          onClick={() => onInfo(product)}
          aria-label={`Qué lleva ${product.name}`}
          title={`Qué lleva ${product.name}`}
          className="absolute right-0 top-0 z-10 rounded-full p-2 text-stone-300 transition-colors hover:bg-amber-50 hover:text-amber-700"
        >
          <Info className="h-4 w-4" />
        </button>
      )}
      <m.button
        whileTap={{ scale: 0.95 }}
        onClick={(e) => {
          onMarcarOrigen(e)
          onElegir(product)
        }}
        className={`w-full text-left rounded-xl border transition-all duration-150 overflow-hidden ${
          abierto
            ? "border-amber-400 bg-amber-50 shadow-md"
            : "border-stone-200 bg-white hover:border-amber-300 hover:shadow-sm"
        }`}
      >
        <div className="p-3 relative">
          {accent && <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />}
          <p
            className={`text-sm font-semibold leading-tight text-stone-800 line-clamp-2 ${
              product.description ? "pr-5" : ""
            }`}
          >
            {product.name}
          </p>
          {product.description && product.description !== subcategory && (
            <p className="text-xs text-stone-400 mt-0.5 truncate">{product.description}</p>
          )}
          <p className="text-amber-700 font-bold text-base mt-1 flex items-center justify-between">
            {getDisplayPrice(product)}
            {product.modifierGroups && (
              <SlidersHorizontal className="h-3.5 w-3.5 text-stone-300" aria-label="Con opciones" />
            )}
          </p>
        </div>
      </m.button>

      {/* Selector de tamaño – justo debajo de la tarjeta */}
      <AnimatePresence>
        {abierto && product.sizes && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex gap-1.5 mt-1.5">
              {product.sizes.map((size, index) => (
                <m.button
                  key={size.label}
                  whileTap={{ scale: 0.92 }}
                  onClick={(e) => {
                    onMarcarOrigen(e)
                    onElegirTamano(product, size)
                  }}
                  className="relative flex-1 py-2.5 md:py-2 px-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-center transition-colors"
                >
                  {index < 9 && (
                    <Kbd className="absolute top-1 right-1 border-white/40 bg-white/20 text-white opacity-90">
                      {index + 1}
                    </Kbd>
                  )}
                  <span className="block text-xs font-bold">{size.label}</span>
                  <span className="block text-[10px] opacity-80">{size.oz}</span>
                  <span className="block text-xs font-bold mt-0.5">${size.price}</span>
                </m.button>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
})
