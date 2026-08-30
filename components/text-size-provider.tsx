"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  DEFAULT_TEXT_SIZE,
  readTextSize,
  storeTextSize,
  textSizePx,
  type TextSizeKey,
} from "@/lib/text-size"

/**
 * Tamaño de letra del panel, compartido por todo el árbol.
 *
 * Es un proveedor y no un hook suelto porque el control aparece DOS veces —en
 * el menú de escritorio y en el del teléfono— y las dos tienen que mover la
 * misma preferencia. Con un hook por copia, cada una llevaría su propio estado
 * y la del teléfono, que se monta y desmonta con el cajón lateral, restauraría
 * el tamaño al cerrarse.
 *
 * Comparte la preferencia con el POS a propósito (misma llave de
 * almacenamiento): quien la ajusta lo hace por sus ojos y su pantalla, no por
 * la sección en la que está. La llave conserva el nombre viejo para no perder
 * la preferencia de quien ya la eligió en el POS.
 */

interface TextSizeContextValue {
  size: TextSizeKey
  setSize: (next: TextSizeKey) => void
}

const Ctx = createContext<TextSizeContextValue | null>(null)

export function TextSizeProvider({ children }: { children: ReactNode }) {
  const [size, setSizeState] = useState<TextSizeKey>(DEFAULT_TEXT_SIZE)

  // Después de montar: en el servidor no hay `localStorage`, y leerlo durante
  // el render daría un HTML distinto al del cliente.
  useEffect(() => {
    setSizeState(readTextSize())
  }, [])

  useEffect(() => {
    const raiz = document.documentElement
    const previo = raiz.style.fontSize
    raiz.style.fontSize = `${textSizePx(size)}px`
    return () => {
      raiz.style.fontSize = previo
    }
  }, [size])

  const value = useMemo(
    () => ({
      size,
      setSize: (next: TextSizeKey) => {
        storeTextSize(next)
        setSizeState(next)
      },
    }),
    [size],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTextSize(): TextSizeContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useTextSize debe usarse dentro de <TextSizeProvider>.")
  return ctx
}
