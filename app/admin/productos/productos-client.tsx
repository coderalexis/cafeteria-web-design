"use client"

import { useState, useMemo } from "react"
import {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductActive,
  createVariant,
  updateVariant,
  deleteVariant,
} from "@/app/actions/menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Package,
  Search,
  Plus,
  Trash2,
  Layers,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Category {
  id: string
  name: string
  slug: string
}

interface Variant {
  id: string
  name: string
  sizeLabel: string
  price: number
  sortOrder: number
}

interface Product {
  id: string
  name: string
  description: string
  categoryId: string
  categoryName: string
  categorySlug: string
  sortOrder: number
  isActive: boolean
  minPrice: number
  maxPrice: number
  variantCount: number
  variants: Variant[]
}

interface ProductosClientProps {
  categories: Category[]
  products: Product[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getPriceDisplay(p: Product): string {
  if (p.variantCount === 0) return "Sin precio"
  if (p.minPrice === p.maxPrice) return `$${p.minPrice}`
  return `$${p.minPrice} - $${p.maxPrice}`
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function ProductosClient({
  categories,
  products,
}: ProductosClientProps) {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("todos")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  /* ── Filtering ──────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let result = products

    // Filter by category
    if (activeCategory !== "todos") {
      result = result.filter((p) => p.categorySlug === activeCategory)
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
      )
    }

    return result
  }, [products, activeCategory, search])

  /* ── Group by category ──────────────────────────────────────────── */
  const grouped = useMemo(() => {
    const map: Record<string, Product[]> = {}
    filtered.forEach((p) => {
      const key = p.categoryName || "Sin categoría"
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    return map
  }, [filtered])

  /* ── Handlers ───────────────────────────────────────────────────── */
  const openProduct = (product: Product) => {
    setSelectedProduct(product)
    setIsCreating(false)
    setSheetOpen(true)
  }

  const openCreateNew = () => {
    setSelectedProduct(null)
    setIsCreating(true)
    setSheetOpen(true)
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
              <Package className="h-6 w-6 text-emerald-600" />
              Productos
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              {products.length} productos · Clic en un producto para editarlo
            </p>
          </div>
          <Button
            onClick={openCreateNew}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            placeholder="Buscar producto por nombre, descripción o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            variant={activeCategory === "todos" ? "default" : "outline"}
            onClick={() => setActiveCategory("todos")}
            className={`rounded-full shrink-0 text-sm ${
              activeCategory === "todos"
                ? "bg-amber-700 hover:bg-amber-800 text-white"
                : "border-stone-300 text-stone-600 hover:bg-stone-100"
            }`}
          >
            Todos
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.slug ? "default" : "outline"}
              onClick={() => setActiveCategory(cat.slug)}
              className={`rounded-full shrink-0 text-sm ${
                activeCategory === cat.slug
                  ? "bg-amber-700 hover:bg-amber-800 text-white"
                  : "border-stone-300 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <ScrollArea className="flex-1 px-6 pb-6">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400">
            <Package className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-base font-medium">No se encontraron productos</p>
            <p className="text-sm">
              {search ? "Intenta con otra búsqueda" : "Agrega tu primer producto"}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {Object.entries(grouped).map(([catName, catProducts]) => (
            <div key={catName}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1">
                {catName}
                <span className="ml-2 text-stone-300 font-normal normal-case tracking-normal">
                  ({catProducts.length})
                </span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {catProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => openProduct(product)}
                    className={`w-full text-left rounded-xl border transition-all duration-150 overflow-hidden group ${
                      product.isActive
                        ? "border-stone-200 bg-white hover:border-amber-300 hover:shadow-md"
                        : "border-stone-200 bg-stone-50 opacity-60 hover:opacity-80"
                    }`}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`font-semibold text-sm leading-tight line-clamp-2 ${
                          product.isActive
                            ? "text-stone-800 group-hover:text-amber-800"
                            : "text-stone-500"
                        }`}>
                          {product.name}
                        </p>
                        {!product.isActive && (
                          <EyeOff className="h-3.5 w-3.5 text-stone-400 shrink-0 mt-0.5" />
                        )}
                      </div>
                      {product.description &&
                        product.description !== product.categoryName && (
                          <p className="text-xs text-stone-400 mt-0.5 truncate">
                            {product.description}
                          </p>
                        )}
                      <p className={`font-bold text-base mt-1 ${
                        product.isActive ? "text-amber-700" : "text-stone-400"
                      }`}>
                        {getPriceDisplay(product)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 border-stone-200 text-stone-400"
                        >
                          {product.variantCount}{" "}
                          {product.variantCount === 1 ? "var" : "vars"}
                        </Badge>
                        {!product.isActive && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 border-red-200 text-red-500 bg-red-50"
                          >
                            Inactivo
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* ───── Edit / Create Sheet ───── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg p-0 flex flex-col"
        >
          {isCreating ? (
            <CreateProductSheet
              categories={categories}
              onClose={() => setSheetOpen(false)}
            />
          ) : selectedProduct ? (
            <EditProductSheet
              product={selectedProduct}
              categories={categories}
              onClose={() => setSheetOpen(false)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ================================================================== */
/*  Edit Product Sheet                                                 */
/* ================================================================== */
function EditProductSheet({
  product,
  categories,
  onClose,
}: {
  product: Product
  categories: Category[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  const handleToggleActive = async () => {
    setIsToggling(true)
    const fd = new FormData()
    fd.set("id", product.id)
    fd.set("is_active", (!product.isActive).toString())

    const result = await toggleProductActive(fd)

    if (result.error) {
      toast.error(result.error)
      setIsToggling(false)
      return
    }

    toast.success(
      product.isActive
        ? `"${product.name}" desactivado — ya no aparecerá en el POS`
        : `"${product.name}" activado — ahora aparecerá en el POS`
    )
    onClose()
    router.refresh()
  }

  const handleDeleteProduct = async () => {
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}" y todas sus variantes? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return

    setIsDeleting(true)
    const fd = new FormData()
    fd.set("id", product.id)

    const result = await deleteProduct(fd)

    if (result.error) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }

    toast.success(`"${product.name}" eliminado`)
    onClose()
    router.refresh()
  }

  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-stone-200 shrink-0">
        <SheetTitle className="text-lg">{product.name}</SheetTitle>
        <SheetDescription className="text-sm">
          {product.categoryName} · {product.variantCount}{" "}
          {product.variantCount === 1 ? "variante" : "variantes"}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-6">
          {/* ── Product info form ── */}
          <form action={updateProduct} className="space-y-4">
            <input type="hidden" name="id" value={product.id} />

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Nombre
              </label>
              <Input name="name" defaultValue={product.name} required />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Categoría
              </label>
              <select
                name="category_id"
                defaultValue={product.categoryId}
                className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
                required
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Descripción
              </label>
              <Input
                name="description"
                defaultValue={product.description}
                placeholder="Descripción del producto"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              Guardar producto
            </Button>
          </form>

          {/* ── Active toggle ── */}
          <div className={`rounded-lg border p-4 flex items-center justify-between ${
            product.isActive
              ? "border-stone-200 bg-stone-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <div className="flex items-center gap-2">
              {product.isActive ? (
                <Eye className="h-4 w-4 text-emerald-600" />
              ) : (
                <EyeOff className="h-4 w-4 text-amber-600" />
              )}
              <div>
                <p className="text-sm font-medium text-stone-700">
                  {product.isActive ? "Producto activo" : "Producto inactivo"}
                </p>
                <p className="text-xs text-stone-500">
                  {product.isActive
                    ? "Visible en el POS para los cajeros"
                    : "No aparece en el POS"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleActive}
              disabled={isToggling}
              className={product.isActive
                ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              }
            >
              {isToggling
                ? "..."
                : product.isActive
                ? "Desactivar"
                : "Activar"}
            </Button>
          </div>

          <Separator />

          {/* ── Variants section ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600" />
                Variantes
              </h3>
              <span className="text-xs text-stone-400">
                {product.variants.length}{" "}
                {product.variants.length === 1 ? "variante" : "variantes"}
              </span>
            </div>

            {/* Existing variants */}
            <div className="space-y-2">
              {product.variants.map((variant) => (
                <div
                  key={variant.id}
                  className="rounded-lg border border-stone-200 p-3 space-y-2"
                >
                  <form
                    action={updateVariant}
                    className="grid grid-cols-3 gap-2"
                  >
                    <input type="hidden" name="id" value={variant.id} />
                    <Input
                      name="name"
                      defaultValue={variant.name}
                      placeholder="Nombre"
                      required
                      className="text-sm"
                    />
                    <Input
                      name="size_label"
                      defaultValue={variant.sizeLabel}
                      placeholder="Tamaño"
                      className="text-sm"
                    />
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                          $
                        </span>
                        <Input
                          name="price"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={variant.price}
                          required
                          className="text-sm pl-6 font-semibold"
                        />
                      </div>
                    </div>
                    <div className="col-span-3 flex gap-2">
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                      >
                        Guardar
                      </Button>
                      <DeleteVariantInline variantId={variant.id} />
                    </div>
                  </form>
                </div>
              ))}
            </div>

            {/* Add new variant */}
            <div className="rounded-lg border border-dashed border-stone-300 p-3 bg-stone-50/50">
              <p className="text-xs font-medium text-stone-500 mb-2 flex items-center gap-1.5">
                <Plus className="h-3 w-3" />
                Agregar variante
              </p>
              <form
                action={createVariant}
                className="grid grid-cols-3 gap-2"
              >
                <input
                  type="hidden"
                  name="product_id"
                  value={product.id}
                />
                <Input
                  name="name"
                  placeholder="Nombre"
                  required
                  className="text-sm"
                />
                <Input
                  name="size_label"
                  placeholder="Tamaño"
                  className="text-sm"
                />
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                      $
                    </span>
                    <Input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      required
                      className="text-sm pl-6"
                    />
                  </div>
                </div>
                <div className="col-span-3">
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed"
                  >
                    <Plus className="h-3 w-3 mr-1.5" />
                    Agregar
                  </Button>
                </div>
              </form>
            </div>
          </div>

          <Separator />

          {/* ── Delete product ── */}
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Zona de peligro
            </div>
            <p className="text-xs text-red-600/80">
              Eliminar este producto borrará también todas sus variantes. Las ventas históricas no se verán afectadas.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleDeleteProduct}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {isDeleting ? "Eliminando..." : "Eliminar producto"}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

/* ================================================================== */
/*  Create Product Sheet                                               */
/* ================================================================== */
function CreateProductSheet({
  categories,
  onClose,
}: {
  categories: Category[]
  onClose: () => void
}) {
  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-stone-200 shrink-0">
        <SheetTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-emerald-600" />
          Nuevo producto
        </SheetTitle>
        <SheetDescription className="text-sm">
          Crea un producto y después agrega sus variantes
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-6">
          <form action={createProduct} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Nombre *
              </label>
              <Input
                name="name"
                placeholder="Nombre del producto"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Categoría *
              </label>
              <select
                name="category_id"
                className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Selecciona una categoría...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Descripción
              </label>
              <Input
                name="description"
                placeholder="Descripción del producto (opcional)"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              Crear producto
            </Button>
          </form>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800">
              <strong>Tip:</strong> Después de crear el producto, haz clic en
              él en el grid para agregar variantes (tamaños y precios).
            </p>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

/* ================================================================== */
/*  Delete Variant Inline Button                                       */
/* ================================================================== */
function DeleteVariantInline({ variantId }: { variantId: string }) {
  return (
    <form action={deleteVariant}>
      <input type="hidden" name="id" value={variantId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-stone-400 hover:text-red-600 hover:bg-red-50 px-2"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </form>
  )
}
