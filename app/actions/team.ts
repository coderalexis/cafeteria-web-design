"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActiveContext } from "@/lib/context"
import type { BusinessRole } from "@/lib/context-shape"
import {
  generateTempPassword,
  isSyntheticEmail,
  normalizeUsername,
  syntheticEmail,
  USERNAME_PATTERN,
  validatePassword,
} from "@/lib/accounts"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Equipo del negocio activo. Todo va con service role (RLS no permite  */
/*  escribir business_members desde clientes), por eso CADA consulta    */
/*  filtra por ctx.business.id explícitamente.                          */
/* ------------------------------------------------------------------ */

const ROLES: BusinessRole[] = ["owner", "admin", "cajero"]
const uuid = z.string().uuid()

function revalidateTeam() {
  revalidatePath("/admin/equipo")
  revalidatePath("/admin", "layout")
}

function parseRole(raw: unknown): BusinessRole | null {
  return typeof raw === "string" && (ROLES as string[]).includes(raw) ? (raw as BusinessRole) : null
}

/** Solo un owner puede otorgar o quitar el rol owner. */
function canAssignRole(caller: BusinessRole, target: BusinessRole): boolean {
  return target !== "owner" || caller === "owner"
}

async function getMembership(admin: ReturnType<typeof createAdminClient>, businessId: string, userId: string) {
  const { data } = await admin
    .from("business_members")
    .select("user_id, role, username, is_active")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle()
  return data
}

async function countActiveOwners(admin: ReturnType<typeof createAdminClient>, businessId: string) {
  const { count } = await admin
    .from("business_members")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("role", "owner")
    .eq("is_active", true)
  return count ?? 0
}

/** Crea el usuario auth (perfil por trigger) y su membresía; si algo falla revierte. */
async function createAccountWithMembership(
  admin: ReturnType<typeof createAdminClient>,
  ctx: ActiveContext,
  opts: { email: string; password: string; fullName: string; role: BusinessRole; username: string | null },
): Promise<{ userId: string } | { error: string }> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName },
  })
  if (createError || !created.user) {
    const msg = createError?.message ?? ""
    if (/already|registered|exists/i.test(msg)) {
      return { error: "Ya existe una cuenta con ese correo o usuario." }
    }
    return { error: msg || "No se pudo crear la cuenta." }
  }
  const userId = created.user.id

  // El trigger crea el perfil; asegura nombre y negocio activo (por si el trigger corrió sin metadata).
  await admin
    .from("profiles")
    .update({ full_name: opts.fullName, active_business_id: ctx.business.id })
    .eq("id", userId)

  const { error: memberError } = await admin.from("business_members").insert({
    business_id: ctx.business.id,
    user_id: userId,
    role: opts.role,
    username: opts.username,
  })
  if (memberError) {
    await admin.auth.admin.deleteUser(userId)
    // El nombre de la restricción distingue «ese usuario ya está tomado» de
    // «esa persona ya es del equipo»; antes ambas decían lo primero.
    return { error: dbErrorMessage(memberError) }
  }
  return { userId }
}

/* ── Crear cuenta de café (usuario + contraseña, sin correo real) ─── */
export async function createCashierAccount(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const username = normalizeUsername(String(formData.get("username") ?? ""))
  const fullName = String(formData.get("full_name") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const role = parseRole(String(formData.get("role") ?? "cajero"))

  if (!username || !fullName || !password) {
    return { error: "Usuario, nombre completo y contraseña son obligatorios." }
  }
  if (username.length < 3) {
    return { error: "El usuario debe tener al menos 3 caracteres." }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { error: "El usuario solo puede llevar letras minúsculas, números, punto y guiones." }
  }
  if (fullName.length > 80) {
    return { error: "El nombre es demasiado largo." }
  }
  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }
  if (!role) return { error: "Rol inválido." }
  if (!canAssignRole(ctx.role, role)) {
    return { error: "Solo el dueño puede otorgar el rol de dueño." }
  }

  const admin = createAdminClient()

  const { data: taken } = await admin
    .from("business_members")
    .select("user_id")
    .eq("business_id", ctx.business.id)
    .eq("username", username)
    .maybeSingle()
  if (taken) {
    return { error: `El usuario "${username}" ya existe en esta cafetería.` }
  }

  const result = await createAccountWithMembership(admin, ctx, {
    email: syntheticEmail(username, ctx.business.slug),
    password,
    fullName,
    role,
    username,
  })
  if ("error" in result) return { error: result.error }

  await logAudit("miembro.creado", `${fullName} (@${username})`, { rol: role })
  revalidateTeam()
  return { success: true }
}

