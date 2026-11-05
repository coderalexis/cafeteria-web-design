import { runTrialCheck } from "@/lib/trials"
import { sendErrorDigest } from "@/lib/correo-errores"
import { anotarFallosDelCron, limpiarEnviosViejos, rechazoDelCron } from "@/lib/cron"

/** Varias cafeterías, cada una con su correo: que un Resend lento no corte el cron a medias. */
export const maxDuration = 60

/**
 * GET /api/pruebas — cron diario de Vercel (10:00 UTC = 04:00 en CDMX: después
 * de que venza cualquier caja mexicana y antes de que nadie abra; ver vercel.json).
 * Avisa a quien está por terminar su prueba y suspende las vencidas, salvo que
 * tengan la caja abierta (ver lib/trials.ts).
 *
 * Query: ?dry=1 (no manda ni suspende, solo reporta) · ?business=slug.
 */
export async function GET(request: Request) {
  const rechazo = rechazoDelCron(request)
  if (rechazo) return rechazo

  const url = new URL(request.url)
  const dryRun = url.searchParams.get("dry") === "1"
  const prueba = await runTrialCheck({
    dryRun,
    onlySlug: url.searchParams.get("business"),
  }).catch((e: unknown) => ({
    results: [],
    error: e instanceof Error ? e.message : "Error inesperado.",
    barrido: undefined,
  }))

  // Lo que no salió queda en app_errors ANTES del resumen: así llega en el
  // correo de esta misma mañana y no solo en una respuesta que nadie lee.
  if (!dryRun) {
    await limpiarEnviosViejos()
    await anotarFallosDelCron("pruebas", [
      ...(prueba.error ? [{ detalle: `Revisión de pruebas: ${prueba.error}` }] : []),
      ...(prueba.barrido ? [{ detalle: prueba.barrido }] : []),
      ...prueba.results
        .filter((r) => r.action === "error")
        .map((r) => ({ businessId: r.businessId, detalle: `Prueba de ${r.name}: ${r.detail}` })),
    ])
  }

  // El resumen diario de errores viaja en este mismo cron porque el plan de
  // Vercel limita cuántos crons hay, y ya son dos. Sale SIEMPRE, también si
  // la revisión de pruebas falló: antes un fallo ahí cortaba el cron y el
  // correo no salía justo el día que más hacía falta.
  const errores = await sendErrorDigest({ dryRun }).catch((e: unknown) => ({
    sent: false,
    count: 0,
    error: e instanceof Error ? e.message : "Error inesperado.",
  }))
  return Response.json(
    { results: prueba.results, barrido: prueba.barrido, errores, error: prueba.error },
    { status: prueba.error ? 500 : 200 },
  )
}
