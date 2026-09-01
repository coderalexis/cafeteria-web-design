"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/context"
import { logAudit } from "@/lib/audit"
import { CATEGORIAS_GASTO, FORMAS_PAGO } from "@/lib/expenses"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Gastos del negocio.                                                */
/*                                                                     */
/*  Dos cosas distintas y a propósito separadas:                       */
/*    · gasto FIJO   — «cada mes pago lo mismo». Se captura una vez.   */
/*    · gasto del mes — «hoy le pagué al proveedor». Lleva fecha.      */
/*                                                                     */
/*  Aquí no hay cuentas: la utilidad y el punto de equilibrio los saca */
/*  `profit_report` en la base, con el mismo costo fotografiado que    */
/*  usan los reportes de margen. Esto es solo el alta y la baja.       */
/*                                                                     */
/*  El permiso lo cuida DOS veces: `requireRole` para dar un mensaje   */
/*  decente, y las políticas RLS, que son las que de verdad mandan —   */
/*  un cajero no puede ni leer cuánto se paga de renta.                */
/* ------------------------------------------------------------------ */

const categoria = z.enum(CATEGORIAS_GASTO)
const monto = z.coerce
  .number()
  .positive("El monto tiene que ser mayor a cero.")
  .max(9_999_999, "Ese monto es demasiado grande.")

const fijoSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Ponle un nombre.").max(60, "El nombre es muy largo."),
  category: categoria,
  monthlyAmount: monto,
})

const gastoSchema = z.object({
  id: z.string().uuid().optional(),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  category: categoria,
  description: z.string().trim().min(2, "Escribe de qué fue.").max(120, "La descripción es muy larga."),
  amount: monto,
  paidWith: z.enum(FORMAS_PAGO).nullable().optional(),
})

/* ── Gastos fijos ─────────────────────────────────────────────────── */

export async function saveFixedExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const parsed = fijoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const { id, name, category, monthlyAmount } = parsed.data

  const supabase = await createClient()
  // `business_id` no se manda nunca desde el cliente: lo pone el DEFAULT
  // `current_business_id()`, que sale de la sesión y no de lo que llegue.
  const fila = { name, category, monthly_amount: monthlyAmount }

  if (id) {
    const { error } = await supabase.from("fixed_expenses").update(fila).eq("id", id)
    if (error) return { error: error.message }
    await logAudit("gasto_fijo.editado", name, { monto: monthlyAmount, categoria: category })
    revalidatePath("/admin/gastos")
    revalidatePath("/admin")
    return { success: true, id }
  }

  const { data, error } = await supabase.from("fixed_expenses").insert(fila).select("id").single()
  if (error) return { error: error.message }
  await logAudit("gasto_fijo.creado", name, { monto: monthlyAmount, categoria: category })
  revalidatePath("/admin/gastos")
  revalidatePath("/admin")
  return { success: true, id: data.id }
}

/**
 * Apagar en vez de borrar: un gasto fijo que se da de baja deja de contar
 * para el mes en curso, pero se conserva por si el dueño lo vuelve a activar
 * (la renta que sube y baja de local, el sueldo del que se fue y volvió).
 */
export async function toggleFixedExpense(id: string, active: boolean): Promise<ActionResult> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("fixed_expenses")
    .update({ is_active: active })
    .eq("id", id)
    .select("name")
    .single()
  if (error) return { error: error.message }

  await logAudit(active ? "gasto_fijo.activado" : "gasto_fijo.apagado", data.name)
  revalidatePath("/admin/gastos")
  revalidatePath("/admin")
  return { success: true }
}

export async function deleteFixedExpense(id: string): Promise<ActionResult> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data: previo } = await supabase.from("fixed_expenses").select("name").eq("id", id).maybeSingle()
  const { error } = await supabase.from("fixed_expenses").delete().eq("id", id)
  if (error) return { error: error.message }

  await logAudit("gasto_fijo.borrado", previo?.name ?? id)
  revalidatePath("/admin/gastos")
  revalidatePath("/admin")
  return { success: true }
}

/* ── Gastos del mes ───────────────────────────────────────────────── */

export async function saveExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const parsed = gastoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const { id, spentOn, category, description, amount, paidWith } = parsed.data

  const supabase = await createClient()
  const fila = {
    spent_on: spentOn,
    category,
    description,
    amount,
    paid_with: paidWith ?? null,
  }

  if (id) {
    const { error } = await supabase.from("expenses").update(fila).eq("id", id)
    if (error) return { error: error.message }
    await logAudit("gasto.editado", description, { monto: amount, categoria: category })
    revalidatePath("/admin/gastos")
    revalidatePath("/admin")
    return { success: true, id }
  }

  const { data, error } = await supabase.from("expenses").insert(fila).select("id").single()
  if (error) return { error: error.message }
  await logAudit("gasto.creado", description, { monto: amount, categoria: category })
  revalidatePath("/admin/gastos")
  revalidatePath("/admin")
  return { success: true, id: data.id }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data: previo } = await supabase.from("expenses").select("description, amount").eq("id", id).maybeSingle()
  const { error } = await supabase.from("expenses").delete().eq("id", id)
  if (error) return { error: error.message }

  await logAudit("gasto.borrado", previo?.description ?? id, { monto: previo?.amount })
  revalidatePath("/admin/gastos")
  revalidatePath("/admin")
  return { success: true }
}

/* ── El equilibrio como meta del día ──────────────────────────────── */

/**
 * Pone el punto de equilibrio como meta diaria de venta.
 *
 * La meta del día venía siendo un número que el dueño inventaba. Con los
 * gastos capturados ya no hace falta adivinar: es lo que tiene que vender
 * para no perder. Se redondea hacia ARRIBA a los siguientes $50 porque una
 * meta de «$3,836.99» no se recuerda ni se persigue, y quedarse corto por
 * redondeo sería justo el error que no se vale cometer aquí.
 */
export async function applyBreakEvenGoal(): Promise<ActionResult<{ goal: number }>> {
  const { ctx, error: authError } = await requireRole(["owner", "admin"])
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("profit_report")
  if (error) return { error: error.message }

  const diario = (data as { break_even?: { daily?: number | null } } | null)?.break_even?.daily
  if (!diario || diario <= 0) {
    return { error: "Todavía no se puede calcular: captura tus gastos fijos y los costos de tus productos." }
  }
  const meta = Math.ceil(diario / 50) * 50

  const previas =
    ctx.business.settings && typeof ctx.business.settings === "object"
      ? (ctx.business.settings as Record<string, unknown>)
      : {}
  const { error: errorGuardar } = await supabase
    .from("businesses")
    .update({ settings: { ...previas, daily_goal: meta } as never })
    .eq("id", ctx.business.id)
  if (errorGuardar) return { error: errorGuardar.message }

  await logAudit("meta.desde_equilibrio", `Meta del día: ${meta}`, { equilibrio: diario })
  revalidatePath("/admin", "layout")
  revalidatePath("/admin/gastos")
  return { success: true, goal: meta }
}