/* ── Agregar por correo (cuenta existente o nueva con contraseña temporal) ── */
export async function addMemberByEmail(
  formData: FormData,
): Promise<ActionResult<{ created: boolean; tempPassword?: string }>> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const fullName = String(formData.get("full_name") ?? "").trim()
  const role = parseRole(String(formData.get("role") ?? "admin"))

  if (!z.string().email().safeParse(email).success) {
    return { error: "Indica un correo válido." }
  }
  if (isSyntheticEmail(email)) {
    return { error: "Ese correo pertenece a una cuenta de café; agrégala como usuario." }
  }
  if (!role) return { error: "Rol inválido." }
  if (!canAssignRole(ctx.role, role)) {
    return { error: "Solo el dueño puede otorgar el rol de dueño." }
  }

  const admin = createAdminClient()
  const { data: existingId } = await admin.rpc("find_user_id_by_email", { p_email: email })

  if (existingId) {
    const membership = await getMembership(admin, ctx.business.id, existingId)
    if (membership?.is_active) {
      return { error: "Esa persona ya forma parte del equipo." }
    }
    if (membership) {
      const { error } = await admin
        .from("business_members")
        .update({ is_active: true, role })
        .eq("business_id", ctx.business.id)
        .eq("user_id", existingId)
      if (error) return { error: dbErrorMessage(error) }
    } else {
      const { error } = await admin.from("business_members").insert({
        business_id: ctx.business.id,
        user_id: existingId,
        role,
        username: null,
      })
      if (error) return { error: dbErrorMessage(error) }
    }
    // Si no tenía negocio activo, este será el suyo
    await admin
      .from("profiles")
      .update({ active_business_id: ctx.business.id })
      .eq("id", existingId)
      .is("active_business_id", null)

    await logAudit("miembro.agregado", email, { rol: role })
    revalidateTeam()
    return { success: true, created: false }
  }

  if (!fullName) {
    return { error: "Indica el nombre de la persona (se creará su cuenta)." }
  }
  const tempPassword = generateTempPassword()
  const result = await createAccountWithMembership(admin, ctx, {
    email,
    password: tempPassword,
    fullName,
    role,
    username: null,
  })
  if ("error" in result) return { error: result.error }

  await logAudit("miembro.agregado", `${fullName} <${email}>`, { rol: role, cuenta_nueva: true })
  revalidateTeam()
  return { success: true, created: true, tempPassword }
}

/* ── Editar nombre y rol ──────────────────────────────────────────── */
export async function updateMember(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const userId = String(formData.get("user_id") ?? "")
  const fullName = String(formData.get("full_name") ?? "").trim()
  const role = parseRole(String(formData.get("role") ?? ""))

  if (!uuid.safeParse(userId).success) return { error: "Miembro inválido." }
  if (!fullName || fullName.length > 80) return { error: "El nombre es obligatorio (máximo 80 caracteres)." }
  if (!role) return { error: "Rol inválido." }

  const admin = createAdminClient()
  const membership = await getMembership(admin, ctx.business.id, userId)
  if (!membership) return { error: "Esa persona no pertenece a esta cafetería." }

  if (membership.role !== role) {
    if (!canAssignRole(ctx.role, role) || (membership.role === "owner" && ctx.role !== "owner")) {
      return { error: "Solo el dueño puede cambiar el rol de dueño." }
    }
    if (membership.role === "owner" && membership.is_active && (await countActiveOwners(admin, ctx.business.id)) <= 1) {
      return { error: "La cafetería debe conservar al menos un dueño activo." }
    }
  }

  const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", userId)
  if (profileError) return { error: dbErrorMessage(profileError) }

  if (membership.role !== role) {
    const { error } = await admin
      .from("business_members")
      .update({ role })
      .eq("business_id", ctx.business.id)
      .eq("user_id", userId)
    if (error) return { error: dbErrorMessage(error) }
  }

  await logAudit("miembro.editado", fullName, { rol: role })
  revalidateTeam()
  return { success: true }
}

