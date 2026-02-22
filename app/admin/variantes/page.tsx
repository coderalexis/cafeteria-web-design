import { createClient } from "@/lib/supabase/server"
import { createVariant, updateVariant, deleteVariant } from "@/app/actions/menu"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Layers, Plus, Trash2 } from "lucide-react"

export default async function VariantesPage() {
  const supabase = await createClient()

  const [{ data: products }, { data: variants }] = await Promise.all([
    supabase
      .from("menu_products")
      .select("id, name, menu_categories(name)")
      .order("name"),
    supabase
      .from("menu_variants")
      .select(
        "id, name, size_label, price, sort_order, product_id, menu_products(name, menu_categories(name))"
      )
      .order("product_id")
      .order("sort_order"),
  ])

  // Group variants by product
  const grouped: Record<
    string,
    { productName: string; categoryName: string; items: NonNullable<typeof variants> }
  > = {}

  variants?.forEach((v) => {
    const product = v.menu_products as any
    const key = v.product_id
    if (!grouped[key]) {
      grouped[key] = {
        productName: product?.name || "?",
        categoryName: product?.menu_categories?.name || "?",
        items: [],
      }
    }
    grouped[key].items.push(v)
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
          <Layers className="h-6 w-6 text-purple-600" />
          Variantes
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Gestiona los tamaños y precios de cada producto (
          {variants?.length ?? 0} variantes)
        </p>
      </div>

      {/* Create variant */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nueva variante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={createVariant}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <select
              name="product_id"
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm lg:col-span-2"
              required
            >
              <option value="">Producto...</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {(p.menu_categories as any)?.name}
                </option>
              ))}
            </select>
            <Input name="name" placeholder="Nombre (ej: Grande)" required />
            <Input
              name="size_label"
              placeholder="Tamaño (ej: 16 oz)"
            />
            <div className="flex gap-2">
              <Input
                name="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="Precio"
                required
                className="flex-1"
              />
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700 shrink-0"
              >
                Crear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Variants grouped by product */}
      {Object.entries(grouped).map(([productId, group]) => (
        <Card key={productId}>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{group.productName}</span>
                <Badge
                  variant="outline"
                  className="text-xs font-normal border-stone-300"
                >
                  {group.categoryName}
                </Badge>
              </div>
              <span className="text-xs text-stone-400">
                {group.items.length}{" "}
                {group.items.length === 1 ? "variante" : "variantes"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Table header */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 pb-2 text-[11px] font-medium text-stone-400 uppercase tracking-wider">
              <span className="col-span-3">Nombre</span>
              <span className="col-span-3">Tamaño</span>
              <span className="col-span-3">Precio</span>
              <span className="col-span-3"></span>
            </div>

            <div className="space-y-2">
              {group.items.map((variant) => (
                <form
                  key={variant.id}
                  action={updateVariant}
                  className="grid sm:grid-cols-12 gap-2 items-center rounded-lg border border-stone-200 p-3 hover:border-stone-300 transition-colors"
                >
                  <input type="hidden" name="id" value={variant.id} />

                  {/* Color indicator + Name */}
                  <div className="sm:col-span-3 flex items-center gap-2">
                    <div
                      className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                        variant.name === "Único"
                          ? "bg-stone-100"
                          : variant.name === "Chico"
                          ? "bg-blue-50"
                          : variant.name === "Grande"
                          ? "bg-amber-50"
                          : variant.name === "Frio"
                          ? "bg-cyan-50"
                          : "bg-purple-50"
                      }`}
                    >
                      <span
                        className={`text-xs font-bold ${
                          variant.name === "Único"
                            ? "text-stone-500"
                            : variant.name === "Chico"
                            ? "text-blue-600"
                            : variant.name === "Grande"
                            ? "text-amber-600"
                            : variant.name === "Frio"
                            ? "text-cyan-600"
                            : "text-purple-600"
                        }`}
                      >
                        {variant.name === "Único"
                          ? "U"
                          : variant.name?.charAt(0)}
                      </span>
                    </div>
                    <Input
                      name="name"
                      defaultValue={variant.name}
                      required
                      className="text-sm"
                    />
                  </div>

                  {/* Size label */}
                  <div className="sm:col-span-3">
                    <Input
                      name="size_label"
                      defaultValue={variant.size_label ?? ""}
                      placeholder="ej: 16 oz"
                      className="text-sm"
                    />
                  </div>

                  {/* Price */}
                  <div className="sm:col-span-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                        $
                      </span>
                      <Input
                        name="price"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={variant.price ?? 0}
                        required
                        className="text-sm pl-7 font-semibold"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="sm:col-span-3 flex items-center gap-2 justify-end">
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                    >
                      Guardar
                    </Button>
                    {/* Delete as a separate form so it doesn't interfere */}
                    <DeleteVariantButton variantId={variant.id} />
                  </div>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DeleteVariantButton({ variantId }: { variantId: string }) {
  return (
    <form action={deleteVariant}>
      <input type="hidden" name="id" value={variantId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-stone-400 hover:text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  )
}
