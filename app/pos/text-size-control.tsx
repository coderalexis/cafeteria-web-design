"use client"

import { AArrowDown, AArrowUp } from "lucide-react"
import { stepTextSize, TEXT_SIZES, type TextSizeKey } from "./text-size"
import { Button } from "@/components/ui/button"

/**
 * A− / A+ del tamaño de letra. Sin estado propio: lo lleva `usePosTextSize` en
 * el POS, que sigue montado aunque este control esté dentro de un menú cerrado.
 */
export function TextSizeControl({
  size,
  setSize,
  block = false,
}: {
  size: TextSizeKey
  setSize: (next: TextSizeKey) => void
  /** Ocupa todo el ancho disponible, con botones anchos de dedo. */
  block?: boolean
}) {
  const actual = TEXT_SIZES.find((s) => s.key === size)
  const enMinimo = size === TEXT_SIZES[0].key
  const enMaximo = size === TEXT_SIZES[TEXT_SIZES.length - 1].key

  return (
    <div className={`flex items-center gap-1 ${block ? "w-full" : ""}`}>
      <Button
        variant="outline"
        size={block ? "default" : "icon"}
        onClick={() => setSize(stepTextSize(size, -1))}
        disabled={enMinimo}
        className={block ? "flex-1" : "h-9 w-9"}
        title="Letra más chica"
        aria-label="Letra más chica"
      >
        <AArrowDown className="h-4 w-4" />
      </Button>
      <span
        className={`select-none text-center text-xs font-medium text-stone-500 ${block ? "flex-1" : "w-16"}`}
        aria-live="polite"
      >
        {actual?.label ?? "Normal"}
      </span>
      <Button
        variant="outline"
        size={block ? "default" : "icon"}
        onClick={() => setSize(stepTextSize(size, 1))}
        disabled={enMaximo}
        className={block ? "flex-1" : "h-9 w-9"}
        title="Letra más grande"
        aria-label="Letra más grande"
      >
        <AArrowUp className="h-4 w-4" />
      </Button>
    </div>
  )
}
