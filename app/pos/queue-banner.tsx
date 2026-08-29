"use client"

import { AlertTriangle, CloudUpload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import type { QueueState } from "./queue"

/**
 * Aviso de ventas por subir. NO se puede descartar a propósito: una cola
 * olvidada es dinero cobrado que no está registrado en ningún lado.
 */
export function QueueBanner({
  state,
  pendientes,
  porRevisar,
  subiendo,
  onSubir,
  onRevisar,
  onCerrarDiferencias,
}: {
  state: QueueState
  pendientes: number
  porRevisar: number
  subiendo: { hecho: number; total: number } | null
  onSubir: () => void
  onRevisar: () => void
  onCerrarDiferencias: () => void
}) {
  const hayDiffs = state.diffs.length > 0
  if (pendientes === 0 && porRevisar === 0 && !hayDiffs) return null

  return (
    <div className="shrink-0 space-y-px">
      {(pendientes > 0 || subiendo) && (
        <div className="flex items-center gap-2 bg-amber-500 px-3 py-1.5 text-sm font-medium text-amber-950">
          {subiendo ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="min-w-0 truncate">
                Subiendo {subiendo.hecho + 1} de {subiendo.total}…
              </span>
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                {pendientes} venta{pendientes === 1 ? "" : "s"} sin subir
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 shrink-0 border-amber-700/40 bg-white/80 text-xs font-semibold text-amber-900 hover:bg-white"
                onClick={onSubir}
              >
                Reintentar
              </Button>
            </>
          )}
        </div>
      )}

      {porRevisar > 0 && (
        <button
          type="button"
          onClick={onRevisar}
          className="flex w-full items-center gap-2 bg-red-600 px-3 py-1.5 text-left text-sm font-medium text-white"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            {porRevisar} venta{porRevisar === 1 ? "" : "s"} necesita{porRevisar === 1 ? "" : "n"} tu revisión
          </span>
          <span className="ml-auto shrink-0 text-xs underline underline-offset-2">Ver</span>
        </button>
      )}

      {hayDiffs && (
        <div className="bg-stone-800 px-3 py-1.5 text-xs text-stone-100">
          <div className="flex items-start gap-2">
            <span className="min-w-0">
              {state.diffs.map((d) => (
                <span key={d.provisional} className="block truncate">
                  {d.provisional} (folio {d.folio}): cobraste {formatCurrency(d.charged)} y se registró{" "}
                  {formatCurrency(d.registered)} — cambió un precio.
                </span>
              ))}
            </span>
            <button
              type="button"
              onClick={onCerrarDiferencias}
              className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] underline underline-offset-2 hover:bg-white/10"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
