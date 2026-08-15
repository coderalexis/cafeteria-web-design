"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Crear ticket — el RPC create_ticket recalcula los precios en el    */
/*  servidor e inserta ticket + items en una sola transacción; el      */
/*  client_ref hace idempotente el reintento tras un timeout.          */
/* ------------------------------------------------------------------ */

const createTicketSchema = z.object({
  clientRef: z.string().uuid(),
  paymentMethod: z.enum(["efectivo", "transferencia", "tarjeta_clip"]),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "El ticket debe incluir al menos un artículo.")
    .max(50),
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>

interface CreateTicketData {
  ticketId: string
  folio: number
  total: number
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<ActionResult<CreateTicketData>> {
  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Datos de venta inválidos." }
  }

  const { clientRef, paymentMethod, notes, items } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_ticket", {
    p_client_ref: clientRef,
    p_payment_method: paymentMethod,
    p_items: items,
    p_notes: notes,
  })

  if (error) {
    return { error: error.message }
  }

  const ticket = data as { ticket_id: string; folio: number; total: number }

  revalidatePath("/admin", "layout")
  revalidatePath("/pos")

  return {
    success: true,
    ticketId: ticket.ticket_id,
    folio: ticket.folio,
    total: ticket.total,
  }
}

/* ------------------------------------------------------------------ */
/*  Eliminar ticket (solo admin)                                       */
/* ------------------------------------------------------------------ */

export async function deleteTicket(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID de ticket requerido." }
  }

  const { error: authError } = await requireAdmin()
  if (authError) {
    return { error: authError }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("tickets").delete().eq("id", id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/admin", "layout")
  revalidatePath("/pos")

  return { success: true }
}
