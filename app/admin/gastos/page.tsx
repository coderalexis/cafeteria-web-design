import { redirect } from "next/navigation"
import { Coins } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { dateStringInTz } from "@/lib/dates"
import type { CategoriaGasto, Gasto, GastoFijo } from "@/lib/expenses"
import { GastosClient } from "./gastos-client"
import type { ReporteUtilidad } from "./types"

export const dynamic = "force-dynamic"

/** «2026-08» → primer día del mes. Cualquier cosa rara cae en el mes de hoy. */
function mesPedido(raw: string | undefined, hoy: string): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`
  return `${hoy.slice(0, 7)}-01`
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  // Los gastos son secreto del dueño: la RLS ya lo impide, pero mandar a un
  // cajero a una pantalla vacía sería peor que no dejarlo entrar.
  if (ctx.role === "cajero") redirect("/pos")

  const tz = ctx.business.timezone
  const hoy = dateStringInTz(tz)
  const raw = await searchParams
  const mes = mesPedido(Array.isArray(raw.mes) ? raw.mes[0] : raw.mes, hoy)
  const mesFin = new Date(`${mes}T00:00:00Z`)
  mesFin.setUTCMonth(mesFin.getUTCMonth() + 1)
  const finStr = mesFin.toISOString().slice(0, 10)

  const supabase = await createClient()
  const [{ data: reporte }, { data: fijos }, { data: gastos }] = await Promise.all([
    supabase.rpc("profit_report", { p_month: mes }),
    supabase
      .from("fixed_expenses")
      .select("id, name, category, monthly_amount, is_active")
      .order("is_active", { ascending: false })
      .order("monthly_amount", { ascending: false }),
    supabase
      .from("expenses")
      .select("id, spent_on, category, description, amount, paid_with, cash_movement_id")
      .gte("spent_on", mes)
      .lt("spent_on", finStr)
      .order("spent_on", { ascending: false })
      .limit(300),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
          <Coins className="h-6 w-6 text-amber-700" />
          Gastos y utilidad
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Lo que vendes menos lo que te cuesta preparar menos lo que pagas para tener abierto. Aquí sale cuánto{" "}
          <strong className="text-stone-700">ganaste</strong> de verdad, y cuánto necesitas vender para no perder.
        </p>
      </div>

      <GastosClient
        mes={mes}
        hoy={hoy}
        reporte={(reporte as unknown as ReporteUtilidad | null) ?? null}
        fijos={(fijos ?? []).map(
          (f): GastoFijo => ({
            id: f.id,
            name: f.name,
            category: f.category as CategoriaGasto,
            monthlyAmount: Number(f.monthly_amount),
            isActive: f.is_active,
          }),
        )}
        gastos={(gastos ?? []).map(
          (g): Gasto => ({
            id: g.id,
            spentOn: g.spent_on,
            category: g.category as CategoriaGasto,
            description: g.description,
            amount: Number(g.amount),
            paidWith: g.paid_with,
            fromCashMovement: g.cash_movement_id != null,
          }),
        )}
      />
    </div>
  )
}
