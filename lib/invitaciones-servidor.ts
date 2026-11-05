import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendWithResend } from "@/lib/email"
import type { BusinessRole } from "@/lib/context-shape"
import { correoDeInvitacion, hashDelToken, pareceToken } from "@/lib/invitaciones"

type Admin = ReturnType<typeof createAdminClient>

export interface InvitacionEncontrada {
  id: string
  email: string
  fullName: string
  role: BusinessRole
  invitedByName: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  cafe: { id: string; name: string; status: string }
}

/**
 * La invitación de un enlace, con su café. Se busca por el sha256 del token:
 * la tabla nunca tiene el token en claro. null si el enlace no existe.
 */
export async function buscarInvitacion(admin: Admin, token: string): Promise<InvitacionEncontrada | null> {
  if (!pareceToken(token)) return null
  const { data: inv } = await admin
    .from("team_invitations")
    .select("id, email, full_name, role, invited_by_name, expires_at, accepted_at, revoked_at, business_id")
    .eq("token_hash", hashDelToken(token))
    .maybeSingle()
  if (!inv) return null
  const { data: cafe } = await admin.from("businesses").select("id, name, status").eq("id", inv.business_id).maybeSingle()
  if (!cafe) return null
  return {
    id: inv.id,
    email: inv.email,
    fullName: inv.full_name,
    role: inv.role,
    invitedByName: inv.invited_by_name,
    expires_at: inv.expires_at,
    accepted_at: inv.accepted_at,
    revoked_at: inv.revoked_at,
    cafe,
  }
}

/**
 * Manda el correo con el enlace. Devuelve null si salió, o el motivo. Sin
 * `RESEND_API_KEY` (en local) no sale nada y se dice.
 *
 * El remitente es siempre «Cafecito POS»: el nombre del café va en el texto,
 * no en el remitente, para que nadie se haga pasar por otro con el nombre de
 * su cafetería.
 */
export async function mandarInvitacion(d: {
  email: string
  token: string
  cafe: string
  quienInvita: string
  rol: BusinessRole
}): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return "Falta RESEND_API_KEY."
  const origen = process.env.NEXT_PUBLIC_SITE_URL || "https://cafecitopos.com"
  const c = correoDeInvitacion({
    cafe: d.cafe,
    quienInvita: d.quienInvita,
    rol: d.rol,
    enlace: `${origen}/invitacion/${d.token}`,
  })
  return sendWithResend({
    apiKey,
    fromName: "Cafecito POS",
    fromAddress: "no-reply@cafecitopos.com",
    to: [d.email],
    subject: c.asunto,
    html: c.html,
    text: c.texto,
  })
}
