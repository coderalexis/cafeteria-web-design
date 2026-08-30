"use client"

import Link from "next/link"
import { useTransition } from "react"
import { ChevronsUpDown, Loader2, LogOut, ShieldCheck, UserCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TextSizeControl } from "@/components/text-size-control"
import { useTextSize } from "@/components/text-size-provider"

/**
 * Quién eres y lo que se hace de vez en cuando, en un solo renglón.
 *
 * Antes el pie del menú tenía cuatro enlaces sueltos (Guía, Mi cuenta, Panel
 * del operador, Cerrar sesión) más un bloque de «Conectado como»: 273 px fijos
 * para cosas que se usan una vez a la semana. Sumado al menú, el panel pedía
 * 981 px de alto y en una laptop de 800 px «Cerrar sesión» quedaba FUERA de la
 * pantalla, sin aviso de que había más abajo.
 *
 * Ahora es un renglón que ya dice el nombre y el rol —la información que daba
 * el bloque— y guarda lo demás detrás de un toque. Se pasa de 273 px a ~110.
 */
export function AdminUserMenu({
  userName,
  roleLabel,
  isPlatformAdmin,
  logoutAction,
  onNavigate,
}: {
  userName: string
  roleLabel: string
  isPlatformAdmin: boolean
  logoutAction: () => Promise<void>
  /** El menú lateral del teléfono se cierra al navegar. */
  onNavigate?: () => void
}) {
  const [saliendo, empezarSalida] = useTransition()
  const { size, setSize } = useTextSize()

  const iniciales =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-stone-100"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600">
            {saliendo ? <Loader2 className="h-4 w-4 animate-spin" /> : iniciales}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-stone-700">{userName}</span>
            <span className="block text-xs text-stone-400">{roleLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-stone-400" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60">
        {/* Tamaño de letra, el mismo A− / A+ del POS. `onSelect` cancelado a
            propósito: sin eso el menú se cerraría al primer toque y habría que
            volver a abrirlo para cada paso —ajustar la letra es probar hasta
            que se ve bien, no elegir una opción—. */}
        <DropdownMenuLabel className="pb-1 text-xs font-normal text-stone-400">
          Tamaño de letra
        </DropdownMenuLabel>
        <div className="px-2 pb-1.5" onSelect={(e) => e.preventDefault()}>
          <TextSizeControl size={size} setSize={setSize} block />
        </div>
        <DropdownMenuSeparator />

        {/* La guía ya no vive aquí: se subió junto al nombre de la cafetería.
            Aquí uno viene por su cuenta, no por ayuda. */}
        <DropdownMenuItem asChild onSelect={onNavigate}>
          <Link href="/cuenta" className="gap-2">
            <UserCircle className="h-4 w-4 text-stone-400" />
            Mi cuenta
          </Link>
        </DropdownMenuItem>
        {isPlatformAdmin && (
          <DropdownMenuItem asChild onSelect={onNavigate}>
            <Link href="/super" className="gap-2">
              <ShieldCheck className="h-4 w-4 text-stone-400" />
              Panel del operador
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => empezarSalida(() => logoutAction())}
          disabled={saliendo}
          className="gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
