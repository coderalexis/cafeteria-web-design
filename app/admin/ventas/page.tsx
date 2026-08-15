import { createClient } from "@/lib/supabase/server"
import { TICKET_SELECT, buildProfileNameMap, serializeTicket, type TicketRow } from "@/lib/tickets"
import VentasClient from "./ventas-client"

export default async function VentasPage() {
  // Cliente de sesión: el RLS ya da acceso total al admin, sin service-role.
  const supabase = await createClient()

  const [{ data: tickets }, { data: profiles }] = await Promise.all([
    supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("profiles").select("id, full_name, username"),
  ])

  const names = buildProfileNameMap(profiles)
  const serialized = (tickets ?? []).map((t) => serializeTicket(t as TicketRow, names))

  return <VentasClient tickets={serialized} />
}
