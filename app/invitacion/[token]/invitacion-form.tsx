"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { aceptarInvitacion, salirParaAceptar } from "@/app/actions/invitaciones"
import { sinTumbar } from "@/lib/sin-tumbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * unirme      ya entró con el correo invitado: un toque.
 * entrar      el correo tiene cuenta: su contraseña.
 * crear       el correo no tiene cuenta: su nombre y SU contraseña.
 * otra-sesion hay una sesión abierta de otra cuenta en este aparato.
 */
export type ModoInvitacion = "unirme" | "entrar" | "crear" | "otra-sesion"

export function InvitacionForm({
  token,
  modo,
  email,
  nombre,
  sesionDe,
}: {
  token: string
  modo: ModoInvitacion
  email: string
  nombre: string
  sesionDe: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const aceptar = (formData: FormData) => {
    setError(null)
    startTransition(
      sinTumbar(async () => {
        // Si sale bien, la acción redirige al panel o al POS.
        const r = await aceptarInvitacion({
          token,
          password: String(formData.get("password") ?? ""),
          fullName: String(formData.get("full_name") ?? ""),
        })
        if (!r.success) setError(r.error)
      }, setError),
    )
  }

  if (modo === "otra-sesion") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          En este aparato está abierta la sesión de <strong>{sesionDe}</strong>. Para aceptar, sal de esa sesión y
          entra con <strong className="break-all">{email}</strong>.
        </p>
        <Button
          className="w-full"
          disabled={isPending}
          onClick={() => startTransition(sinTumbar(async () => salirParaAceptar(token), setError))}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salir de esa sesión
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <form action={aceptar} className="space-y-4">
      {modo === "crear" && (
        <>
          <p className="text-sm text-stone-600">Todavía no tienes cuenta: créala aquí, con tu propia contraseña.</p>
          <div className="space-y-1.5">
            <label htmlFor="inv-nombre" className="text-sm font-medium text-stone-700">
              Tu nombre
            </label>
            <Input id="inv-nombre" name="full_name" defaultValue={nombre} required maxLength={80} autoComplete="name" />
          </div>
        </>
      )}
      {(modo === "crear" || modo === "entrar") && (
        <div className="space-y-1.5">
          <label htmlFor="inv-password" className="text-sm font-medium text-stone-700">
            {modo === "crear" ? "Elige una contraseña" : "Tu contraseña"}
          </label>
          {/* El correo va oculto para que el gestor de contraseñas sepa de qué cuenta es. */}
          <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
          <Input
            id="inv-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={modo === "crear" ? "new-password" : "current-password"}
          />
          {modo === "crear" ? (
            <p className="text-xs text-stone-400">Mínimo 8 caracteres, con letras y números.</p>
          ) : (
            <Link href="/olvide-contrasena" className="text-xs text-amber-700 hover:underline">
              Olvidé mi contraseña
            </Link>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isPending} className="w-full bg-amber-700 hover:bg-amber-800">
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {modo === "crear" ? "Crear mi cuenta y unirme" : "Unirme al equipo"}
      </Button>
      <p className="text-center text-xs text-stone-400">
        ¿No esperabas esta invitación? No hagas nada: nadie entra a tu nombre sin que la aceptes.
      </p>
    </form>
  )
}
