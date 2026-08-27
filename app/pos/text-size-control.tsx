"use client"

import { useEffect, useState } from "react"
import { AArrowDown, AArrowUp } from "lucide-react"
import {
  DEFAULT_TEXT_SIZE,
  readTextSize,
  stepTextSize,
  storeTextSize,
  TEXT_SIZES,
  textSizePx,
  type TextSizeKey,
} from "./text-size"
import { Button } from "@/components/ui/button"

/**
 * A− / A+ para el tamaño de letra del POS. Se aplica al documento entero
 * mientras el POS está montado y se restaura al salir, para no dejar el panel
 * de administración con el tamaño de la tablet del mostrador.
 */
export function TextSizeControl({ compact = false }: { compact?: boolean }) {
  const [size, setSize] = useState<TextSizeKey>(DEFAULT_TEXT_SIZE)

  // Se lee después de montar: en el servidor no hay localStorage, y leerlo
  // durante el render daría un HTML distinto al del cliente.
  useEffect(() => {
    setSize(readTextSize())
  }, [])

  useEffect(() => {
    const raiz = document.documentElement
    const previo = raiz.style.fontSize
    raiz.style.fontSize = `${textSizePx(size)}px`
    return () => {
      raiz.style.fontSize = previo
    }
  }, [size])

  function cambiar(direction: 1 | -1) {
    setSize((actual) => {
      const nuevo = stepTextSize(actual, direction)
      storeTextSize(nuevo)
      return nuevo
    })
  }

  const actual = TEXT_SIZES.find((s) => s.key === size)
  const enMinimo = size === TEXT_SIZES[0].key
  const enMaximo = size === TEXT_SIZES[TEXT_SIZES.length - 1].key

  return (
    <div className={`flex items-center ${compact ? "gap-0.5" : "gap-1"}`}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => cambiar(-1)}
        disabled={enMinimo}
        className={compact ? "h-9 w-9" : "bg-white/80 backdrop-blur"}
        title="Letra más chica"
        aria-label="Letra más chica"
      >
        <AArrowDown className="h-4 w-4" />
      </Button>
      <span
        className={`select-none text-center text-xs font-medium text-stone-500 ${compact ? "w-16" : "w-20"}`}
        aria-live="polite"
      >
        {actual?.label ?? "Normal"}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={() => cambiar(1)}
        disabled={enMaximo}
        className={compact ? "h-9 w-9" : "bg-white/80 backdrop-blur"}
        title="Letra más grande"
        aria-label="Letra más grande"
      >
        <AArrowUp className="h-4 w-4" />
      </Button>
    </div>
  )
}
