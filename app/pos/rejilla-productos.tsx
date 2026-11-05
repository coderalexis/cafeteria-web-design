"use client"

import type React from "react"
import { m } from "framer-motion"
import { Coffee, Search, Sparkles, Star } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { colorClasses } from "@/lib/category-colors"
import { esquinaExistencia } from "@/lib/existencias"
import { formatCurrency } from "@/lib/format"
import { ArranqueCard } from "./arranque-card"
import { getDisplayPrice, type Product, type SizeOption } from "./cart"
import { ProductCard } from "./product-card"
import type { useCartFeedback } from "./use-cart-feedback"

type Feedback = ReturnType<typeof useCartFeedback>

/**
 * La carta del POS: el arranque de la primera vez, «Más vendidos» y los
 * productos por categoría. Salió de pos-client.tsx tal cual, sin cambios de
 * comportamiento.
 */
export function RejillaProductos({
  gridScrollRef,
  isMobile,
  cuentasActivas,
  openAccount,
  chipsCuentas,
  products,
  favorites,
  filtered,
  grouped,
  empezarRecorrido,
  instalar,
  searchQuery,
  searchLower,
  activeCategory,
  customItemsEnabled,
  setFueraDeMenu,
  porVarianteMapa,
  esquinaDe,
  markFlyOrigin,
  chooseProduct,
  handleProductClick,
  sizePickerFor,
  setInfoProduct,
  categoryColor,
}: {
  gridScrollRef: React.Ref<HTMLDivElement>
  isMobile: boolean | undefined
  cuentasActivas: boolean
  openAccount: unknown
  chipsCuentas: unknown[]
  products: Product[]
  favorites: Array<{ product: Product; size?: SizeOption }>
  filtered: Product[]
  grouped: Record<string, Product[]>
  empezarRecorrido: () => void
  instalar: React.ComponentProps<typeof ArranqueCard>["instalar"]
  searchQuery: string
  searchLower: string
  activeCategory: string
  customItemsEnabled: boolean
  setFueraDeMenu: (v: { open: boolean; name: string }) => void
  porVarianteMapa: Record<string, { qty: number; minQty: number }>
  esquinaDe: (p: Product) => string | null
  markFlyOrigin: Feedback["markFlyOrigin"]
  chooseProduct: (product: Product, size?: SizeOption) => void
  handleProductClick: React.ComponentProps<typeof ProductCard>["onElegir"]
  sizePickerFor: string | null
  setInfoProduct: React.ComponentProps<typeof ProductCard>["onInfo"]
  categoryColor: Record<string, string | null>
}) {
  return (
    <ScrollArea ref={gridScrollRef} className="flex-1 min-h-0">
      <div className={`p-4 space-y-6 ${isMobile ? (cuentasActivas && (openAccount || chipsCuentas.length > 0) ? "pb-40" : "pb-24") : ""}`}>
        {/* Los dos pasos de una venta, solo la primera vez en un celular. */}
        <ArranqueCard
          mostrar={isMobile === true && products.length > 0}
          tieneFavoritos={favorites.length > 0}
          onRecorrido={empezarRecorrido}
          instalar={instalar}
        />
        {products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400">
            <Coffee className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-base font-medium">No hay productos en el menú</p>
            <p className="text-sm">Agrega productos desde el panel de administración</p>
          </div>
        )}
        {products.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-stone-400">
            <Search className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Sin resultados para «{searchQuery}»</p>
            {/* Lo buscado no existe en la carta: se vende fuera de menú con
                lo que se escribió, sin volver a teclearlo. */}
            {customItemsEnabled && (
              <button
                type="button"
                onClick={() => setFueraDeMenu({ open: true, name: searchQuery.trim() })}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                data-fuera-buscar
              >
                <Sparkles className="h-4 w-4" />
                Vender «{searchQuery.trim()}» fuera de menú
              </button>
            )}
          </div>
        )}
        {/* Más vendidos: un toque para los productos de siempre */}
        {(favorites.length > 0 || customItemsEnabled) && !searchLower && activeCategory === "todos" && (
          <div>
            <h3 className="compacto-si-bajo text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-500" />
              Más vendidos
            </h3>
            {/* En celular son tiles grandes a dos columnas: en la hora pico
                la pantalla útil son estos ocho productos, no la carta entera. */}
            {/* Dos columnas grandes son lo correcto en un celular. En una
                tablet de pie (600 px de ancho) esa misma rejilla ocupaba
                202 px donde una fila que envuelve ocupa ~90. */}
            <div
              className={`una-fila-si-bajo ${isMobile ? "grid grid-cols-2 gap-2 min-[500px]:flex min-[500px]:flex-wrap" : "flex flex-wrap gap-2"}`}
              data-favoritos
            >
              {favorites.map(({ product, size }) => {
                const e = size ? porVarianteMapa[size.variantId] : undefined
                const esquina = size ? (e ? esquinaExistencia(e.qty, e.minQty) : null) : esquinaDe(product)
                return (
                <m.button
                  key={size?.variantId ?? product.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    markFlyOrigin(e)
                    chooseProduct(product, size)
                  }}
                  className={`rounded-xl border border-amber-200 bg-amber-50 text-left hover:border-amber-400 hover:bg-amber-100 transition-colors ${isMobile ? "px-3 py-3" : "px-3 py-2"}`}
                >
                  <span className={`block font-semibold text-stone-800 leading-tight ${isMobile ? "text-base" : "text-sm"}`}>
                    {product.name}
                    {size ? <span className="text-stone-500 font-normal"> · {size.label}</span> : null}
                  </span>
                  <span className="block text-xs font-bold text-amber-700">
                    {size ? formatCurrency(size.price) : getDisplayPrice(product)}
                  </span>
                  {esquina && (
                    <span
                      className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                        esquina === "Agotado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {esquina}
                    </span>
                  )}
                </m.button>
                )
              })}
              {/* Lo que no está en la carta, al alcance del pulgar: un
                  tile más al final de los de siempre. */}
              {customItemsEnabled && (
                <m.button
                  key="fuera-de-menu"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFueraDeMenu({ open: true, name: "" })}
                  className={`rounded-xl border border-dashed border-amber-400 bg-white text-left hover:bg-amber-50 transition-colors ${isMobile ? "px-3 py-3" : "px-3 py-2"}`}
                  data-fuera-tile
                >
                  <span className={`flex items-center gap-1.5 font-semibold text-amber-800 leading-tight ${isMobile ? "text-base" : "text-sm"}`}>
                    <Sparkles className="h-4 w-4 shrink-0" />
                    Fuera de menú
                  </span>
                  <span className="block text-xs text-stone-500">precio al vuelo</span>
                </m.button>
              )}
            </div>
          </div>
        )}

        {Object.entries(grouped).map(([subcategory, items], gi) => (
          <div key={subcategory}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1">
              {subcategory}
            </h3>
            {/* Columnas por el ancho REAL del panel, no por el de la ventana.
                El mínimo es 9rem tras medirlo: a 7rem entraban 5 columnas en
                la tablet pero NO se veía ni un producto más (los títulos de
                categoría mandan) y se cortaban 9 nombres en vez de 2. En
                pantallas grandes sí caben 6 columnas, donde antes el
                grid-cols-4 fijo desperdiciaba el ancho. */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))]">
              {items.map((product, pi) => (
                <ProductCard
                  key={product.id}
                  marcado={gi === 0 && pi === 0}
                  product={product}
                  accent={colorClasses(categoryColor[product.category])?.accent}
                  subcategory={subcategory}
                  abierto={sizePickerFor === product.id}
                  onInfo={setInfoProduct}
                  onMarcarOrigen={markFlyOrigin}
                  onElegir={handleProductClick}
                  onElegirTamano={chooseProduct}
                  esquina={esquinaDe(product)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
