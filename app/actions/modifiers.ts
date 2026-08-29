"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Modificadores: grupos ("Tipo de leche"), opciones ("Leche de avena  */
/*  +$12") y su asignación a productos. Solo admin (RLS lo respalda).   */
/* ------------------------------------------------------------------ */

function revalidateAll() {
  revalidatePath("/admin", "layout")
  revalidatePath("/pos")
}

const groupSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(60),
  minSelect: z.number().int().min(0).max(20),
  maxSelect: z.number().int().min(1).max(20).nullable(),
  isRequired: z.boolean(),
})

function readGroup(formData: FormData) {
  const maxRaw = String(formData.get("max_select") ?? "").trim()
  return groupSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    minSelect: Number(formData.get("min_select") ?? 0),
    maxSelect: maxRaw === "" ? null : Number(maxRaw),
    isRequired: formData.get("is_required") === "true" || formData.get("is_required") === "on",
  })
}

export async function createModifierGroup(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const parsed = readGroup(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const g = parsed.data
  if (g.maxSelect !== null && g.maxSelect < g.minSelect) {
    return { error: "El máximo no puede ser menor que el mínimo." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("modifier_groups").insert({
    name: g.name,
    min_select: g.minSelect,
    max_select: g.maxSelect,
    is_required: g.isRequired || g.minSelect > 0,
  })
  if (error) return { error: dbErrorMessage(error) }

  await logAudit("grupo.creado", g.name)
  revalidateAll()
  return { success: true }
}

export async function updateModifierGroup(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "ID es obligatorio." }

  const parsed = readGroup(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const g = parsed.data
  if (g.maxSelect !== null && g.maxSelect < g.minSelect) {
    return { error: "El máximo no puede ser menor que el mínimo." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("modifier_groups")
    .update({
      name: g.name,
      min_select: g.minSelect,
      max_select: g.maxSelect,
      is_required: g.isRequired || g.minSelect > 0,
    })
    .eq("id", id)
  if (error) return { error: dbErrorMessage(error) }

  await logAudit("grupo.editado", g.name)
  revalidateAll()
  return { success: true }
}

export async function toggleModifierGroupActive(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const isActive = formData.get("is_active") === "true"
  if (!id) return { error: "ID es obligatorio." }

  const supabase = await createClient()
  const { error } = await supabase.from("modifier_groups").update({ is_active: isActive }).eq("id", id)
  if (error) return { error: dbErrorMessage(error) }

  const { data: g } = await supabase.from("modifier_groups").select("name").eq("id", id).maybeSingle()
  await logAudit("grupo.editado", g?.name ?? id, { activo: isActive })
  revalidateAll()
  return { success: true }
}

export async function deleteModifierGroup(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "ID es obligatorio." }

  const supabase = await createClient()

  // Con ventas que usaron sus opciones, mejor desactivar: el historial
  // conserva los nombres (snapshot) pero perdería la referencia.
  const { data: mods } = await supabase.from("modifiers").select("id").eq("group_id", id)
  const modIds = (mods ?? []).map((m) => m.id)
  if (modIds.length > 0) {
    const { count } = await supabase
      .from("ticket_item_modifiers")
      .select("*", { count: "exact", head: true })
      .in("modifier_id", modIds)
    if (count && count > 0) {
      return { error: `Este grupo tiene opciones usadas en ${count} venta(s). Desactívalo en lugar de eliminarlo.` }
    }
  }

  const { data: before } = await supabase.from("modifier_groups").select("name").eq("id", id).maybeSingle()

  const { error } = await supabase.from("modifier_groups").delete().eq("id", id)
  if (error) return { error: dbErrorMessage(error) }

  await logAudit("grupo.eliminado", before?.name ?? id)
  revalidateAll()
  return { success: true }
}

/* ── Opciones ─────────────────────────────────────────────────────── */

const modifierSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(60),
  priceDelta: z.number().finite().min(-9_999).max(9_999),
})

function readModifier(formData: FormData) {
  return modifierSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    priceDelta: Number(formData.get("price_delta") ?? 0),
  })
}

