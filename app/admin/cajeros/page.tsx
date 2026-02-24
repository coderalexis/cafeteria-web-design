import { createAdminClient } from "@/lib/supabase/admin"
import CajerosClient from "./cajeros-client"

export default async function CajerosPage() {
  const admin = createAdminClient()

  // Fetch all profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, username, role, created_at")
    .order("created_at", { ascending: true })

  // Get ticket counts per cashier
  const { data: ticketCounts } = await admin
    .from("tickets")
    .select("cashier_id")

  const countMap: Record<string, number> = {}
  ticketCounts?.forEach((t: any) => {
    countMap[t.cashier_id] = (countMap[t.cashier_id] || 0) + 1
  })

  const serialized = (profiles || []).map((p: any) => ({
    id: p.id as string,
    fullName: (p.full_name || "") as string,
    username: (p.username || "") as string,
    role: (p.role || "cajero") as string,
    createdAt: p.created_at as string,
    ticketCount: countMap[p.id] || 0,
  }))

  return <CajerosClient cajeros={serialized} />
}
