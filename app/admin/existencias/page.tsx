import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor, isManager } from "@/lib/context-shape"
import type { KindMovimiento } from "@/lib/existencias"
import { ExistenciasClient, type Candidato, type ItemExistencia, type Movimiento } from "./existencias-client"

export const dynamic = "force-dynamic"

/** Nombre con el que se reconoce una variante: el producto, y el tamaño solo si lo hay. */
function nombreDe(producto: string, variante: string): string {
  return variante === "Único" ? producto : `${producto} · ${variante}`
}

/**
 * Inventario por pieza (P45). Todo se lee por RLS: las dos tablas son de solo
 * lectura para el cliente y se escriben por RPC desde `app/actions/existencias.ts`.
 * Diseño en docs/inventario.md.
 */
export default async function ExistenciasPage() {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  if (!isManager(ctx.role)) redirect("/pos")

  const supabase = await createClient()
  const [{ data: filas }, { data: menu }, { data: movs }] = await Promise.all([
    supabase
      .from("stock_items")
      .select(
        `variant_id, qty, min_qty, updated_at,
         menu_variants(id, name, size_label, price, cost, is_active,
           menu_products(id, name, is_active, menu_categories(name, sort_order)))`,
      ),
    supabase
      .from("menu_products")
      .select(
        `id, name, sort_order, menu_categories(name, sort_order),
         menu_variants(id, name, size_label, is_active, sort_order)`,
      )
      .eq("is_active", true)
      .order("sort_order"),
    // El diario reciente de todo el café, para el historial por artículo. Con
    // el volumen de una cafetería (decenas de movimientos por semana) alcanza
    // de sobra; si un día no, el historial se pide por artículo.
    supabase
      .from("stock_movements")
      .select("id, seq, variant_id, kind, qty, qty_after, unit_cost, reason, created_at, tickets(folio), profiles(full_name)")
      .order("seq", { ascending: false })
      .limit(400),
  ])

  const items: ItemExistencia[] = (filas ?? [])
    .map((f) => {
      const v = f.menu_variants
      const p = v?.menu_products
      return {
        variantId: f.variant_id,
        nombre: nombreDe(p?.name ?? "(producto borrado)", v?.name ?? "Único"),
        categoria: p?.menu_categories?.name ?? "",
        categoriaOrden: p?.menu_categories?.sort_order ?? 0,
        qty: f.qty,
        minQty: f.min_qty,
        cost: Number(v?.cost ?? 0),
        price: Number(v?.price ?? 0),
        activo: (v?.is_active ?? false) && (p?.is_active ?? false),
        updatedAt: f.updated_at,
      }
    })
    .sort((a, b) => a.categoriaOrden - b.categoriaOrden || a.nombre.localeCompare(b.nombre, "es"))

  const contados = new Set(items.map((i) => i.variantId))
  const candidatos: Candidato[] = (menu ?? [])
    .flatMap((p) =>
      [...(p.menu_variants ?? [])]
        .filter((v) => v.is_active && !contados.has(v.id))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => ({
          variantId: v.id,
          nombre: nombreDe(p.name, v.name),
          categoria: p.menu_categories?.name ?? "",
          categoriaOrden: p.menu_categories?.sort_order ?? 0,
        })),
    )
    .sort((a, b) => a.categoriaOrden - b.categoriaOrden || a.nombre.localeCompare(b.nombre, "es"))

  const movimientos: Movimiento[] = (movs ?? []).map((m) => ({
    id: m.id,
    variantId: m.variant_id,
    kind: m.kind as KindMovimiento,
    qty: m.qty,
    qtyAfter: m.qty_after,
    unitCost: m.unit_cost == null ? null : Number(m.unit_cost),
    reason: m.reason,
    folio: m.tickets?.folio ?? null,
    actor: m.profiles?.full_name ?? null,
    at: m.created_at,
  }))

  return (
    <ExistenciasClient
      items={items}
      candidatos={candidatos}
      movimientos={movimientos}
      timezone={ctx.business.timezone}
    />
  )
}
