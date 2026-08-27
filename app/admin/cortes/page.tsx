import { createClient } from "@/lib/supabase/server"
import { getMemberDirectory } from "@/lib/team"
import { buildProfileNameMap } from "@/lib/tickets"
import CortesClient, { type CashSessionRecord } from "./cortes-client"

export default async function CortesPage() {
  const supabase = await createClient()

  const [{ data: sessions }, members] = await Promise.all([
    supabase
      .from("cash_sessions")
      .select(
        "id, status, opened_by, opened_at, opening_float, opening_notes, closed_by, closed_at, expected_cash, counted_cash, difference, closing_notes, auto_closed",
      )
      .order("opened_at", { ascending: false })
      .limit(200),
    getMemberDirectory(supabase),
  ])

  const names = buildProfileNameMap(members)

  // Entradas/salidas de efectivo por sesión (solo las sesiones listadas)
  const sessionIds = (sessions ?? []).map((s) => s.id)
  const { data: movements } = sessionIds.length
    ? await supabase.from("cash_movements").select("session_id, kind, amount").in("session_id", sessionIds)
    : { data: [] }
  const movementTotals: Record<string, { in: number; out: number }> = {}
  for (const m of movements ?? []) {
    const t = (movementTotals[m.session_id] ??= { in: 0, out: 0 })
    if (m.kind === "entrada") t.in += m.amount
    else t.out += m.amount
  }

  // Propinas por turno. Solo los tickets que llevan propina (la mayoría no),
  // así la consulta sigue siendo chica aunque el historial sea largo.
  const { data: tipRows } = sessionIds.length
    ? await supabase
        .from("tickets")
        .select("session_id, tip_amount, payment_method")
        .in("session_id", sessionIds)
        .eq("status", "completado")
        .gt("tip_amount", 0)
    : { data: [] }
  const tipTotals: Record<string, { total: number; cash: number }> = {}
  for (const t of tipRows ?? []) {
    const acc = (tipTotals[t.session_id] ??= { total: 0, cash: 0 })
    acc.total += t.tip_amount
    if (t.payment_method === "efectivo") acc.cash += t.tip_amount
  }

  const serialized: CashSessionRecord[] = (sessions ?? []).map((s) => ({
    movementsIn: movementTotals[s.id]?.in ?? 0,
    movementsOut: movementTotals[s.id]?.out ?? 0,
    tipsTotal: tipTotals[s.id]?.total ?? 0,
    tipsCash: tipTotals[s.id]?.cash ?? 0,
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
    autoClosed: s.auto_closed === true,
  }))

  return <CortesClient sessions={serialized} />
}
