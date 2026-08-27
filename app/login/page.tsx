"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { login } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Coffee, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"

const BUSINESS_STORAGE_KEY = "pos-business-slug"

function normalizeSlugInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [identifier, setIdentifier] = useState("")
  const [business, setBusiness] = useState("")
  const [verContrasena, setVerContrasena] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Recuerda el café en este dispositivo; `?c=slug` (p. ej. desde un acceso
  // directo en la tablet) tiene prioridad.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("c")
    const stored = window.localStorage.getItem(BUSINESS_STORAGE_KEY)
    const initial = normalizeSlugInput(fromUrl ?? stored ?? "")
    if (initial) setBusiness(initial)
  }, [])

  const usesEmail = identifier.includes("@")

  function handleSubmit(formData: FormData) {
    setError(null)
    const slug = normalizeSlugInput(String(formData.get("business") ?? ""))
    formData.set("business", slug)
    if (slug) window.localStorage.setItem(BUSINESS_STORAGE_KEY, slug)
    startTransition(async () => {
      const result = await login(formData)
      // Si llegamos aquí, el login falló (el éxito redirige)
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
          <h1 className="text-2xl font-bold text-stone-800">Cafecito POS</h1>
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
            <label htmlFor="identifier" className="text-sm font-medium text-stone-700">
              Usuario o correo
            </label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              placeholder="Tu usuario o tu correo"
              required
              autoComplete="username"
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
              className="bg-stone-50"
              disabled={isPending}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className={usesEmail ? "hidden" : "space-y-2"} aria-hidden={usesEmail}>
            <label htmlFor="business" className="text-sm font-medium text-stone-700">
              Café
            </label>
            <Input
              id="business"
              name="business"
              type="text"
              placeholder="nombre-corto-del-cafe"
              required={!usesEmail}
              autoComplete="organization"
              autoCapitalize="none"
              spellCheck={false}
              className="bg-stone-50"
              disabled={isPending}
              value={business}
              onChange={(e) => setBusiness(normalizeSlugInput(e.target.value))}
            />
            <p className="text-xs text-stone-400">
              El identificador de tu cafetería (te lo da el administrador). Se recuerda en este dispositivo.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-stone-700">
              Contraseña
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={verContrasena ? "text" : "password"}
                placeholder="Tu contraseña"
                required
                autoComplete="current-password"
                className="bg-stone-50 pr-11"
                disabled={isPending}
              />
              {/* type="button": dentro de un form, un botón sin tipo lo envía. */}
              <button
                type="button"
                onClick={() => setVerContrasena((v) => !v)}
                disabled={isPending}
                aria-label={verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={verContrasena}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-stone-400 transition-colors hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-50"
              >
                {verContrasena ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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

          <p className="text-center">
            <Link
              href="/olvide-contrasena"
              className="text-xs text-stone-400 hover:text-stone-600 hover:underline underline-offset-2"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-stone-400">
          Sistema de punto de venta para cafeterías
        </p>
      </div>
    </main>
  )
}
