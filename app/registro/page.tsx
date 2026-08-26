import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Coffee, Check } from "lucide-react"
import { getContext } from "@/lib/context"
import { landingPathFor } from "@/lib/context-shape"
import { TRIAL_DAYS } from "@/lib/signup"
import { RegistroForm } from "./registro-form"

export const metadata: Metadata = {
  title: "Crea tu cafetería · Cafecito POS",
  description: `Prueba Cafecito POS gratis ${TRIAL_DAYS} días. Sin tarjeta.`,
}

export default async function RegistroPage() {
  // Quien ya entró no se registra otra vez.
  const ctx = await getContext()
  if (ctx) redirect(landingPathFor(ctx))

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-stone-800">Cafecito POS</span>
          </Link>
          <Link href="/login" className="text-sm text-stone-500 hover:text-amber-700">
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
            Prueba el sistema en tu cafetería
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-stone-600">
            {TRIAL_DAYS} días gratis, sin tarjeta. Tu cafetería queda lista con un menú de ejemplo para que empieces a
            vender en cuanto confirmes tu correo.
          </p>
          <ul className="mx-auto mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-stone-600">
            {["Sin instalar nada", "Con tu menú y tus precios", "Cancela cuando quieras"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8">
          <RegistroForm />
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-stone-400">
          Al crear tu cafetería aceptas que guardemos los datos necesarios para operarla (tu correo, tu menú y tus
          ventas). No los compartimos con nadie y puedes pedir que los borremos cuando quieras.
        </p>
      </main>
    </div>
  )
}
