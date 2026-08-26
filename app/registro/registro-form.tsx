"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowRight, Coffee, Loader2, MailCheck } from "lucide-react"
import { startRegistration } from "@/app/actions/signup"
import { PRESETS } from "@/lib/presets"
import { MEXICO_TIMEZONES } from "@/lib/dates"
import { TRIAL_DAYS } from "@/lib/signup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function RegistroForm() {
  const [isPending, startTransition] = useTransition()
  const [enviadoA, setEnviadoA] = useState<string | null>(null)

  const enviar = (formData: FormData) => {
    startTransition(async () => {
      const result = await startRegistration(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setEnviadoA(result.email)
    })
  }

  if (enviadoA) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
          <MailCheck className="h-7 w-7 text-emerald-700" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-stone-800">Revisa tu correo</h2>
        <p className="mx-auto mt-2 max-w-sm text-stone-600">
          Te enviamos un enlace a <strong className="text-stone-800">{enviadoA}</strong>. Ábrelo para confirmar tu
          cuenta y tu cafetería queda lista al instante.
        </p>
        <p className="mt-4 text-sm text-stone-400">
          ¿No llega en unos minutos? Revisa tu carpeta de correo no deseado.
        </p>
      </div>
    )
  }

  return (
    <form action={enviar} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
      <div className="space-y-1.5">
        <label htmlFor="business_name" className="text-sm font-medium text-stone-700">
          ¿Cómo se llama tu cafetería?
        </label>
        <Input id="business_name" name="business_name" required minLength={2} maxLength={80} placeholder="Café de Lupita" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="owner_name" className="text-sm font-medium text-stone-700">
            Tu nombre
          </label>
          <Input id="owner_name" name="owner_name" required minLength={2} maxLength={80} placeholder="Lupita Hernández" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-stone-700">
            Tu correo
          </label>
          <Input id="email" name="email" type="email" required placeholder="lupita@gmail.com" autoComplete="email" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-stone-700">
            Contraseña
          </label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-stone-400">Mínimo 8 caracteres, con letras y números.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="timezone" className="text-sm font-medium text-stone-700">
            Zona horaria
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue="America/Mexico_City"
            className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
          >
            {MEXICO_TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-stone-400">Define a qué hora cierra tu día de ventas.</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-700">¿Cómo opera tu cafetería?</p>
        {PRESETS.map((preset, i) => (
          <label
            key={preset.key}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-stone-200 p-3 hover:border-amber-300"
          >
            <input type="radio" name="preset" value={preset.key} defaultChecked={i === 0} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-stone-800">{preset.label}</span>
              <span className="block text-xs text-stone-500">{preset.hint}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-stone-400">Todo esto lo puedes cambiar después.</p>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full gap-2 bg-amber-700 py-6 text-base font-semibold text-white hover:bg-amber-800"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
        Crear mi cafetería
        {!isPending && <ArrowRight className="h-4 w-4" />}
      </Button>

      <p className="text-center text-xs text-stone-400">
        Gratis {TRIAL_DAYS} días, sin tarjeta. ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-amber-700 hover:underline">
          Entra aquí
        </Link>
      </p>
    </form>
  )
}
