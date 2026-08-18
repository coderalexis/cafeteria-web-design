"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { homePathFor, parseContext } from "@/lib/context-shape"
import { isValidTimeZone } from "@/lib/dates"
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
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  }
  const v = parsed.data

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
    })
    .eq("id", ctx.business.id)
    .select("id")

  if (error) {
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: "No tienes permiso para editar este negocio." }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
