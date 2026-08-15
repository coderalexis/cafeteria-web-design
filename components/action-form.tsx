"use client"

import { toast } from "sonner"
import type { ReactNode } from "react"

type FormAction = (formData: FormData) => Promise<{ error?: string; success?: boolean } | void>

/**
 * Reemplazo directo de `<form action={serverAction}>` que sí muestra el
 * resultado: sin esto, el `{ error }` que devuelven las actions se descarta
 * y un fallo se ve igual que un éxito.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: FormAction
  className?: string
  children: ReactNode
}) {
  return (
    <form
      className={className}
      action={async (formData: FormData) => {
        const result = await action(formData)
        if (result?.error) {
          toast.error(result.error)
        }
      }}
    >
      {children}
    </form>
  )
}
