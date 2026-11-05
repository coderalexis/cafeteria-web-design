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
 * Reserva un envío de un cron ANTES de hacerlo (migración 60). Si la misma
 * clave ya estaba, ya se hizo: correr el cron dos veces —Vercel avisa que
 * puede pasar, y un «Run» a mano desde el panel hace lo mismo— reenviaba los
 * correos. Si el envío falla, `liberar()` quita la reserva para que el
 * siguiente intento sí lo mande.
 *
 * Si la tabla no se puede usar (falla la base), se responde «primera vez»:
 * es mejor repetir un correo que dejar de mandarlo.
 */
export async function reservarEnvio(
  trabajo: "aviso-prueba" | "correo-errores" | "resumen-semanal",
  clave: string,
): Promise<{ primera: boolean; liberar: () => Promise<void> }> {
  const admin = createAdminClient()
  const liberar = async () => {
    try {
      await admin.from("cron_corridas").delete().eq("trabajo", trabajo).eq("clave", clave)
    } catch {
      // Sin base: el siguiente intento lo verá como ya hecho; es lo de menos.
    }
  }
  try {
    const { error } = await admin.from("cron_corridas").insert({ trabajo, clave })
    if (error?.code === "23505") return { primera: false, liberar }
    return { primera: true, liberar }
  } catch {
    return { primera: true, liberar }
  }
}

/** Las reservas viejas ya no evitan nada: se borran pasados 90 días. */
export async function limpiarEnviosViejos(): Promise<void> {
  try {
    await createAdminClient()
      .from("cron_corridas")
      .delete()
      .lt("creada", new Date(Date.now() - 90 * 24 * 3600_000).toISOString())
  } catch {
    // Se intenta otra vez mañana.
  }
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
