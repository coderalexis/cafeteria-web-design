import { createClient } from "@/lib/supabase/server"
import { createCategory, updateCategory, deleteCategory } from "@/app/actions/menu"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tag, Plus, Trash2 } from "lucide-react"

export default async function CategoriasPage() {
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name, slug, sort_order")
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
          <form action={createCategory} className="flex gap-3">
            <Input
              name="name"
              placeholder="Nombre (ej: Bebidas calientes)"
              required
              className="flex-1"
            />
            <Input
              name="slug"
              placeholder="Slug (ej: bebidas-calientes)"
              required
              className="flex-1"
            />
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 shrink-0">
              Crear
            </Button>
          </form>
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
              {/* Sort order badge */}
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-stone-100 text-xs font-bold text-stone-500 shrink-0">
                {category.sort_order ?? index + 1}
              </span>

              {/* Edit form */}
              <form
                action={updateCategory}
                className="flex items-center gap-3 flex-1"
              >
                <input type="hidden" name="id" value={category.id} />
                <Input
                  name="name"
                  defaultValue={category.name}
                  required
                  className="flex-1"
                />
                <Input
                  name="slug"
                  defaultValue={category.slug}
                  required
                  className="flex-1 font-mono text-sm"
                />
                <Button type="submit" variant="secondary" size="sm" className="shrink-0">
                  Guardar
                </Button>
              </form>

              {/* Product count */}
              <Badge
                variant="outline"
                className="shrink-0 border-stone-300 text-stone-500"
              >
                {countMap[category.id] || 0} prod.
              </Badge>

              {/* Delete button (separate form) */}
              <form action={deleteCategory}>
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
              </form>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
