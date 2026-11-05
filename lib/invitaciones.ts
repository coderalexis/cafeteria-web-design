import { createHash, randomBytes } from "node:crypto"
import { escapeHtml } from "./receipt"
import { ROLE_LABELS, type BusinessRole } from "./context-shape"

/**
 * Invitaciones al equipo por correo (migración 61). La persona invitada
 * decide: nadie entra a un café sin aceptar, y nadie crea una cuenta a nombre
 * de un correo ajeno. Lo puro vive aquí; las acciones en
 * app/actions/invitaciones.ts y la pantalla en app/invitacion/[token].
 */

/** Cuánto dura un enlace. Reenviar lo renueva. */
export const VIGENCIA_DIAS = 7

/**
 * Cuántas invitaciones (envíos o reenvíos) puede mandar un café en 24 horas.
 * Un equipo de cafetería se arma con 2 o 3; el tope existe para que nadie use
 * el correo del sistema para mandar spam a quien sea.
 */
export const TOPE_POR_DIA = 20

/** Token del enlace: 32 bytes al azar, legibles en una URL. Solo viaja en el correo. */
export function nuevoToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Lo que se guarda: el sha256 del token. Quien lea la tabla no puede aceptar nada. */
export function hashDelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** ¿Tiene forma de token? Antes de tocar la base: un enlace mal copiado no consulta nada. */
export function pareceToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export type EstadoInvitacion = "viva" | "vencida" | "aceptada" | "cancelada"

export function estadoInvitacion(
  inv: { expires_at: string; accepted_at: string | null; revoked_at: string | null },
  ahora: Date = new Date(),
): EstadoInvitacion {
  if (inv.accepted_at) return "aceptada"
  if (inv.revoked_at) return "cancelada"
  if (Date.parse(inv.expires_at) <= ahora.getTime()) return "vencida"
  return "viva"
}

/** Lo que ve quien abre un enlace que ya no sirve. */
export function mensajeDeEstado(estado: Exclude<EstadoInvitacion, "viva"> | "no-existe"): string {
  switch (estado) {
    case "aceptada":
      return "Esta invitación ya se usó. Si eres tú, entra con tu cuenta."
    case "cancelada":
      return "Esta invitación se canceló. Pídele a quien te invitó que te mande otra."
    case "vencida":
      return `Esta invitación venció (duran ${VIGENCIA_DIAS} días). Pídele a quien te invitó que te la reenvíe.`
    case "no-existe":
      return "Este enlace no es válido. Revisa que lo hayas copiado completo, o pide que te reenvíen la invitación."
  }
}

/** El correo de la invitación, en HTML y en texto. Todo lo que viene de la gente va escapado. */
export function correoDeInvitacion(d: {
  cafe: string
  quienInvita: string
  rol: BusinessRole
  enlace: string
}): { asunto: string; html: string; texto: string } {
  const rol = ROLE_LABELS[d.rol].toLowerCase()
  const quien = d.quienInvita.trim() || "El equipo"
  const asunto = `${d.cafe} te invitó a su equipo en Cafecito POS`
  const texto = [
    `${quien} te invitó a ${d.cafe} como ${rol}.`,
    "",
    "Para aceptar, abre este enlace:",
    d.enlace,
    "",
    `El enlace dura ${VIGENCIA_DIAS} días. Si no esperabas esta invitación, ignora este correo: nadie entra a tu nombre sin que la aceptes.`,
  ].join("\n")
  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#faf7f2;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#292524">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<p style="font-size:16px;line-height:1.5;margin:0 0 16px"><strong>${escapeHtml(quien)}</strong> te invitó a <strong>${escapeHtml(d.cafe)}</strong> como ${escapeHtml(rol)}.</p>
<p style="margin:24px 0"><a href="${escapeHtml(d.enlace)}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Ver la invitación</a></p>
<p style="font-size:13px;line-height:1.5;color:#78716c;margin:0">El enlace dura ${VIGENCIA_DIAS} días. Si no esperabas esta invitación, ignora este correo: nadie entra a tu nombre sin que la aceptes.</p>
</div></body></html>`
  return { asunto, html, texto }
}
