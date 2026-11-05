"use server"

import { z } from "@/lib/zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireSuperAdmin } from "@/lib/context"
import { ERRORES_DIAS } from "@/lib/errores"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Errores visibles.                                                  */
/*                                                                     */
/*  Si el POS truena un sábado a las 8 de la mañana, hasta hoy nadie   */
/*  se enteraba hasta que el dueño llamara. Los límites de error lo    */
/*  reportan aquí; el RPC lo guarda (con anti-tormenta), /super lo     */
/*  enseña, y el cron de la mañana manda un resumen si hubo algo.      */
/*                                                                     */
/*  Por el mismo canal van los AVISOS (lib/avisos.ts): lo que no       */
/*  revienta pero delata un problema — choques al guardar cuentas,     */
/*  copias «(2)», ventas que subieron tarde desde la cola o que no     */
/*  pudieron subir, sondeos sin respuesta. El 2026-09-14 hubo 26       */
/*  choques y 8 copias en Gym Coffe y nadie lo supo en dos semanas.    */
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
export async function getRecentErrors(days = ERRORES_DIAS): Promise<ActionResult<{ errors: ErrorReciente[] }>> {
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
