import { createClient } from "@/lib/supabase/server"
import ModificadoresClient, { type ModifierGroupRecord } from "./modificadores-client"

export default async function ModificadoresPage() {
  const supabase = await createClient()

  const [{ data: groups }, { data: links }] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("id, name, min_select, max_select, is_required, sort_order, is_active, modifiers(id, name, price_delta, sort_order, is_active)")
      .order("sort_order")
      .order("name"),
    supabase
      .from("product_modifier_groups")
      .select("group_id, menu_products(id, name)")
      .order("group_id"),
  ])

  const productsByGroup: Record<string, Array<{ id: string; name: string }>> = {}
  for (const link of links ?? []) {
    const p = link.menu_products
    if (!p) continue
    ;(productsByGroup[link.group_id] ??= []).push({ id: p.id, name: p.name })
  }

  const serialized: ModifierGroupRecord[] = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.min_select,
    maxSelect: g.max_select,
    isRequired: g.is_required,
    isActive: g.is_active,
    options: [...(g.modifiers ?? [])]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name))
      .map((m) => ({ id: m.id, name: m.name, priceDelta: m.price_delta, isActive: m.is_active })),
    products: (productsByGroup[g.id] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))

  return <ModificadoresClient groups={serialized} />
}
