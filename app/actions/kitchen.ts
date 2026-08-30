"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireContext } from "@/lib/context"
import { businessDayRange } from "@/lib/dates"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Pantalla «Por preparar»: la comanda, pero en pantalla.             */
/*                                                                     */
/*  Para quien atiende solo y no tiene impresora. Se piden los datos   */
/*  de la COMANDA, no los del ticket: qué hacer y para quién, sin un   */
/*  solo precio —a quien prepara no le sirven y solo estorban—.        */
/* ------------------------------------------------------------------ */

export interface KitchenItem {
  label: string
  quantity: number
  notes: string | null
  modifiers: string[]
}

export interface KitchenOrder {
  id: string
  folio: number
  createdAt: string
  notes: string | null
  /** El ticket llevaba cargo por llevar: hay que empacarlo, no servirlo. */
  takeout: boolean
  items: KitchenItem[]
  /** Ya se marcó como hecho. Solo lo usa la consulta de «Últimos pedidos». */
  prepared?: boolean
}

interface FilaTicket {
  id: string
  folio: number
  created_at: string
  notes: string | null
  takeout_fee: number | null
  prepared_at?: string | null
  ticket_items: Array<{
    quantity: number
    product_name: string
    variant_name: string | null
    notes: string | null
    ticket_item_modifiers: Array<{ modifier_name: string }> | null
  }> | null
}

/** Lo que se pide de un ticket para verlo como comanda. */
const COMANDA_SELECT = `id, folio, created_at, notes, takeout_fee, prepared_at,
  ticket_items(quantity, product_name, variant_name, notes,
    ticket_item_modifiers(modifier_name))` as const

function aComanda(t: FilaTicket): KitchenOrder {
  return {
    id: t.id,
    folio: t.folio,
    createdAt: t.created_at,
    notes: t.notes?.trim() || null,
    takeout: (t.takeout_fee ?? 0) > 0,
    prepared: t.prepared_at != null,
    items: (t.ticket_items ?? []).map((i) => ({
      label:
        i.variant_name && i.variant_name !== "Único"
          ? `${i.product_name} (${i.variant_name})`
          : i.product_name,
      quantity: i.quantity,
      notes: i.notes?.trim() || null,
      modifiers: (i.ticket_item_modifiers ?? []).map((m) => m.modifier_name),
    })),
  }
}

/**
 * Los pedidos del día que faltan por preparar, del más viejo al más nuevo:
 * en una barra se atiende por orden de llegada, no al revés.
 *
 * Se limita al día de operación del negocio para que un pendiente olvidado de
 * ayer no aparezca mezclado con los de hoy — a esas alturas ya no se prepara,
 * se resuelve a mano.
 */
export async function getPendingOrders(): Promise<ActionResult<{ orders: KitchenOrder[] }>> {
  const { ctx, error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const supabase = await createClient()
  const { fromIso, toIso } = businessDayRange(ctx.business.timezone)

  const { data, error } = await supabase
    .from("tickets")
    .select(COMANDA_SELECT)
    .eq("status", "completado")
    .is("prepared_at", null)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: true })
    .limit(60)

  if (error) return { error: dbErrorMessage(error) }

  return { success: true, orders: ((data ?? []) as FilaTicket[]).map(aComanda) }
}

/**
 * Los últimos pedidos del día, del más nuevo al más viejo, HECHOS O NO.
 *
 * Es para consultar, no para trabajar: «¿qué acabo de preparar?», «¿el del
 * folio 7 llevaba leche de avena?». Por eso no se marca nada desde aquí — eso
 * se hace en «Por preparar», y tener dos lugares donde marcar sería tener dos
 * lugares donde equivocarse.
 *
 * Distinto de «Tickets del día», que es la vista del DINERO (totales, forma de
 * pago, reimprimir, cancelar). Esta responde qué se pidió.
 */
export async function getRecentOrders(): Promise<ActionResult<{ orders: KitchenOrder[] }>> {
  const { ctx, error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const supabase = await createClient()
  const { fromIso, toIso } = businessDayRange(ctx.business.timezone)

  const { data, error } = await supabase
    .from("tickets")
    .select(COMANDA_SELECT)
    .eq("status", "completado")
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(10)

  if (error) return { error: dbErrorMessage(error) }

  return { success: true, orders: ((data ?? []) as FilaTicket[]).map(aComanda) }
}

const marcarSchema = z.object({
  ticketId: z.string().uuid(),
  prepared: z.boolean(),
})

/**
 * Marca (o desmarca) un pedido como preparado.
 *
 * Va por RPC y no por un update directo porque las escrituras sobre tickets
 * viven en funciones: la función deriva la cafetería de quien llama, así que
 * un id de otra simplemente no encuentra fila.
 *
 * Se puede DESMARCAR a propósito: quien toca «Listo» por error necesita una
 * salida, y sin ella el pedido desaparecería de la pantalla para siempre.
 */
export async function setOrderPrepared(
  input: z.infer<typeof marcarSchema>,
): Promise<ActionResult> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const parsed = marcarSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_ticket_prepared", {
    p_ticket_id: parsed.data.ticketId,
    p_prepared: parsed.data.prepared,
  })
  if (error) return { error: dbErrorMessage(error) }

  return { success: true }
}
