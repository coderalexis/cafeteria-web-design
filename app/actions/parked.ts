"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireContext } from "@/lib/context"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Pedidos en espera (cuentas abiertas), compartidos entre aparatos.  */
/*                                                                     */
/*  Antes vivían en el navegador de cada dispositivo. Un pedido en     */
/*  espera NO es una venta —nada llega a `tickets` hasta cobrar— pero  */
/*  eso no significaba que no debiera estar en la base: le faltaba     */
/*  tabla propia. Guardado en el navegador se perdía al borrar datos.  */
/* ------------------------------------------------------------------ */

/** Más viejo que esto y ya no es un pedido esperando, es basura del día pasado. */
const CADUCIDAD_HORAS = 12

export interface ParkedRecord {
  id: string
  name: string
  savedAt: number
  /** El carrito serializado, tal como lo guardó el POS. */
  cart: unknown
}

/**
 * Los pedidos en espera de la cafetería activa, del más viejo al más nuevo.
 *
 * De paso borra los caducados: son de un día anterior y ya nadie los va a
 * cobrar. Se hace aquí y no en un proceso aparte porque es barato y así la
 * limpieza ocurre justo cuando alguien mira la lista.
 */
export async function listParked(): Promise<ActionResult<{ orders: ParkedRecord[] }>> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const supabase = await createClient()
  const limite = new Date(Date.now() - CADUCIDAD_HORAS * 3600_000).toISOString()

  // Sin `await`: que la limpieza no retrase la lista. Si falla, no pasa nada
  // —el filtro de abajo igual los esconde— y se reintenta a la siguiente.
  void supabase.from("parked_orders").delete().lt("created_at", limite)

  const { data, error } = await supabase
    .from("parked_orders")
    .select("id, name, cart, created_at")
    .gte("created_at", limite)
    .order("created_at", { ascending: true })
    .limit(50)

  if (error) return { error: dbErrorMessage(error) }

  const orders: ParkedRecord[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    savedAt: new Date(r.created_at).getTime(),
    cart: r.cart,
  }))
  return { success: true, orders }
}

const guardarSchema = z.object({
  name: z.string().trim().max(40),
  cart: z.unknown(),
})

/** Guarda el carrito actual como pedido en espera. Devuelve el id que le tocó. */
export async function parkOrder(
  input: z.infer<typeof guardarSchema>,
): Promise<ActionResult<{ id: string; savedAt: number }>> {
  const { ctx, error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const parsed = guardarSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("parked_orders")
    .insert({
      name: parsed.data.name,
      cart: parsed.data.cart as never,
      created_by: ctx.userId,
    })
    .select("id, created_at")
    .single()

  if (error) return { error: dbErrorMessage(error) }
  return { success: true, id: data.id, savedAt: new Date(data.created_at).getTime() }
}

/** Quita un pedido de la bandeja (se retomó o se descartó). */
export async function removeParked(id: string): Promise<ActionResult> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }
  if (!z.string().uuid().safeParse(id).success) return { error: "Datos inválidos." }

  const supabase = await createClient()
  // RLS se encarga de que solo borre de su cafetería: un id ajeno no encuentra
  // fila y el borrado simplemente no afecta nada.
  const { error } = await supabase.from("parked_orders").delete().eq("id", id)
  if (error) return { error: dbErrorMessage(error) }
  return { success: true }
}
