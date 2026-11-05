import "server-only"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { ENCABEZADO_RUTA, esDelPos } from "./ruta"

type Ruta = string | [string, "layout" | "page"]

/**
 * `revalidatePath`, salvo cuando la acción la llamó el POS.
 *
 * En Next 15, CUALQUIER `revalidatePath` dentro de una acción —sea cual sea la
 * ruta— hace que el servidor vuelva a armar la página desde la que se llamó y
 * la mande pegada a la respuesta («TODO: only revalidate if the path
 * matches», en el código de Next). Desde el POS eso era volver a armar y
 * descargar el POS entero en cada cobro, cancelación, movimiento de caja o
 * merma: una docena de consultas, el menú completo de regreso, y el
 * «Cobrado» esperando a que llegara todo. El POS no lo necesita: pone al día
 * lo suyo con lo que cada acción devuelve, y donde de verdad cambian los
 * datos de la página (abrir o cerrar caja, cancelar, fiados) ya pide su
 * propio `router.refresh()`.
 *
 * Desde el panel sí se revalida, como siempre: ahí la página se pone al día
 * así. Sin la marca de ruta (una petición que no pasó por el middleware), se
 * revalida: es lo seguro.
 */
export async function revalidarFueraDelPos(...rutas: Ruta[]): Promise<void> {
  let ruta: string | null = null
  try {
    ruta = (await headers()).get(ENCABEZADO_RUTA)
  } catch {
    ruta = null
  }
  if (esDelPos(ruta)) return
  for (const r of rutas) {
    if (Array.isArray(r)) revalidatePath(r[0], r[1])
    else revalidatePath(r)
  }
}
