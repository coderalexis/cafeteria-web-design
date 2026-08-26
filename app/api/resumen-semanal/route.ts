import { previewWeeklyHtml, runWeeklySummaries } from "@/lib/weekly-summary"

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
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: "Falta CRON_SECRET en el entorno." }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("No autorizado", { status: 401 })
  }

  const url = new URL(request.url)

  if (url.searchParams.get("html") === "1") {
    const slug = url.searchParams.get("business")
    if (!slug) return Response.json({ error: "Falta ?business=slug." }, { status: 400 })
    const preview = await previewWeeklyHtml(slug)
    if ("error" in preview) return Response.json({ error: preview.error }, { status: 400 })
    return new Response(preview.html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  }

  const { results, error } = await runWeeklySummaries({
    dryRun: url.searchParams.get("dry") === "1",
    onlySlug: url.searchParams.get("business"),
  })
  if (error) {
    return Response.json({ error }, { status: 500 })
  }
  return Response.json({ results })
}
