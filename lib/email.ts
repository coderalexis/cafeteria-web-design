import "server-only"

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
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${args.fromName} <${args.fromAddress ?? "resumen@cafecitopos.com"}>`,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    return `Resend ${response.status}: ${body.slice(0, 200)}`
  }
  return null
}

/** Escapa lo mínimo para meter texto ajeno en un HTML de correo. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
