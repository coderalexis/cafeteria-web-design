"use client"

import { GraduationCap, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TarjetaRecorrido } from "@/lib/recorrido-pos"

/**
 * La tarjeta de un paso del recorrido. Flota sobre los productos (arriba de
 * la barra en celular, abajo a la izquierda en escritorio) o va dentro del
 * carrito, donde está la acción de ese paso; quien decide es la máquina.
 * Violeta como el modo práctica: es el mismo «aquí nada se registra».
 */
export function RecorridoTarjeta({
  tarjeta,
  esMovil,
  onSiguiente,
  onCerrar,
  onVender,
  onOtraVez,
}: {
  tarjeta: TarjetaRecorrido
  esMovil: boolean
  onSiguiente: () => void
  onCerrar: () => void
  /** Al terminar: salir de práctica y quedarse en el POS listo para vender. */
  onVender: () => void
  onOtraVez: () => void
}) {
  const flotante = tarjeta.donde === "flotante"
  // z-60: por encima del velo de las hojas (z-50) para seguir leyéndose
  // mientras el producto pregunta por la leche.
  const posicion = flotante
    ? esMovil
      ? "fixed inset-x-3 bottom-[4.5rem] z-[60]"
      : "fixed bottom-4 left-4 z-[60] w-[22rem] max-w-[calc(100vw-2rem)]"
    : "mb-3"
  return (
    <div
      role="status"
      aria-live="polite"
      data-recorrido-paso={tarjeta.paso}
      className={`${posicion} rounded-xl border border-violet-300 bg-violet-50 p-3 text-sm text-stone-700 shadow-lg`}
    >
      <div className="flex items-start gap-2">
        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Paso {tarjeta.paso} de 5</p>
          <p className="text-base font-bold leading-tight text-stone-800">{tarjeta.titulo}</p>
          <p className="mt-1">{tarjeta.texto}</p>
          {(tarjeta.siguiente || tarjeta.paso === 5) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tarjeta.siguiente && (
                <Button size="sm" className="bg-violet-700 text-white hover:bg-violet-800" onClick={onSiguiente}>
                  Siguiente
                </Button>
              )}
              {tarjeta.paso === 5 && (
                <>
                  <Button size="sm" className="bg-violet-700 text-white hover:bg-violet-800" onClick={onVender}>
                    Vender de verdad
                  </Button>
                  <Button size="sm" variant="outline" onClick={onOtraVez}>
                    Otra vez
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Salir del recorrido"
          className="-mr-1 -mt-1 rounded-full p-1 text-stone-400 hover:bg-violet-100 hover:text-stone-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
