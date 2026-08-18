import Link from "next/link"
import { redirect } from "next/navigation"
import { Coffee, LogOut } from "lucide-react"
import { getContext } from "@/lib/context"
import { logout } from "@/app/actions/auth"
import { BusinessPicker } from "@/components/business-picker"

export const dynamic = "force-dynamic"

export default async function SeleccionarNegocioPage() {
  const ctx = await getContext()
  if (!ctx) redirect("/login")

  const memberships = ctx.memberships
  const activeId = ctx.business?.id ?? null

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-14 w-14 rounded-2xl bg-amber-700 flex items-center justify-center">
            <Coffee className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">
            {memberships.length > 0 ? "¿Con qué cafetería trabajas hoy?" : "Sin cafetería asignada"}
          </h1>
          <p className="text-sm text-stone-500">
            {memberships.length > 0
              ? `Hola, ${ctx.fullName || "bienvenido"}. Elige una para continuar.`
              : "Tu cuenta existe pero aún no pertenece a ninguna cafetería. Pide al administrador que te agregue a su equipo."}
          </p>
        </div>

        {memberships.length > 0 && <BusinessPicker memberships={memberships} activeId={activeId} />}

        <div className="flex items-center justify-between text-sm">
          <Link href="/cuenta" className="text-stone-500 hover:text-stone-800">
            Mi cuenta
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-stone-500 hover:text-stone-800"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
