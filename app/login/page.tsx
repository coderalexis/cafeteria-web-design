"use client"

import { useState, useTransition } from "react"
import { login } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Coffee, AlertCircle, Loader2 } from "lucide-react"

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await login(formData)
      // If we get here, login failed (success redirects)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-amber-700 flex items-center justify-center">
            <Coffee className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">El Cafecito</h1>
          <p className="text-sm text-stone-500">Ingresa para continuar</p>
        </div>

        {/* Form */}
        <form
          action={handleSubmit}
          className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="username"
              className="text-sm font-medium text-stone-700"
            >
              Usuario
            </label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="Tu nombre de usuario"
              required
              autoComplete="username"
              autoFocus
              className="bg-stone-50"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-stone-700"
            >
              Contraseña
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Tu contraseña"
              required
              autoComplete="current-password"
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
                Ingresando...
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-stone-400">
          Sistema de punto de venta
        </p>
      </div>
    </main>
  )
}
