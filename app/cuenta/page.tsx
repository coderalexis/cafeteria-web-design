import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Store, UserCircle } from "lucide-react"
import { getContext } from "@/lib/context"
import { landingPathFor, ROLE_LABELS } from "@/lib/context-shape"
import { createClient } from "@/lib/supabase/server"
import { isSyntheticEmail } from "@/lib/accounts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChangePasswordCard } from "./account-client"
import { PinCard } from "./pin-card"

export const dynamic = "force-dynamic"

export default async function CuentaPage() {
  const ctx = await getContext()
  if (!ctx) redirect("/login")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const email = user?.email ?? ""
  const synthetic = isSyntheticEmail(email)

  // Para cuentas de café el "usuario" vive en la membresía del negocio activo
  const [{ data: activeMember }, { data: pinSet }] = ctx.business
    ? await Promise.all([
        supabase
          .from("business_members")
          .select("username")
          .eq("business_id", ctx.business.id)
          .eq("user_id", ctx.userId)
          .maybeSingle(),
        supabase.rpc("my_pin_set"),
      ])
    : [{ data: null }, { data: null }]

  return (
    <main className="min-h-screen bg-stone-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href={landingPathFor(ctx)}
            className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-stone-800">Mi cuenta</h1>
          <p className="text-sm text-stone-500">Tus datos de acceso y las cafeterías a las que perteneces.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-amber-700" />
              Datos de acceso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-stone-500">Nombre</span>
              <span className="font-medium text-stone-800">{ctx.fullName || "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-stone-500">{synthetic ? "Usuario" : "Correo"}</span>
              <span className="font-medium text-stone-800 break-all text-right">
                {synthetic
                  ? activeMember?.username
                    ? `${activeMember.username} · ${ctx.business?.slug ?? ""}`
                    : "cuenta de café"
                  : email || "—"}
              </span>
            </div>
            {synthetic && (
              <p className="text-xs text-stone-400 pt-1">
                Entras con tu usuario y el identificador de tu café. Un administrador puede restablecer tu
                contraseña desde Equipo si la olvidas.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4 text-amber-700" />
              Mis cafeterías
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ctx.memberships.length === 0 ? (
              <p className="text-sm text-stone-500">Aún no perteneces a ninguna cafetería.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {ctx.memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-800 truncate">
                        {m.name}
                        {m.isTemplate && <span className="ml-1 text-xs font-normal text-stone-400">(plantilla)</span>}
                      </p>
                      <p className="text-xs text-stone-400">{m.slug}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.id === ctx.business?.id && (
                        <Badge variant="outline" className="border-amber-300 text-amber-800">
                          activa
                        </Badge>
                      )}
                      {m.status === "suspended" && <Badge variant="destructive">suspendida</Badge>}
                      <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {ctx.business && <PinCard hasPin={pinSet === true} businessName={ctx.business.name} />}

        <ChangePasswordCard />
      </div>
    </main>
  )
}
