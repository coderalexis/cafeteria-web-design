import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Coffee, TimerOff } from "lucide-react"
import { ResetPasswordForm } from "./reset-form"

export const dynamic = "force-dynamic"

/**
 * Aterrizaje del enlace de recuperación (después de /restablecer/confirmar).
 * Con sesión de recuperación válida muestra el formulario; sin ella, explica
 * que el enlace caducó.
 */
export default async function RestablecerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-amber-700 flex items-center justify-center">
            <Coffee className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">Nueva contraseña</h1>
          {user && <p className="text-sm text-stone-500 text-center break-all">para {user.email}</p>}
        </div>

        {user ? (
          <ResetPasswordForm />
        ) : (
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-stone-100 flex items-center justify-center">
              <TimerOff className="h-6 w-6 text-stone-400" />
            </div>
            <p className="text-sm text-stone-700">
              Este enlace no es válido o ya caducó (dura 1 hora y se usa una sola vez).
            </p>
            <Link
              href="/olvide-contrasena"
              className="inline-block text-sm font-medium text-amber-700 hover:underline"
            >
              Pedir un enlace nuevo
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
