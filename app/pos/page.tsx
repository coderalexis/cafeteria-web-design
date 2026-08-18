import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor, isManager } from "@/lib/context-shape"
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
      .select("id, name, slug, sort_order")
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
    { id: "todos", label: "Todos" },
    ...(dbCategories ?? []).map((c) => ({ id: c.slug, label: c.name })),
  ]

  /* ── Transform products ─────────────────────────────────────────── */
  const products = (dbProducts ?? []).map((p) => {
    const cat = p.menu_categories
    const variants = [...(p.menu_variants ?? [])]
      .filter((v) => v.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    const isFlat = variants.length === 1 && variants[0].name === "Único"
    const categorySlug = cat?.slug || ""
    const categoryName = cat?.name || ""

    // Use description as subcategory grouping label
    const subcategory = p.description || categoryName

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
  const { fromIso, toIso } = businessDayRange()

  const [{ data: todayTickets }, { data: session }] = await Promise.all([
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
  ])

  const dbTotalSales = (todayTickets ?? []).reduce((sum, t) => sum + (t.total || 0), 0)

  return (
    <POSClient
      categories={categories}
      products={products}
      isAdmin={isAdmin}
      businessId={businessId}
      cashierId={ctx.userId}
      initialTotalSales={dbTotalSales}
      openSession={
        session
          ? { id: session.id, openedAt: session.opened_at, openingFloat: session.opening_float }
          : null
      }
    />
  )
}
