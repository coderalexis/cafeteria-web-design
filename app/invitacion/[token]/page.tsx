import type { Metadata } from "next"
import Link from "next/link"
import { Coffee } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ROLE_LABELS } from "@/lib/context-shape"
import { estadoInvitacion, mensajeDeEstado } from "@/lib/invitaciones"
import { buscarInvitacion } from "@/lib/invitaciones-servidor"
import { InvitacionForm, type ModoInvitacion } from "./invitacion-form"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Invitación · Cafecito POS",
  robots: { index: false, follow: false },
}

/**
 * A donde lleva el enlace del correo de invitación. Pública (fuera del
 * middleware): quien la abre puede no tener cuenta todavía. Lo que decide es
 * el token; la pantalla solo elige qué pedir, y la acción vuelve a decidirlo.
 */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const inv = await buscarInvitacion(admin, token)
  const estado = inv ? estadoInvitacion(inv) : "no-existe"

  let modo: ModoInvitacion | null = null
  let sesionDe: string | null = null
  if (inv && estado === "viva") {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const suyo = (user.email ?? "").toLowerCase() === inv.email
      modo = suyo ? "unirme" : "otra-sesion"
      // Una cuenta de café no tiene correo de verdad: no se muestra el interno.
      sesionDe = suyo ? null : String(user.user_metadata?.full_name || "otra cuenta")
    } else {
      const { data: existente } = await admin.rpc("find_user_id_by_email", { p_email: inv.email })
      modo = existente ? "entrar" : "crear"
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-stone-800">Cafecito POS</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10 sm:py-14">
        {inv && modo ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
            <p className="text-sm text-stone-500">{inv.invitedByName ? `${inv.invitedByName} te invitó a` : "Te invitaron a"}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 text-balance">{inv.cafe.name}</h1>
            <p className="mt-2 text-stone-600">
              como <strong className="text-stone-800">{ROLE_LABELS[inv.role].toLowerCase()}</strong>, con el correo{" "}
              <strong className="break-all text-stone-800">{inv.email}</strong>.
            </p>
            <div className="mt-6">
              <InvitacionForm token={token} modo={modo} email={inv.email} nombre={inv.fullName} sesionDe={sesionDe} />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center sm:p-8">
            <h1 className="text-xl font-bold text-stone-800">Esta invitación ya no sirve</h1>
            <p className="mx-auto mt-2 max-w-sm text-stone-600">
              {mensajeDeEstado(estado === "viva" ? "no-existe" : estado)}
            </p>
            <Link href="/login" className="mt-5 inline-block text-sm font-medium text-amber-700 hover:underline">
              Ir a entrar
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
