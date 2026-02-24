import { createAdminClient } from "@/lib/supabase/admin"
import VentasClient from "./ventas-client"

export default async function VentasPage() {
  // Use admin client to bypass RLS and reliably read profiles
  const admin = createAdminClient()

  // Fetch tickets with cashier info and items
  const { data: tickets } = await admin
    .from("tickets")
    .select(`
      id, payment_method, subtotal, total, notes, created_at,
      cashier_id,
      ticket_items(
        id, quantity, unit_price, line_total, notes,
        menu_variants(id, name, size_label, menu_products(name))
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200)

  // Fetch all profiles to map cashier names
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, username")

  const profileMap: Record<string, { fullName: string; username: string }> = {}
  profiles?.forEach((p: any) => {
    profileMap[p.id] = {
      fullName: p.full_name || "",
      username: p.username || "",
    }
  })

  const serialized = (tickets || []).map((t: any) => {
    const profile = profileMap[t.cashier_id]
    return {
      id: t.id,
      paymentMethod: t.payment_method as string,
      subtotal: t.subtotal as number,
      total: t.total as number,
      notes: (t.notes || "") as string,
      createdAt: t.created_at as string,
      cashierName: profile?.fullName || profile?.username || "Desconocido",
      items: (t.ticket_items || []).map((item: any) => {
        const variant = item.menu_variants as any
        const product = variant?.menu_products as any
        return {
          id: item.id as string,
          quantity: item.quantity as number,
          unitPrice: item.unit_price as number,
          lineTotal: item.line_total as number,
          notes: (item.notes || "") as string,
          productName: product?.name || "Producto eliminado",
          variantName: variant?.name || "",
          sizeLabel: variant?.size_label || "",
        }
      }),
    }
  })

  return <VentasClient tickets={serialized} />
}
