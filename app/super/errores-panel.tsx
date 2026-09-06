import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { getRecentErrors } from "@/app/actions/errors"
import { ERRORES_DIAS } from "@/lib/errores"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Lo primero que ve el operador al entrar a /super: qué tronó en los últimos
 * dos días, en qué cafetería y cuántas veces. Si no hubo nada, lo dice en una
 * línea — que el silencio también sea información.
 *
 * Dos días y no una semana: un error que ya se atendió no tiene por qué
 * seguir saludando cada mañana; y el que sigue pasando se reporta de nuevo
 * solo. La base guarda lo mismo (migración 52).
 */
export async function ErroresPanel() {
  const r = await getRecentErrors(ERRORES_DIAS)
  if (!r.success) {
    return <p className="text-sm text-red-600">No se pudieron leer los errores: {r.error}</p>
  }

  if (r.errors.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Sin errores reportados en los últimos {ERRORES_DIAS} días.
      </p>
    )
  }

  const total = r.errors.reduce((s, e) => s + e.count, 0)
  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          {total} error{total === 1 ? "" : "es"} en {ERRORES_DIAS} días · {r.errors.length} distinto{r.errors.length === 1 ? "" : "s"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-red-100">
          {r.errors.slice(0, 20).map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
              <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-red-700">{e.count}×</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-stone-800">{e.message}</p>
                <p className="text-xs text-stone-500">
                  {e.businessName ?? "sin sesión"} · <code>{e.route}</code> · última{" "}
                  {new Date(e.lastAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
                  {e.digest && <> · ref {e.digest}</>}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {r.errors.length > 20 && (
          <p className="mt-2 text-xs text-stone-500">Se muestran los 20 más frecuentes de {r.errors.length}.</p>
        )}
      </CardContent>
    </Card>
  )
}
