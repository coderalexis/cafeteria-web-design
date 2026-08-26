"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { homePathFor, parseContext } from "@/lib/context-shape"
import { isValidTimeZone } from "@/lib/dates"
import { LOCK_MINUTES_OPTIONS, parseBusinessSettings, parseGoal, serializeBusinessSettings } from "@/lib/settings"
import type { ActionResult } from "./types"

/**
 * Cambia el negocio activo del usuario (debe tener membresía activa; lo valida
 * el RPC). Devuelve a dónde llevarlo según su rol en el nuevo negocio.
 */
export async function switchBusiness(businessId: string): Promise<ActionResult<{ redirectTo: string }>> {
  if (!z.string().uuid().safeParse(businessId).success) {
    return { error: "Negocio inválido." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("set_active_business", { p_business_id: businessId })
  if (error) {
    return { error: error.message }
  }

  const ctx = parseContext(data)
  revalidatePath("/", "layout")
  return { success: true, redirectTo: homePathFor(ctx) }
}

/* ------------------------------------------------------------------ */
/*  Ajustes del negocio (/admin/negocio). Escribe con el cliente de     */
/*  sesión: RLS (owner|admin del negocio activo) + grant por columna    */
/*  (name, timezone, address, phone, receipt_header, receipt_footer).   */
/* ------------------------------------------------------------------ */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length ? v : null))

const settingsSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80, "El nombre es demasiado largo."),
  timezone: z
    .string()
    .trim()
    .min(1, "Elige la zona horaria.")
    .refine(isValidTimeZone, "Zona horaria no reconocida (usa un nombre IANA como America/Mexico_City)."),
  address: optionalText(200),
  phone: optionalText(40),
  receiptHeader: optionalText(200),
  receiptFooter: optionalText(200),
  lockMinutes: z
    .number()
    .int()
    .refine((n) => (LOCK_MINUTES_OPTIONS as readonly number[]).includes(n), "Valor de bloqueo inválido."),
  // Metas en pesos: campo vacío = sin meta.
  dailyGoal: z
    .string()
    .trim()
    .transform((v) => parseGoal(v === "" ? null : v))
    .refine((v) => v === null || v >= 1, "La meta diaria debe ser un monto positivo."),
  monthlyGoal: z
    .string()
    .trim()
    .transform((v) => parseGoal(v === "" ? null : v))
    .refine((v) => v === null || v >= 1, "La meta mensual debe ser un monto positivo."),
})

export async function updateBusinessSettings(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const parsed = settingsSchema.safeParse({
    name: formData.get("name") ?? "",
    timezone: formData.get("timezone") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    receiptHeader: formData.get("receipt_header") ?? "",
    receiptFooter: formData.get("receipt_footer") ?? "",
    lockMinutes: Number(formData.get("lock_minutes") ?? 0),
    dailyGoal: formData.get("daily_goal") ?? "",
    monthlyGoal: formData.get("monthly_goal") ?? "",
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  }
  const v = parsed.data

  // Merge sobre el JSON existente: claves futuras de settings no se pierden.
  const currentSettings =
    ctx.business.settings && typeof ctx.business.settings === "object"
      ? (ctx.business.settings as Record<string, unknown>)
      : {}
  const prevSettings = parseBusinessSettings(ctx.business.settings)
  const nextSettings = {
    ...currentSettings,
    ...serializeBusinessSettings({
      ...prevSettings,
      lockMinutes: v.lockMinutes,
      dailyGoal: v.dailyGoal,
      monthlyGoal: v.monthlyGoal,
    }),
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("businesses")
    .update({
      name: v.name,
      timezone: v.timezone,
      address: v.address,
      phone: v.phone,
      receipt_header: v.receiptHeader,
      receipt_footer: v.receiptFooter,
      settings: nextSettings as never,
    })
    .eq("id", ctx.business.id)
    .select("id")

  if (error) {
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: "No tienes permiso para editar este negocio." }
  }

  const before = ctx.business
  const cambios: string[] = []
  if (before.name !== v.name) cambios.push("nombre")
  if (before.timezone !== v.timezone) cambios.push("zona horaria")
  if ((before.address ?? null) !== v.address) cambios.push("dirección")
  if ((before.phone ?? null) !== v.phone) cambios.push("teléfono")
  if ((before.receiptHeader ?? null) !== v.receiptHeader) cambios.push("encabezado del ticket")
  if ((before.receiptFooter ?? null) !== v.receiptFooter) cambios.push("pie del ticket")
  if (prevSettings.lockMinutes !== v.lockMinutes) cambios.push("bloqueo por inactividad")
  if (prevSettings.dailyGoal !== v.dailyGoal || prevSettings.monthlyGoal !== v.monthlyGoal) cambios.push("metas de venta")
  if (cambios.length > 0) {
    await logAudit("negocio.ajustes", v.name, { cambios })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

/**
 * Oculta la checklist de arranque del dashboard (queda en settings.hide_checklist;
 * merge para no pisar otras claves).
 */
export async function hideStartupChecklist(): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const currentSettings =
    ctx.business.settings && typeof ctx.business.settings === "object"
      ? (ctx.business.settings as Record<string, unknown>)
      : {}

  const supabase = await createClient()
  const { error } = await supabase
    .from("businesses")
    .update({ settings: { ...currentSettings, hide_checklist: true } as never })
    .eq("id", ctx.business.id)

  if (error) return { error: error.message }

  revalidatePath("/admin", "layout")
  return { success: true }
}
