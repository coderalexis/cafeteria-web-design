"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { LockKeyhole, Loader2 } from "lucide-react"
import { setMyPin } from "@/app/actions/security"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** Fijar o cambiar mi PIN de caja (desbloqueo del POS) en el negocio activo. */
export function PinCard({ hasPin, businessName }: { hasPin: boolean; businessName: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await setMyPin(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast.success("PIN guardado.")
      setSaved(true)
      formRef.current?.reset()
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LockKeyhole className="h-4 w-4 text-amber-700" />
          PIN de caja
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-stone-500 mb-3">
          Desbloquea el POS de «{businessName}» cuando se bloquea por inactividad.{" "}
          {hasPin || saved ? "Ya tienes un PIN; aquí puedes cambiarlo." : "Aún no tienes PIN."}
        </p>
        <form ref={formRef} action={handleSubmit} className="space-y-3">
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="pin" className="text-sm font-medium text-stone-700">
                Nuevo PIN
              </label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                placeholder="4 a 6 dígitos"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirm_pin" className="text-sm font-medium text-stone-700">
                Confirmar
              </label>
              <Input
                id="confirm_pin"
                name="confirm_pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                required
                disabled={isPending}
              />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="bg-amber-700 hover:bg-amber-800 text-white">
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar PIN
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
