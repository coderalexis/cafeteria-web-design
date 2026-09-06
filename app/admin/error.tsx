"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { reportClientError } from "@/app/actions/errors"
import { clasificarError, marcarRecargaPorVersion } from "@/lib/version"

/**
 * Error boundary del panel admin: conserva la barra lateral (layout).
 *
 * Igual que el raíz: un build viejo tras un deploy se recarga solo una vez
 * (y se reporta como tal), y quedarse sin señal se dice claro sin reportarse
 * como error de la app. Ver lib/version.ts.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const tipo = clasificarError(error.message)
  const [recargando, setRecargando] = useState(false)

  useEffect(() => {
    console.error(error)
    const mensaje = error.message || String(error)
    const reportar = (m: string) =>
      reportClientError({
        route: typeof window !== "undefined" ? window.location.pathname : "?",
        message: m,
        digest: error.digest,
        stack: error.stack?.slice(0, 4000),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : undefined,
      })
    const tipo = clasificarError(mensaje)
    if (tipo === "version" && marcarRecargaPorVersion()) {
      setRecargando(true)
      // Primero el reporte, luego la recarga: una recarga cancela lo que esté
      // en vuelo, y este aviso es justo lo que el operador necesita ver. Con
      // tope, para no dejar la pantalla colgada si el reporte no contesta.
      let recargado = false
      const recargar = () => {
        if (recargado) return
        recargado = true
        window.location.reload()
      }
      void reportar(`Versión vieja tras una actualización (se recargó sola): ${mensaje}`).then(recargar, recargar)
      const t = window.setTimeout(recargar, 2500)
      return () => window.clearTimeout(t)
    }
    if (tipo === "red") return
    // Que alguien más se entere, no solo la consola de este aparato: el
    // reporte se guarda y llega al operador en el resumen de la mañana.
    void reportar(mensaje)
  }, [error])

  if (recargando) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center" data-recargando-version>
        <p className="text-sm text-stone-500">Hay una versión nueva. Recargando…</p>
      </div>
    )
  }

  const sinRed = tipo === "red"
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className={`bg-white rounded-2xl border p-8 text-center space-y-4 ${sinRed ? "border-amber-200" : "border-red-200"}`}>
        <div className={`mx-auto h-12 w-12 rounded-full flex items-center justify-center ${sinRed ? "bg-amber-50" : "bg-red-50"}`}>
          {sinRed ? <WifiOff className="h-6 w-6 text-amber-600" /> : <AlertTriangle className="h-6 w-6 text-red-600" />}
        </div>
        <h2 className="text-lg font-bold text-stone-800">
          {sinRed ? "Sin conexión con el servidor" : "No se pudo cargar esta sección"}
        </h2>
        <p className="text-sm text-stone-500">
          {sinRed
            ? "Revisa la señal o el wifi y vuelve a intentar."
            : "Ocurrió un error al cargar los datos. Puedes reintentar o navegar a otra sección."}
        </p>
        {error.digest && !sinRed && (
          <p className="text-[11px] text-stone-400 font-mono">Ref: {error.digest}</p>
        )}
        <Button onClick={reset} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </div>
    </div>
  )
}
