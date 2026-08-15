import { createClient } from "@/lib/supabase/server"
import { buildProfileNameMap } from "@/lib/tickets"
import CortesClient, { type CashSessionRecord } from "./cortes-client"

export default async function CortesPage() {
  const supabase = await createClient()

  const [{ data: sessions }, { data: profiles }] = await Promise.all([
    supabase
      .from("cash_sessions")
      .select(
        "id, status, opened_by, opened_at, opening_float, opening_notes, closed_by, closed_at, expected_cash, counted_cash, difference, closing_notes",
      )
      .order("opened_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name, username"),
  ])

  const names = buildProfileNameMap(profiles)

  const serialized: CashSessionRecord[] = (sessions ?? []).map((s) => ({
    id: s.id,
    status: s.status === "abierta" ? "abierta" : "cerrada",
    openedAt: s.opened_at,
    openedByName: names[s.opened_by] ?? "Desconocido",
    openingFloat: s.opening_float,
    openingNotes: s.opening_notes,
    closedAt: s.closed_at,
    closedByName: s.closed_by ? (names[s.closed_by] ?? "Desconocido") : null,
    expectedCash: s.expected_cash,
    countedCash: s.counted_cash,
    difference: s.difference,
    closingNotes: s.closing_notes,
  }))

  return <CortesClient sessions={serialized} />
}
