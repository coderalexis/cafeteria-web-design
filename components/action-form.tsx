"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ReactNode } from "react"

type FormAction = (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>

/** Cuánto esperar una respuesta antes de admitir que no sabemos qué pasó. */
const ESPERA_MAX_MS = 15_000

/**
 * Reemplazo directo de `<form action={serverAction}>` que sí muestra el
 * resultado. Nació porque el `{ error }` de las actions se descartaba y un
 * fallo se veía igual que un éxito; hoy cubre los TRES silencios que se leen
 * igual desde el otro lado de la pantalla —«no pasó nada»— y que invitan a
 * volver a darle hasta crear duplicados:
 *
 * 1. **Falló y no se dijo.** El `{ error }` se descartaba. → toast de error.
 * 2. **Guardó y no se notó.** La action escribía en la base pero la pantalla
 *    no se movía: el formulario la llama desde el cliente, así que el
 *    `revalidatePath` del servidor no re-renderiza solo. Una dueña real creó
 *    tres variantes idénticas en quince segundos por esto. → `router.refresh()`
 *    siempre, más confirmación opcional.
 * 3. **Se cayó el internet a media guardada.** El peor, y el que menos se ve
 *    venir: la promesa de la action NO se rechaza, se queda COLGADA para
 *    siempre (medido: ni a los 25 s). Por eso no basta un try/catch —hay que
 *    mirar la conexión antes y ponerle un plazo después.
 *
 * Lo que este componente NO hace, a propósito: reintentar solo. Una venta se
 * puede reenviar sin miedo porque `create_ticket` es idempotente por
 * `client_ref`; un cambio del menú modifica algo compartido, y repetirlo a
 * ciegas es exactamente como nacen los duplicados. Por eso, cuando no se sabe
 * si guardó, el mensaje pide RECARGAR antes de reintentar.
 */
export function ActionForm({
  action,
  className,
  children,
  /** Confirmación al guardar. Para formularios de «agregar», donde el
   *  silencio se lee como error. */
  successMessage,
  /** Vaciar los campos al guardar: lo correcto en un «agregar otro». */
  resetOnSuccess = false,
  /** Se llama SOLO cuando el servidor confirmó que guardó. Para cerrar la hoja
   *  de edición y cosas así; nunca se dispara si hubo error o si no llegó
   *  respuesta, que es justo cuando cerrar sería mentirle al usuario. */
  onSuccess,
}: {
  action: FormAction
  className?: string
  children: ReactNode
  successMessage?: string
  resetOnSuccess?: boolean
  onSuccess?: () => void
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className={className}
      action={async (formData: FormData) => {
        // Sin señal ni lo intentamos: así el mensaje puede ser rotundo («no se
        // guardó») en vez de ambiguo, y lo escrito se queda intacto para
        // reintentar de un toque cuando vuelva.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          toast.error("Sin internet: no se guardó. Lo que escribiste sigue aquí; inténtalo cuando vuelva la señal.")
          return
        }

        const agotado = Symbol("agotado")
        let result: Awaited<ReturnType<FormAction>> | typeof agotado
        try {
          result = await Promise.race([
            action(formData),
            new Promise<typeof agotado>((r) => setTimeout(() => r(agotado), ESPERA_MAX_MS)),
          ])
        } catch {
          toast.error("No se guardó: falló la conexión. Lo que escribiste sigue aquí; vuelve a intentar.")
          return
        }

        if (result === agotado) {
          // Se mandó, pero no llegó respuesta. Puede haber guardado o no, y
          // decir cualquiera de las dos sería mentir: se pide recargar, que
          // es lo único que responde la pregunta sin arriesgar un duplicado.
          toast.error("No pudimos confirmar si se guardó. Recarga la página para ver cómo quedó antes de intentar otra vez.")
          return
        }

        if (result?.error) {
          toast.error(result.error)
          return
        }
        if (successMessage) toast.success(successMessage)
        if (resetOnSuccess) formRef.current?.reset()
        onSuccess?.()
        router.refresh()
      }}
    >
      {children}
    </form>
  )
}
