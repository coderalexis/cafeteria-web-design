import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { dateStringInTz, daysToUtcRange } from "@/lib/dates"
import { getMemberDirectory, memberLabel } from "@/lib/team"
import { TICKET_SELECT, buildProfileNameMap, serializeTicket, type TicketRow } from "@/lib/tickets"
import { PAGE_SIZE, parseVentasFilters, type SalesReport } from "./params"
import VentasClient from "./ventas-client"

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  const tz = ctx.business.timezone
  const today = dateStringInTz(tz)
  const filters = parseVentasFilters(await searchParams, today)
  const { fromIso, toIso } = daysToUtcRange(tz, filters.from, filters.to)
  const offset = (filters.page - 1) * PAGE_SIZE

  // Cliente de sesión: el RLS ya da acceso total al admin, sin service-role.
  const supabase = await createClient()

  // Búsqueda por folio: encuentra el ticket sin importar fecha ni filtros.
  let ticketsQuery = supabase.from("tickets").select(TICKET_SELECT, { count: "exact" })
  if (filters.folio !== null) {
    ticketsQuery = ticketsQuery.eq("folio", filters.folio)
  } else {
    ticketsQuery = ticketsQuery.gte("created_at", fromIso).lt("created_at", toIso)
    if (filters.cajero) ticketsQuery = ticketsQuery.eq("cashier_id", filters.cajero)
    if (filters.pago) ticketsQuery = ticketsQuery.eq("payment_method", filters.pago)
  }

  const [reportResult, ticketsResult, members] = await Promise.all([
    filters.folio !== null
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc("sales_report", {
          p_from: filters.from,
          p_to: filters.to,
          p_cashier: filters.cajero ?? undefined,
          p_method: filters.pago ?? undefined,
        }),
    ticketsQuery.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
    getMemberDirectory(supabase),
  ])

  const names = buildProfileNameMap(members)
  const tickets = (ticketsResult.data ?? []).map((t) => serializeTicket(t as TicketRow, names))
  const totalCount = ticketsResult.count ?? 0
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const cashiers = [...members]
    .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), "es"))
    .map((m) => ({ id: m.id, name: memberLabel(m) }))

  return (
    <VentasClient
      filters={filters}
      report={(reportResult.data as unknown as SalesReport | null) ?? null}
      reportError={reportResult.error?.message ?? ticketsResult.error?.message ?? null}
      tickets={tickets}
      totalCount={totalCount}
      pageCount={pageCount}
      cashiers={cashiers}
      today={today}
      timezone={tz}
    />
  )
}
