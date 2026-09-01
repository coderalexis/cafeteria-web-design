import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendWithResend } from "@/lib/email"
import { isSyntheticEmail } from "@/lib/accounts"
import { addDays, dateStringInTz, formatDateString, type DateString } from "@/lib/dates"
import { formatCurrency } from "@/lib/format"
import { parseBusinessSettings } from "@/lib/settings"

/**
 * Resumen semanal por correo (P3b). Lo disparan el cron de Vercel
 * (/api/resumen-semanal, lunes por la mañana) y el botón de /super.
 * Corre con service role: sin sesión de usuario, agrega por negocio vía el
 * RPC weekly_summary (solo service_role) y manda el correo con Resend a los
 * dueños/administradores con correo real (los sintéticos de cajeros no).
 */

export interface WeeklySummaryData {
  business: { id: string; name: string; slug: string; timezone: string }
  from: DateString
  to: DateString
  totals: {
    tickets: number
    revenue: number
    tips_total: number
    discount_total: number
    items_sold: number
    avg_ticket: number
    cancelled_count: number
    cancelled_amount: number
  }
  previous: { tickets: number; revenue: number }
  by_day: Array<{ day: DateString; tickets: number; revenue: number }>
  top_products: Array<{
    product_name: string
    variant_name: string
    size_label: string | null
    qty: number
    revenue: number
  }>
  by_cashier: Array<{ name: string; tickets: number; revenue: number; tips: number }>
}

export interface WeeklySendResult {
  slug: string
  name: string
  status: "enviado" | "listo" | "omitido" | "error"
  detail: string
  recipients?: string[]
}

/** Semana pasada completa (lunes a domingo) en la zona del negocio. */
export function previousWeekRange(tz: string, reference: Date = new Date()): { from: DateString; to: DateString } {
  const today = dateStringInTz(tz, reference)
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = domingo
  const daysSinceMonday = (dow + 6) % 7
  const thisMonday = addDays(today, -daysSinceMonday)
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) }
}

/* ------------------------------------------------------------------ */
/*  Correo (HTML sencillo, estilos en línea: es un email)              */
/* ------------------------------------------------------------------ */

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function pctDelta(current: number, previous: number): string {
  if (previous <= 0) return ""
  const pct = Math.round(((current - previous) / previous) * 100)
  const sign = pct > 0 ? "+" : ""
  return ` (${sign}${pct}% vs. semana anterior)`
}

export function weeklyEmailSubject(s: WeeklySummaryData): string {
  return `Resumen semanal de ${s.business.name}: ${formatCurrency(s.totals.revenue)} (${formatDateString(s.from)} – ${formatDateString(s.to)})`
}

