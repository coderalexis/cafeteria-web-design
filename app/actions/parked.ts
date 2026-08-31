"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireContext, requireRole } from "@/lib/context"
import { logAudit } from "@/lib/audit"
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

/**
 * Cuánto sobrevive una cuenta sin cobrar.
 *
 * Eran 12 h, pensando en «basura del día anterior». Estaba mal: en la
 * cafetería del gym alguien pide un café el viernes en la noche, se va a
 * entrenar, y vuelve a pagar el lunes o el martes. Con 12 h su cuenta se
 * borraba sola —y en silencio— antes de que regresara: el café servido y sin
 * cobrar, sin rastro de que alguien debía.
 *
 * Una semana cubre ese caso con holgura. Antes de que se cumpla, la lista y
 * el corte la señalan por su edad (ver `waitingLabel`).
 *
 * NO aplica al fiado: una cuenta marcada como «se fue sin pagar» no caduca
 * nunca. Ahí la deuda es el dato, y borrarla sola sería exactamente el error
 * que este plazo vino a arreglar, solo que más caro.
 */
const CADUCIDAD_HORAS = 7 * 24

export interface ParkedRecord {
  id: string
  name: string
  /** Cuándo se ABRIÓ la cuenta. No se mueve al agregar rondas. */
  savedAt: number
  /** El carrito serializado, tal como lo guardó el POS. */
  cart: unknown
  /**
   * Sello de la última vez que se guardó. Se devuelve tal cual llega y se
   * manda de vuelta al guardar: si no coincide, alguien más movió la cuenta
   * desde otro aparato. Ver `updateParked`.
   */
  updatedAt: string
  /**
   * Desde cuándo se debe. Nulo = cuenta abierta del día; con fecha = fiado:
   * la persona se fue sin pagar y esto ya no estorba la lista del día.
   */
  owedSince: number | null
  /** Teléfono o nota para poder cobrarle. */
  owedContact: string | null
}

/**
 * Los pedidos en espera de la cafetería activa, del más viejo al más nuevo.
 *
 * De paso borra las caducadas (más de una semana). Se hace aquí y no en un
 * proceso aparte porque es barato y así la limpieza ocurre justo cuando
 * alguien mira la lista.
 */
export async function listParked(): Promise<ActionResult<{ orders: ParkedRecord[] }>> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const supabase = await createClient()
  const limite = new Date(Date.now() - CADUCIDAD_HORAS * 3600_000).toISOString()

  // Sin `await`: que la limpieza no retrase la lista. Si falla, no pasa nada
  // —el filtro de abajo igual los esconde— y se reintenta a la siguiente.
  void supabase.from("parked_orders").delete().lt("created_at", limite).is("owed_since", null)

  const { data, error } = await supabase
    .from("parked_orders")
    .select("id, name, cart, created_at, updated_at, owed_since, owed_contact")
    // El fiado se salva de la caducidad: `or` mantiene las recientes Y todas
    // las que alguien debe, sin importar de cuándo sean.
    .or(`created_at.gte.${limite},owed_since.not.is.null`)
    .order("created_at", { ascending: true })
    .limit(50)

  if (error) return { error: dbErrorMessage(error) }

  const orders: ParkedRecord[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    savedAt: new Date(r.created_at).getTime(),
    cart: r.cart,
    updatedAt: r.updated_at,
    owedSince: r.owed_since ? new Date(r.owed_since).getTime() : null,
    owedContact: r.owed_contact,
  }))
  return { success: true, orders }
}

const guardarSchema = z.object({
  name: z.string().trim().max(40),
  cart: z.unknown(),
})

/** Abre una cuenta con el carrito actual. Devuelve el id que le tocó. */
export async function parkOrder(
  input: z.infer<typeof guardarSchema>,
): Promise<ActionResult<{ id: string; savedAt: number; updatedAt: string }>> {
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
    .select("id, created_at, updated_at")
    .single()

  if (error) return { error: dbErrorMessage(error) }
  return {
    success: true,
    id: data.id,
    savedAt: new Date(data.created_at).getTime(),
    updatedAt: data.updated_at,
  }
}

const actualizarSchema = z.object({
  id: z.string().uuid(),
  cart: z.unknown(),
  /** El sello que traía la cuenta cuando se abrió en este aparato. */
  expectedUpdatedAt: z.string(),
})

