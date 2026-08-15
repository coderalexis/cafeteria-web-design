import { createClient } from "@/lib/supabase/server"
import ProductosClient from "./productos-client"

export default async function ProductosPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, slug, sort_order")
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select(
        `id, name, description, category_id, sort_order, is_active,
         menu_categories(id, name, slug),
         menu_variants(id, name, size_label, price, sort_order)`
      )
      .order("sort_order"),
  ])

  // Serialize for client component
  const serializedCategories = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }))

  const serializedProducts = (products ?? []).map((p) => {
    const cat = p.menu_categories
    const variants = [...(p.menu_variants ?? [])].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    )

    // Calculate price range from variants
    const prices = variants.map((v) => v.price)
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0

    return {
      id: p.id,
      name: p.name,
      description: p.description || "",
      categoryId: p.category_id || "",
      categoryName: cat?.name || "",
      categorySlug: cat?.slug || "",
      sortOrder: p.sort_order,
      isActive: p.is_active,
      minPrice,
      maxPrice,
      variantCount: variants.length,
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        sizeLabel: v.size_label || "",
        price: v.price,
        sortOrder: v.sort_order,
      })),
    }
  })

  return (
    <ProductosClient
      categories={serializedCategories}
      products={serializedProducts}
    />
  )
}
