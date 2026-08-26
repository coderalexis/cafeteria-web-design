"use client"

import { useEffect, useState } from "react"
import { CalendarClock, X } from "lucide-react"
import { trialState } from "@/lib/signup"

/**
 * Aviso del fin de la prueba. El último día es rojo y no se puede ignorar por
 * accidente: la idea es que a nadie le caiga el vencimiento con la caja
 * abierta y las ventas del día a medias.
 *
 * Se puede cerrar, pero solo por hoy: mañana vuelve, porque cada día que pasa
 * importa más.
 */
export function TrialBanner({ trialEndsAt }: { trialEndsAt: string | null }) {
  const [oculto, setOculto] = useState(true)
  const { state, daysLeft } = trialState(trialEndsAt)
  const hoy = new Date().toISOString().slice(0, 10)
  const clave = `trial-aviso:${hoy}`

  useEffect(() => {
    try {
      setOculto(window.localStorage.getItem(clave) === "1")
    } catch {
      setOculto(false)
    }
  }, [clave])

  if (oculto || (state !== "last-day" && state !== "ending-soon")) return null

  const ultimo = state === "last-day"

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-sm ${
        ultimo ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900"
      }`}
      role="status"
    >
      <CalendarClock className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {ultimo ? (
          <>
            <strong>Hoy es el último día de tu prueba.</strong> Cierra bien tu caja al terminar el turno para que no te
            queden ventas a medias. ¿Quieres seguir? Escríbenos a soporte@cafecitopos.com.
          </>
        ) : (
          <>
            Tu prueba termina en <strong>{daysLeft} días</strong>. Si quieres continuar, escríbenos a
            soporte@cafecitopos.com.
          </>
        )}
      </p>
      <button
        type="button"
        aria-label="Ocultar por hoy"
        onClick={() => {
          setOculto(true)
          try {
            window.localStorage.setItem(clave, "1")
          } catch {
            /* sin almacenamiento: se oculta solo en esta pantalla */
          }
        }}
        className={`shrink-0 rounded p-1 ${ultimo ? "hover:bg-red-500" : "hover:bg-amber-200"}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
