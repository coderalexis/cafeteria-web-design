import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Destino del enlace del correo de recuperación:
 *   /restablecer/confirmar?token_hash=...&type=recovery
 * Canjea el token por una sesión (los Route Handlers sí pueden escribir
 * cookies) y manda a /restablecer para capturar la contraseña nueva.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")

  if (!tokenHash || type !== "recovery") {
    return NextResponse.redirect(new URL("/restablecer?estado=invalido", url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })

  return NextResponse.redirect(new URL(error ? "/restablecer?estado=invalido" : "/restablecer", url.origin))
}
