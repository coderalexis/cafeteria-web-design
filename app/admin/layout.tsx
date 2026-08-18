import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Coffee, Store, LogOut, BookOpen, UserCircle } from "lucide-react"
import { logout } from "@/app/actions/auth"
import { getContext } from "@/lib/context"
import { homePathFor, isManager, ROLE_LABELS } from "@/lib/context-shape"
import { BusinessProvider } from "@/components/business-provider"
import { BusinessSwitcher } from "@/components/business-switcher"
import { AdminNav } from "./admin-nav"
import { AdminMobileNav } from "./mobile-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getContext()
  // El middleware ya filtra; esto cubre renders sin middleware.
  if (!ctx?.business || !isManager(ctx.role) || ctx.business.status !== "active") {
    redirect(homePathFor(ctx))
  }

  const userName = ctx.fullName || "Administrador"
  const roleLabel = ctx.role ? ROLE_LABELS[ctx.role] : ""
  const business = ctx.business
  const isTemplate = business.isTemplate

  return (
    <BusinessProvider value={ctx}>
      <div className="flex h-[100dvh] bg-stone-100">
        {/* ───── Sidebar (escritorio) ───── */}
        <aside className="hidden lg:flex w-64 bg-white border-r border-stone-200 flex-col shrink-0">
          {/* Logo */}
          <div className="px-5 py-5 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <Coffee className="h-6 w-6 text-amber-700 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-stone-800 leading-tight truncate">{business.name}</h1>
                <p className="text-xs text-stone-400">
                  {isTemplate ? "Plantilla de menú" : "Panel de Administración"}
                </p>
              </div>
            </div>
            {ctx.memberships.length > 1 && (
              <div className="mt-3">
                <BusinessSwitcher memberships={ctx.memberships} activeId={business.id} className="w-full max-w-none justify-between" />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <AdminNav />
          </nav>

          {/* Bottom actions */}
          <div className="px-3 pb-4 space-y-1 border-t border-stone-200 pt-4">
            {!isTemplate && (
              <Link
                href="/pos"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <Store className="h-4 w-4" />
                Ir al POS
              </Link>
            )}
            <Link
              href="/ayuda"
              target="_blank"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Guía de uso
            </Link>
            <Link
              href="/cuenta"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100 transition-colors"
            >
              <UserCircle className="h-4 w-4" />
              Mi cuenta
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
              <p className="text-sm font-medium text-stone-700 truncate">{userName}</p>
              <p className="text-xs text-stone-400">{roleLabel}</p>
            </div>
          </div>
        </aside>

        {/* ───── Main content (con barra superior en móvil) ───── */}
        <div className="flex-1 flex flex-col min-w-0">
          <AdminMobileNav
            userName={userName}
            roleLabel={roleLabel}
            businessName={business.name}
            isTemplate={isTemplate}
            memberships={ctx.memberships}
            activeBusinessId={business.id}
            logoutAction={logout}
          />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </BusinessProvider>
  )
}
