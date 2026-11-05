import { NextResponse } from "next/server"
import { previewPromotion } from "@/app/actions/promotions"

/**
 * La vista previa de la promoción del carrito, como petición normal y no
 * como server action: se pide a cada cambio del carrito —justo antes de
 * cobrar— y, como acción, se formaba en la misma fila que el cobro. Ver
 * `app/pos/datos/cuentas/route.ts`.
 */
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let items: unknown
  try {
    items = await request.json()
  } catch {
    items = null
  }
  if (!Array.isArray(items)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 })
  const r = await previewPromotion(items as Parameters<typeof previewPromotion>[0])
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } })
}
