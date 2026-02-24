"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/* ── Domain used for username-based auth ─────────────────────────── */
const EMAIL_DOMAIN = "cafecitojaral.com"

function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@${EMAIL_DOMAIN}`
}

/* ── Login ────────────────────────────────────────────────────────── */
export async function login(formData: FormData) {
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
    return { error: "Usuario no encontrado." }
  }

  // Get their actual auth email (whatever it is)
  const { data: authData } = await admin.auth.admin.getUserById(profile.id)
  const email = authData?.user?.email

  if (!email) {
    return { error: "Error al obtener datos del usuario." }
  }

  // Sign in with their real email + the password provided
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: "Contraseña incorrecta." }
  }

  redirect("/")
}

/* ── Logout ───────────────────────────────────────────────────────── */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

/* ── Create cajero (admin only) ───────────────────────────────────── */
export async function createCajero(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim()
  const fullName = String(formData.get("full_name") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const role = String(formData.get("role") ?? "cajero")

  if (!username || !fullName || !password) {
    return { error: "Usuario, nombre completo y contraseña son obligatorios." }
  }

  if (username.length < 3) {
    return { error: "El usuario debe tener al menos 3 caracteres." }
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." }
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
    .eq("username", username.toLowerCase())
    .maybeSingle()

  if (existing) {
    return { error: `El usuario "${username}" ya existe.` }
  }

  // Create auth user
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (authError || !authUser.user) {
    return { error: authError?.message ?? "No se pudo crear el usuario." }
  }

  // Update profile with role and username
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      username: username.toLowerCase(),
      role,
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

/* ── Update cajero ────────────────────────────────────────────────── */
export async function updateCajero(formData: FormData) {
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

  const admin = createAdminClient()

  // Update profile
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, role })
    .eq("id", id)

  if (profileError) {
    return { error: profileError.message }
  }

  // Update password if provided
  if (newPassword) {
    if (newPassword.length < 6) {
      return { error: "La contraseña debe tener al menos 6 caracteres." }
    }

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

/* ── Delete cajero ────────────────────────────────────────────────── */
export async function deleteCajero(formData: FormData) {
  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  // Prevent deleting yourself
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user?.id === id) {
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
