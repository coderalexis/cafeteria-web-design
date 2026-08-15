import { createClient } from "@/lib/supabase/server"
import VentasClient from "./ventas-client"

export default async function VentasPage() {
  // Cliente de sesión: el RLS ya da acceso total al admin, sin service-role.
  const supabase = await createClient()

  // Fetch tickets with cashier info and items (snapshots de nombre incluidos)
  const { data: tickets } = await supabase
    .from("tickets")
    .select(`
      id, payment_method, subtotal, total, notes, created_at,
      cashier_id,
      ticket_items(
        id, quantity, unit_price, line_total, notes,
        product_name, variant_name, size_label
      )
    `)
    .order("created_at", { ascending: false })
    .limit(1000)

  // Fetch all profiles to map cashier names
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username")

  const profileMap: Record<string, { fullName: string; username: string }> = {}
  profiles?.forEach((p) => {
    profileMap[p.id] = {
      fullName: p.full_name || "",
      username: p.username || "",
    }
  })

  const serialized = (tickets ?? []).map((t) => {
    const profile = profileMap[t.cashier_id]
    return {
      id: t.id,
      paymentMethod: t.payment_method as string,
      subtotal: t.subtotal,
      total: t.total,
      notes: t.notes || "",
      createdAt: t.created_at,
      cashierName: profile?.fullName || profile?.username || "Desconocido",
      items: (t.ticket_items ?? []).map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
        notes: item.notes || "",
        productName: item.product_name,
        variantName: item.variant_name,
        sizeLabel: item.size_label || "",
      })),
    }
  })

  return <VentasClient tickets={serialized} />
}
