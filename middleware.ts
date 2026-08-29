import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

/**
 * Portero de la aplicación: deja pasar solo a quien trae sesión y refresca su
 * token. Nada más.
 *
 * ANTES hacía dos viajes a Supabase en CADA petición —`getUser()` al servidor
 * de autenticación y `my_context` a la base— para decidir además a dónde
 * mandar a cada quien según su rol. El problema: la página que venía después
 * volvía a pedir exactamente lo mismo, así que entrar costaba cuatro viajes de
 * ida y vuelta donde bastaba uno. Encadenados, esos viajes fueron parte de lo
 * que tumbó producción con un 504.
 *
 * Ahora:
 *   · `getClaims()` verifica la FIRMA del token contra el JWKS del proyecto
 *     —que se cachea—, sin preguntarle a nadie, y refresca el token si venció.
 *     Funciona así porque el proyecto firma con llave asimétrica (ES256); con
 *     llave simétrica volvería a viajar y no habría ganancia.
 *   · Las reglas de ROL las aplica cada zona en su propio layout, que es donde
 *     deben vivir: `/admin` exige dueño o administrador y negocio vigente,
 *     `/super` exige operador de plataforma, `/pos` exige negocio activo que no
 *     sea plantilla. No es un cheque en blanco: esos layouts YA hacían la
 *     comprobación (estaban ahí para cubrir renders sin middleware), así que
 *     esto elimina la copia, no la defensa.
 *
 * Lo que se acepta a cambio: un token ya emitido sigue siendo válido hasta que
 * vence (una hora) aunque se cierre la sesión desde otro lado. Lo que de
 * verdad importa —dar de baja a alguien del equipo o suspender una cafetería—
 * sigue siendo inmediato, porque eso lo lee `my_context` de la base en vivo, no
 * del token.
 */

export async function middleware(request: NextRequest) {
  const { supabase, response } = await updateSession(request)

  const { data } = await supabase.auth.getClaims()
  const haySesion = typeof data?.claims?.sub === "string"

  if (haySesion) return response

  // La portada es pública; todo lo demás pide identificarse.
  const path = request.nextUrl.pathname
  return path === "/" ? response : NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/pos/:path*",
    "/super/:path*",
    "/seleccionar-negocio",
    "/cuenta",
    "/suspendido",
  ],
}
