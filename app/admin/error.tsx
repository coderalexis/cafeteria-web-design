"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Error boundary del panel admin: conserva la barra lateral (layout). */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-stone-800">No se pudo cargar esta sección</h2>
        <p className="text-sm text-stone-500">
          Ocurrió un error al cargar los datos. Puedes reintentar o navegar a otra sección.
        </p>
        {error.digest && (
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
