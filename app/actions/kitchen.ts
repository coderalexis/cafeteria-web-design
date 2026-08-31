"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireContext } from "@/lib/context"
import { businessDayRange } from "@/lib/dates"
import { dbErrorMessage } from "@/lib/db-errors"
import { lineKey } from "@/app/pos/parked"
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
  /**
   * Cuenta abierta sin cobrar: se identifica por su nombre, no por folio —
   * todavía no existe la venta. En una cafetería con mesas es LO NORMAL que
   * la barra prepare esto y no un ticket.
   */
  accountName?: string
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

  const [tickets, cuentas] = await Promise.all([
    supabase
      .from("tickets")
      .select(COMANDA_SELECT)
      .eq("status", "completado")
      .is("prepared_at", null)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(60),
    cuentasPorPreparar(supabase),
  ])

  if (tickets.error) return { error: dbErrorMessage(tickets.error) }

  // Mezcladas y por orden de llegada: en la barra se atiende en el orden en
  // que se pidió, sin importar si ya se cobró o no.
  const orders = [...((tickets.data ?? []) as FilaTicket[]).map(aComanda), ...cuentas].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  return { success: true, orders }
}

/* ------------------------------------------------------------------ */
/*  Cuentas abiertas: lo que la barra debe hacer y todavía no se cobra */
/* ------------------------------------------------------------------ */

interface LineaCarrito {
  lineId?: string
  productId?: string
  sizeLabel?: string | null
  quantity?: number
  notes?: string | null
  modifierIds?: string[]
}

/**
 * Lo PENDIENTE de cada cuenta abierta, ya restando lo que se preparó antes.
 *
 * Una cuenta acumula rondas, así que mostrarla entera haría que la barra
 * vuelva a preparar lo servido. `prepared_lines` guarda cuánto se hizo de
 * cada renglón y aquí solo sale la diferencia.
 *
 * Los nombres se arman contra el menú de HOY (igual que el POS). Si un
 * producto salió del menú, ese renglón se omite: no se puede preparar algo
 * que ya no existe, y la cuenta lo señala aparte cuando se va a cobrar.
 */
async function cuentasPorPreparar(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<KitchenOrder[]> {
  const { data } = await supabase
    .from("parked_orders")
    .select("id, name, cart, created_at, updated_at, prepared_lines, owed_since")
    .is("owed_since", null) // un fiado ya se sirvió y se fue; no hay nada que hacer
    .order("created_at", { ascending: true })
    .limit(30)

  if (!data || data.length === 0) return []

  const [{ data: variantes }, { data: mods }] = await Promise.all([
    supabase.from("menu_variants").select("product_id, name, price, menu_products(name)").eq("is_active", true),
    supabase.from("modifiers").select("id, name").eq("is_active", true),
  ])

  // Llave producto|tamaño → etiqueta, igual que la arma el POS.
  const etiqueta = new Map<string, string>()
  const unico = new Map<string, string>()
  for (const v of variantes ?? []) {
    const prod = (v.menu_products as { name: string } | null)?.name
    if (!prod) continue
    const label = v.name && v.name !== "Único" ? `${prod} (${v.name})` : prod
    etiqueta.set(`${v.product_id}|${v.name}`, label)
    unico.set(v.product_id, unico.has(v.product_id) ? "" : label)
  }
  const nombreMod = new Map((mods ?? []).map((m) => [m.id, m.name]))

  const out: KitchenOrder[] = []
  for (const c of data) {
    const foto = (c.prepared_lines ?? {}) as Record<string, number>
    const lineas = ((c.cart as { lines?: LineaCarrito[] } | null)?.lines ?? []) as LineaCarrito[]
    const items: KitchenItem[] = []

    for (const l of lineas) {
      const pendiente = Math.max(0, (Number(l.quantity) || 0) - (Number(foto[lineKey(l)]) || 0))
      if (pendiente <= 0) continue
      const label = l.sizeLabel
        ? etiqueta.get(`${l.productId}|${l.sizeLabel}`)
        : unico.get(l.productId ?? "") || undefined
      if (!label) continue // salió del menú: no se puede preparar
      items.push({
        label,
        quantity: pendiente,
        notes: l.notes?.trim() || null,
        modifiers: (l.modifierIds ?? []).map((id) => nombreMod.get(id)).filter((n): n is string => !!n),
      })
    }

    if (items.length === 0) continue // nada nuevo que hacer
    out.push({
      id: c.id,
      folio: 0,
      accountName: c.name,
      // La hora de la ÚLTIMA ronda, no la de apertura: en la barra lo que
      // importa es cuándo llegó el pedido que falta, no cuándo llegó la mesa.
      createdAt: c.updated_at ?? c.created_at,
      notes: null,
      takeout: false,
      items,
    })
  }
  return out
}

const cuentaPreparadaSchema = z.object({ id: z.string().uuid() })

/**
 * Marca como hecho lo que hoy está pendiente de una cuenta.
 *
 * Guarda la foto de las cantidades ACTUALES: la ronda que llegue después
 * saldrá sola como pendiente, sin volver a pedir lo ya servido.
 */
export async function setAccountPrepared(input: z.infer<typeof cuentaPreparadaSchema>): Promise<ActionResult> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }
  const parsed = cuentaPreparadaSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }

  const supabase = await createClient()
  const { data: fila } = await supabase
    .from("parked_orders")
    .select("cart")
    .eq("id", parsed.data.id)
    .maybeSingle()
  if (!fila) return { error: "Esa cuenta ya no existe." }

  // La foto va por CONTENIDO y no por `lineId`: ese identificador se
  // regenera al abrir la cuenta en el carrito, asi que una foto guardada con
  // el quedaba apuntando a renglones inexistentes y TODO volvia a salir como
  // pendiente en la ronda siguiente. Fue justo el fallo que se reporto.
  const foto: Record<string, number> = {}
  for (const l of ((fila.cart as { lines?: LineaCarrito[] } | null)?.lines ?? []) as LineaCarrito[]) {
    foto[lineKey(l)] = (foto[lineKey(l)] ?? 0) + (Number(l.quantity) || 0)
  }

  // NO se toca `updated_at`: es el sello del candado entre aparatos, y
  // moverlo aquí haría que a quien tenga la cuenta abierta le rebotara su
  // ronda como si otro la hubiera cambiado.
  const { error } = await supabase
    .from("parked_orders")
    .update({ prepared_lines: foto })
    .eq("id", parsed.data.id)

  if (error) return { error: dbErrorMessage(error) }
  return { success: true }
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
