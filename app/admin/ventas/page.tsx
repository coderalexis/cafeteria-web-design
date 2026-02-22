import { createClient } from "@/lib/supabase/server"
import VentasClient from "./ventas-client"

export default async function VentasPage() {
  const supabase = await createClient()

  // Fetch tickets with cashier info and items
  const { data: tickets } = await supabase
    .from("tickets")
    .select(`
      id, payment_method, subtotal, total, notes, created_at,
      profiles(full_name),
      ticket_items(
        id, quantity, unit_price, line_total, notes,
        menu_variants(id, name, size_label, menu_products(name))
      )
    `)
    .order("created_at", { ascending: false })
    .limit(200)

  const serialized = (tickets || []).map((t: any) => ({
    id: t.id,
    paymentMethod: t.payment_method as string,
    subtotal: t.subtotal as number,
    total: t.total as number,
    notes: (t.notes || "") as string,
    createdAt: t.created_at as string,
    cashierName: (t.profiles as any)?.full_name || "Desconocido",
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
  }))

  return <VentasClient tickets={serialized} />
}
