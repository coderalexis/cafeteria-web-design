import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Coffee, Store } from "lucide-react"
import { logout } from "@/app/actions/auth"
import { getContext } from "@/lib/context"
import { homePathFor, isManager, ROLE_LABELS } from "@/lib/context-shape"
import { BusinessProvider } from "@/components/business-provider"
import { BusinessSwitcher } from "@/components/business-switcher"
import { AdminUserMenu } from "@/components/admin-user-menu"
import { TextSizeProvider } from "@/components/text-size-provider"
import { NavScrollArea } from "@/components/nav-scroll-area"
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
      <TextSizeProvider>
      <div className="flex h-[100dvh] bg-stone-100">
        {/* ───── Sidebar (escritorio) ───── */}
        <aside className="hidden lg:flex w-64 bg-white border-r border-stone-200 flex-col shrink-0">
          {/* Logo */}
          <div className="px-5 py-5 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <Coffee className="h-6 w-6 text-amber-700 shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-bold text-stone-800 leading-tight truncate">{business.name}</h1>
                {/* «Panel de Administración» se cayó: ya se sabe dónde está uno,
                    y ese renglón costaba altura que el menú necesita. La
                    etiqueta de plantilla SÍ se queda — esa sí informa algo que
                    no es evidente. */}
                {isTemplate && <p className="text-xs text-stone-400">Plantilla de menú</p>}
              </div>
              {/* La guía, arriba y a la vista. Estaba enterrada en el menú de
                  usuario, que es donde uno busca su cuenta, no ayuda. Va en el
                  mismo renglón del nombre para no costar ni un píxel de alto:
                  el menú está ajustado para caber entero en 768 px. */}
              <Link
                href="/ayuda"
                target="_blank"
                title="Guía de uso"
                aria-label="Guía de uso"
                className="shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-amber-50 hover:text-amber-700"
              >
                <BookOpen className="h-[1.125rem] w-[1.125rem]" />
              </Link>
            </div>
            {ctx.memberships.length > 1 && (
              <div className="mt-3">
                <BusinessSwitcher memberships={ctx.memberships} activeId={business.id} className="w-full max-w-none justify-between" />
              </div>
            )}
          </div>

          {/* Navigation */}
          {/* El menú está dimensionado para caber ENTERO en una laptop de 768
              px, así que normalmente no se desplaza. `NavScrollArea` es la red
              para cuando sí —letra en «Muy grande», pantalla muy chica—: antes
              no había ninguna y lo que no cabía simplemente desaparecía. */}
          <NavScrollArea className="px-3 py-2 space-y-0.5">
            <AdminNav />
          </NavScrollArea>

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
      </TextSizeProvider>
    </BusinessProvider>
  )
}
