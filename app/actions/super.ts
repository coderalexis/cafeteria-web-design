"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/context"
import { generateTempPassword, isSyntheticEmail, normalizeSlug, SLUG_PATTERN } from "@/lib/accounts"
import { isValidTimeZone } from "@/lib/dates"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Panel del operador (/super): alta de cafeterías, dueños, plantilla, */
/*  suspensión. Todo exige requireSuperAdmin() y usa la service role.   */
/* ------------------------------------------------------------------ */

const uuid = z.string().uuid()

function revalidateSuper() {
  revalidatePath("/super")
  revalidatePath("/", "layout")
}

export interface PlatformBusiness {
  id: string
  name: string
  slug: string
  status: "active" | "suspended"
  plan: string
  is_template: boolean
  timezone: string
  created_at: string
  active_members: number
  owners: string[]
  has_menu: boolean
  tickets_30d: number
  revenue_30d: number
  last_sale_at: string | null
}

export async function getPlatformOverview(): Promise<ActionResult<{ businesses: PlatformBusiness[] }>> {
  const { error: authError } = await requireSuperAdmin()
  if (authError) return { error: authError }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("platform_overview")
  if (error) return { error: error.message }
  return { success: true, businesses: (data as unknown as PlatformBusiness[]) ?? [] }
}

/** Slug sugerido a partir del nombre (sin acentos, minúsculas, guiones). */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

const createSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(80),
  slug: z
    .string()
    .trim()
    .transform((s) => normalizeSlug(s))
    .refine((s) => SLUG_PATTERN.test(s) && s.length >= 3, "Identificador inválido: 3+ caracteres, minúsculas, números y guiones."),
  timezone: z.string().trim().refine(isValidTimeZone, "Zona horaria no reconocida."),
  cloneTemplate: z.boolean(),
  ownerEmail: z.string().trim().toLowerCase().email("Correo del dueño inválido."),
  ownerName: z.string().trim().max(80),
})

/**
 * Crea la cafetería con su dueño (cuenta existente por correo, o nueva con
 * contraseña temporal) y, opcionalmente, clona el menú de la plantilla.
 */
export async function createBusiness(
  formData: FormData,
): Promise<ActionResult<{ businessId: string; ownerCreated: boolean; tempPassword?: string; cloneError?: string }>> {
  const { ctx, error: authError } = await requireSuperAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const rawName = String(formData.get("name") ?? "")
  const parsed = createSchema.safeParse({
    name: rawName,
    slug: String(formData.get("slug") ?? "") || slugify(rawName),
    timezone: String(formData.get("timezone") ?? "America/Mexico_City"),
    cloneTemplate: String(formData.get("clone_template") ?? "") === "on",
    ownerEmail: String(formData.get("owner_email") ?? ""),
    ownerName: String(formData.get("owner_name") ?? ""),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  }
  const v = parsed.data
  if (isSyntheticEmail(v.ownerEmail)) {
    return { error: "El dueño debe tener un correo real (no una cuenta de café)." }
  }

  const admin = createAdminClient()

  const { data: slugTaken } = await admin.from("businesses").select("id").eq("slug", v.slug).maybeSingle()
  if (slugTaken) {
    return { error: `El identificador "${v.slug}" ya está en uso.` }
  }

  // 1) Dueño: cuenta existente o nueva (antes de crear el negocio, para no dejar negocios huérfanos)
  let ownerId: string | null = null
  let ownerCreated = false
  let tempPassword: string | undefined
  const { data: existingId } = await admin.rpc("find_user_id_by_email", { p_email: v.ownerEmail })
  if (existingId) {
    ownerId = existingId
  } else {
    if (!v.ownerName) {
      return { error: "Indica el nombre del dueño (se creará su cuenta)." }
    }
    tempPassword = generateTempPassword()
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: v.ownerEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: v.ownerName },
    })
    if (createError || !created.user) {
      return { error: createError?.message ?? "No se pudo crear la cuenta del dueño." }
    }
    ownerId = created.user.id
    ownerCreated = true
    await admin.from("profiles").update({ full_name: v.ownerName }).eq("id", ownerId)
  }

  // 2) Negocio
  const { data: biz, error: bizError } = await admin
    .from("businesses")
    .insert({ name: v.name, slug: v.slug, timezone: v.timezone, created_by: ctx.userId })
    .select("id")
    .single()
  if (bizError || !biz) {
    if (ownerCreated && ownerId) await admin.auth.admin.deleteUser(ownerId)
    return { error: bizError?.message ?? "No se pudo crear el negocio." }
  }

  // 3) Membresía del dueño (+ negocio activo si no tenía)
  const { error: memberError } = await admin
    .from("business_members")
    .insert({ business_id: biz.id, user_id: ownerId!, role: "owner", username: null })
  if (memberError) {
    await admin.from("businesses").delete().eq("id", biz.id)
    if (ownerCreated && ownerId) await admin.auth.admin.deleteUser(ownerId)
    return { error: memberError.message }
  }
  await admin.from("profiles").update({ active_business_id: biz.id }).eq("id", ownerId!).is("active_business_id", null)

  // 4) Menú de la plantilla (si falla, el negocio queda vacío y se puede clonar después)
  let cloneError: string | undefined
  if (v.cloneTemplate) {
    const { data: tpl } = await admin.from("businesses").select("id").eq("is_template", true).order("created_at").limit(1).maybeSingle()
    if (!tpl) {
      cloneError = "No hay una plantilla de menú configurada."
    } else {
      const { error } = await admin.rpc("clone_menu", { p_source: tpl.id, p_target: biz.id })
      if (error) cloneError = error.message
    }
  }

  revalidateSuper()
  return { success: true, businessId: biz.id, ownerCreated, tempPassword, cloneError }
}