/* ── Activar / desactivar ─────────────────────────────────────────── */
export async function setMemberActive(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const userId = String(formData.get("user_id") ?? "")
  const active = String(formData.get("active") ?? "") === "true"
  if (!uuid.safeParse(userId).success) return { error: "Miembro inválido." }
  if (userId === ctx.userId) return { error: "No puedes desactivar tu propia cuenta." }

  const admin = createAdminClient()
  const membership = await getMembership(admin, ctx.business.id, userId)
  if (!membership) return { error: "Esa persona no pertenece a esta cafetería." }
  if (membership.role === "owner" && ctx.role !== "owner") {
    return { error: "Solo el dueño puede desactivar a otro dueño." }
  }
  if (!active && membership.role === "owner" && membership.is_active) {
    if ((await countActiveOwners(admin, ctx.business.id)) <= 1) {
      return { error: "La cafetería debe conservar al menos un dueño activo." }
    }
  }

  const { error } = await admin
    .from("business_members")
    .update({ is_active: active })
    .eq("business_id", ctx.business.id)
    .eq("user_id", userId)
  if (error) return { error: dbErrorMessage(error) }

  if (!active) {
    // Que no siga operando aquí: si este era su negocio activo, se lo quitamos.
    await admin
      .from("profiles")
      .update({ active_business_id: null })
      .eq("id", userId)
      .eq("active_business_id", ctx.business.id)
  } else {
    // Al reactivar, si quedó sin negocio activo, vuelve a este.
    await admin
      .from("profiles")
      .update({ active_business_id: ctx.business.id })
      .eq("id", userId)
      .is("active_business_id", null)
  }

  const { data: prof } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle()
  await logAudit(active ? "miembro.reactivado" : "miembro.desactivado", prof?.full_name || membership.username || userId)
  revalidateTeam()
  return { success: true }
}

