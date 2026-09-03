"use server"

import { revalidatePath } from "next/cache"
import { z } from "@/lib/zod"
import { createClient } from "@/lib/supabase/server"
import { checkExpectedBusiness } from "@/lib/context"
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
/** Negocio con el que la UI cree estar operando (guardia multi-pestaña). */
const expectedBusinessSchema = z.string().uuid().optional()

const openSchema = z.object({
  openingFloat: moneySchema,
  notes: notesSchema,
  expectedBusinessId: expectedBusinessSchema,
})

export async function openCashSession(
  input: z.infer<typeof openSchema>,
): Promise<ActionResult<{ sessionId: string; openedAt: string; openingFloat: number }>> {
  const parsed = openSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Fondo inicial inválido." }
  }

  const businessError = await checkExpectedBusiness(parsed.data.expectedBusinessId)
  if (businessError) {
    return { error: businessError }
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

const closeSchema = z.object({
  countedCash: moneySchema,
  notes: notesSchema,
  /** Conteo por denominación (P27): el servidor exige que sume lo contado. */
  countDetail: z.array(z.object({ value: z.number().positive(), qty: z.number().int().nonnegative() })).max(20).optional(),
  /** Lo que se deja en el cajón para el siguiente turno (P27). */
  nextFloat: moneySchema.optional(),
  expectedBusinessId: expectedBusinessSchema,
})

export async function closeCashSession(
  input: z.infer<typeof closeSchema>,
): Promise<ActionResult<{ summary: CashSessionSummary }>> {
  const parsed = closeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Efectivo contado inválido." }
  }

  const businessError = await checkExpectedBusiness(parsed.data.expectedBusinessId)
  if (businessError) {
    return { error: businessError }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("close_cash_session", {
    p_counted_cash: parsed.data.countedCash,
    p_notes: parsed.data.notes || undefined,
    p_count_detail: parsed.data.countDetail,
    p_next_float: parsed.data.nextFloat,
  })

  if (error) {
    return { error: error.message }
  }

  revalidateCash()
  return { success: true, summary: data as unknown as CashSessionSummary }
}

const movementSchema = z.object({
  kind: z.enum(["entrada", "salida"]),
  amount: z.number().finite().positive().max(9_999_999),
  reason: z.string().trim().min(2, "Indica el motivo del movimiento.").max(200),
  expectedBusinessId: expectedBusinessSchema,
})

export type CashMovementInput = z.infer<typeof movementSchema>

/** Entrada o salida de efectivo a mitad de turno (exige caja abierta). */
export async function addCashMovement(
  input: CashMovementInput,
): Promise<ActionResult<{ id: string; amount: number }>> {
  const parsed = movementSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  }

  const businessError = await checkExpectedBusiness(parsed.data.expectedBusinessId)
  if (businessError) {
    return { error: businessError }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("add_cash_movement", {
    p_kind: parsed.data.kind,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  })

  if (error) {
    return { error: error.message }
  }

  const row = data as { id: string; amount: number }
  revalidateCash()
  return { success: true, id: row.id, amount: row.amount }
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
