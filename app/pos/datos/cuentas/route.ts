import { NextResponse } from "next/server"
import { listParked } from "@/app/actions/parked"

/**
 * El sondeo de cuentas abiertas, como petición GET y no como server action.
 *
 * Next corre las server actions de una pestaña EN FILA, una tras otra. El
 * sondeo sale cada 10 s (30 s en el celular), y con la señal mala una
 * respuesta puede tardar segundos: si en ese momento alguien tocaba
 * «Cobrar», el cobro esperaba detrás del sondeo. Un `fetch` normal no hace
 * fila. Vive bajo /pos para pasar por el middleware (sesión y token).
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const r = await listParked()
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } })
}
