import { createCategory, createProduct, createVariant } from "@/app/actions/menu"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: products }, { data: variants }] = await Promise.all([
    supabase.from("menu_categories").select("id, name, slug").order("sort_order"),
    supabase.from("menu_products").select("id, name, category_id").order("name"),
    supabase.from("menu_variants").select("id, name, product_id, price").order("name"),
  ])

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Panel Admin · Menú</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Nueva categoría</CardTitle></CardHeader>
          <CardContent>
            <form action={createCategory} className="space-y-2">
              <Input name="name" placeholder="Bebidas calientes" required />
              <Input name="slug" placeholder="bebidas-calientes" required />
              <Button type="submit">Crear</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nuevo producto</CardTitle></CardHeader>
          <CardContent>
            <form action={createProduct} className="space-y-2">
              <Input name="name" placeholder="Latte" required />
              <Input name="category_id" placeholder="UUID categoría" required />
              <Input name="description" placeholder="Descripción" />
              <Button type="submit">Crear</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nueva variante</CardTitle></CardHeader>
          <CardContent>
            <form action={createVariant} className="space-y-2">
              <Input name="product_id" placeholder="UUID producto" required />
              <Input name="name" placeholder="Grande 16 oz" required />
              <Input name="price" type="number" step="0.01" placeholder="65" required />
              <Button type="submit">Crear</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Catálogo actual</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <h2 className="mb-2 font-medium">Categorías</h2>
            <ul className="space-y-1 text-sm">
              {categories?.map((category) => <li key={category.id}>{category.name} ({category.slug})</li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Productos</h2>
            <ul className="space-y-1 text-sm">
              {products?.map((product) => <li key={product.id}>{product.name}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Variantes</h2>
            <ul className="space-y-1 text-sm">
              {variants?.map((variant) => <li key={variant.id}>{variant.name} - ${variant.price}</li>)}
            </ul>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
