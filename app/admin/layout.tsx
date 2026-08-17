import type React from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Coffee, Store, LogOut, BookOpen } from "lucide-react"
import { logout } from "@/app/actions/auth"
import { AdminNav } from "./admin-nav"
import { AdminMobileNav } from "./mobile-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userName = "Admin"
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .maybeSingle()
    userName = profile?.full_name || profile?.username || "Admin"
  }

  return (
    <div className="flex h-[100dvh] bg-stone-100">
      {/* ───── Sidebar (escritorio) ───── */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-stone-200 flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Coffee className="h-6 w-6 text-amber-700" />
            <div>
              <h1 className="text-lg font-bold text-stone-800 leading-tight">
                El Cafecito
              </h1>
              <p className="text-xs text-stone-400">Panel de Administración</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <AdminNav />
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-4 space-y-1 border-t border-stone-200 pt-4">
          <Link
            href="/pos"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
          >
            <Store className="h-4 w-4" />
            Ir al POS
          </Link>
          <Link
            href="/ayuda"
            target="_blank"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Guía de uso
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>

          {/* User info */}
          <div className="px-3 pt-3 border-t border-stone-100">
            <p className="text-xs text-stone-400">Conectado como</p>
            <p className="text-sm font-medium text-stone-700 truncate">
              {userName}
            </p>
          </div>
        </div>
      </aside>

      {/* ───── Main content (con barra superior en móvil) ───── */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminMobileNav userName={userName} logoutAction={logout} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
