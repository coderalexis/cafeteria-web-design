import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { cdmxDaysToUtcRange } from "@/lib/dates"
import { formatDate, formatTime, paymentLabel } from "@/lib/format"
import { TICKET_SELECT, buildProfileNameMap, serializeTicket, ticketItemLabel, type TicketRow } from "@/lib/tickets"
import { parseVentasFilters } from "../params"

/**
 * GET /admin/ventas/export?from=&to=&cajero=&pago=
 * Descarga el detalle de tickets del rango en CSV (UTF-8 con BOM para que
 * Excel muestre bien los acentos). Solo admin.
 */

const MAX_ROWS = 20_000

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: Request) {
  const { error: authError } = await requireAdmin()
  if (authError) {
    return new Response("No autorizado", { status: 401 })
  }

  const url = new URL(request.url)
  const filters = parseVentasFilters(Object.fromEntries(url.searchParams.entries()))
  const { fromIso, toIso } = cdmxDaysToUtcRange(filters.from, filters.to)

  const supabase = await createClient()

  let query = supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
  if (filters.cajero) query = query.eq("cashier_id", filters.cajero)
  if (filters.pago) query = query.eq("payment_method", filters.pago)

  const [{ data: rows, error }, { data: profiles }] = await Promise.all([
    query.order("created_at", { ascending: true }).limit(MAX_ROWS),
    supabase.from("profiles").select("id, full_name, username"),
  ])

  if (error) {
    return new Response(`Error al consultar ventas: ${error.message}`, { status: 500 })
  }

  const names = buildProfileNameMap(profiles)
  const tickets = (rows ?? []).map((r) => serializeTicket(r as TicketRow, names))

  const header = [
    "Folio",
    "Fecha",
    "Hora",
    "Cajero",
    "Método de pago",
    "Estado",
    "Subtotal",
    "Descuento",
    "Motivo descuento",
    "Total",
    "Efectivo recibido",
    "Cambio",
    "Artículos",
    "Detalle",
    "Nota",
    "Motivo cancelación",
  ]

  const lines = [header.map(csvCell).join(",")]
  for (const t of tickets) {
    lines.push(
      [
        t.folio,
        formatDate(t.createdAt),
        formatTime(t.createdAt),
        t.cashierName,
        paymentLabel(t.paymentMethod),
        t.status === "cancelado" ? "Cancelado" : "Completado",
        t.subtotal.toFixed(2),
        t.discountTotal.toFixed(2),
        t.discountReason ?? "",
        t.total.toFixed(2),
        t.cashReceived != null ? t.cashReceived.toFixed(2) : "",
        t.changeDue != null ? t.changeDue.toFixed(2) : "",
        t.items.reduce((sum, i) => sum + i.quantity, 0),
        t.items
          .map(
            (i) =>
              `${i.quantity}x ${ticketItemLabel(i)}${
                i.modifiers.length > 0 ? ` [${i.modifiers.map((m) => m.name).join(", ")}]` : ""
              }`,
          )
          .join("; "),
        t.notes,
        t.cancelReason ?? "",
      ]
        .map(csvCell)
        .join(","),
    )
  }

  const csv = String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n"
  const suffix = [filters.cajero ? "cajero" : null, filters.pago].filter(Boolean).join("_")
  const filename = `ventas_${filters.from}_${filters.to}${suffix ? `_${suffix}` : ""}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
