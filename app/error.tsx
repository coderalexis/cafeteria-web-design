"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { reportClientError } from "@/app/actions/errors"
import { clasificarError, marcarRecargaPorVersion } from "@/lib/version"

/**
 * Error boundary raíz: si algo truena en el POS o el login, la pantalla no
 * queda en blanco a media jornada; se ofrece reintentar.
 *
 * Dos casos no son errores de la app y se tratan aparte (lib/version.ts):
 * la pestaña se quedó con un build viejo tras un deploy (se recarga sola una
 * vez, y se reporta como tal para que el operador sepa que fue eso), y el
 * aparato se quedó sin señal (se dice claro y no se reporta: no hay nada que
 * arreglar en el código).
 */
export default function RootError({
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
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6" data-recargando-version>
        <p className="text-sm text-stone-500">Hay una versión nueva. Recargando…</p>
      </div>
    )
  }

  const sinRed = tipo === "red"
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 shadow-sm p-8 text-center space-y-4">
        <div className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${sinRed ? "bg-amber-50" : "bg-red-50"}`}>
          {sinRed ? <WifiOff className="h-7 w-7 text-amber-600" /> : <AlertTriangle className="h-7 w-7 text-red-600" />}
        </div>
        <h1 className="text-xl font-bold text-stone-800">{sinRed ? "Sin conexión con el servidor" : "Algo salió mal"}</h1>
        <p className="text-sm text-stone-500">
          {sinRed
            ? "Revisa la señal o el wifi y vuelve a intentar. Tus ventas registradas están a salvo."
            : "Ocurrió un error inesperado. Tus ventas registradas están a salvo; intenta de nuevo o recarga la página."}
        </p>
        {error.digest && !sinRed && (
          <p className="text-[11px] text-stone-400 font-mono">Ref: {error.digest}</p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <Button onClick={reset} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recargar página
          </Button>
        </div>
      </div>
    </div>
  )
}
