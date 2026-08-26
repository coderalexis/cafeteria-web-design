"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Mail, Send } from "lucide-react"
import { runWeeklySummariesNow } from "@/app/actions/super"
import type { WeeklySendResult } from "@/lib/weekly-summary"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const STATUS_STYLES: Record<WeeklySendResult["status"], string> = {
  enviado: "bg-emerald-100 text-emerald-700 border-emerald-200",
  listo: "bg-blue-100 text-blue-700 border-blue-200",
  omitido: "bg-stone-100 text-stone-500 border-stone-200",
  error: "bg-red-100 text-red-700 border-red-200",
}

/**
 * Disparo manual del resumen semanal (el cron corre solo los lunes). «Probar»
 * no envía nada: muestra qué saldría y a quién.
 */
export function WeeklySummaryCard() {
  const [isPending, startTransition] = useTransition()
  const [results, setResults] = useState<WeeklySendResult[] | null>(null)
  const [lastWasDry, setLastWasDry] = useState(true)

  const run = (dry: boolean) => {
    if (isPending) return
    if (!dry && !window.confirm("¿Enviar el resumen semanal por correo a todas las cafeterías ahora?")) return
    startTransition(async () => {
      const result = await runWeeklySummariesNow({ dry })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setResults(result.results)
      setLastWasDry(dry)
      if (!dry) toast.success("Resúmenes procesados.")
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-amber-700" />
          Resumen semanal por correo
        </CardTitle>
        <CardDescription>
          El cron lo envía cada lunes a las 8:00 (CDMX) a dueños y administradores con correo real; cubre la semana
          anterior (lunes a domingo) en la zona de cada cafetería. Aquí puedes probarlo o dispararlo manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={isPending} onClick={() => run(true)}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Probar (sin enviar)
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white"
            disabled={isPending}
            onClick={() => run(false)}
          >
            <Send className="h-3.5 w-3.5" />
            Enviar ahora
          </Button>
        </div>

        {results && (
          <div className="space-y-1.5">
            <p className="text-xs text-stone-400">
              {lastWasDry ? "Prueba (no se envió nada):" : "Resultado del envío:"}
            </p>
            {results.length === 0 && <p className="text-sm text-stone-500">Sin cafeterías activas.</p>}
            {results.map((r) => (
              <div key={r.slug} className="flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
                <Badge variant="outline" className={`shrink-0 ${STATUS_STYLES[r.status]}`}>
                  {r.status}
                </Badge>
                <div className="min-w-0">
                  <p className="font-medium text-stone-800">{r.name}</p>
                  <p className="text-xs text-stone-500">{r.detail}</p>
                  {r.recipients && r.recipients.length > 0 && (
                    <p className="text-xs text-stone-400 truncate">Para: {r.recipients.join(", ")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
