import { unstable_rethrow } from "next/navigation"
import { toast } from "sonner"
import { mensajeDeFallo } from "./version"

/**
 * Envuelve lo que corre dentro de `startTransition(async …)` para que una
 * server action que RECHAZA (sin señal, deploy a medias) no tumbe la pantalla.
 *
 * React 19 trata el rechazo dentro de una transición como un error de render:
 * la pantalla entera se va al error boundary («Algo salió mal») y quien estaba
 * dando de alta un gasto pierde lo que escribió. Una acción que CONTESTA con
 * `{ error }` no pasa por aquí: eso lo sigue manejando cada pantalla; esto es
 * para cuando la llamada ni siquiera llegó.
 *
 *   startTransition(sinTumbar(async () => { … }))
 *
 * `redirect()` y `notFound()` siguen su camino (`unstable_rethrow`). Por
 * omisión se avisa con un toast; quien muestra los errores en su formulario
 * pasa su propio `alFallar`.
 */
export function sinTumbar(
  accion: () => Promise<void>,
  alFallar: (mensaje: string) => void = (m) => toast.error(m),
): () => Promise<void> {
  return async () => {
    try {
      await accion()
    } catch (e) {
      unstable_rethrow(e)
      alFallar(mensajeDeFallo(e))
    }
  }
}

/**
 * Lo mismo para una acción que se llama fuera de una transición (un
 * manejador `async` de un botón): si la llamada no llega, en vez de rechazar
 * devuelve `{ success: false, error }` con el mensaje de siempre, y la
 * pantalla lo trata como cualquier error que ya sabe mostrar.
 *
 *   const r = await intentar(() => closeCashSession({ … }))
 *
 * Sin esto, el rechazo dejaba el estado de «cargando» puesto para siempre:
 * prueba de caos del 2026-11-05, cancelar una venta sin señal dejó el diálogo
 * en «Cancelando…» con todos los botones apagados, «Volver» incluido. Lo mismo
 * pasaba con el corte, abrir caja, los movimientos de efectivo y más.
 */
export async function intentar<T>(accion: () => Promise<T>): Promise<T | { success: false; error: string }> {
  try {
    return await accion()
  } catch (e) {
    unstable_rethrow(e)
    return { success: false, error: mensajeDeFallo(e) }
  }
}
