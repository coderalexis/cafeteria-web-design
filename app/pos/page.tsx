import { createClient } from "@/lib/supabase/server"
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
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select(
        `id, name, description, sort_order, category_id,
         menu_categories(id, name, slug),
         menu_variants(id, name, size_label, price, sort_order)`
      )
      .order("sort_order"),
  ])

  /* ── Transform categories ───────────────────────────────────────── */
  const categories = [
    { id: "todos", label: "Todos" },
    ...(dbCategories || []).map((c: any) => ({
      id: c.slug as string,
      label: c.name as string,
    })),
  ]

  /* ── Transform products ─────────────────────────────────────────── */
  const products = (dbProducts || []).map((p: any) => {
    const cat = p.menu_categories as { id: string; name: string; slug: string } | null
    const variants = [...(p.menu_variants || [])].sort(
      (a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)
    )

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
        id: p.id as string,
        name: p.name as string,
        category: categorySlug,
        subcategory,
        description: cardDescription,
        price: variants[0].price as number,
        variantId: variants[0].id as string,
      }
    }

    return {
      id: p.id as string,
      name: p.name as string,
      category: categorySlug,
      subcategory,
      description: cardDescription,
      sizes: variants.map((v: any) => ({
        variantId: v.id as string,
        label: v.name as string,
        oz: (v.size_label || "") as string,
        price: v.price as number,
      })),
    }
  })

  /* ── Fetch today's sales total ──────────────────────────────────── */
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: todayTickets } = await supabase
    .from("tickets")
    .select("total")
    .gte("created_at", todayStart.toISOString())

  const dbTotalSales = (todayTickets || []).reduce(
    (sum: number, t: any) => sum + (t.total || 0),
    0
  )

  return (
    <POSClient
      categories={categories}
      products={products}
      isAdmin={isAdmin}
      initialTotalSales={dbTotalSales}
    />
  )
}
