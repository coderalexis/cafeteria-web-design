"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { homePathFor, parseContext } from "@/lib/context-shape"
import { normalizeSlug, normalizeUsername, SLUG_PATTERN, USERNAME_PATTERN, validatePassword } from "@/lib/accounts"
import type { ActionResult } from "./types"

// Mensaje único para usuario inexistente, café incorrecto y contraseña
// incorrecta: no revelar cuál de los tres falló (enumeración de usuarios).
const LOGIN_ERROR = "Usuario, café o contraseña incorrectos."

/* ── Login ────────────────────────────────────────────────────────── */
/**
 * Dos formas de entrar:
 * - Correo + contraseña (dueños/administradores con correo real).
 * - Usuario + café + contraseña (cuentas de café: `business_members.username`
 *   dentro del negocio con ese slug). El correo real de la cuenta se resuelve
 *   en el servidor con la service role; el cliente nunca lo ve.
 */
export async function login(formData: FormData): Promise<ActionResult> {
  const identifier = String(formData.get("identifier") ?? formData.get("username") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const businessSlug = normalizeSlug(String(formData.get("business") ?? ""))

  if (!identifier || !password) {
    return { error: "Usuario y contraseña son obligatorios." }
  }

  let email: string
  let businessId: string | null = null

  if (identifier.includes("@")) {
    email = identifier.toLowerCase()
    if (businessSlug && !SLUG_PATTERN.test(businessSlug)) {
      return { error: LOGIN_ERROR }
    }
  } else {
    const username = normalizeUsername(identifier)
    if (!businessSlug) {
      return { error: "Indica el café al que perteneces (o entra con tu correo)." }
    }
    if (!USERNAME_PATTERN.test(username) || !SLUG_PATTERN.test(businessSlug)) {
      return { error: LOGIN_ERROR }
    }

    const admin = createAdminClient()
    const { data: business } = await admin
      .from("businesses")
      .select("id")
      .eq("slug", businessSlug)
      .maybeSingle()
    if (!business) {
      return { error: LOGIN_ERROR }
    }

    const { data: member } = await admin
      .from("business_members")
      .select("user_id")
      .eq("business_id", business.id)
      .eq("username", username)
      .eq("is_active", true)
      .maybeSingle()
    if (!member) {
      return { error: LOGIN_ERROR }
    }

    const { data: authData } = await admin.auth.admin.getUserById(member.user_id)
    if (!authData?.user?.email) {
      return { error: LOGIN_ERROR }
    }
    email = authData.user.email
    businessId = business.id
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: LOGIN_ERROR }
  }

  // Si entró por café, ese pasa a ser el negocio activo. Si entró por correo
  // e indicó un café al que pertenece, también.
  if (!businessId && businessSlug) {
    const { data: ctx0 } = await supabase.rpc("my_context")
    const membership = parseContext(ctx0)?.memberships.find((m) => m.slug === businessSlug)
    businessId = membership?.id ?? null
  }
  if (businessId) {
    await supabase.rpc("set_active_business", { p_business_id: businessId })
  }

  let { data: ctxJson } = await supabase.rpc("my_context")
  let ctx = parseContext(ctxJson)

  // Sin negocio activo pero con una sola membresía → se activa sola.
  if (ctx && !ctx.business && ctx.memberships.length === 1) {
    ;({ data: ctxJson } = await supabase.rpc("set_active_business", {
      p_business_id: ctx.memberships[0].id,
    }))
    ctx = parseContext(ctxJson)
  }

  redirect(homePathFor(ctx))
}

/* ── Logout ───────────────────────────────────────────────────────── */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

/* ── Cambiar mi contraseña (/cuenta) ──────────────────────────────── */
export async function changeOwnPassword(formData: FormData): Promise<ActionResult> {
  const current = String(formData.get("current_password") ?? "")
  const next = String(formData.get("new_password") ?? "")
  const confirm = String(formData.get("confirm_password") ?? "")

  if (!current || !next || !confirm) {
    return { error: "Completa los tres campos." }
  }
  if (next !== confirm) {
    return { error: "La confirmación no coincide con la nueva contraseña." }
  }
  if (next === current) {
    return { error: "La nueva contraseña debe ser distinta a la actual." }
  }
  const passwordError = validatePassword(next)
  if (passwordError) {
    return { error: passwordError }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { error: "Sesión inválida." }
  }

  // Verifica la contraseña actual antes de cambiarla.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  })
  if (verifyError) {
    return { error: "La contraseña actual es incorrecta." }
  }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) {
    return { error: "No se pudo cambiar la contraseña. Intenta de nuevo." }
  }

  return { success: true }
}
