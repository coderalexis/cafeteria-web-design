import { redirect } from "next/navigation"
import { Percent } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import type { AmbitoPromo, Promocion, TipoPromo } from "@/lib/promotions"
import { PromocionesClient } from "./promociones-client"

export const dynamic = "force-dynamic"

/** Lo que devuelve `promotions_report`. */
export interface ResultadoPromos {
  days: number
  by_promotion: Array<{
    id: string
    name: string
    is_active: boolean
    tickets: number
    revenue: number
    discount: number
  }>
}

export default async function PromocionesPage() {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  if (ctx.role === "cajero") redirect("/pos")

  const supabase = await createClient()
  const [{ data: promos }, { data: categorias }, { data: resultado }] = await Promise.all([
    supabase
      .from("promotions")
      .select("id, name, kind, value, scope, category_id, weekdays, start_hour, end_hour, starts_on, ends_on, min_ticket, is_active, menu_categories(name)")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.from("menu_categories").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.rpc("promotions_report", { p_days: 30 }),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
          <Percent className="h-6 w-6 text-amber-700" />
          Promociones
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Para llenar las horas flojas. Tú pones la regla —qué días, a qué hora y cuánto— y el sistema la aplica solo
          al cobrar; la cajera no tiene que acordarse de nada.
        </p>
      </div>

      <PromocionesClient
        promociones={(promos ?? []).map((p): Promocion => {
          // El join de PostgREST puede venir como objeto o como arreglo según
          // la cardinalidad que infiera; se normaliza aquí y no en la pantalla.
          const cat = p.menu_categories as unknown as { name: string } | { name: string }[] | null
          const nombreCat = Array.isArray(cat) ? (cat[0]?.name ?? null) : (cat?.name ?? null)
          return {
            id: p.id,
            name: p.name,
            kind: p.kind as TipoPromo,
            value: Number(p.value),
            scope: p.scope as AmbitoPromo,
            categoryId: p.category_id,
            categoryName: nombreCat,
            weekdays: (p.weekdays ?? []).map(Number),
            startHour: p.start_hour,
            endHour: p.end_hour,
            startsOn: p.starts_on,
            endsOn: p.ends_on,
            minTicket: Number(p.min_ticket),
            isActive: p.is_active,
          }
        })}
        categorias={(categorias ?? []).map((c) => ({ id: c.id, name: c.name }))}
        resultado={(resultado as unknown as ResultadoPromos | null) ?? null}
      />
    </div>
  )
}
