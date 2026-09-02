"use server"

import { revalidatePath } from "next/cache"
import { z } from "@/lib/zod"
import { createClient } from "@/lib/supabase/server"
import { requireContext, requireRole } from "@/lib/context"
import { logAudit } from "@/lib/audit"
import { AMBITOS_PROMO, TIPOS_PROMO } from "@/lib/promotions"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Promociones por horario.                                           */
/*                                                                     */
/*  Aquí NO se calcula ningún descuento. Quién aplica y cuánto lo      */
/*  decide `create_ticket` en el servidor, con la hora de captura de   */
/*  la venta; esto es el alta, la baja y la vista previa del POS.      */
/*                                                                     */
/*  La vista previa es SOLO pantalla: sirve para que la cajera pueda   */
/*  decírselo al cliente antes de cobrar. Si alguna vez difiere de lo  */
/*  que cobra el servidor, manda el servidor.                          */
/* ------------------------------------------------------------------ */

const promoSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "Ponle un nombre.").max(60, "El nombre es muy largo."),
    kind: z.enum(TIPOS_PROMO),
    value: z.coerce.number().positive("El descuento tiene que ser mayor a cero."),
    scope: z.enum(AMBITOS_PROMO),
    categoryId: z.string().uuid().nullable().optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Elige al menos un día."),
    startHour: z.coerce.number().int().min(0).max(23),
    endHour: z.coerce.number().int().min(1).max(24),
    minTicket: z.coerce.number().min(0).max(9_999_999).default(0),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  // Las mismas reglas que la base, para dar un mensaje decente antes de que
  // el constraint las corte con su jerga.
  .refine((v) => v.endHour > v.startHour, {
    message: "La hora de fin tiene que ser posterior a la de inicio.",
  })
  .refine((v) => v.kind !== "porcentaje" || v.value <= 100, {
    message: "Un porcentaje no puede pasar de 100.",
  })
  .refine((v) => v.scope !== "categoria" || !!v.categoryId, {
    message: "Elige la categoría a la que aplica.",
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    message: "La fecha de fin no puede ser anterior a la de inicio.",
  })

export async function savePromotion(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const parsed = promoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const v = parsed.data

  const supabase = await createClient()
  const fila = {
    name: v.name,
    kind: v.kind,
    value: v.value,
    scope: v.scope,
    // Una promoción de toda la venta no lleva categoría: el constraint de la
    // base lo exige y mandarla sería un error silencioso.
    category_id: v.scope === "categoria" ? (v.categoryId ?? null) : null,
    weekdays: v.weekdays,
    start_hour: v.startHour,
    end_hour: v.endHour,
    min_ticket: v.minTicket,
    starts_on: v.startsOn ?? null,
    ends_on: v.endsOn ?? null,
  }

  if (v.id) {
    const { error } = await supabase.from("promotions").update(fila).eq("id", v.id)
    if (error) return { error: error.message }
    await logAudit("promocion.editada", v.name, { tipo: v.kind, valor: v.value })
    revalidatePath("/admin/promociones")
    return { success: true, id: v.id }
  }

  const { data, error } = await supabase.from("promotions").insert(fila).select("id").single()
  if (error) return { error: error.message }
  await logAudit("promocion.creada", v.name, { tipo: v.kind, valor: v.value })
  revalidatePath("/admin/promociones")
  return { success: true, id: data.id }
}

/**
 * Apagar en vez de borrar mientras tenga ventas: las ventas que ya cobró
 * apuntan a ella, y el reporte de resultados se quedaría sin nombre.
 */
export async function togglePromotion(id: string, active: boolean): Promise<ActionResult> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("promotions")
    .update({ is_active: active })
    .eq("id", id)
    .select("name")
    .single()
  if (error) return { error: error.message }

  await logAudit(active ? "promocion.encendida" : "promocion.apagada", data.name)
  revalidatePath("/admin/promociones")
  return { success: true }
}

export async function deletePromotion(id: string): Promise<ActionResult> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data: previa } = await supabase.from("promotions").select("name").eq("id", id).maybeSingle()

  // Si ya cobró ventas no se borra: se apaga. Borrarla dejaría los tickets
  // con `promotion_id` en null (la FK es «set null») y el resultado de la
  // promoción se perdería para siempre.
  const { count } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("promotion_id", id)
  if ((count ?? 0) > 0) {
    return {
      error: `«${previa?.name ?? "Esta promoción"}» ya cobró ${count} ventas. Apágala en vez de borrarla, para no perder su resultado.`,
    }
  }

  const { error } = await supabase.from("promotions").delete().eq("id", id)
  if (error) return { error: error.message }

  await logAudit("promocion.borrada", previa?.name ?? id)
  revalidatePath("/admin/promociones")
  return { success: true }
}

/** Vista previa para el carrito. Devuelve null cuando no hay promoción viva. */
export async function previewPromotion(
  items: Array<{ variant_id: string; quantity: number; modifiers?: string[] }>,
): Promise<ActionResult<{ promo: { id: string; name: string; discount: number } | null }>> {
  const { error: authError } = await requireContext()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("promo_preview", { p_items: items as never })
  if (error) return { error: error.message }

  const promo = data as unknown as { id: string; name: string; discount: number } | null
  return { success: true, promo: promo ?? null }
}
