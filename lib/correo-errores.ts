import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { escapeHtml, sendWithResend } from "@/lib/email"
import { reservarEnvio } from "@/lib/cron"
import { dateStringInTz } from "@/lib/dates"

/*
 * Vivía en app/actions/errors.ts, un archivo «use server»: todo lo que exporta
 * ese tipo de archivo es una acción que se puede llamar desde fuera, y esta
 * manda correo con permisos de servicio sin revisar quién la pide. Solo la
 * usa el cron de la mañana, así que vive aquí, en el servidor.
 */

/**
 * Resumen de las últimas 24 h para el operador. Lo dispara el cron diario;
 * si no hubo errores no manda nada, para que un correo signifique algo.
 */
export async function sendErrorDigest(options: { dryRun: boolean }): Promise<{
  sent: boolean
  count: number
  error?: string
}> {
  const admin = createAdminClient()
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await admin
    .from("app_errors")
    .select("route, message, created_at, businesses(name)")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) return { sent: false, count: 0, error: error.message }
  const filas = data ?? []
  if (filas.length === 0) return { sent: false, count: 0 }

  const grupos = new Map<string, { n: number; biz: string; route: string; message: string }>()
  for (const r of filas) {
    const biz = r.businesses as unknown as { name: string } | { name: string }[] | null
    const nombre = (Array.isArray(biz) ? biz[0]?.name : biz?.name) ?? "(sin sesión)"
    const clave = `${nombre}|${r.route}|${r.message}`
    const g = grupos.get(clave)
    if (g) g.n += 1
    else grupos.set(clave, { n: 1, biz: nombre, route: r.route, message: r.message })
  }
  const lista = [...grupos.values()].sort((a, b) => b.n - a.n)

  const destino = process.env.OPERATOR_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!destino || !apiKey) return { sent: false, count: filas.length, error: "Falta OPERATOR_EMAIL o RESEND_API_KEY." }
  if (options.dryRun) return { sent: false, count: filas.length }

  // Un correo por día (de CDMX, donde vive el operador), aunque el cron corra dos veces.
  const reserva = await reservarEnvio("correo-errores", dateStringInTz("America/Mexico_City", new Date()))
  if (!reserva.primera) return { sent: false, count: filas.length, error: "Ya se mandó el de hoy." }

  const text = lista.map((g) => `${g.n}× · ${g.biz} · ${g.route}\n   ${g.message}`).join("\n\n")
  const html = `<p>Errores y avisos de las últimas 24 horas en Cafecito POS (${filas.length} en total, ${lista.length} distintos):</p>
<table style="border-collapse:collapse;font:14px system-ui">
${lista
  .map(
    (g) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap"><b>${g.n}×</b></td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(g.biz)} · <code>${escapeHtml(g.route)}</code><br><span style="color:#555">${escapeHtml(g.message)}</span></td></tr>`,
  )
  .join("\n")}
</table>
<p style="color:#777;font-size:12px">El detalle con traza y hora está en /super.</p>`

  const fallo = await sendWithResend({
    apiKey,
    fromName: "Cafecito POS",
    fromAddress: "alertas@cafecitopos.com",
    to: [destino],
    subject: `Cafecito POS: ${filas.length} ${filas.length === 1 ? "aviso o error" : "avisos y errores"} en las últimas 24 h`,
    html,
    text,
  })
  if (fallo) {
    await reserva.liberar()
    return { sent: false, count: filas.length, error: fallo }
  }
  return { sent: true, count: filas.length }
}
