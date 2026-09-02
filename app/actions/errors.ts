"use server"

import { z } from "@/lib/zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSuperAdmin } from "@/lib/context"
import { escapeHtml, sendWithResend } from "@/lib/email"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Errores visibles.                                                  */
/*                                                                     */
/*  Si el POS truena un sábado a las 8 de la mañana, hasta hoy nadie   */
/*  se enteraba hasta que el dueño llamara. Los límites de error lo    */
/*  reportan aquí; el RPC lo guarda (con anti-tormenta), /super lo     */
/*  enseña, y el cron de la mañana manda un resumen si hubo algo.      */
/*                                                                     */
/*  Sin proveedor externo, a propósito: con dos cafeterías, una tabla  */
/*  y el correo que ya existe alcanzan, y no se agrega otra cuenta que */
/*  pagar ni otra llave que cuidar.                                    */
/* ------------------------------------------------------------------ */

const reporteSchema = z.object({
  route: z.string().max(200),
  message: z.string().max(500),
  digest: z.string().max(64).optional(),
  stack: z.string().max(4000).optional(),
  userAgent: z.string().max(300).optional(),
})

/**
 * Lo llama un límite de error desde el navegador. Nunca falla hacia afuera:
 * un reporte que revienta dentro de una pantalla que ya reventó solo
 * empeora las cosas.
 */
export async function reportClientError(input: z.infer<typeof reporteSchema>): Promise<void> {
  const parsed = reporteSchema.safeParse(input)
  if (!parsed.success) return
  try {
    const supabase = await createClient()
    await supabase.rpc("report_error", {
      p_route: parsed.data.route,
      p_message: parsed.data.message,
      p_digest: parsed.data.digest,
      p_stack: parsed.data.stack,
      p_user_agent: parsed.data.userAgent,
    })
  } catch (e) {
    console.error("[errores] no se pudo reportar", e instanceof Error ? e.message : e)
  }
}

export interface ErrorReciente {
  id: number
  businessName: string | null
  route: string
  message: string
  digest: string | null
  count: number
  lastAt: string
}

/** Para /super: los errores de los últimos días, agrupados por ruta y mensaje. */
export async function getRecentErrors(days = 7): Promise<ActionResult<{ errors: ErrorReciente[] }>> {
  const { error: authError } = await requireSuperAdmin()
  if (authError) return { error: authError }

  const admin = createAdminClient()
  const desde = new Date(Date.now() - days * 24 * 3600_000).toISOString()
  const { data, error } = await admin
    .from("app_errors")
    .select("id, business_id, route, message, digest, created_at, businesses(name)")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) return { error: error.message }

  // Se agrupa aquí y no en SQL: son a lo mucho 300 filas por hora por
  // diseño del RPC, y así el panel no necesita otro RPC.
  const grupos = new Map<string, ErrorReciente>()
  for (const r of data ?? []) {
    const biz = r.businesses as unknown as { name: string } | { name: string }[] | null
    const nombre = Array.isArray(biz) ? (biz[0]?.name ?? null) : (biz?.name ?? null)
    const clave = `${nombre ?? ""}|${r.route}|${r.message}`
    const previo = grupos.get(clave)
    if (previo) {
      previo.count += 1
    } else {
      grupos.set(clave, {
        id: r.id,
        businessName: nombre,
        route: r.route,
        message: r.message,
        digest: r.digest,
        count: 1,
        lastAt: r.created_at,
      })
    }
  }
  return { success: true, errors: [...grupos.values()] }
}

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

  const text = lista.map((g) => `${g.n}× · ${g.biz} · ${g.route}\n   ${g.message}`).join("\n\n")
  const html = `<p>Errores de las últimas 24 horas en Cafecito POS (${filas.length} en total, ${lista.length} distintos):</p>
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
    subject: `Cafecito POS: ${filas.length} error${filas.length === 1 ? "" : "es"} en las últimas 24 h`,
    html,
    text,
  })
  return fallo ? { sent: false, count: filas.length, error: fallo } : { sent: true, count: filas.length }
}
