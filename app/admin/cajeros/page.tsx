import { createClient } from "@/lib/supabase/server"
import CajerosClient from "./cajeros-client"

export default async function CajerosPage() {
  // Cliente de sesión: el RLS ya da acceso total al admin, sin service-role.
  const supabase = await createClient()

  // Fetch all profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, created_at")
    .order("created_at", { ascending: true })

  // Get ticket counts per cashier
  const { data: ticketCounts } = await supabase
    .from("tickets")
    .select("cashier_id")

  const countMap: Record<string, number> = {}
  ticketCounts?.forEach((t) => {
    countMap[t.cashier_id] = (countMap[t.cashier_id] || 0) + 1
  })

  const serialized = (profiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name || "",
    username: p.username || "",
    role: p.role as string,
    createdAt: p.created_at,
    ticketCount: countMap[p.id] || 0,
  }))

  return <CajerosClient cajeros={serialized} />
}
