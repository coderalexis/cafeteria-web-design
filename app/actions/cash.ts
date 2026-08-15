"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { CashSessionSummary } from "@/lib/receipt"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Sesiones de caja (apertura / corte). Toda la lógica de negocio     */
/*  vive en los RPC de Postgres; aquí solo se valida la forma.         */
/* ------------------------------------------------------------------ */

function revalidateCash() {
  revalidatePath("/pos")
  revalidatePath("/admin", "layout")
}

const moneySchema = z.number().finite().nonnegative().max(9_999_999)
const notesSchema = z.string().trim().max(300).optional()

const openSchema = z.object({ openingFloat: moneySchema, notes: notesSchema })

export async function openCashSession(
  input: z.infer<typeof openSchema>,
): Promise<ActionResult<{ sessionId: string; openedAt: string; openingFloat: number }>> {
  const parsed = openSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Fondo inicial inválido." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("open_cash_session", {
    p_opening_float: parsed.data.openingFloat,
    p_notes: parsed.data.notes || undefined,
  })

  if (error) {
    return { error: error.message }
  }

  const row = data as { session_id: string; opened_at: string; opening_float: number }
  revalidateCash()
  return {
    success: true,
    sessionId: row.session_id,
    openedAt: row.opened_at,
    openingFloat: row.opening_float,
  }
}

const closeSchema = z.object({ countedCash: moneySchema, notes: notesSchema })

export async function closeCashSession(
  input: z.infer<typeof closeSchema>,
): Promise<ActionResult<{ summary: CashSessionSummary }>> {
  const parsed = closeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Efectivo contado inválido." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("close_cash_session", {
    p_counted_cash: parsed.data.countedCash,
    p_notes: parsed.data.notes || undefined,
  })

  if (error) {
    return { error: error.message }
  }

  revalidateCash()
  return { success: true, summary: data as unknown as CashSessionSummary }
}

export async function getCashSessionSummary(
  sessionId: string,
): Promise<ActionResult<{ summary: CashSessionSummary }>> {
  if (!z.string().uuid().safeParse(sessionId).success) {
    return { error: "Sesión inválida." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("cash_session_summary", {
    p_session_id: sessionId,
  })

  if (error) {
    return { error: error.message }
  }
  if (!data) {
    return { error: "No se encontró la sesión de caja." }
  }

  return { success: true, summary: data as unknown as CashSessionSummary }
}