/* ── Suspender / reactivar ────────────────────────────────────────── */
export async function setBusinessStatus(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireSuperAdmin()
  if (authError) return { error: authError }

  const businessId = String(formData.get("business_id") ?? "")
  const status = String(formData.get("status") ?? "")
  if (!uuid.safeParse(businessId).success) return { error: "Negocio inválido." }
  if (status !== "active" && status !== "suspended") return { error: "Estado inválido." }

  const admin = createAdminClient()
  const { data: biz } = await admin.from("businesses").select("id, is_template").eq("id", businessId).maybeSingle()
  if (!biz) return { error: "Negocio no encontrado." }
  if (biz.is_template && status === "suspended") return { error: "La plantilla no se suspende." }

  const { error } = await admin.from("businesses").update({ status }).eq("id", businessId)
  if (error) return { error: error.message }

  revalidateSuper()
  return { success: true }
}

/* ── Clonar plantilla en un negocio vacío ─────────────────────────── */
export async function cloneTemplateInto(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireSuperAdmin()
  if (authError) return { error: authError }

  const businessId = String(formData.get("business_id") ?? "")
  if (!uuid.safeParse(businessId).success) return { error: "Negocio inválido." }

  const admin = createAdminClient()
  const { data: tpl } = await admin.from("businesses").select("id").eq("is_template", true).order("created_at").limit(1).maybeSingle()
  if (!tpl) return { error: "No hay una plantilla de menú configurada." }
  if (tpl.id === businessId) return { error: "Ese negocio es la plantilla." }

  const { error } = await admin.rpc("clone_menu", { p_source: tpl.id, p_target: businessId })
  if (error) return { error: error.message }

  revalidateSuper()
  return { success: true }
}

/* ── Entrar a un negocio como dueño (soporte) ─────────────────────── */
export async function enterBusiness(formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const { ctx, error: authError } = await requireSuperAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const businessId = String(formData.get("business_id") ?? "")
  if (!uuid.safeParse(businessId).success) return { error: "Negocio inválido." }

  const admin = createAdminClient()
  const { data: biz } = await admin.from("businesses").select("id").eq("id", businessId).maybeSingle()
  if (!biz) return { error: "Negocio no encontrado." }

  // Membresía owner del operador (se reactiva si existía)
  const { error: upsertError } = await admin
    .from("business_members")
    .upsert({ business_id: businessId, user_id: ctx.userId, role: "owner", is_active: true }, { onConflict: "business_id,user_id" })
  if (upsertError) return { error: upsertError.message }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_active_business", { p_business_id: businessId })
  if (error) return { error: error.message }

  revalidateSuper()
  return { success: true, redirectTo: "/admin" }
}
