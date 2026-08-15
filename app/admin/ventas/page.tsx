import { createClient } from "@/lib/supabase/server"
import { cdmxDaysToUtcRange } from "@/lib/dates"
import { TICKET_SELECT, buildProfileNameMap, serializeTicket, type TicketRow } from "@/lib/tickets"
import { PAGE_SIZE, parseVentasFilters, type SalesReport } from "./params"
import VentasClient from "./ventas-client"

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseVentasFilters(await searchParams)
  const { fromIso, toIso } = cdmxDaysToUtcRange(filters.from, filters.to)
  const offset = (filters.page - 1) * PAGE_SIZE

  // Cliente de sesión: el RLS ya da acceso total al admin, sin service-role.
  const supabase = await createClient()

  let ticketsQuery = supabase
    .from("tickets")
    .select(TICKET_SELECT, { count: "exact" })
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
  if (filters.cajero) ticketsQuery = ticketsQuery.eq("cashier_id", filters.cajero)
  if (filters.pago) ticketsQuery = ticketsQuery.eq("payment_method", filters.pago)

  const [reportResult, ticketsResult, profilesResult] = await Promise.all([
    supabase.rpc("sales_report", {
      p_from: filters.from,
      p_to: filters.to,
      p_cashier: filters.cajero ?? undefined,
      p_method: filters.pago ?? undefined,
    }),
    ticketsQuery.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
    supabase.from("profiles").select("id, full_name, username").order("full_name"),
  ])

  const names = buildProfileNameMap(profilesResult.data)
  const tickets = (ticketsResult.data ?? []).map((t) => serializeTicket(t as TicketRow, names))
  const totalCount = ticketsResult.count ?? 0
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const cashiers = (profilesResult.data ?? []).map((p) => ({ id: p.id, name: names[p.id] }))

  return (
    <VentasClient
      filters={filters}
      report={(reportResult.data as unknown as SalesReport | null) ?? null}
      reportError={reportResult.error?.message ?? ticketsResult.error?.message ?? null}
      tickets={tickets}
      totalCount={totalCount}
      pageCount={pageCount}
      cashiers={cashiers}
    />
  )
}
