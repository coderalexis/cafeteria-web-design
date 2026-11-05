"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { landingPathFor, parseContext } from "@/lib/context-shape"
import { validatePassword } from "@/lib/accounts"
import { estadoInvitacion, mensajeDeEstado } from "@/lib/invitaciones"
import { buscarInvitacion, type InvitacionEncontrada } from "@/lib/invitaciones-servidor"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Aceptar una invitación al equipo (migración 61). Quien llega aquí    */
/*  NO tiene todavía membresía en el café, así que todo lo del café va   */
/*  con service role; lo de la persona (entrar, su café activo) va con   */
/*  SU sesión. Lo que decide es el token del enlace, que solo viajó al   */
/*  correo invitado.                                                     */
/* ------------------------------------------------------------------ */

const CONTRASENA_INCORRECTA = "Contraseña incorrecta. Si no la recuerdas, usa «Olvidé mi contraseña»."

/**
 * Tres caminos, decididos AQUÍ (no por lo que diga la pantalla):
 *   · ya entró con el correo invitado → se une;
 *   · el correo tiene cuenta → entra con su contraseña y se une;
 *   · el correo no tiene cuenta → la crea con SU nombre y SU contraseña. Abrir
 *     el enlace que llegó a ese correo prueba que el correo es suyo, por eso
 *     la cuenta nace confirmada.
 */
export async function aceptarInvitacion(input: {
  token: string
  password?: string
  fullName?: string
}): Promise<ActionResult> {
  const admin = createAdminClient()
  const inv = await buscarInvitacion(admin, String(input.token ?? ""))
  if (!inv) return { error: mensajeDeEstado("no-existe") }
  const estado = estadoInvitacion(inv)
  if (estado !== "viva") return { error: mensajeDeEstado(estado) }
  if (inv.cafe.status !== "active") return { error: `${inv.cafe.name} está pausada por ahora. Intenta más tarde.` }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const password = String(input.password ?? "")

  let userId: string
  let nombre: string
  if (user) {
    if ((user.email ?? "").toLowerCase() !== inv.email) {
      return { error: `Esta invitación es para ${inv.email}. Sal de tu sesión para aceptarla con esa cuenta.` }
    }
    userId = user.id
    nombre = String(user.user_metadata?.full_name ?? "")
  } else {
    const { data: existente } = await admin.rpc("find_user_id_by_email", { p_email: inv.email })
    if (existente) {
      if (!password) return { error: "Escribe tu contraseña." }
      const { data, error } = await supabase.auth.signInWithPassword({ email: inv.email, password })
      if (error || !data.user) return { error: CONTRASENA_INCORRECTA }
      userId = data.user.id
      nombre = String(data.user.user_metadata?.full_name ?? "")
    } else {
      nombre = String(input.fullName ?? "").trim()
      if (!nombre || nombre.length > 80) return { error: "Escribe tu nombre (máximo 80 caracteres)." }
      const problema = validatePassword(password)
      if (problema) return { error: problema }
      const { data: creada, error } = await admin.auth.admin.createUser({
        email: inv.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: nombre },
      })
      if (error || !creada.user) {
        return {
          error: /already|registered|exists/i.test(error?.message ?? "")
            ? "Ese correo ya tiene cuenta: recarga la página y entra con tu contraseña."
            : "No se pudo crear tu cuenta. Vuelve a intentar.",
        }
      }
      userId = creada.user.id
      // El trigger crea el perfil; el nombre se asegura por si corrió sin metadata.
      await admin.from("profiles").update({ full_name: nombre }).eq("id", userId)
      const { error: eEntrar } = await supabase.auth.signInWithPassword({ email: inv.email, password })
      if (eEntrar) {
        // La cuenta existe pero no hay sesión: se une igual y que entre por /login.
        const unida = await unirAlCafe(admin, inv, userId, nombre)
        if (unida) return { error: unida }
        redirect("/login")
      }
    }
  }

  const problema = await unirAlCafe(admin, inv, userId, nombre)
  if (problema) return { error: problema }

  // El café al que se acaba de unir pasa a ser el activo: es a donde iba.
  const { data } = await supabase.rpc("set_active_business", { p_business_id: inv.cafe.id })
  redirect(landingPathFor(parseContext(data)))
}

/**
 * La invitación se RECLAMA primero (una sola vez, aunque toquen el botón dos
 * veces o dos aparatos a la vez) y luego se da la membresía. Si la membresía
 * falla, la invitación se suelta para poder reintentar.
 */
async function unirAlCafe(
  admin: ReturnType<typeof createAdminClient>,
  inv: InvitacionEncontrada,
  userId: string,
  nombre: string,
): Promise<string | null> {
  const { data: reclamada } = await admin
    .from("team_invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", inv.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle()
  if (!reclamada) return mensajeDeEstado("aceptada")

  const { data: previa } = await admin
    .from("business_members")
    .select("is_active")
    .eq("business_id", inv.cafe.id)
    .eq("user_id", userId)
    .maybeSingle()
  // Si ya estaba (activa), se queda con su rol: aceptar no le baja de dueño a
  // cajero. Si estaba dada de baja, vuelve con el rol de la invitación.
  const { error } = previa
    ? previa.is_active
      ? { error: null }
      : await admin
          .from("business_members")
          .update({ is_active: true, role: inv.role })
          .eq("business_id", inv.cafe.id)
          .eq("user_id", userId)
    : await admin.from("business_members").insert({
        business_id: inv.cafe.id,
        user_id: userId,
        role: inv.role,
        username: null,
      })
  if (error) {
    await admin.from("team_invitations").update({ accepted_at: null, accepted_by: null }).eq("id", inv.id)
    return "No se pudo completar. Vuelve a intentar."
  }

  // Bitácora del café: log_audit exige ser admin del café activo, así que va
  // directo (como las bitácoras del lado del cajero).
  await admin.from("audit_events").insert({
    business_id: inv.cafe.id,
    actor_id: userId,
    actor_name: nombre,
    action: "miembro.acepto",
    entity: inv.email,
    details: { rol: inv.role },
  })
  return null
}

/** Salir de la sesión de OTRA cuenta para aceptar con la invitada. Solo este aparato. */
export async function salirParaAceptar(token: string): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect(`/invitacion/${encodeURIComponent(token)}`)
}
