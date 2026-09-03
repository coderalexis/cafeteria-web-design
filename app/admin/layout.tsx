import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Store } from "lucide-react"
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
import { AdminSearch } from "@/components/admin-search"
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
          {/* Sin la taza decorativa: al lado del nombre de la cafetería no
              informaba nada y se comía 32 px que el nombre sí necesita. Con
              ella, «Cafecito Jaral» se recortaba a «Cafecito Jar…». La marca
              sigue en la barra del teléfono y en la portada. */}
          <div className="px-4 py-5 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h1 title={business.name} className="text-lg font-bold text-stone-800 leading-tight truncate">
                  {business.name}
                </h1>
                {/* «Panel de Administración» se cayó: ya se sabe dónde está uno,
                    y ese renglón costaba altura que el menú necesita. La
                    etiqueta de plantilla SÍ se queda — esa sí informa algo que
                    no es evidente. */}
                {isTemplate && <p className="text-xs text-stone-400">Plantilla de menú</p>}
              </div>
              {/* La guía, arriba y a la vista, CON su nombre: solo el icono
                  se perdía —hay que saber qué es un libro abierto para
                  buscarlo—. Va en el mismo renglón del nombre para no costar
                  ni un píxel de alto: el menú está ajustado para caber entero
                  en 768 px. El nombre de la cafetería se recorta si hace
                  falta; la guía no, porque un «Gu…» no serviría de nada. */}
              <Link
                href="/ayuda"
                target="_blank"
                title="Abrir la guía de uso"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Guía
              </Link>
            </div>
            {ctx.memberships.length > 1 && (
              <div className="mt-3">
                <BusinessSwitcher memberships={ctx.memberships} activeId={business.id} className="w-full max-w-none justify-between" />
              </div>
            )}
            {/* «¿Dónde está…?»: los ajustes viven en una docena de pantallas y
                la pregunta más común no es cómo sino dónde. Va aquí, mirando
                la lista de pantallas, que es donde nace la duda. */}
            <div className="mt-3">
              <AdminSearch />
            </div>
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
