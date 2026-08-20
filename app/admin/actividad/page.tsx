import { redirect } from "next/navigation"
import { History } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { AUDIT_ACTION_LABELS } from "@/lib/audit"
import { formatDateTime } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

const MAX_EVENTS = 200

/** Resumen legible de `details` (pares clave: valor cortos). */
function summarizeDetails(details: unknown): string {
  if (!details || typeof details !== "object") return ""
  const parts: string[] = []
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (value === null || value === undefined) continue
    const label = key.replace(/_/g, " ")
    if (Array.isArray(value)) {
      parts.push(`${label}: ${value.join(", ")}`)
    } else if (typeof value === "boolean") {
      parts.push(`${label}: ${value ? "sí" : "no"}`)
    } else {
      parts.push(`${label}: ${String(value)}`)
    }
  }
  return parts.join(" · ")
}

export default async function ActividadPage() {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  const tz = ctx.business.timezone

  // RLS: solo eventos del negocio activo y solo para owner|admin.
  const supabase = await createClient()
  const { data: events, error } = await supabase
    .from("audit_events")
    .select("id, actor_name, action, entity, details, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_EVENTS)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
          <History className="h-6 w-6 text-amber-700" />
          Actividad
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Quién cambió qué en el menú, el equipo y los ajustes (últimos {MAX_EVENTS} movimientos). Las ventas y
          cancelaciones se consultan en Ventas.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error.message}</p>
      )}

      <Card>
        <CardContent className="p-0">
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-stone-400 py-10 text-center">
              Aún no hay actividad registrada. Los cambios que hagas a partir de ahora aparecerán aquí.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {(events ?? []).map((e) => {
                const detail = summarizeDetails(e.details)
                return (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    <span className="text-xs text-stone-400 w-32 shrink-0">{formatDateTime(e.created_at, tz)}</span>
                    <span className="font-medium text-stone-800 shrink-0">{e.actor_name || "—"}</span>
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                    {e.entity && <span className="text-stone-700 truncate">{e.entity}</span>}
                    {detail && <span className="text-xs text-stone-400 basis-full sm:basis-auto">{detail}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
