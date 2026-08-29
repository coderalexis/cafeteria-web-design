import { createClient } from "@/lib/supabase/server"
import { createCategory, updateCategory, deleteCategory, moveCategory } from "@/app/actions/menu"
import { ActionForm } from "@/components/action-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CATEGORY_NOTE_MAX } from "@/lib/settings"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_COLORS, COLOR_CLASSES, isCategoryColor } from "@/lib/category-colors"
import { Tag, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react"

/**
 * Selector de color con radios nativos (sin JS): el POS pinta los chips de
 * categoría y la franja de las tarjetas con este color.
 */
function ColorPicker({ value }: { value?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="cursor-pointer" title="Sin color">
        <input
          type="radio"
          name="color"
          value=""
          defaultChecked={!isCategoryColor(value)}
          className="peer sr-only"
        />
        <span className="block h-6 w-6 rounded-full border-2 border-dashed border-stone-300 bg-white peer-checked:ring-2 peer-checked:ring-stone-500 peer-checked:ring-offset-1 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500" />
      </label>
      {CATEGORY_COLORS.map((color) => (
        <label key={color} className="cursor-pointer" title={COLOR_CLASSES[color].label}>
          <input
            type="radio"
            name="color"
            value={color}
            defaultChecked={value === color}
            className="peer sr-only"
          />
          <span
            className={`block h-6 w-6 rounded-full ${COLOR_CLASSES[color].dot} peer-checked:ring-2 peer-checked:ring-stone-500 peer-checked:ring-offset-1 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500`}
          />
        </label>
      ))}
    </div>
  )
}

export default async function CategoriasPage() {
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name, slug, sort_order, color, note")
    .order("sort_order")

  // Count products per category
  const { data: productCounts } = await supabase
    .from("menu_products")
    .select("category_id")

  const countMap: Record<string, number> = {}
  productCounts?.forEach((p) => {
    countMap[p.category_id] = (countMap[p.category_id] || 0) + 1
  })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            Categorías
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Gestiona las categorías de tu menú ({categories?.length ?? 0}{" "}
            categorías)
          </p>
        </div>
      </div>

      {/* Create category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nueva categoría
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createCategory} className="flex flex-wrap items-center gap-3" successMessage="Categoría creada" resetOnSuccess>
            <Input
              name="name"
              placeholder="Nombre (ej: Bebidas calientes)"
              required
              className="flex-1 min-w-[12rem]"
            />
            <Input
              name="slug"
              placeholder="Slug (ej: bebidas-calientes)"
              required
              className="flex-1 min-w-[12rem]"
            />
            <ColorPicker />
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 shrink-0">
              Crear
            </Button>
            <Input
              name="note"
              maxLength={CATEGORY_NOTE_MAX}
              placeholder="Nota para el menú público (opcional): «Incluyen café del día y fruta»"
              className="w-full"
            />
          </ActionForm>
          <p className="text-xs text-stone-400 mt-2">
            El color pinta la categoría en el POS (chips y tarjetas) para encontrarla más rápido.
          </p>
        </CardContent>
      </Card>

      {/* Categories list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas las categorías</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {categories?.length === 0 && (
            <p className="text-sm text-stone-400 py-4 text-center">
              No hay categorías aún. Crea la primera arriba.
            </p>
          )}
          {categories?.map((category, index) => (
            <div
              key={category.id}
              className="flex items-center gap-3 rounded-lg border border-stone-200 p-3 hover:border-stone-300 transition-colors"
            >
              {/* Orden: subir / bajar (es el orden de las pestañas del POS) */}
              <div className="flex flex-col shrink-0">
                <ActionForm action={moveCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={index === 0}
                    title="Subir"
                    className="flex h-4 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </ActionForm>
                <ActionForm action={moveCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={index === (categories?.length ?? 0) - 1}
                    title="Bajar"
                    className="flex h-4 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </ActionForm>
              </div>
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-stone-100 text-xs font-bold text-stone-500 shrink-0">
                {index + 1}
              </span>

              {/* Edit form */}
              <ActionForm
                action={updateCategory}
                className="flex flex-wrap items-center gap-3 flex-1"
              >
                <input type="hidden" name="id" value={category.id} />
                <Input
                  name="name"
                  defaultValue={category.name}
                  required
                  className="flex-1 min-w-[10rem]"
                />
                <Input
                  name="slug"
                  defaultValue={category.slug}
                  required
                  className="flex-1 min-w-[10rem] font-mono text-sm"
                />
                <ColorPicker value={category.color} />
                <Button type="submit" variant="secondary" size="sm" className="shrink-0">
                  Guardar
                </Button>
                <Input
                  name="note"
                  defaultValue={category.note ?? ""}
                  maxLength={CATEGORY_NOTE_MAX}
                  placeholder="Nota para el menú público (opcional)"
                  className="w-full text-sm"
                />
              </ActionForm>

              {/* Product count */}
              <Badge
                variant="outline"
                className="shrink-0 border-stone-300 text-stone-500"
              >
                {countMap[category.id] || 0} prod.
              </Badge>

              {/* Delete button (separate form) */}
              <ActionForm action={deleteCategory}>
                <input type="hidden" name="id" value={category.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-stone-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  disabled={(countMap[category.id] || 0) > 0}
                  title={
                    (countMap[category.id] || 0) > 0
                      ? "Elimina los productos primero"
                      : "Eliminar categoría"
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </ActionForm>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
