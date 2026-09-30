import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor, isManager } from "@/lib/context-shape"
import { esUnidad, type Unidad } from "@/lib/existencias"
import { ExistenciasClient, type Candidato, type Fila } from "./existencias-client"

export const dynamic = "force-dynamic"

/** Nombre con el que se reconoce una variante: el producto, y el tamaño solo si lo hay. */
function nombreDe(producto: string, variante: string): string {
  return variante === "Único" ? producto : `${producto} · ${variante}`
}

/**
 * Existencias (P45): lo que cada café cuenta, de las dos clases — insumos que
 * se compran para preparar y artículos del menú que se revenden. Todo se lee
 * por RLS: las tablas son de solo lectura para el cliente y se escriben por
 * RPC desde `app/actions/existencias.ts`. Diseño en docs/inventario.md.
 */
export default async function ExistenciasPage() {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  if (!isManager(ctx.role)) redirect("/pos")

  const supabase = await createClient()
  // El historial NO se trae aquí: se pide por artículo al abrirlo
  // (`historialDe`), que es cuando de verdad hace falta.
  const [{ data: filas }, { data: menu }] = await Promise.all([
    supabase
      .from("stock_items")
      .select(
        `id, variant_id, supply_id, qty, min_qty,
         supplies(id, name, unit),
         menu_variants(id, name, price, cost, is_active,
           menu_products(id, name, is_active, menu_categories(name, sort_order)))`,
      )
      .eq("tracked", true),
    supabase
      .from("menu_products")
      .select(
        `id, name, sort_order, menu_categories(name, sort_order),
         menu_variants(id, name, is_active, sort_order)`,
      )
      .eq("is_active", true)
      .order("sort_order"),
  ])

  const items: Fila[] = (filas ?? [])
    .map((f): Fila => {
      const s = f.supplies
      const v = f.menu_variants
      const p = v?.menu_products
      const esInsumo = !!f.supply_id
      return {
        itemId: f.id,
        variantId: f.variant_id,
        supplyId: f.supply_id,
        esInsumo,
        nombre: esInsumo ? (s?.name ?? "(insumo borrado)") : nombreDe(p?.name ?? "(producto borrado)", v?.name ?? "Único"),
        unidad: esInsumo && s && esUnidad(s.unit) ? (s.unit as Unidad) : "pieza",
        categoria: esInsumo ? "" : (p?.menu_categories?.name ?? ""),
        categoriaOrden: esInsumo ? 0 : (p?.menu_categories?.sort_order ?? 0),
        qty: Number(f.qty),
        minQty: Number(f.min_qty),
        cost: Number(v?.cost ?? 0),
        // Un insumo nunca sale del menú; una variante sí puede desactivarse.
        activo: esInsumo || ((v?.is_active ?? false) && (p?.is_active ?? false)),
      }
    })
    .sort((a, b) => a.categoriaOrden - b.categoriaOrden || a.nombre.localeCompare(b.nombre, "es"))

  const contados = new Set(items.map((i) => i.variantId).filter(Boolean))
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

  return <ExistenciasClient items={items} candidatos={candidatos} timezone={ctx.business.timezone} />
}
