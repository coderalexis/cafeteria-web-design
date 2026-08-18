import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { isManager, parseContext } from "@/lib/context-shape"

/** Rutas que solo piden sesión (el negocio activo se resuelve dentro). */
const SESSION_ONLY = ["/seleccionar-negocio", "/cuenta", "/suspendido"]

export async function middleware(request: NextRequest) {
  const { supabase, response } = await updateSession(request)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const redirectTo = (to: string) =>
    to === path ? response : NextResponse.redirect(new URL(to, request.url))

  if (!user) {
    return path === "/" ? response : redirectTo("/login")
  }

  if (path === "/" || SESSION_ONLY.some((p) => path === p || path.startsWith(p + "/"))) {
    return response
  }

  // Un solo round trip: negocio activo, rol y flags del usuario.
  const { data } = await supabase.rpc("my_context")
  const ctx = parseContext(data)

  if (path.startsWith("/super")) {
    return ctx?.isPlatformAdmin ? response : redirectTo("/")
  }

  // /admin y /pos requieren negocio activo y vigente
  if (!ctx?.business || !ctx.role) {
    return redirectTo("/seleccionar-negocio")
  }
  if (ctx.business.status === "suspended") {
    return redirectTo("/suspendido")
  }
  if (path.startsWith("/admin") && !isManager(ctx.role)) {
    return redirectTo("/pos")
  }
  if (path.startsWith("/pos") && ctx.business.isTemplate) {
    return redirectTo("/admin")
  }

  return response
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