export async function createModifier(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const groupId = String(formData.get("group_id") ?? "")
  if (!groupId) return { error: "Grupo es obligatorio." }

  const parsed = readModifier(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase.from("modifiers").insert({
    group_id: groupId,
    name: parsed.data.name,
    price_delta: parsed.data.priceDelta,
  })
  if (error) return { error: dbErrorMessage(error) }

  const { data: g } = await supabase.from("modifier_groups").select("name").eq("id", groupId).maybeSingle()
  await logAudit("modificador.creado", `${g?.name ?? "?"}: ${parsed.data.name}`, { precio_extra: parsed.data.priceDelta })
  revalidateAll()
  return { success: true }
}

export async function updateModifier(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "ID es obligatorio." }

  const parsed = readModifier(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("modifiers")
    .update({ name: parsed.data.name, price_delta: parsed.data.priceDelta })
    .eq("id", id)
  if (error) return { error: dbErrorMessage(error) }

  await logAudit("modificador.editado", parsed.data.name, { precio_extra: parsed.data.priceDelta })
  revalidateAll()
  return { success: true }
}

export async function toggleModifierActive(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const isActive = formData.get("is_active") === "true"
  if (!id) return { error: "ID es obligatorio." }

  const supabase = await createClient()
  const { error } = await supabase.from("modifiers").update({ is_active: isActive }).eq("id", id)
  if (error) return { error: dbErrorMessage(error) }

  const { data: m } = await supabase.from("modifiers").select("name").eq("id", id).maybeSingle()
  await logAudit("modificador.editado", m?.name ?? id, { activo: isActive })
  revalidateAll()
  return { success: true }
}

export async function deleteModifier(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "ID es obligatorio." }

  const supabase = await createClient()
  const { count } = await supabase
    .from("ticket_item_modifiers")
    .select("*", { count: "exact", head: true })
    .eq("modifier_id", id)
  if (count && count > 0) {
    return { error: `Esta opción se usó en ${count} venta(s). Desactívala en lugar de eliminarla.` }
  }

  const { data: before } = await supabase.from("modifiers").select("name").eq("id", id).maybeSingle()

  const { error } = await supabase.from("modifiers").delete().eq("id", id)
  if (error) return { error: dbErrorMessage(error) }

  await logAudit("modificador.eliminado", before?.name ?? id)
  revalidateAll()
  return { success: true }
}

/* ── Asignación grupos ↔ producto ─────────────────────────────────── */

const assignSchema = z.object({
  productId: z.string().uuid(),
  groupIds: z.array(z.string().uuid()).max(50),
})

export async function setProductModifierGroups(
  input: z.infer<typeof assignSchema>,
): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const parsed = assignSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }
  const { productId, groupIds } = parsed.data

  const supabase = await createClient()

  const { data: current, error: readError } = await supabase
    .from("product_modifier_groups")
    .select("group_id")
    .eq("product_id", productId)
  if (readError) return { error: dbErrorMessage(readError) }

  const have = new Set((current ?? []).map((r) => r.group_id))
  const want = new Set(groupIds)
  const toAdd = groupIds.filter((g) => !have.has(g))
  const toRemove = [...have].filter((g) => !want.has(g))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("product_modifier_groups")
      .delete()
      .eq("product_id", productId)
      .in("group_id", toRemove)
    if (error) return { error: dbErrorMessage(error) }
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("product_modifier_groups")
      .insert(toAdd.map((group_id) => ({ product_id: productId, group_id })))
    if (error) return { error: dbErrorMessage(error) }
  }

  if (toAdd.length > 0 || toRemove.length > 0) {
    const { data: p } = await supabase.from("menu_products").select("name").eq("id", productId).maybeSingle()
    await logAudit("producto.modificadores", p?.name ?? productId, {
      agregados: toAdd.length,
      quitados: toRemove.length,
      total: want.size,
    })
  }
  revalidateAll()
  return { success: true }
}
