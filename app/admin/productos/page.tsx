import { createClient } from "@/lib/supabase/server"
import ProductosClient, { type ModifierGroupOption } from "./productos-client"

export default async function ProductosPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: products }, { data: groups }, { data: usoExtras }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, slug, sort_order")
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select(
        `id, name, description, category_id, sort_order, is_active, prompt_modifiers, pinned_order,
         menu_categories(id, name, slug),
         menu_variants(id, name, size_label, price, cost, sort_order, is_active),
         product_modifier_groups(group_id)`
      )
      .order("sort_order"),
    supabase
      .from("modifier_groups")
      .select("id, name, is_active, sort_order, min_select, max_select, modifiers(id, name, price_delta, sort_order, is_active)")
      .order("sort_order")
      .order("name"),
    // Cuántas ventas de cada producto llevaron extras (30 días): el dato para
    // decidir si vale la pena preguntar al tocar.
    supabase.rpc("product_extras_usage", { p_days: 30 }),
  ])

  const extrasUso: Record<string, { items: number; withExtras: number }> = {}
  for (const u of (Array.isArray(usoExtras) ? usoExtras : []) as Array<{ product_id: string; items: number; with_extras: number }>) {
    extrasUso[u.product_id] = { items: Number(u.items), withExtras: Number(u.with_extras) }
  }

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
        cost: v.cost,
        sortOrder: v.sort_order,
        isActive: v.is_active,
      })),
      modifierGroupIds: (p.product_modifier_groups ?? []).map((l) => l.group_id),
      promptModifiers: p.prompt_modifiers ?? true,
      pinnedOrder: p.pinned_order ?? null,
    }
  })

  const modifierGroups: ModifierGroupOption[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    isActive: g.is_active,
    optionCount: (g.modifiers ?? []).length,
    minSelect: g.min_select,
    maxSelect: g.max_select,
    // El asistente de producto enseña las opciones al elegir una pregunta
    // existente: «Tipo de leche: Deslactosada, Vegetal +$10» dice más que el
    // puro nombre.
    options: [...(g.modifiers ?? [])]
      .filter((m) => m.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((m) => ({ name: m.name, priceDelta: m.price_delta })),
  }))

  return (
    <ProductosClient
      categories={serializedCategories}
      products={serializedProducts}
      modifierGroups={modifierGroups}
      extrasUso={extrasUso}
    />
  )
}
