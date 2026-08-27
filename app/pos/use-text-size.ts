"use client"

import { useEffect, useState } from "react"
import {
  DEFAULT_TEXT_SIZE,
  readTextSize,
  storeTextSize,
  textSizePx,
  type TextSizeKey,
} from "./text-size"

/**
 * Aplica el tamaño de letra guardado mientras el POS está montado.
 *
 * Vive aquí y no dentro del control porque el control ahora está DENTRO del
 * menú: si el efecto viviera ahí, el tamaño elegido no se aplicaría hasta que
 * alguien abriera el menú, y al recargar volvería al normal.
 */
export function usePosTextSize(): { size: TextSizeKey; setSize: (next: TextSizeKey) => void } {
  const [size, setSizeState] = useState<TextSizeKey>(DEFAULT_TEXT_SIZE)

  // Después de montar: en el servidor no hay localStorage, y leerlo durante el
  // render daría un HTML distinto al del cliente.
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

  return {
    size,
    setSize: (next) => {
      storeTextSize(next)
      setSizeState(next)
    },
  }
}
