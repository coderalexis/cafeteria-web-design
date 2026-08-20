"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { completePasswordReset } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, Loader2 } from "lucide-react"

export function ResetPasswordForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await completePasswordReset(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success("Contraseña actualizada. ¡Bienvenido de vuelta!")
      router.push("/")
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="new_password" className="text-sm font-medium text-stone-700">
          Nueva contraseña
        </label>
        <Input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          className="bg-stone-50"
          disabled={isPending}
        />
        <p className="text-xs text-stone-400">Mínimo 8 caracteres, con al menos una letra y un número.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm_password" className="text-sm font-medium text-stone-700">
          Confirmar contraseña
        </label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
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
            Guardando...
          </>
        ) : (
          "Guardar y entrar"
        )}
      </Button>
    </form>
  )
}
