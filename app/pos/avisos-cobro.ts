"use client"

import { toast } from "sonner"
import { marcarRecargaPorVersion } from "@/lib/version"

/**
 * Lo que se le dice a quien cobró sin señal. Si el aparato no pudo guardar la
 * venta (modo privado, sin espacio), NO es «guardada»: vive solo en memoria y
 * cerrar la app se la llevaría. Antes decía «guardada» igual.
 */
export function avisarEncolada(encolada: { provisional: string; guardada: boolean }, id?: string | number) {
  if (encolada.guardada) {
    toast.success(`Venta guardada sin conexión · ${encolada.provisional}. Se subirá sola al volver el internet.`, { id })
  } else {
    toast.warning(
      `Venta ${encolada.provisional} cobrada SIN conexión y este aparato no pudo guardarla: no cierres ni recargues la app hasta que suba.`,
      { id, duration: 20000 },
    )
  }
}


/**
 * Un cobro que no llegó porque hay un deploy más nuevo que esta pestaña:
 * la venta NO se registró (el servidor no reconoció la acción), el carrito
 * sigue guardado con su clientRef, y lo que toca es recargar y volver a
 * cobrar con el código nuevo. Ver lib/version.ts.
 */
export function avisarVersionNueva(id?: string | number) {
  const recarga = marcarRecargaPorVersion()
  toast.info(
    recarga
      ? "Hay una versión nueva del sistema. Se recarga y vuelves a cobrar."
      : "Hay una versión nueva del sistema. Recarga la página y vuelve a cobrar.",
    { id, duration: 6000 },
  )
  if (recarga) window.setTimeout(() => window.location.reload(), 900)
}

