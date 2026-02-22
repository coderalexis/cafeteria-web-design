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
        `id, name, description, category_id, sort_order,
         menu_categories(id, name, slug),
         menu_variants(id, name, size_label, price, sort_order)`
      )
      .order("sort_order"),
  ])

  // Serialize for client component
  const serializedCategories = (categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }))

  const serializedProducts = (products || []).map((p: any) => {
    const cat = p.menu_categories as { id: string; name: string; slug: string } | null
    const variants = [...(p.menu_variants || [])].sort(
      (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)
    )

    // Calculate price range from variants
    const prices = variants.map((v: any) => v.price as number)
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0

    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description || "") as string,
      categoryId: (p.category_id || "") as string,
      categoryName: cat?.name || "",
      categorySlug: cat?.slug || "",
      sortOrder: p.sort_order as number,
      minPrice,
      maxPrice,
      variantCount: variants.length,
      variants: variants.map((v: any) => ({
        id: v.id as string,
        name: v.name as string,
        sizeLabel: (v.size_label || "") as string,
        price: v.price as number,
        sortOrder: v.sort_order as number,
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
