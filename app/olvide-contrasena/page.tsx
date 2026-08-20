"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { requestPasswordReset } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Coffee, AlertCircle, Loader2, MailCheck, ArrowLeft } from "lucide-react"

export default function OlvideContrasenaPage() {
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    startTransition(async () => {
      const result = await requestPasswordReset(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSentTo(email)
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-amber-700 flex items-center justify-center">
            <Coffee className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">Recuperar contraseña</h1>
          <p className="text-sm text-stone-500 text-center">
            Para cuentas que entran con correo. Si eres cajero (usuario + café), tu administrador la restablece desde
            Equipo.
          </p>
        </div>

        {sentTo ? (
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <MailCheck className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-stone-700">
              Si <strong className="break-all">{sentTo}</strong> está registrado, te enviamos un enlace para
              restablecer tu contraseña. Revisa tu bandeja (y el spam).
            </p>
            <p className="text-xs text-stone-400">El enlace caduca en 1 hora y solo se puede usar una vez.</p>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:underline">
              <ArrowLeft className="h-4 w-4" />
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-stone-700">
                Tu correo
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tucorreo@ejemplo.com"
                required
                autoComplete="email"
                autoFocus
                className="bg-stone-50"
                disabled={isPending}
              />
            </div>

            <Button
              className="w-full bg-amber-700 hover:bg-amber-800 text-white font-semibold py-5"
              type="submit"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviarme el enlace"
              )}
            </Button>

            <p className="text-center">
              <Link
                href="/login"
                className="text-xs text-stone-400 hover:text-stone-600 hover:underline underline-offset-2"
              >
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
