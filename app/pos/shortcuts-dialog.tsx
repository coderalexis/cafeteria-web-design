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

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-amber-700" />
            Atajos de teclado
          </DialogTitle>
          <DialogDescription>Los atajos con letras funcionan cuando no estás escribiendo en un campo.</DialogDescription>
        </DialogHeader>
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
