import "server-only"

import { timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Lo común de los dos crons de Vercel (`/api/pruebas`, `/api/resumen-semanal`).
 */

/**
 * ¿Es Vercel quien llama? Devuelve la respuesta de rechazo, o null si pasa.
 * Sin `CRON_SECRET` configurado la ruta se niega a correr, para no quedar
 * abierta. La comparación es de tiempo constante.
 */
export function rechazoDelCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return Response.json({ error: "Falta CRON_SECRET en el entorno." }, { status: 503 })
  const llega = Buffer.from(request.headers.get("authorization") ?? "")
  const esperado = Buffer.from(`Bearer ${secret}`)
  if (llega.length !== esperado.length || !timingSafeEqual(llega, esperado)) {
    return new Response("No autorizado", { status: 401 })
  }
  return null
}

/**
 * Deja en `app_errors` lo que un cron no pudo hacer, para que llegue en el
 * correo de la mañana. Antes, un aviso de prueba que no salió o un resumen
 * semanal que falló solo vivía en la respuesta JSON del cron, que nadie lee.
 * Si ni esto se puede guardar, no hay a quién decírselo: se ignora.
 */
export async function anotarFallosDelCron(
  cron: "pruebas" | "resumen-semanal",
  fallos: Array<{ businessId?: string | null; detalle: string }>,
): Promise<void> {
  if (fallos.length === 0) return
  try {
    await createAdminClient()
      .from("app_errors")
      .insert(
        fallos.map((f) => ({
          business_id: f.businessId ?? null,
          route: `/api/${cron}`,
          message: f.detalle.slice(0, 500),
          digest: "cron",
        })),
      )
  } catch {
    // Sin base no hay dónde anotarlo.
  }
}
