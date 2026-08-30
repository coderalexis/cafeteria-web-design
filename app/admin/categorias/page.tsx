import { createClient } from "@/lib/supabase/server"
import CategoriasClient, { type CategoryRecord } from "./categorias-client"

export default async function CategoriasPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: productCounts }] = await Promise.all([
    supabase.from("menu_categories").select("id, name, sort_order, color, note").order("sort_order"),
    supabase.from("menu_products").select("category_id"),
  ])

  const countMap: Record<string, number> = {}
  for (const p of productCounts ?? []) {
    countMap[p.category_id] = (countMap[p.category_id] || 0) + 1
  }

  // El `slug` no viaja al cliente: es una llave interna que el usuario ya no
  // ve ni edita —se deriva del nombre al crear la categoría—.
  const serialized: CategoryRecord[] = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    note: c.note,
    productCount: countMap[c.id] ?? 0,
  }))

  return <CategoriasClient categories={serialized} />
}
