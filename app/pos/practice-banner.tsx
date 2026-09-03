"use client"

import { GraduationCap, X } from "lucide-react"

/**
 * Franja de «modo práctica».
 *
 * Existe para que nadie confunda una venta de práctica con una real: color
 * que no usa ninguna otra alerta del POS (violeta; rojo es la prueba vencida,
 * ámbar la caja de otro día) y «nada se registra» a la vista todo el tiempo.
 * Salir vacía el carrito: lo que se armó practicando no debe poder cobrarse
 * de verdad un toque después.
 */
export function PracticeBanner({ onExit }: { onExit: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 bg-violet-700 px-4 py-2 text-sm text-white">
      <GraduationCap className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>Modo práctica.</strong> Nada se registra: cobra las veces que quieras.
      </p>
      <button
        type="button"
        onClick={onExit}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25"
      >
        <X className="h-3.5 w-3.5" /> Salir
      </button>
    </div>
  )
}
