"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { landingPathFor, parseContext } from "@/lib/context-shape"
import {
  elegirCafe,
  isSyntheticEmail,
  normalizeSlug,
  normalizeUsername,
  SLUG_PATTERN,
  USERNAME_PATTERN,
  validatePassword,
  type CandidatoCafe,
} from "@/lib/accounts"
import { LOGIN_FALTA_CAFE } from "@/lib/login-mensajes"
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
  // El café puede venir de dos sitios y no valen lo mismo: si lo ESCRIBIÓ la
  // persona (se lo pedimos) tiene que coincidir; si lo recordó el dispositivo
  // es solo una pista. Ver `elegirCafe`.
  const cafeEscrito = String(formData.get("cafeEscrito") ?? "") === "1"

  if (!identifier || !password) {
    return { error: "Usuario y contraseña son obligatorios." }
  }

  let email: string
  let businessId: string | null = null
  // Con correo, el café es opcional (solo sirve para dejarlo activo si es miembro);
  // un valor raro guardado en el dispositivo no debe impedir entrar.
  const wantedSlug = SLUG_PATTERN.test(businessSlug) ? businessSlug : ""

  if (identifier.includes("@")) {
    email = identifier.toLowerCase()
  } else {
    const username = normalizeUsername(identifier)
    if (!USERNAME_PATTERN.test(username)) {
      return { error: LOGIN_ERROR }
    }

    // Se busca en TODOS los cafés: el campo del café va oculto porque casi
    // nadie tiene que escribirlo. El usuario es único POR CAFÉ, no en la
    // plataforma, así que esto puede traer varios («cajero», «admin»).
    const admin = createAdminClient()
    const { data: filas } = await admin
      .from("business_members")
      .select("business_id, user_id, businesses(slug)")
      .eq("username", username)
      .eq("is_active", true)

    const candidatos: CandidatoCafe[] = (filas ?? []).flatMap((f) => {
      const rel = f.businesses as { slug?: string } | { slug?: string }[] | null
      const slug = Array.isArray(rel) ? rel[0]?.slug : rel?.slug
      return slug ? [{ businessId: f.business_id, slug, userId: f.user_id }] : []
    })

    const elegido = elegirCafe(candidatos, { valor: businessSlug, escrito: cafeEscrito })
    if (elegido.tipo === "ninguno") {
      return { error: LOGIN_ERROR }
    }
    if (elegido.tipo === "varios") {
      // Lo único que se revela es que ese usuario está repetido. No ayuda a
      // entrar —la contraseña sigue haciendo falta— y es lo mismo que se
      // averiguaría probando. A cambio, el campo desaparece para todos.
      return { error: LOGIN_FALTA_CAFE }
    }

    const { data: authData } = await admin.auth.admin.getUserById(elegido.candidato.userId)
    if (!authData?.user?.email) {
      return { error: LOGIN_ERROR }
    }
    email = authData.user.email
    businessId = elegido.candidato.businessId
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: LOGIN_ERROR }
  }

  // Cada consulta a Supabase es un viaje de ida y vuelta por la red, y este
  // punto es el más caro del sistema: entre el middleware y esta action se
  // encadenaban seis. Con arranque en frío eso rebasaba el límite de tiempo
  // de la función y devolvía 504 (le pasó a una cafetería real). Por eso
  // ahora se REUTILIZA lo que cada llamada ya devuelve en vez de volver a
  // preguntar: set_active_business responde el contexto completo, igual que
  // my_context.
  let ctx = null as ReturnType<typeof parseContext>

  // Si entró por café, ese pasa a ser el negocio activo. Si entró por correo
  // e indicó un café al que pertenece, también.
  if (!businessId && wantedSlug) {
    const { data: ctx0 } = await supabase.rpc("my_context")
    ctx = parseContext(ctx0)
    businessId = ctx?.memberships.find((m) => m.slug === wantedSlug)?.id ?? null
  }

  if (businessId) {
    const { data } = await supabase.rpc("set_active_business", { p_business_id: businessId })
    ctx = parseContext(data)
  } else if (!ctx) {
    const { data } = await supabase.rpc("my_context")
    ctx = parseContext(data)
  }

  // Sin negocio activo pero con una sola membresía → se activa sola.
  if (ctx && !ctx.business && ctx.memberships.length === 1) {
    const { data } = await supabase.rpc("set_active_business", {
      p_business_id: ctx.memberships[0].id,
    })
    ctx = parseContext(data)
  }

  redirect(landingPathFor(ctx))
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

/* ── ¿Olvidaste tu contraseña? (solo cuentas con correo real) ─────── */
export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Escribe un correo válido." }
  }
  if (isSyntheticEmail(email)) {
    return {
      error:
        "Las cuentas de café entran con su usuario, no con correo. Pide a tu administrador que restablezca tu contraseña desde Equipo.",
    }
  }

  const supabase = await createClient()
  // Supabase no revela si el correo existe (solo envía cuando sí); nosotros tampoco.
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) {
    if (/rate|seconds|frequen/i.test(error.message)) {
      return { error: "Ya se envió un correo hace poco. Espera unos minutos e intenta de nuevo." }
    }
    return { error: "No se pudo enviar el correo. Intenta de nuevo más tarde." }
  }
  return { success: true }
}

/* ── Nueva contraseña desde el enlace de recuperación ─────────────── */
export async function completePasswordReset(formData: FormData): Promise<ActionResult> {
  const next = String(formData.get("new_password") ?? "")
  const confirm = String(formData.get("confirm_password") ?? "")

  if (!next || !confirm) {
    return { error: "Completa ambos campos." }
  }
  if (next !== confirm) {
    return { error: "La confirmación no coincide con la nueva contraseña." }
  }
  const passwordError = validatePassword(next)
  if (passwordError) {
    return { error: passwordError }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "El enlace caducó. Solicita uno nuevo desde «¿Olvidaste tu contraseña?»." }
  }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) {
    if (/different from the old/i.test(error.message)) {
      return { error: "La nueva contraseña debe ser distinta a la anterior." }
    }
    return { error: "No se pudo guardar la contraseña. Intenta de nuevo." }
  }
  return { success: true }
}
