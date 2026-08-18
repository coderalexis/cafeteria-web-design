import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, LogOut } from "lucide-react"
import { getContext } from "@/lib/context"
import { logout } from "@/app/actions/auth"
import { BusinessPicker } from "@/components/business-picker"

export const dynamic = "force-dynamic"

export default async function SuspendidoPage() {
  const ctx = await getContext()
  if (!ctx) redirect("/login")
  // Si el negocio activo está bien, esta página no aplica.
  if (ctx.business && ctx.business.status === "active") redirect("/")

  const others = ctx.memberships.filter((m) => m.status === "active")

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">Cafetería suspendida</h1>
          <p className="text-sm text-stone-500">
            {ctx.business ? `«${ctx.business.name}»` : "Esta cafetería"} está suspendida temporalmente y no se
            puede operar. Si crees que es un error, contacta al operador del sistema.
          </p>
        </div>

        {others.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">También perteneces a:</p>
            <BusinessPicker memberships={others} activeId={null} />
          </div>
        )}

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
