"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { KeyRound, Loader2 } from "lucide-react"
import { changeOwnPassword } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ChangePasswordCard() {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await changeOwnPassword(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success("Contraseña actualizada.")
      formRef.current?.reset()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-700" />
          Cambiar contraseña
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="space-y-3">
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="current_password" className="text-sm font-medium text-stone-700">
              Contraseña actual
            </label>
            <Input
              id="current_password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
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
              disabled={isPending}
            />
            <p className="text-xs text-stone-400">Mínimo 8 caracteres, con al menos una letra y un número.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm_password" className="text-sm font-medium text-stone-700">
              Confirmar nueva contraseña
            </label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={isPending}
            />
          </div>
          <Button type="submit" disabled={isPending} className="bg-amber-700 hover:bg-amber-800 text-white">
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Guardar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
