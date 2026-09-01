"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { reportClientError } from "@/app/actions/errors"

/**
 * Error boundary raíz: si algo truena en el POS o el login, la pantalla no
 * queda en blanco a media jornada; se ofrece reintentar.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
    // Que alguien más se entere, no solo la consola de este aparato: el
    // reporte se guarda y llega al operador en el resumen de la mañana.
    void reportClientError({
      route: typeof window !== "undefined" ? window.location.pathname : "?",
      message: error.message || String(error),
      digest: error.digest,
      stack: error.stack?.slice(0, 4000),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : undefined,
    })
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 shadow-sm p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-stone-800">Algo salió mal</h1>
        <p className="text-sm text-stone-500">
          Ocurrió un error inesperado. Tus ventas registradas están a salvo; intenta de nuevo o
          recarga la página.
        </p>
        {error.digest && (
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
