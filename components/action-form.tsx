"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ReactNode } from "react"

type FormAction = (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>

/**
 * Reemplazo directo de `<form action={serverAction}>` que sí muestra el
 * resultado: sin esto, el `{ error }` que devuelven las actions se descarta
 * y un fallo se ve igual que un éxito.
 *
 * Y AL REVÉS, que costó caro: un éxito también se veía igual que un fallo.
 * La action guardaba en la base, pero la pantalla no se movía —el formulario
 * llama a la action desde el cliente, así que el `revalidatePath` del
 * servidor no re-renderiza sola— y quien lo usaba concluía «no funcionó» y
 * volvía a darle. Una dueña real creó tres variantes idénticas en quince
 * segundos así. Por eso ahora todo éxito hace `router.refresh()`: la
 * pantalla siempre acaba enseñando lo que de verdad quedó guardado.
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
}: {
  action: FormAction
  className?: string
  children: ReactNode
  successMessage?: string
  resetOnSuccess?: boolean
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className={className}
      action={async (formData: FormData) => {
        const result = await action(formData)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        if (successMessage) toast.success(successMessage)
        if (resetOnSuccess) formRef.current?.reset()
        router.refresh()
      }}
    >
      {children}
    </form>
  )
}
