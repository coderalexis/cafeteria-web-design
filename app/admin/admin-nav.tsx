"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Tag, Package, SlidersHorizontal, Receipt, Users, Wallet, Store, BarChart3, History, Stamp, HandCoins, Coins } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Menú del panel, en grupos.
 *
 * Eran once opciones en una lista plana, todas del mismo peso: había que
 * leerlas una por una para encontrar la que servía. Agrupadas se busca por lo
 * que uno quiere hacer —tocar el menú, ver el dinero, administrar el
 * negocio— y no por el nombre de la pantalla.
 *
 * Los títulos están en segunda persona a propósito («Tu menú», no «Menú»):
 * quien entra aquí es la dueña de la cafetería, no alguien configurando un
 * sistema.
 *
 * `Resumen` va suelto arriba porque es el punto de partida, no una categoría.
 */
const navGroups: { titulo?: string; items: { href: string; label: string; icon: typeof Tag }[] }[] = [
  {
    items: [{ href: "/admin", label: "Resumen", icon: LayoutDashboard }],
  },
  {
    titulo: "Tu menú",
    items: [
      { href: "/admin/categorias", label: "Categorías", icon: Tag },
      { href: "/admin/productos", label: "Productos", icon: Package },
      // La ruta sigue siendo /modificadores para no romper enlaces guardados
      // ni los de la guía; lo que cambia es cómo se llama a la vista del
      // usuario. «Modificadores» es palabra de programador: una dueña real se
      // quedó atorada sin entender qué eran.
      { href: "/admin/modificadores", label: "Opciones y extras", icon: SlidersHorizontal },
    ],
  },
  {
    titulo: "Tu dinero",
    items: [
      { href: "/admin/ventas", label: "Ventas", icon: Receipt },
      { href: "/admin/cortes", label: "Cortes de caja", icon: Wallet },
      { href: "/admin/por-cobrar", label: "Por cobrar", icon: HandCoins },
      { href: "/admin/gastos", label: "Gastos y utilidad", icon: Coins },
      { href: "/admin/analisis", label: "Análisis", icon: BarChart3 },
    ],
  },
  {
    titulo: "Tu negocio",
    items: [
      { href: "/admin/equipo", label: "Equipo", icon: Users },
      { href: "/admin/lealtad", label: "Lealtad", icon: Stamp },
      { href: "/admin/actividad", label: "Actividad", icon: History },
      { href: "/admin/negocio", label: "Datos y ajustes", icon: Store },
    ],
  },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <>
      {navGroups.map((grupo, i) => (
        <div key={grupo.titulo ?? "inicio"} className={i > 0 ? "pt-1" : undefined}>
          {/* El título ya separa por sí solo; el espacio extra que llevaba
              arriba costaba 30 px que hacían que el menú no cupiera entero. */}
          {grupo.titulo && (
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              {grupo.titulo}
            </p>
          )}
          <div className="space-y-0.5">
            {grupo.items.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    // `py-2` y no `py-2.5`: el menú tiene que caber ENTERO en
                    // una laptop de 768 px de alto. Cuatro píxeles por opción,
                    // por once opciones, son 44 px — la diferencia entre verlo
                    // completo y creer que faltan opciones.
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "text-stone-600 hover:bg-stone-50 hover:text-stone-800"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
