import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSyntheticEmail } from "@/lib/accounts"
import { formatDateString, dateStringInTz, type DateString } from "@/lib/dates"
import { trialState } from "@/lib/signup"
import { closeStaleSessions } from "@/lib/stale-cash"

/**
 * Vigilancia diaria de las pruebas gratuitas (/api/pruebas, cron de Vercel).
 *
 * Dos cosas, en este orden de importancia:
 *   1. **Avisar.** A dos días del final y otra vez el último día. El aviso en
 *      pantalla (banner) ya está; esto es para quien no abrió el sistema.
 *   2. **Suspender la vencida** — pero no a media jornada: suspender con la
 *      caja abierta dejaría un turno sin cortar y un arqueo imposible de
 *      cuadrar. La espera NO es indefinida: antes de evaluar nada se barren
 *      las cajas olvidadas (`closeStaleSessions`), así que solo queda abierta
 *      la de un turno de verdad en curso. Sin ese barrido, una cafetería que
 *      nunca cerrara su caja nunca perdería la prueba.
 *
 * Suspender no borra nada: los datos siguen ahí y basta reactivar desde /super.
 */

export interface TrialResult {
  slug: string
  name: string
  action: "aviso" | "suspendida" | "esperando-corte" | "sin-cambios" | "error"
  detail: string
  recipients?: string[]
}

const FROM = "Cafecito POS <avisos@cafecitopos.com>"

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function trialEmail(args: {
  businessName: string
  daysLeft: number
  endsOn: DateString
}): { subject: string; html: string; text: string } {
  const ultimo = args.daysLeft <= 1
  const subject = ultimo
    ? `Hoy es el último día de tu prueba de ${args.businessName}`
    : `Tu prueba de ${args.businessName} termina en ${args.daysLeft} días`

  const cuerpo = ultimo
    ? "Hoy es el último día de tu prueba gratis. Cierra tu caja al terminar el turno para que no te queden ventas a medias: mañana la cafetería queda en pausa hasta que nos escribas."
    : `Tu prueba gratis termina el ${formatDateString(args.endsOn)}, en ${args.daysLeft} días.`

  const nota =
    "Nada se borra: tus ventas, tu menú y tu equipo se quedan como están. Si quieres seguir usando Cafecito POS, escríbenos a soporte@cafecitopos.com y lo arreglamos."

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#292524">',
    `<h1 style="font-size:19px;margin:0 0 12px">${esc(args.businessName)}</h1>`,
    `<p style="font-size:15px;line-height:1.6;margin:0 0 16px${ultimo ? ";color:#b91c1c;font-weight:600" : ""}">${esc(cuerpo)}</p>`,
    `<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${esc(nota)}</p>`,
    '<p style="font-size:13px;color:#78716c;margin:24px 0 0">Cafecito POS · cafecitopos.com</p>',
    "</div>",
  ].join("\n")

  const text = `${args.businessName}\n\n${cuerpo}\n\n${nota}\n\nCafecito POS · cafecitopos.com`
  return { subject, html, text }
}

async function sendWithResend(args: {
  apiKey: string
  to: string[]
  subject: string
  html: string
  text: string
}): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: args.to, subject: args.subject, html: args.html, text: args.text }),
  })
  if (!response.ok) return `Resend ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`
  return null
}

/** Correos reales de dueños/administradores activos (los sintéticos no reciben). */
async function ownerEmails(businessId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: members } = await admin
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
  const emails: string[] = []
  for (const member of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(member.user_id)
    const email = data?.user?.email
    if (email && !isSyntheticEmail(email) && !emails.includes(email)) emails.push(email)
  }
  return emails
}

export async function runTrialCheck(options: {
  dryRun: boolean
  onlySlug?: string | null
  now?: Date
}): Promise<{ results: TrialResult[]; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const now = options.now ?? new Date()
  const admin = createAdminClient()

  // Primero las cajas olvidadas: si no, «tiene la caja abierta» sería excusa
  // permanente para no vencer nunca.
  if (!options.dryRun) await closeStaleSessions()

  let query = admin
    .from("businesses")
    .select("id, name, slug, timezone, status, trial_ends_at")
    .eq("status", "active")
    .eq("is_template", false)
    .not("trial_ends_at", "is", null)
    .order("trial_ends_at")
  if (options.onlySlug) query = query.eq("slug", options.onlySlug)

  const { data: businesses, error } = await query
  if (error) return { results: [], error: error.message }

  const results: TrialResult[] = []

  for (const biz of businesses ?? []) {
    const base = { slug: biz.slug, name: biz.name }
    try {
      const { state, daysLeft } = trialState(biz.trial_ends_at, now)

      if (state === "expired") {
        const { count, error: cajaError } = await admin
          .from("cash_sessions")
          .select("id", { count: "exact", head: true })
          .eq("business_id", biz.id)
          .eq("status", "abierta")
        if (cajaError) {
          results.push({ ...base, action: "error", detail: cajaError.message })
          continue
        }
        if ((count ?? 0) > 0) {
          // Día de gracia: primero que cierren bien la caja.
          results.push({ ...base, action: "esperando-corte", detail: "Venció, pero tiene la caja abierta." })
          continue
        }
        if (options.dryRun) {
          results.push({ ...base, action: "suspendida", detail: "Se suspendería (venció y no hay caja abierta)." })
          continue
        }
        const { error: upError } = await admin.from("businesses").update({ status: "suspended" }).eq("id", biz.id)
        results.push(
          upError
            ? { ...base, action: "error", detail: upError.message }
            : { ...base, action: "suspendida", detail: "Prueba vencida; se suspendió sin caja abierta." },
        )
        continue
      }

      if (state !== "last-day" && state !== "ending-soon") {
        results.push({ ...base, action: "sin-cambios", detail: `Quedan ${daysLeft} días.` })
        continue
      }

      // El cron corre una vez al día, así que cada estado toca a lo más una vez.
      const emails = await ownerEmails(biz.id)
      if (emails.length === 0) {
        results.push({ ...base, action: "sin-cambios", detail: "Sin correo real a quién avisar." })
        continue
      }
      const mail = trialEmail({
        businessName: biz.name,
        daysLeft,
        endsOn: dateStringInTz(biz.timezone, new Date(biz.trial_ends_at!)),
      })
      if (options.dryRun) {
        results.push({ ...base, action: "aviso", detail: `Se avisaría: ${mail.subject}`, recipients: emails })
        continue
      }
      if (!apiKey) {
        results.push({ ...base, action: "error", detail: "Falta RESEND_API_KEY en el entorno." })
        continue
      }
      const sendError = await sendWithResend({ apiKey, to: emails, ...mail })
      results.push(
        sendError
          ? { ...base, action: "error", detail: sendError }
          : { ...base, action: "aviso", detail: mail.subject, recipients: emails },
      )
    } catch (err) {
      results.push({ ...base, action: "error", detail: err instanceof Error ? err.message : "Error inesperado." })
    }
  }

  return { results }
}
