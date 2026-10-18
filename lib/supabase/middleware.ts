import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "./database.types"

/** Una cookie de sesión que Supabase acaba de renovar (o borrar, con valor vacío). */
export type CookieRenovada = { name: string; value: string; options: CookieOptions }

/**
 * Sesión del middleware: verifica el token y lo renueva si venció.
 *
 * Ya NO pregunta al servidor de autenticación: `getClaims()` verifica la FIRMA
 * del token contra el JWKS del proyecto, sin viajar, y solo viaja para
 * renovarlo cuando venció. Antes esta función llamaba a `getUser()`, y esa
 * llamada viajaba en CADA petición del sistema.
 */
export async function updateSession(request: NextRequest): Promise<{ haySesion: boolean; response: NextResponse }> {
  const renovadas: CookieRenovada[] = []
  const encabezados: Record<string, string> = {}

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // Solo se anotan: la respuesta se arma cuando ya terminó la renovación.
        setAll(cookiesToSet, headers) {
          renovadas.push(...cookiesToSet)
          Object.assign(encabezados, headers)
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  return { haySesion: typeof data?.claims?.sub === "string", response: continuarConCookies(request, renovadas, encabezados) }
}

/**
 * La respuesta del middleware, con la sesión renovada repartida a sus dos
 * destinos, cada uno por su camino:
 *
 * - A la página o la acción que sigue, en los encabezados de la PETICIÓN
 *   (`NextResponse.next({ request })` armado DESPUÉS de cambiar las cookies),
 *   para que lea el token nuevo y no lo vuelva a renovar.
 * - Al navegador, con `Set-Cookie`, junto con los encabezados que Supabase
 *   pide para que nadie guarde en caché una respuesta con la sesión de otro.
 *
 * Y nunca por `x-middleware-set-cookie`, la vía normal de Next para lo
 * primero. Cuando la petición es una server action, Next toma esas cookies
 * como «la acción cambió cookies»: vuelve a armar la página entera y se la
 * manda al cliente pegada a la respuesta. Al abrir la app después de más de
 * una hora, la primera petición del POS es justo una acción (el sondeo de
 * cuentas) y llega con el token vencido. Si el teléfono abrió la copia
 * guardada de antes de un deploy, recibía la página del build nuevo y
 * tronaba: «undefined is not an object (evaluating 'e[o].call')» en el
 * iPhone de Gym Coffe, cuatro veces entre septiembre y octubre de 2026,
 * siempre la primera vez que abrió la app después de un deploy. Sin deploy
 * de por medio no tronaba, pero cada apertura armaba el POS dos veces.
 */
export function continuarConCookies(
  request: NextRequest,
  renovadas: CookieRenovada[],
  encabezados: Record<string, string> = {},
): NextResponse {
  for (const { name, value } of renovadas) {
    if (value) request.cookies.set(name, value)
    else request.cookies.delete(name)
  }
  const response = NextResponse.next({ request })
  for (const { name, value, options } of renovadas) response.cookies.set(name, value, options)
  response.headers.delete("x-middleware-set-cookie")
  for (const [nombre, valor] of Object.entries(encabezados)) response.headers.set(nombre, valor)
  return response
}
