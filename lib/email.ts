import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSyntheticEmail } from "@/lib/accounts"

/**
 * Envío de correo por Resend, en un solo lugar.
 *
 * Vivía dentro de lib/weekly-summary.ts porque el resumen semanal fue el
 * primer correo; en cuanto hubo un segundo (el resumen diario de errores)
 * copiarlo habría sido tener dos formas de fallar. Devuelve `null` si salió,
 * o el motivo en texto si no: quien llama decide si eso es grave.
 */
export async function sendWithResend(args: {
  apiKey: string
  fromName: string
  /** Buzón remitente, sin el nombre. Debe ser del dominio verificado. */
  fromAddress?: string
  to: string[]
  subject: string
  html: string
  text: string
}): Promise<string | null> {
  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${args.fromName} <${args.fromAddress ?? "resumen@cafecitopos.com"}>`,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
      // Un Resend que no contesta no puede comerse el tiempo del cron entero:
      // los demás cafés también tienen correo que mandar.
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return `Resend no contestó: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    return `Resend ${response.status}: ${body.slice(0, 200)}`
  }
  return null
}

/**
 * Correos reales de los dueños y administradores activos de una cafetería
 * (las cuentas de café, con correo sintético, no reciben). Lo usan el aviso
 * de fin de prueba y el resumen semanal; antes cada uno tenía su copia.
 */
export async function correosDeDuenos(businessId: string): Promise<{ emails: string[]; error?: string }> {
  const admin = createAdminClient()
  const { data: members, error } = await admin
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
  if (error) return { emails: [], error: error.message }
  const emails: string[] = []
  for (const member of members ?? []) {
    const { data } = await admin.auth.admin.getUserById(member.user_id)
    const email = data?.user?.email
    if (email && !isSyntheticEmail(email) && !emails.includes(email)) emails.push(email)
  }
  return { emails }
}

/** Escapa lo mínimo para meter texto ajeno en un HTML de correo. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
