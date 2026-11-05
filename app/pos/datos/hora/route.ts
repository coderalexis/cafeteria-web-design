/**
 * La hora del servidor, para que el POS sepa cuánto se desvía el reloj del
 * teléfono (ver app/pos/hora-servidor.ts). No toca la base: solo contesta.
 * Detrás del middleware como todo /pos, así que pide sesión.
 */
export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({ ahora: Date.now() }, { headers: { "Cache-Control": "no-store" } })
}
