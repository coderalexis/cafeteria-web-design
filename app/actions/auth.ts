"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth"
import type { ActionResult } from "./types"

/* ── Domain used for username-based auth ─────────────────────────── */
const EMAIL_DOMAIN = "cafecitojaral.com"

// Solo minúsculas/números/punto/guiones: el username forma la parte local
// del email sintético, y así también evita enumeración por variantes.
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

// Mensaje único para usuario inexistente y contraseña incorrecta:
// no revelar cuál de los dos falló (enumeración de usuarios).
const LOGIN_ERROR = "Usuario o contraseña incorrectos."

// Debe coincidir con la política de Supabase Auth (Sign In / Providers → Email):
// mínimo 8 caracteres, al menos una letra y un dígito. Se valida aquí para
// que el error salga en español desde el formulario y no desde Supabase.
const PASSWORD_MIN_LENGTH = 8

function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir al menos una letra y un número."
  }
  return null
}

function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@${EMAIL_DOMAIN}`
}

/* ── Login ────────────────────────────────────────────────────────── */
export async function login(formData: FormData): Promise<ActionResult> {
  const username = String(formData.get("username") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!username || !password) {
    return { error: "Usuario y contraseña son obligatorios." }
  }

  // Look up the username in profiles to find the user
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username.toLowerCase())
    .maybeSingle()

  if (!profile) {
    return { error: LOGIN_ERROR }
  }

  // Get their actual auth email (whatever it is)
  const { data: authData } = await admin.auth.admin.getUserById(profile.id)
  const email = authData?.user?.email

  if (!email) {
    return { error: LOGIN_ERROR }
  }

  // Sign in with their real email + the password provided
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: LOGIN_ERROR }
  }

  // Redirect based on role
  const { data: roleData } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profile.id)
    .maybeSingle()

  redirect(roleData?.role === "admin" ? "/admin" : "/pos")
}

/* ── Logout ───────────────────────────────────────────────────────── */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

/* ── Create cajero (admin only) ───────────────────────────────────── */
export async function createCajero(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) {
    return { error: authError }
  }

  const username = String(formData.get("username") ?? "").trim().toLowerCase()
  const fullName = String(formData.get("full_name") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const role = String(formData.get("role") ?? "cajero")

  if (!username || !fullName || !password) {
    return { error: "Usuario, nombre completo y contraseña son obligatorios." }
  }

  if (username.length < 3) {
    return { error: "El usuario debe tener al menos 3 caracteres." }
  }

  if (!USERNAME_PATTERN.test(username)) {
    return { error: "El usuario solo puede llevar letras, números, punto y guiones." }
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    return { error: passwordError }
  }

  if (!["admin", "cajero"].includes(role)) {
    return { error: "Rol inválido." }
  }

  const email = usernameToEmail(username)
  const admin = createAdminClient()

  // Check if username already exists
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle()

  if (existing) {
    return { error: `El usuario "${username}" ya existe.` }
  }

  // Create auth user
  const { data: authUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (createError || !authUser.user) {
    return { error: createError?.message ?? "No se pudo crear el usuario." }
  }

  // Update profile with role and username
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      username,
      role: role as "admin" | "cajero",
    })
    .eq("id", authUser.user.id)

  if (profileError) {
    // Rollback: delete auth user
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath("/admin", "layout")
  return { success: true }
}

/* ── Update cajero (admin only) ───────────────────────────────────── */
export async function updateCajero(formData: FormData): Promise<ActionResult> {
  const { error: authError } = await requireAdmin()
  if (authError) {
    return { error: authError }
  }

  const id = String(formData.get("id") ?? "")
  const fullName = String(formData.get("full_name") ?? "").trim()
  const role = String(formData.get("role") ?? "cajero")
  const newPassword = String(formData.get("new_password") ?? "")

  if (!id || !fullName) {
    return { error: "ID y nombre son obligatorios." }
  }

  if (!["admin", "cajero"].includes(role)) {
    return { error: "Rol inválido." }
  }

  // Validar todo antes de escribir, para no dejar el perfil a medio actualizar.
  if (newPassword) {
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      return { error: passwordError }
    }
  }

  const admin = createAdminClient()

  // Update profile
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, role: role as "admin" | "cajero" })
    .eq("id", id)

  if (profileError) {
    return { error: profileError.message }
  }

  // Update password if provided
  if (newPassword) {
    const { error: passError } = await admin.auth.admin.updateUserById(id, {
      password: newPassword,
    })

    if (passError) {
      return { error: `Perfil actualizado, pero error al cambiar contraseña: ${passError.message}` }
    }
  }

  revalidatePath("/admin", "layout")
  return { success: true }
}

/* ── Delete cajero (admin only) ───────────────────────────────────── */
export async function deleteCajero(formData: FormData): Promise<ActionResult> {
  const { user, error: authError } = await requireAdmin()
  if (authError || !user) {
    return { error: authError ?? "Sesión inválida." }
  }

  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  // Prevent deleting yourself
  if (user.id === id) {
    return { error: "No puedes eliminar tu propia cuenta." }
  }

  const admin = createAdminClient()

  // Check if cajero has tickets
  const { count } = await admin
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("cashier_id", id)

  if (count && count > 0) {
    return {
      error: `Este usuario tiene ${count} venta(s) registradas. No se puede eliminar.`,
    }
  }

  // Delete auth user (cascades to profile via FK)
  const { error } = await admin.auth.admin.deleteUser(id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/admin", "layout")
  return { success: true }
}
