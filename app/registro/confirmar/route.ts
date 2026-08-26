import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Destino del correo de verificación. Canjea lo que traiga el enlace por una
 * sesión (los Route Handlers sí pueden escribir cookies) y manda a /registro/listo,
 * que es donde se arma la cafetería.
 *
 * Se aceptan las dos formas por las que Supabase puede mandar la confirmación:
 *   · `code`       — flujo PKCE, el de fábrica; solo sirve en el mismo navegador
 *                    donde se llenó el formulario.
 *   · `token_hash` — si se personaliza la plantilla del correo con {{ .TokenHash }},
 *                    también funciona abriendo el correo en otro dispositivo.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")

  const supabase = await createClient()
  let ok = false

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  } else if (tokenHash && (type === "signup" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({ type: "signup", token_hash: tokenHash })
    ok = !error
  }

  return NextResponse.redirect(new URL(ok ? "/registro/listo" : "/registro/listo?estado=invalido", url.origin))
}
