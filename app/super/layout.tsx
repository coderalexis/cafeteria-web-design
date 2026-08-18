import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Coffee, LogOut, ShieldCheck, LayoutDashboard, UserCircle } from "lucide-react"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { logout } from "@/app/actions/auth"

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  if (!ctx) redirect("/login")
  if (!ctx.isPlatformAdmin) redirect(homePathFor(ctx))

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-amber-700 flex items-center justify-center shrink-0">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-stone-800 leading-tight">Cafecito POS</p>
              <p className="text-xs text-stone-500 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Panel del operador
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            {ctx.business && (
              <Link
                href={homePathFor(ctx)}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
              >
                <LayoutDashboard className="h-4 w-4" />
                Mi cafetería
              </Link>
            )}
            <Link
              href="/cuenta"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
            >
              <UserCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Mi cuenta</span>
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
