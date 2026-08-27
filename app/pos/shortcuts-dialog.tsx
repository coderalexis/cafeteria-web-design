"use client"

import Link from "next/link"
import { BookOpen, Keyboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { POS_SHORTCUTS } from "./shortcuts"
import { TextSizeControl } from "./text-size-control"
import type { TextSizeKey } from "./text-size"

export function ShortcutsDialog({
  open,
  onOpenChange,
  textSize,
  setTextSize,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  textSize: TextSizeKey
  setTextSize: (next: TextSizeKey) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-amber-700" />
            Pantalla y atajos
          </DialogTitle>
          <DialogDescription>
            Ajusta cómo se ve el punto de venta. Los atajos con letras funcionan cuando no estás escribiendo en un
            campo.
          </DialogDescription>
        </DialogHeader>
        {/* El tamaño de letra vive aquí además del encabezado: es donde alguien
            busca cuando no alcanza a leer, y en el encabezado no siempre cabe. */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-700">Tamaño de letra</p>
            <p className="text-xs text-stone-400">Solo en esta pantalla; se recuerda en este dispositivo.</p>
          </div>
          <TextSizeControl size={textSize} setSize={setTextSize} compact />
        </div>

        <div className="divide-y divide-stone-100 text-sm">
          {POS_SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-stone-700">{s.label}</p>
                {s.hint && <p className="text-xs text-stone-400">{s.hint}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-stone-300 bg-stone-50 px-1.5 font-mono text-xs font-semibold text-stone-700"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/ayuda" target="_blank">
            <BookOpen className="h-4 w-4" />
            Ver la guía completa
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