/* ── Restablecer contraseña (solo cuentas de café) ────────────────── */
export async function resetMemberPassword(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const userId = String(formData.get("user_id") ?? "")
  const newPassword = String(formData.get("new_password") ?? "")
  if (!uuid.safeParse(userId).success) return { error: "Miembro inválido." }
  const passwordError = validatePassword(newPassword)
  if (passwordError) return { error: passwordError }

  const admin = createAdminClient()
  const membership = await getMembership(admin, ctx.business.id, userId)
  if (!membership) return { error: "Esa persona no pertenece a esta cafetería." }
  if (membership.role === "owner" && ctx.role !== "owner" && userId !== ctx.userId) {
    return { error: "Solo el dueño puede restablecer la contraseña de otro dueño." }
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  if (!isSyntheticEmail(authUser?.user?.email)) {
    return { error: "Esa cuenta entra con correo real: la contraseña la cambia la persona desde «Mi cuenta»." }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return { error: error.message }

  await logAudit("miembro.contrasena", membership.username ?? userId)
  return { success: true }
}

/* ── Quitar del equipo ────────────────────────────────────────────── */
export async function removeMember(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const userId = String(formData.get("user_id") ?? "")
  if (!uuid.safeParse(userId).success) return { error: "Miembro inválido." }
  if (userId === ctx.userId) return { error: "No puedes quitarte a ti mismo del equipo." }

  const admin = createAdminClient()
  const membership = await getMembership(admin, ctx.business.id, userId)
  if (!membership) return { error: "Esa persona no pertenece a esta cafetería." }
  if (membership.role === "owner" && ctx.role !== "owner") {
    return { error: "Solo el dueño puede quitar a otro dueño." }
  }
  if (membership.role === "owner" && membership.is_active && (await countActiveOwners(admin, ctx.business.id)) <= 1) {
    return { error: "La cafetería debe conservar al menos un dueño activo." }
  }

  const { count } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("business_id", ctx.business.id)
    .eq("cashier_id", userId)
  if (count && count > 0) {
    return {
      error: `Esta persona tiene ${count} venta(s) registradas aquí. Desactívala en lugar de quitarla, para conservar el historial.`,
    }
  }

  const { error } = await admin
    .from("business_members")
    .delete()
    .eq("business_id", ctx.business.id)
    .eq("user_id", userId)
  if (error) return { error: dbErrorMessage(error) }

  await admin
    .from("profiles")
    .update({ active_business_id: null })
    .eq("id", userId)
    .eq("active_business_id", ctx.business.id)

  // Cuenta de café sin más membresías: se elimina por completo (no tiene correo real).
  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  if (isSyntheticEmail(authUser?.user?.email)) {
    const { count: others } = await admin
      .from("business_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
    if (!others) {
      await admin.auth.admin.deleteUser(userId)
    }
  }

  await logAudit("miembro.eliminado", membership.username ?? userId)
  revalidateTeam()
  return { success: true }
}

/* ── Correo de acceso ─────────────────────────────────────────────── */

/**
 * Correos de los miembros, para mostrarlos en /admin/equipo. Viven en
 * `auth.users`, así que hacen falta permisos de servicio. De las cuentas de
 * café se devuelve null: su correo es interno y no se enseña como correo.
 */
export async function getMemberEmails(
  userIds: string[],
): Promise<ActionResult<{ emails: Record<string, string | null> }>> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const admin = createAdminClient()
  const emails: Record<string, string | null> = {}
  for (const id of userIds.slice(0, 100)) {
    if (!uuid.safeParse(id).success) continue
    const { data } = await admin.auth.admin.getUserById(id)
    const email = data?.user?.email ?? null
    emails[id] = email && !isSyntheticEmail(email) ? email : null
  }
  return { success: true, emails }
}

/**
 * Corrige el correo con el que entra un miembro. Es la única salida cuando el
 * correo quedó mal escrito: esa persona no puede entrar NI recuperar su
 * contraseña, así que no puede arreglarlo ella misma desde «Mi cuenta».
 *
 * El correo nuevo queda confirmado de inmediato (a propósito): pedir
 * confirmación al correo viejo sería pedírsela a un buzón que no existe.
 */
export async function changeMemberEmail(formData: FormData): Promise<ActionResult<{ email: string }>> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const userId = String(formData.get("user_id") ?? "")
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!uuid.safeParse(userId).success) return { error: "Miembro inválido." }
  if (!z.string().email().safeParse(email).success) return { error: "Escribe un correo válido." }
  if (isSyntheticEmail(email)) {
    return { error: "Ese dominio es interno del sistema; usa el correo real de la persona." }
  }

  const admin = createAdminClient()
  const membership = await getMembership(admin, ctx.business.id, userId)
  if (!membership) return { error: "Esa persona no pertenece a esta cafetería." }
  if (membership.role === "owner" && ctx.role !== "owner" && userId !== ctx.userId) {
    return { error: "Solo el dueño puede cambiar el correo de otro dueño." }
  }

  const { data: target } = await admin.auth.admin.getUserById(userId)
  const currentEmail = target?.user?.email ?? ""
  if (!currentEmail) return { error: "No se encontró la cuenta de esa persona." }
  if (isSyntheticEmail(currentEmail)) {
    return {
      error: "Esa cuenta entra con usuario y café, no con correo. Para darle acceso por correo, agrégala de nuevo con su correo.",
    }
  }

  // Un administrador de cafetería no puede apoderarse de la cuenta de un
  // operador de la plataforma cambiándole el correo.
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("full_name, is_platform_admin")
    .eq("id", userId)
    .maybeSingle()
  if (targetProfile?.is_platform_admin && !ctx.isPlatformAdmin) {
    return { error: "No puedes cambiar el correo de un operador de la plataforma." }
  }

  if (currentEmail === email) return { error: "Ese ya es su correo actual." }

  const { data: taken } = await admin.rpc("find_user_id_by_email", { p_email: email })
  if (taken && taken !== userId) return { error: "Ya existe una cuenta con ese correo." }

  const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (error) return { error: error.message }

  await logAudit("miembro.correo", targetProfile?.full_name || email, {
    antes: currentEmail,
    ahora: email,
  })
  revalidateTeam()
  return { success: true, email }
}
