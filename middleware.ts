import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  const { supabase, response } = await updateSession(request)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if ((path.startsWith("/admin") || path.startsWith("/pos")) && !user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (path.startsWith("/admin") && user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/pos", request.url))
    }
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*", "/pos/:path*", "/"],
}
