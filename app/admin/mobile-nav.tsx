"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Coffee, Menu, Store, BookOpen, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { AdminNav } from "./admin-nav"

/**
 * Barra superior + menú lateral deslizable para pantallas chicas.
 * En escritorio (lg+) no se renderiza: el layout muestra el aside fijo.
 */
export function AdminMobileNav({
  userName,
  logoutAction,
}: {
  userName: string
  logoutAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 py-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <Menu className="h-4 w-4" />
        </Button>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetTitle className="sr-only">Menú de administración</SheetTitle>
          <div className="px-5 py-5 border-b border-stone-200 flex items-center gap-2">
            <Coffee className="h-6 w-6 text-amber-700" />
            <div>
              <p className="text-lg font-bold text-stone-800 leading-tight">El Cafecito</p>
              <p className="text-xs text-stone-400">Panel de Administración</p>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" onClick={() => setOpen(false)}>
            <AdminNav />
          </nav>
          <div className="px-3 pb-4 space-y-1 border-t border-stone-200 pt-4">
            <Link
              href="/pos"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50"
              onClick={() => setOpen(false)}
            >
              <Store className="h-4 w-4" />
              Ir al POS
            </Link>
            <Link
              href="/ayuda"
              target="_blank"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100"
            >
              <BookOpen className="h-4 w-4" />
              Guía de uso
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-100"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </form>
            <div className="px-3 pt-3 border-t border-stone-100">
              <p className="text-xs text-stone-400">Conectado como</p>
              <p className="text-sm font-medium text-stone-700 truncate">{userName}</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2 min-w-0">
        <Coffee className="h-5 w-5 text-amber-700 shrink-0" />
        <span className="font-bold text-stone-800 truncate">El Cafecito</span>
        <span className="text-xs text-stone-400 truncate hidden sm:inline">
          · {pathname === "/admin" ? "Dashboard" : pathname.replace("/admin/", "").replace(/^\w/, (c) => c.toUpperCase())}
        </span>
      </div>

      <Link href="/pos" className="shrink-0">
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-amber-700 border-amber-200">
          <Store className="h-4 w-4" />
          POS
        </Button>
      </Link>
    </div>
  )
}
