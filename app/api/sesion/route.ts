import { NextResponse } from "next/server"
import { getContext } from "@/lib/context"

export const dynamic = "force-dynamic"

/**
 * GET /api/sesion — ¿quién está leyendo? (rol y si su negocio es plantilla).
 *
 * La guía es una página pública y estática; no puede saber si quien la lee
 * tiene sesión. Con esto, ya cargada, pregunta y decide si enseña los botones
 * «Hacerlo ahora» de cada sección (y cuáles: a un cajero no se le ofrece
 * Datos y ajustes). No devuelve nada que la propia sesión no sepa ya.
 */
export async function GET() {
  const ctx = await getContext()
  const headers = { "cache-control": "no-store" }
  if (!ctx) return NextResponse.json({ ok: false }, { headers })
  return NextResponse.json(
    { ok: true, role: ctx.role ?? "cajero", isTemplate: ctx.business?.isTemplate ?? false },
    { headers },
  )
}
