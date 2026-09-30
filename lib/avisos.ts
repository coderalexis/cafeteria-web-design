import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

/**
 * Avisos: lo que NO revienta pero delata que algo va mal.
 *
 * El canal de errores (P17: `report_error` → `app_errors` → /super → correo de
 * la mañana) solo se enteraba de pantallas que truenan. El domingo
 * 2026-09-14 en Gym Coffe no tronó nada: hubo 26 choques silenciosos al
 * guardar una cuenta y ocho copias «Mesa 2 (2)» en dos minutos, y nadie lo
 * supo hasta que la dueña lo contó dos semanas después. Un aviso por cada
 * choque habría puesto «26× · Gym Coffe · Cuenta «Mesa 2»: el sello iba
 * viejo» en el correo de esa misma mañana.
 *
 * Van por el mismo canal a propósito: una tabla, una pantalla y un correo que
 * ya existen. `digest` lleva la CLASE del aviso (`cuenta-choque`,
 * `cuenta-copia`, `cola-revision`, `sondeo-lento`…) para agruparlos, y
 * `stack` el detalle en texto para leerlo en /super. El RPC ya tiene freno
 * anti-tormenta (300 por hora), así que un aviso repetido no puede tirar nada.
 */
export interface Aviso {
  route: string
  message: string
  /** La clase del aviso, en kebab-case: por esto se agrupa y se busca. */
  digest: string
  /** Detalle para quien investiga; nunca datos personales. */
  detalle?: string
}

/** Desde el servidor (una server action): se espera, es un solo viaje y el camino es raro. */
export async function registrarAviso(supabase: SupabaseClient<Database>, aviso: Aviso): Promise<void> {
  try {
    await supabase.rpc("report_error", {
      p_route: aviso.route.slice(0, 200),
      p_message: aviso.message.slice(0, 500),
      p_digest: aviso.digest.slice(0, 64),
      p_stack: aviso.detalle?.slice(0, 4000),
    })
  } catch (e) {
    // Un aviso que no se pudo guardar no puede estorbar a lo que se estaba
    // guardando de verdad.
    console.error("[avisos] no se pudo registrar", e instanceof Error ? e.message : e)
  }
}

/** Segundos entre dos sellos ISO, redondeados; null si alguno no se puede leer. */
export function segundosEntre(a: string, b: string): number | null {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round(Math.abs(tb - ta) / 1000)
}
