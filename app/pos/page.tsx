import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor, isManager } from "@/lib/context-shape"
import { parseBusinessSettings } from "@/lib/settings"
import { businessDayRange } from "@/lib/dates"
import POSClient from "./pos-client"

/* ------------------------------------------------------------------ */
/*  Server component – fetches menu from Supabase & checks user role   */
/* ------------------------------------------------------------------ */
export default async function POSPage() {
  const supabase = await createClient()

  /* ── Contexto (negocio activo + rol) ────────────────────────────── */
  const ctx = await getContext()
  if (!ctx?.business) {
    redirect(homePathFor(ctx))
  }
  const isAdmin = isManager(ctx.role)
  const businessId = ctx.business.id

  /* ── Fetch menu data ────────────────────────────────────────────── */
  const [{ data: dbCategories }, { data: dbProducts }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, slug, sort_order, color")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select(
        `id, name, description, sort_order, category_id,
         menu_categories(id, name, slug),
         menu_variants(id, name, size_label, price, sort_order, is_active),
         product_modifier_groups(
           modifier_groups(id, name, min_select, max_select, is_required, sort_order, is_active,
             modifiers(id, name, price_delta, sort_order, is_active))
         )`
      )
      .eq("is_active", true)
      .order("sort_order"),
  ])

  /* ── Transform categories ───────────────────────────────────────── */
  const categories = [
    { id: "todos", label: "Todos", color: null as string | null },
    ...(dbCategories ?? []).map((c) => ({ id: c.slug, label: c.name, color: c.color })),
  ]

  /* ── Transform products ─────────────────────────────────────────── */
  /**
   * La descripción hace dos trabajos distintos en la misma columna.
   *
   * Cuando VARIOS productos la comparten funciona como subtítulo de sección
   * («Frappé a base de leche» vs «a base de agua»), y agrupar por ella ayuda a
   * encontrar las cosas. Cuando es de UN solo producto es su descripción —los
   * ingredientes de un sándwich— y convertirla en encabezado partía la rejilla
   * en secciones de un elemento con un titular en mayúsculas de veinte
   * palabras. En Gym Coffee eso daba 22 encabezados para 10 categorías.
   *
   * La regla: un encabezado tiene que agrupar al menos dos productos. Si no,
   * es descripción y va como subtítulo de la tarjeta.
   */
  const productosPorDescripcion = new Map<string, number>()
  for (const p of dbProducts ?? []) {
    const desc = p.description?.trim()
    if (!desc) continue
    const clave = `${p.menu_categories?.slug ?? ""}|${desc}`
    productosPorDescripcion.set(clave, (productosPorDescripcion.get(clave) ?? 0) + 1)
  }

  const products = (dbProducts ?? []).map((p) => {
    const cat = p.menu_categories
    const variants = [...(p.menu_variants ?? [])]
      .filter((v) => v.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    const isFlat = variants.length === 1 && variants[0].name === "Único"
    const categorySlug = cat?.slug || ""
    const categoryName = cat?.name || ""

    // Encabezado de sección: la descripción solo si la comparten 2 o más.
    const desc = p.description?.trim()
    const esEtiquetaCompartida =
      !!desc && (productosPorDescripcion.get(`${categorySlug}|${desc}`) ?? 0) >= 2
    const subcategory = esEtiquetaCompartida ? desc! : categoryName

    // Show description on card only if it differs from category name
    const cardDescription =
      p.description && p.description !== categoryName ? p.description : undefined

    // Grupos de modificadores activos con al menos una opción activa
    const modifierGroups = (p.product_modifier_groups ?? [])
      .map((link) => link.modifier_groups)
      .filter((g): g is NonNullable<typeof g> => !!g && g.is_active)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: Math.max(g.min_select, g.is_required ? 1 : 0),
        maxSelect: g.max_select,
        sortOrder: g.sort_order,
        options: [...(g.modifiers ?? [])]
          .filter((m) => m.is_active)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((m) => ({ id: m.id, name: m.name, priceDelta: m.price_delta })),
      }))
      .filter((g) => g.options.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, options: g.options }))

    const base = {
      id: p.id,
      name: p.name,
      category: categorySlug,
      subcategory,
      description: cardDescription,
      modifierGroups: modifierGroups.length > 0 ? modifierGroups : undefined,
    }

    if (isFlat) {
      return { ...base, price: variants[0].price, variantId: variants[0].id }
    }

    return {
      ...base,
      sizes: variants.map((v) => ({
        variantId: v.id,
        label: v.name,
        oz: v.size_label || "",
        price: v.price,
      })),
    }
  })

  /* ── Today's sales (día de operación CDMX, solo completadas) + caja ── */
  const { fromIso, toIso } = businessDayRange(ctx.business.timezone)

  const [{ data: todayTickets }, { data: session }, { data: pinSet }, { data: topVariants }] = await Promise.all([
    supabase
      .from("tickets")
      .select("total")
      .eq("status", "completado")
      .gte("created_at", fromIso)
      .lt("created_at", toIso),
    supabase
      .from("cash_sessions")
      .select("id, opened_at, opening_float")
      .eq("status", "abierta")
      .maybeSingle(),
    supabase.rpc("my_pin_set"),
    // Más vendidos del último mes → fila de favoritos del POS
    supabase.rpc("top_variants", { p_days: 30, p_limit: 8 }),
  ])

  const settings = parseBusinessSettings(ctx.business.settings)

  const dbTotalSales = (todayTickets ?? []).reduce((sum, t) => sum + (t.total || 0), 0)

  return (
    <POSClient
      categories={categories}
      products={products}
      isAdmin={isAdmin}
      businessId={businessId}
      cashierId={ctx.userId}
      lockMinutes={settings.lockMinutes}
      autoPrint={settings.autoPrint}
      parkedOrders={settings.parkedOrders}
      discountMaxCashier={settings.discountMaxCashier}
      hasPin={pinSet === true}
      favoriteVariantIds={(topVariants ?? []).map((t) => t.variant_id).filter((id): id is string => !!id)}
      initialTotalSales={dbTotalSales}
      openSession={
        session
          ? { id: session.id, openedAt: session.opened_at, openingFloat: session.opening_float }
          : null
      }
    />
  )
}
