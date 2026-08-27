import Link from "next/link"
import { redirect } from "next/navigation"
import { Stamp } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { parseBusinessSettings } from "@/lib/settings"
import { Card, CardContent } from "@/components/ui/card"
import { LealtadClient } from "./lealtad-client"

export const dynamic = "force-dynamic"

export default async function LealtadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  const settings = parseBusinessSettings(ctx.business.settings)

  const raw = await searchParams
  const q = (Array.isArray(raw.q) ? raw.q[0] : raw.q)?.trim() ?? ""

  const supabase = await createClient()
  let query = supabase
    .from("loyalty_customers")
    .select("id, phone, name, stamps, visits, rewards_redeemed, last_visit_at")
    .order("last_visit_at", { ascending: false, nullsFirst: false })
    .limit(200)
  if (q) {
    const digits = q.replace(/\D/g, "")
    // Por teléfono si el texto trae dígitos; si no, por nombre.
    query = digits.length >= 3 ? query.ilike("phone", `%${digits}%`) : query.ilike("name", `%${q}%`)
  }
  const { data: customers } = await query

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
          <Stamp className="h-6 w-6 text-amber-700" />
          Lealtad
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Clientes de la tarjeta de sellos: {settings.loyaltyTarget} sellos ={" "}
          {settings.loyaltyReward.toLowerCase() || "premio"}. Los sellos se ganan al cobrar y el canje lo valida el
          sistema; aquí solo consultas y corriges.
        </p>
      </div>

      {!settings.loyalty && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="py-4 text-sm text-amber-900">
            El módulo está <strong>apagado</strong>: el POS no ofrece la tarjeta ni registra sellos. Actívalo en{" "}
            <Link href="/admin/negocio" className="font-semibold underline underline-offset-2">
              Negocio → Lealtad con sellos
            </Link>
            . Los clientes ya registrados no se pierden.
          </CardContent>
        </Card>
      )}

      <LealtadClient
        customers={(customers ?? []).map((c) => ({
          id: c.id,
          phone: c.phone,
          name: c.name,
          stamps: c.stamps,
          visits: c.visits,
          rewardsRedeemed: c.rewards_redeemed,
          lastVisitAt: c.last_visit_at,
        }))}
        target={settings.loyaltyTarget}
        query={q}
      />
    </div>
  )
}
