import { previewWeeklyHtml, runWeeklySummaries } from "@/lib/weekly-summary"
import { anotarFallosDelCron, rechazoDelCron } from "@/lib/cron"

/** Un correo por cafetería: que un Resend lento no corte el cron a medias. */
export const maxDuration = 60

/**
 * GET /api/resumen-semanal — lo dispara el cron de Vercel cada lunes 14:00 UTC
 * (08:00 en CDMX). Vercel manda `Authorization: Bearer ${CRON_SECRET}` cuando
 * esa variable existe; sin secret configurado la ruta se niega a correr para
 * no quedar abierta.
 *
 * Query: ?dry=1 (no envía, solo reporta) · ?business=slug (solo ese negocio)
 * · ?html=1&business=slug (devuelve el HTML del correo, sin enviar).
 */
export async function GET(request: Request) {
  const rechazo = rechazoDelCron(request)
  if (rechazo) return rechazo

  const url = new URL(request.url)

  if (url.searchParams.get("html") === "1") {
    const slug = url.searchParams.get("business")
    if (!slug) return Response.json({ error: "Falta ?business=slug." }, { status: 400 })
    const preview = await previewWeeklyHtml(slug)
    if ("error" in preview) return Response.json({ error: preview.error }, { status: 400 })
    return new Response(preview.html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  }

  const dryRun = url.searchParams.get("dry") === "1"
  const { results, error } = await runWeeklySummaries({
    dryRun,
    onlySlug: url.searchParams.get("business"),
  })
  // Un resumen que no salió se ve en el correo de errores del día siguiente.
  if (!dryRun) {
    await anotarFallosDelCron("resumen-semanal", [
      ...(error ? [{ detalle: `Resumen semanal: ${error}` }] : []),
      ...results
        .filter((r) => r.status === "error")
        .map((r) => ({ businessId: r.businessId, detalle: `Resumen semanal de ${r.name}: ${r.detail}` })),
    ])
  }
  if (error) {
    return Response.json({ error }, { status: 500 })
  }
  return Response.json({ results })
}
