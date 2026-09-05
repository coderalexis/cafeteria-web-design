"use server"

import { z } from "@/lib/zod"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActionResult } from "./types"
import { creditAccountsFrom, type CreditAccount } from "@/lib/credit"

/* ------------------------------------------------------------------ */
/*  Fiados por persona (P38).                                          */
/*                                                                     */
/*  Toda la regla de dinero vive en los RPC: quién puede, el módulo    */
/*  encendido, que un abono no pase de lo que se debe, y que el abono  */
/*  en efectivo entre a la caja del turno. Aquí solo se validan formas */
/*  y se traduce a lo que la pantalla necesita.                        */
/* ------------------------------------------------------------------ */

export type { CreditAccount } from "@/lib/credit"

/** Un renglón del estado de cuenta: un cargo (venta fiada) o un abono. */
export type CreditEntry =
  | {
      kind: "cargo"
      at: string
      amount: number
      folio: number
      status: "completado" | "cancelado"
      cancelReason: string | null
      ticketId: string
      items: string
    }
  | { kind: "abono"; at: string; amount: number; method: string; notes: string | null; by: string; paymentId: string }

export interface CreditStatement {
  customer: { id: string; name: string; phone: string | null; notes: string | null; balance: number }
  entries: CreditEntry[]
}

function revalidar() {
  revalidatePath("/admin/por-cobrar")
  revalidatePath("/pos")
}

/** Todas las cuentas del negocio con su saldo (las de saldo cero también). */
export async function getCreditBalances(): Promise<ActionResult<{ accounts: CreditAccount[] }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("credit_balances")
  if (error) return { error: dbErrorMessage(error) }
  return { success: true, accounts: creditAccountsFrom(data) }
}

const altaSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la persona.").max(80, "El nombre es demasiado largo."),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(120).optional(),
})

/** Da de alta (o encuentra por nombre) a quien se le fía. Cualquiera del equipo. */
export async function upsertCreditCustomer(
  input: z.infer<typeof altaSchema>,
): Promise<ActionResult<{ customer: { id: string; name: string; phone: string | null; balance: number } }>> {
  const parsed = altaSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("credit_customer_upsert", {
    p_name: parsed.data.name,
    p_phone: parsed.data.phone || undefined,
    p_notes: parsed.data.notes || undefined,
  })
  if (error) return { error: dbErrorMessage(error) }
  const row = data as { id: string; name: string; phone: string | null; balance: number }
  revalidar()
  return { success: true, customer: { id: row.id, name: row.name, phone: row.phone, balance: Number(row.balance) } }
}

const abonoSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().finite().positive("El abono debe ser mayor a 0.").max(9_999_999),
  method: z.enum(["efectivo", "transferencia", "tarjeta_clip"]),
  notes: z.string().trim().max(120).optional(),
})

export type PayCreditInput = z.infer<typeof abonoSchema>

/**
 * Registra un abono. En efectivo, el RPC lo mete a la caja del turno como
 * entrada (sin caja abierta no hay dónde meterlo); nunca más de lo que se
 * debe. Queda en Actividad aunque lo registre un cajero.
 */
export async function payCredit(
  input: PayCreditInput,
): Promise<ActionResult<{ name: string; amount: number; balance: number; movementId: string | null }>> {
  const parsed = abonoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("credit_pay", {
    p_customer: parsed.data.customerId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_notes: parsed.data.notes || undefined,
  })
  if (error) return { error: dbErrorMessage(error) }
  const row = data as { name: string; amount: number; balance: number; movement_id: string | null }
  revalidar()
  return { success: true, name: row.name, amount: Number(row.amount), balance: Number(row.balance), movementId: row.movement_id ?? null }
}

/** El estado de cuenta de una persona: cargos y abonos, del más reciente al más viejo. */
export async function getCreditStatement(customerId: string): Promise<ActionResult<{ statement: CreditStatement }>> {
  if (!z.string().uuid().safeParse(customerId).success) return { error: "Cuenta inválida." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("credit_statement", { p_customer: customerId })
  if (error) return { error: dbErrorMessage(error) }
  if (!data) return { error: "Cuenta de fiado no encontrada." }
  const raw = data as {
    customer: { id: string; name: string; phone: string | null; notes: string | null; balance: number }
    entries: Array<Record<string, unknown>>
  }
  const entries: CreditEntry[] = raw.entries.map((e) =>
    e.kind === "cargo"
      ? {
          kind: "cargo",
          at: String(e.at),
          amount: Number(e.amount),
          folio: Number(e.folio),
          status: e.status === "cancelado" ? "cancelado" : "completado",
          cancelReason: (e.cancel_reason as string | null) ?? null,
          ticketId: String(e.ticket_id),
          items: (e.items as string | null) ?? "",
        }
      : {
          kind: "abono",
          at: String(e.at),
          amount: Number(e.amount),
          method: String(e.method),
          notes: (e.notes as string | null) ?? null,
          by: (e.by as string | null) ?? "",
          paymentId: String(e.payment_id),
        },
  )
  return {
    success: true,
    statement: { customer: { ...raw.customer, balance: Number(raw.customer.balance) }, entries },
  }
}