/**
 * Guarda una ronda nueva EN LA MISMA cuenta.
 *
 * Es lo que le da identidad: `created_at` no se toca, así que «abierta hace
 * 40 min» sigue contando desde que llegó la mesa, y el nombre no hay que
 * volver a escribirlo en cada ronda.
 *
 * El `where` incluye el sello de la última escritura, así que si otro aparato
 * guardó algo mientras tanto la actualización NO pisa nada: afecta 0 filas y
 * se devuelve `saved: false`. Sin esto, dos personas atendiendo la misma mesa
 * se borrarían la ronda una a la otra sin que nadie se enterara — y una ronda
 * perdida es comida servida que nunca se cobra.
 */
export async function updateParked(
  input: z.infer<typeof actualizarSchema>,
): Promise<ActionResult<{ saved: boolean; updatedAt: string | null }>> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const parsed = actualizarSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }

  const supabase = await createClient()
  // `updated_at` tiene default solo al insertar: en un update hay que moverlo
  // a mano o el sello se quedaría congelado y el candado no serviría.
  const { data, error } = await supabase
    .from("parked_orders")
    .update({ cart: parsed.data.cart as never, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("updated_at", parsed.data.expectedUpdatedAt)
    .select("updated_at")

  if (error) return { error: dbErrorMessage(error) }
  const fila = data?.[0]
  return { success: true, saved: !!fila, updatedAt: fila?.updated_at ?? null }
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

const fiadoSchema = z.object({
  id: z.string().uuid(),
  /** Teléfono o nota para poder cobrarle después. Opcional. */
  contact: z.string().trim().max(60).optional(),
})

/**
 * Marca una cuenta como fiado: la persona se fue sin pagar.
 *
 * NO registra ninguna venta. La venta sigue naciendo al COBRAR, que es
 * cuando entra el dinero a la caja: un ticket de hoy que nadie pagó dejaría
 * el arqueo de esta noche corto y parecería un faltante.
 *
 * Lo único que cambia es dónde vive: sale de la lista del día —donde estorba
 * y se vuelve ruido— y pasa a «Por cobrar», donde lo que importa es quién
 * debe, cuánto y desde cuándo. Y deja de caducar.
 */
export async function markOwed(
  input: z.infer<typeof fiadoSchema>,
): Promise<ActionResult<{ owedSince: number }>> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const parsed = fiadoSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }

  const ahora = new Date().toISOString()
  const supabase = await createClient()
  // `owed_since` solo se pone si aún no estaba: volver a marcar un fiado no
  // debe reiniciar desde cuándo se debe.
  const { data, error } = await supabase
    .from("parked_orders")
    .update({ owed_since: ahora, owed_contact: parsed.data.contact || null, updated_at: ahora })
    .eq("id", parsed.data.id)
    .is("owed_since", null)
    .select("owed_since")

  if (error) return { error: dbErrorMessage(error) }
  const fila = data?.[0]
  if (!fila) return { error: "Esa cuenta ya estaba marcada como fiado, o ya no existe." }
  return { success: true, owedSince: new Date(fila.owed_since!).getTime() }
}

const condonarSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(120),
})

/**
 * Perdona una deuda: la cuenta se borra sin cobrarse.
 *
 * Solo dueño o administrador, y con motivo obligatorio que queda en
 * Actividad. Es la única forma de que dinero servido desaparezca sin entrar
 * a la caja, así que tiene que quedar por escrito quién lo decidió y por qué
 * — igual que una cancelación de venta.
 */
export async function forgiveOwed(
  input: z.infer<typeof condonarSchema>,
): Promise<ActionResult> {
  const { error: ctxError } = await requireRole(["owner", "admin"])
  if (ctxError !== null) return { error: ctxError }

  const parsed = condonarSchema.safeParse(input)
  if (!parsed.success) return { error: "Escribe un motivo de al menos 3 letras." }

  const supabase = await createClient()
  // Se lee antes de borrar: después no habría de qué dejar constancia.
  const { data: fila } = await supabase
    .from("parked_orders")
    .select("name, owed_since, cart")
    .eq("id", parsed.data.id)
    .not("owed_since", "is", null)
    .maybeSingle()
  if (!fila) return { error: "Esa cuenta ya no existe o no está marcada como fiado." }

  const { error } = await supabase.from("parked_orders").delete().eq("id", parsed.data.id)
  if (error) return { error: dbErrorMessage(error) }

  await logAudit("fiado.condonado", fila.name, {
    motivo: parsed.data.reason,
    debia_desde: fila.owed_since,
  })
  revalidatePath("/admin/por-cobrar")
  return { success: true }
}
