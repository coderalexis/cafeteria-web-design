"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Tag, Package, Layers, Receipt } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/categorias", label: "Categorías", icon: Tag },
  { href: "/admin/productos", label: "Productos", icon: Package },
  { href: "/admin/variantes", label: "Variantes", icon: Layers },
  { href: "/admin/ventas", label: "Ventas", icon: Receipt },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <>
      {navItems.map((item) => {
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
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : "text-stone-600 hover:bg-stone-50 hover:text-stone-800"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </>
  )
}
