"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { checkExpectedBusiness, requireContext } from "@/lib/context"
import { businessDayRange } from "@/lib/dates"
import { getMemberDirectory } from "@/lib/team"
import {
  TICKET_SELECT,
  buildProfileNameMap,
  serializeTicket,
  type TicketRecord,
  type TicketRow,
} from "@/lib/tickets"
import type { ActionResult } from "./types"

function revalidateSales() {
  revalidatePath("/admin", "layout")
  revalidatePath("/pos")
}

/* ------------------------------------------------------------------ */
/*  Crear ticket — el RPC create_ticket recalcula los precios en el    */
/*  servidor, exige caja abierta e inserta ticket + items en una sola  */
/*  transacción; el client_ref hace idempotente el reintento.          */
/* ------------------------------------------------------------------ */

const discountSchema = z.object({
  type: z.enum(["percent", "amount"]),
  value: z.number().finite().positive().max(9_999_999),
  reason: z.string().trim().min(3, "Indica el motivo del descuento.").max(200),
})

export type TicketDiscountInput = z.infer<typeof discountSchema>

const createTicketSchema = z.object({
  clientRef: z.string().uuid(),
  /** Negocio con el que la UI cree estar operando (guardia multi-pestaña). */
  expectedBusinessId: z.string().uuid().optional(),
  paymentMethod: z.enum(["efectivo", "transferencia", "tarjeta_clip"]),
  notes: z.string().trim().max(500).optional(),
  cashReceived: z.number().finite().nonnegative().max(9_999_999).optional(),
  /** Propina: se cobra encima del total y no cuenta como venta. */
  tip: z.number().finite().nonnegative().max(99_999).optional(),
  discount: discountSchema.optional(),
  /** Cliente de la tarjeta de sellos adjunto a esta venta (opcional). */
  loyaltyCustomerId: z.string().uuid().optional(),
  /** Canjear el premio en esta venta (el RPC valida saldo, monto y motivo). */
  loyaltyRedeem: z.boolean().optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(200).optional(),
        modifiers: z.array(z.string().uuid()).max(20).optional(),
      }),
    )
    .min(1, "El ticket debe incluir al menos un artículo.")
    .max(50),
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>

interface CreateTicketData {
  ticketId: string
  folio: number
  subtotal: number
  discountTotal: number
  total: number
  tip: number
  cashReceived: number | null
  changeDue: number | null
  /** Estado de la tarjeta tras la venta (solo si se adjuntó cliente). */
  loyalty: { stamps: number; target: number; redeemed: boolean; name: string; phone: string } | null
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<ActionResult<CreateTicketData>> {
  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos de venta inválidos." }
  }

  const { clientRef, expectedBusinessId, paymentMethod, notes, items, cashReceived, tip, discount, loyaltyCustomerId, loyaltyRedeem } = parsed.data

  const businessError = await checkExpectedBusiness(expectedBusinessId)
  if (businessError) {
    return { error: businessError }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_ticket", {
    p_client_ref: clientRef,
    p_payment_method: paymentMethod,
    p_items: items,
    p_notes: notes,
    p_cash_received: paymentMethod === "efectivo" ? cashReceived : undefined,
    p_discount: discount,
    p_tip: tip,
    p_loyalty_customer: loyaltyCustomerId,
    p_loyalty_redeem: loyaltyRedeem,
  })

  if (error) {
    return { error: error.message }
  }

  const ticket = data as {
    ticket_id: string
    folio: number
    subtotal: number
    discount_total: number
    total: number
    tip_amount: number | null
    cash_received: number | null
    change_due: number | null
    loyalty: { stamps: number; target: number; redeemed: boolean; name: string; phone: string } | null
  }

  revalidateSales()

  return {
    success: true,
    ticketId: ticket.ticket_id,
    folio: ticket.folio,
    subtotal: ticket.subtotal,
    discountTotal: ticket.discount_total ?? 0,
    total: ticket.total,
    tip: ticket.tip_amount ?? 0,
    cashReceived: ticket.cash_received ?? null,
    changeDue: ticket.change_due ?? null,
    loyalty: ticket.loyalty ?? null,
  }
}

/* ------------------------------------------------------------------ */
/*  Cancelar ticket (con motivo). Las reglas de quién puede cancelar   */
/*  qué viven en el RPC cancel_ticket.                                 */
/* ------------------------------------------------------------------ */

const cancelSchema = z.object({
  ticketId: z.string().uuid(),
  reason: z.string().trim().min(3, "Indica el motivo.").max(300),
})

export async function cancelTicket(
  input: z.infer<typeof cancelSchema>,
): Promise<ActionResult<{ folio: number }>> {
  const parsed = cancelSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("cancel_ticket", {
    p_ticket_id: parsed.data.ticketId,
    p_reason: parsed.data.reason,
  })

  if (error) {
    return { error: error.message }
  }

  revalidateSales()
  return { success: true, folio: (data as { folio: number }).folio }
}

/* ------------------------------------------------------------------ */
/*  Tickets del día de operación (RLS: cajero ve los suyos, admin todos) */
/* ------------------------------------------------------------------ */

export async function getTodayTickets(): Promise<ActionResult<{ tickets: TicketRecord[] }>> {
  const { ctx, error: ctxError } = await requireContext()
  if (ctxError !== null) {
    return { error: ctxError }
  }
  const supabase = await createClient()
  const { fromIso, toIso } = businessDayRange(ctx.business.timezone)

  const { data: rows, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    return { error: error.message }
  }

  // Nombres de quien vendió/canceló: directorio del negocio activo
  const names = buildProfileNameMap(await getMemberDirectory(supabase))
  const tickets = (rows ?? []).map((r) => serializeTicket(r as TicketRow, names))

  return { success: true, tickets }
}
