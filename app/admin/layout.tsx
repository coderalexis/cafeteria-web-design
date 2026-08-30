import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Coffee, Store } from "lucide-react"
import { logout } from "@/app/actions/auth"
import { getContext } from "@/lib/context"
import { homePathFor, isManager, ROLE_LABELS } from "@/lib/context-shape"
import { BusinessProvider } from "@/components/business-provider"
import { BusinessSwitcher } from "@/components/business-switcher"
import { AdminUserMenu } from "@/components/admin-user-menu"
import { TrialBanner } from "@/components/trial-banner"
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
                {/* «Panel de Administración» se cayó: ya se sabe dónde está uno,
                    y ese renglón costaba altura que el menú necesita. La
                    etiqueta de plantilla SÍ se queda — esa sí informa algo que
                    no es evidente. */}
                {isTemplate && <p className="text-xs text-stone-400">Plantilla de menú</p>}
              </div>
            </div>
            {ctx.memberships.length > 1 && (
              <div className="mt-3">
                <BusinessSwitcher memberships={ctx.memberships} activeId={business.id} className="w-full max-w-none justify-between" />
              </div>
            )}
          </div>

          {/* Navigation */}
          {/* `min-h-0` + `overflow-y-auto` son la red de seguridad: sin ellos,
              cuando el menú no cabe NO se desplaza —se sale del recuadro y las
              opciones de abajo simplemente dejan de existir para quien mira—.
              Con esto, en una pantalla muy chica se puede llegar a todo. Pero
              la red no es la solución: el menú está dimensionado para caber
              entero en una laptop de 768 px, que es lo que de verdad importa. */}
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
            <AdminNav />
          </nav>

          {/* Bottom actions */}
          <div className="shrink-0 border-t border-stone-200 px-3 py-3 space-y-1">
            {!isTemplate && (
              <Link
                href="/pos"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <Store className="h-4 w-4" />
                Ir al POS
              </Link>
            )}
            <AdminUserMenu
              userName={userName}
              roleLabel={roleLabel}
              isPlatformAdmin={ctx.isPlatformAdmin}
              logoutAction={logout}
            />
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
            isPlatformAdmin={ctx.isPlatformAdmin}
            logoutAction={logout}
          />
          <TrialBanner trialEndsAt={business.trialEndsAt} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </BusinessProvider>
  )
}
