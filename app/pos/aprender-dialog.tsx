"use client"

import Link from "next/link"
import { BookOpen, Check, Footprints, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * «Aprender»: el lugar con nombre donde viven los recorridos y la práctica.
 *
 * El recorrido de la primera venta no arranca solo ni se apaga por haber
 * vendido: se repite las veces que haga falta (entra alguien nuevo a la caja,
 * o uno quiere volver a verlo). Tenerlo en un solo sitio, junto a la
 * práctica y a las lecturas cortas de la guía, evita que un cajero nuevo
 * tenga que saber que existe. Lo «hecho» se recuerda por aparato, como
 * señal, nunca como candado.
 */
export function AprenderDialog({
  open,
  onOpenChange,
  recorridoHecho,
  practica,
  parkedEnabled,
  loyaltyEnabled,
  onRecorrido,
  onPracticar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recorridoHecho: boolean
  practica: boolean
  parkedEnabled: boolean
  loyaltyEnabled: boolean
  onRecorrido: () => void
  onPracticar: () => void
}) {
  const lecturas = [
    { id: "gestos", titulo: "La línea del carrito: toca, desliza, mantén" },
    { id: "corte", titulo: "Cerrar el turno contando billetes" },
    ...(parkedEnabled ? [{ id: "espera", titulo: "Cuentas abiertas" }] : []),
    ...(loyaltyEnabled ? [{ id: "sellos", titulo: "Tarjeta de sellos" }] : []),
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-violet-700" />
            Aprender
          </DialogTitle>
          <DialogDescription>
            Recorridos y práctica sobre el POS real. Se pueden repetir las veces que quieras; nada se registra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3" data-aprender="recorrido">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                  <Footprints className="h-4 w-4 shrink-0 text-violet-700" />
                  Tu primera venta
                  {recorridoHecho && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                      <Check className="h-3 w-3" /> Hecho
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-stone-600">
                  Cinco pasos sobre la pantalla real: toca un producto, mira tu línea, di cómo paga, cobra. Un minuto.
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0 bg-violet-700 text-white hover:bg-violet-800"
                onClick={() => {
                  onOpenChange(false)
                  onRecorrido()
                }}
              >
                {recorridoHecho ? "Otra vez" : "Empezar"}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3" data-aprender="practica">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
                  <GraduationCap className="h-4 w-4 shrink-0 text-stone-500" />
                  Practicar sin registrar
                </p>
                <p className="mt-0.5 text-xs text-stone-600">
                  Cobra lo que quieras, con o sin caja abierta. Al salir, el carrito se vacía.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  onOpenChange(false)
                  onPracticar()
                }}
              >
                {practica ? "Salir de práctica" : "Practicar"}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3" data-aprender="lecturas">
            <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
              <BookOpen className="h-4 w-4 shrink-0 text-stone-500" />
              Lecturas de un minuto
            </p>
            <ul className="mt-1.5 space-y-1">
              {lecturas.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/ayuda#${l.id}`}
                    target="_blank"
                    className="text-sm text-amber-800 underline-offset-2 hover:underline"
                  >
                    {l.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
