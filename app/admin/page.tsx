import { createCategory, createProduct, createVariant, updateCategory, updateProduct } from "@/app/actions/menu"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: products }, { data: variants }] = await Promise.all([
    supabase.from("menu_categories").select("id, name, slug, sort_order").order("sort_order"),
    supabase
      .from("menu_products")
      .select("id, name, description, category_id, menu_categories(name)")
      .order("name"),
    supabase
      .from("menu_variants")
      .select("id, name, product_id, price, menu_products(name)")
      .order("name")
      .limit(30),
  ])

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Panel Admin · Menú</h1>
        <p className="text-sm text-muted-foreground">
          Aquí puedes crear y modificar categorías y productos sin usar UUID manual.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Crear categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCategory} className="grid gap-2 sm:grid-cols-3">
              <Input name="name" placeholder="Bebidas calientes" required />
              <Input name="slug" placeholder="bebidas-calientes" required />
              <Button type="submit">Crear</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crear producto</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createProduct} className="grid gap-2 sm:grid-cols-4">
              <Input name="name" placeholder="Latte" required className="sm:col-span-2" />
              <select name="category_id" className="rounded-md border bg-background px-3" required>
                <option value="">Categoría...</option>
                {categories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <Input name="description" placeholder="Descripción" />
              <Button type="submit" className="sm:col-span-4">
                Crear producto
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar categorías</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {categories?.map((category) => (
            <form key={category.id} action={updateCategory} className="grid gap-2 rounded-md border p-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={category.id} />
              <Input name="name" defaultValue={category.name} required />
              <Input name="slug" defaultValue={category.slug} required />
              <Input name="sort_order" defaultValue={String(category.sort_order ?? 0)} disabled />
              <Button type="submit" variant="secondary">
                Guardar
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editar productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {products?.slice(0, 40).map((product) => (
            <form key={product.id} action={updateProduct} className="grid gap-2 rounded-md border p-3 lg:grid-cols-5">
              <input type="hidden" name="id" value={product.id} />
              <Input name="name" defaultValue={product.name} required />
              <select name="category_id" defaultValue={product.category_id} className="rounded-md border bg-background px-3" required>
                {categories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <Input name="description" defaultValue={product.description ?? ""} placeholder="Descripción" className="lg:col-span-2" />
              <Button type="submit" variant="secondary">
                Guardar
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vista rápida</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
          <div>
            <h2 className="mb-2 font-medium">Categorías ({categories?.length ?? 0})</h2>
            <ul className="space-y-1">
              {categories?.map((category) => (
                <li key={category.id}>
                  {category.name} ({category.slug})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Productos ({products?.length ?? 0})</h2>
            <ul className="space-y-1">
              {products?.slice(0, 20).map((product) => (
                <li key={product.id}>{product.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-medium">Variantes (últimas 30)</h2>
            <ul className="space-y-1">
              {variants?.map((variant) => (
                <li key={variant.id}>
                  {variant.name} - ${variant.price}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Crear variante</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createVariant} className="grid gap-2 sm:grid-cols-4">
            <select name="product_id" className="rounded-md border bg-background px-3" required>
              <option value="">Producto...</option>
              {products?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <Input name="name" placeholder="Grande 16 oz" required />
            <Input name="price" type="number" step="0.01" placeholder="65" required />
            <Button type="submit">Crear variante</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