export function buildWeeklyEmailHtml(s: WeeklySummaryData): string {
  const t = s.totals
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#57534e;">${label}</td><td style="padding:6px 12px;text-align:right;font-weight:600;color:#292524;">${value}</td></tr>`
  const days = s.by_day
    .map((d) => row(formatDateString(d.day, { weekday: "long", day: "numeric" }), `${formatCurrency(d.revenue)} · ${d.tickets} venta${d.tickets === 1 ? "" : "s"}`))
    .join("")
  const tops = s.top_products
    .map((p) => {
      const label = p.variant_name && p.variant_name !== "Único" ? `${p.product_name} (${p.variant_name})` : p.product_name
      return row(esc(label), `${p.qty} uds · ${formatCurrency(p.revenue)}`)
    })
    .join("")
  const cashiers = s.by_cashier
    .map((c) => row(esc(c.name), `${formatCurrency(c.revenue)}${c.tips > 0 ? ` · propinas ${formatCurrency(c.tips)}` : ""}`))
    .join("")
  const section = (title: string, rows: string) =>
    rows
      ? `<h3 style="margin:20px 0 6px;font-size:14px;color:#78716c;text-transform:uppercase;letter-spacing:0.05em;">${title}</h3>
         <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e7e5e4;border-radius:8px;">${rows}</table>`
      : ""

  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <h1 style="font-size:20px;color:#292524;margin:0;">${esc(s.business.name)}</h1>
    <p style="color:#78716c;font-size:13px;margin:4px 0 16px;">Resumen del ${formatDateString(s.from)} al ${formatDateString(s.to)}</p>
    <div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:16px;">
      <p style="margin:0;color:#57534e;font-size:14px;">Ventas de la semana</p>
      <p style="margin:4px 0 0;font-size:28px;font-weight:bold;color:#292524;">${formatCurrency(t.revenue)}<span style="font-size:13px;font-weight:normal;color:#78716c;">${pctDelta(t.revenue, s.previous.revenue)}</span></p>
      <p style="margin:8px 0 0;color:#78716c;font-size:13px;">${t.tickets} venta${t.tickets === 1 ? "" : "s"} · ticket promedio ${formatCurrency(t.avg_ticket)} · ${t.items_sold} artículos${t.tips_total > 0 ? ` · propinas ${formatCurrency(t.tips_total)} (aparte)` : ""}${t.cancelled_count > 0 ? ` · ${t.cancelled_count} cancelada${t.cancelled_count === 1 ? "" : "s"}` : ""}</p>
    </div>
    ${section("Por día", days)}
    ${section("Más vendidos", tops)}
    ${section("Por cajero", cashiers)}
    <p style="color:#a8a29e;font-size:12px;margin-top:20px;">Cafecito POS · puedes desactivar este correo en Negocio → Resumen semanal.</p>
  </div>
</body></html>`
}

export function buildWeeklyEmailText(s: WeeklySummaryData): string {
  const t = s.totals
  const lines = [
    `${s.business.name} — resumen del ${formatDateString(s.from)} al ${formatDateString(s.to)}`,
    `Ventas: ${formatCurrency(t.revenue)}${pctDelta(t.revenue, s.previous.revenue)}`,
    `${t.tickets} ventas · ticket promedio ${formatCurrency(t.avg_ticket)} · ${t.items_sold} artículos`,
  ]
  if (t.tips_total > 0) lines.push(`Propinas (aparte): ${formatCurrency(t.tips_total)}`)
  if (t.cancelled_count > 0) lines.push(`Canceladas: ${t.cancelled_count} (${formatCurrency(t.cancelled_amount)})`)
  return lines.join(String.fromCharCode(10))
}

/* ------------------------------------------------------------------ */
/*  Orquestación                                                       */
/* ------------------------------------------------------------------ */

/**
 * Corre el resumen para todos los negocios activos (o solo `onlySlug`).
 * Con `dryRun` no manda nada: reporta qué se enviaría y a quién.
 */
export async function runWeeklySummaries(options: {
  dryRun: boolean
  onlySlug?: string | null
}): Promise<{ results: WeeklySendResult[]; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!options.dryRun && !apiKey) {
    return { results: [], error: "Falta RESEND_API_KEY en el entorno." }
  }

  const admin = createAdminClient()
  let query = admin
    .from("businesses")
    .select("id, name, slug, timezone, status, is_template, settings")
    .eq("status", "active")
    .eq("is_template", false)
    .order("created_at")
  if (options.onlySlug) query = query.eq("slug", options.onlySlug)
  const { data: businesses, error } = await query
  if (error) return { results: [], error: error.message }

  const results: WeeklySendResult[] = []

  for (const biz of businesses ?? []) {
    const base = { slug: biz.slug, name: biz.name }
    try {
      if (!parseBusinessSettings(biz.settings).weeklyEmail) {
        results.push({ ...base, status: "omitido", detail: "Desactivado en Negocio." })
        continue
      }

      const { from, to } = previousWeekRange(biz.timezone)
      const { data, error: rpcError } = await admin.rpc("weekly_summary", {
        p_business_id: biz.id,
        p_from: from,
        p_to: to,
      })
      if (rpcError) {
        results.push({ ...base, status: "error", detail: rpcError.message })
        continue
      }
      const summary = data as unknown as WeeklySummaryData
      if (!summary || summary.totals.tickets === 0) {
        results.push({ ...base, status: "omitido", detail: `Sin ventas del ${from} al ${to}.` })
        continue
      }

      // Destinatarios: dueños/administradores activos con correo real.
      const { data: members, error: membersError } = await admin
        .from("business_members")
        .select("user_id, role")
        .eq("business_id", biz.id)
        .eq("is_active", true)
        .in("role", ["owner", "admin"])
      if (membersError) {
        results.push({ ...base, status: "error", detail: membersError.message })
        continue
      }
      const emails: string[] = []
      for (const member of members ?? []) {
        const { data: userData } = await admin.auth.admin.getUserById(member.user_id)
        const email = userData?.user?.email
        if (email && !isSyntheticEmail(email) && !emails.includes(email)) emails.push(email)
      }
      if (emails.length === 0) {
        results.push({ ...base, status: "omitido", detail: "Ningún dueño/admin tiene correo real." })
        continue
      }

      if (options.dryRun) {
        results.push({
          ...base,
          status: "listo",
          detail: `Se enviaría (${formatCurrency(summary.totals.revenue)}, ${summary.totals.tickets} ventas del ${from} al ${to}).`,
          recipients: emails,
        })
        continue
      }

      const sendError = await sendWithResend({
        apiKey: apiKey!,
        fromName: `${biz.name} · Cafecito POS`,
        to: emails,
        subject: weeklyEmailSubject(summary),
        html: buildWeeklyEmailHtml(summary),
        text: buildWeeklyEmailText(summary),
      })
      if (sendError) {
        results.push({ ...base, status: "error", detail: sendError })
      } else {
        results.push({ ...base, status: "enviado", detail: `Semana del ${from} al ${to}.`, recipients: emails })
      }
    } catch (err) {
      results.push({ ...base, status: "error", detail: err instanceof Error ? err.message : "Error inesperado." })
    }
  }

  return { results }
}

/** Vista previa del HTML del correo de un negocio (para ?html=1 en la ruta). */
export async function previewWeeklyHtml(slug: string): Promise<{ html: string } | { error: string }> {
  const admin = createAdminClient()
  const { data: biz, error } = await admin
    .from("businesses")
    .select("id, timezone")
    .eq("slug", slug)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!biz) return { error: "Negocio no encontrado." }
  const { from, to } = previousWeekRange(biz.timezone)
  const { data, error: rpcError } = await admin.rpc("weekly_summary", {
    p_business_id: biz.id,
    p_from: from,
    p_to: to,
  })
  if (rpcError) return { error: rpcError.message }
  return { html: buildWeeklyEmailHtml(data as unknown as WeeklySummaryData) }
}
