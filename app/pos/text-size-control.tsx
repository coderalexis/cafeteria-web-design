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
  compact = false,
}: {
  size: TextSizeKey
  setSize: (next: TextSizeKey) => void
  compact?: boolean
}) {
  const actual = TEXT_SIZES.find((s) => s.key === size)
  const enMinimo = size === TEXT_SIZES[0].key
  const enMaximo = size === TEXT_SIZES[TEXT_SIZES.length - 1].key

  return (
    <div className={`flex items-center ${compact ? "gap-0.5" : "gap-1"}`}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setSize(stepTextSize(size, -1))}
        disabled={enMinimo}
        className="h-9 w-9"
        title="Letra más chica"
        aria-label="Letra más chica"
      >
        <AArrowDown className="h-4 w-4" />
      </Button>
      <span className="w-16 select-none text-center text-xs font-medium text-stone-500" aria-live="polite">
        {actual?.label ?? "Normal"}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setSize(stepTextSize(size, 1))}
        disabled={enMaximo}
        className="h-9 w-9"
        title="Letra más grande"
        aria-label="Letra más grande"
      >
        <AArrowUp className="h-4 w-4" />
      </Button>
    </div>
  )
}
