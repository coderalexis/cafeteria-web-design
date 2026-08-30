"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Coffee, Menu, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { BusinessSwitcher } from "@/components/business-switcher"
import { AdminUserMenu } from "@/components/admin-user-menu"
import { NavScrollArea } from "@/components/nav-scroll-area"
import type { Membership } from "@/lib/context-shape"
import { AdminNav } from "./admin-nav"

/** Mismos nombres que en `admin-nav.tsx`; si cambias uno, cambia el otro. */
const SECTION_LABELS: Record<string, string> = {
  categorias: "Categorías",
  productos: "Productos",
  modificadores: "Opciones y extras",
  ventas: "Ventas",
  analisis: "Análisis",
  cortes: "Cortes de caja",
  lealtad: "Lealtad",
  equipo: "Equipo",
  actividad: "Actividad",
  negocio: "Datos y ajustes",
}

/**
 * Barra superior + menú lateral deslizable para pantallas chicas.
 * En escritorio (lg+) no se renderiza: el layout muestra el aside fijo.
 */
export function AdminMobileNav({
  userName,
  roleLabel,
  businessName,
  isTemplate,
  memberships,
  activeBusinessId,
  isPlatformAdmin,
  logoutAction,
}: {
  userName: string
  roleLabel: string
  businessName: string
  isTemplate: boolean
  memberships: Membership[]
  activeBusinessId: string
  isPlatformAdmin: boolean
  logoutAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const section = pathname.split("/")[2] ?? ""
  const sectionLabel = pathname === "/admin" ? "Resumen" : SECTION_LABELS[section] ?? section

  return (
    <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 py-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="h-4 w-4" />
        </Button>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetTitle className="sr-only">Menú de administración</SheetTitle>
          <div className="px-5 py-5 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <Coffee className="h-6 w-6 text-amber-700 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-stone-800 leading-tight truncate">{businessName}</p>
                {isTemplate && <p className="text-xs text-stone-400">Plantilla de menú</p>}
              </div>
              {/* Igual que en escritorio: la guía arriba, a la vista. */}
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
            {memberships.length > 1 && (
              <div className="mt-3">
                <BusinessSwitcher
                  memberships={memberships}
                  activeId={activeBusinessId}
                  className="w-full max-w-none justify-between"
                />
              </div>
            )}
          </div>
          <div onClick={() => setOpen(false)} className="contents">
            <NavScrollArea className="px-3 py-2 space-y-0.5">
              <AdminNav />
            </NavScrollArea>
          </div>
          {/* Mismo pie que en escritorio, con el mismo componente: eran dos
              copias de la misma lista y se desincronizaban al tocar una. */}
          <div className="shrink-0 border-t border-stone-200 px-3 py-3 space-y-1">
            {!isTemplate && (
              <Link
                href="/pos"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50"
                onClick={() => setOpen(false)}
              >
                <Store className="h-4 w-4" />
                Ir al POS
              </Link>
            )}
            <AdminUserMenu
              userName={userName}
              roleLabel={roleLabel}
              isPlatformAdmin={isPlatformAdmin}
              logoutAction={logoutAction}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2 min-w-0">
        <Coffee className="h-5 w-5 text-amber-700 shrink-0" />
        <span className="font-bold text-stone-800 truncate">{businessName}</span>
        <span className="text-xs text-stone-400 truncate hidden sm:inline">· {sectionLabel}</span>
      </div>

      {!isTemplate ? (
        <Link href="/pos" className="shrink-0">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-amber-700 border-amber-200">
            <Store className="h-4 w-4" />
            POS
          </Button>
        </Link>
      ) : (
        <span className="w-9" />
      )}
    </div>
  )
}
