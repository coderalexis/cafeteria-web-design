import { runTrialCheck } from "@/lib/trials"

/**
 * GET /api/pruebas — cron diario de Vercel (15:00 UTC ≈ 09:00 en CDMX).
 * Avisa a quien está por terminar su prueba y suspende las vencidas, salvo que
 * tengan la caja abierta (ver lib/trials.ts).
 *
 * Query: ?dry=1 (no manda ni suspende, solo reporta) · ?business=slug.
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
  const { results, error } = await runTrialCheck({
    dryRun: url.searchParams.get("dry") === "1",
    onlySlug: url.searchParams.get("business"),
  })
  if (error) return Response.json({ error }, { status: 500 })
  return Response.json({ results })
}
