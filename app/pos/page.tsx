import { createClient } from "@/lib/supabase/server"
import { businessDayRange } from "@/lib/dates"
import POSClient from "./pos-client"

/* ------------------------------------------------------------------ */
/*  Server component – fetches menu from Supabase & checks user role   */
/* ------------------------------------------------------------------ */
export default async function POSPage() {
  const supabase = await createClient()

  /* ── Auth & role ────────────────────────────────────────────────── */
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()
    isAdmin = profile?.role === "admin"
  }

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
         menu_variants(id, name, size_label, price, sort_order, is_active)`
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

    if (isFlat) {
      return {
        id: p.id,
        name: p.name,
        category: categorySlug,
        subcategory,
        description: cardDescription,
        price: variants[0].price,
        variantId: variants[0].id,
      }
    }

    return {
      id: p.id,
      name: p.name,
      category: categorySlug,
      subcategory,
      description: cardDescription,
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
      initialTotalSales={dbTotalSales}
      openSession={
        session
          ? { id: session.id, openedAt: session.opened_at, openingFloat: session.opening_float }
          : null
      }
    />
  )
}
