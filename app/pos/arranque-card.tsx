"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, GraduationCap, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const KEY = "pos-arranque-visto"

/**
 * Los dos pasos de una venta, la primera vez que alguien abre el POS en un
 * celular.
 *
 * Nadie lee una guía de treinta pantallas parado en un mostrador; esto cabe
 * en media pantalla y se va con un toque. Se recuerda POR APARATO
 * (localStorage): quien ya lo vio no lo vuelve a ver. Solo en celular: en
 * tablet y escritorio el carrito está a la vista y el flujo se explica solo.
 */
export function ArranqueCard({
  mostrar,
  tieneFavoritos,
  onPracticar,
  instalar,
}: {
  mostrar: boolean
  /** Ya hay fila «Más vendidos»: vale la pena señalarla. */
  tieneFavoritos: boolean
  onPracticar: () => void
  instalar: { puede: boolean; esIOS: boolean; instalar: () => void }
}) {
  // Hasta leer localStorage se asume visto: así no parpadea en quien ya lo cerró.
  const [visto, setVisto] = useState(true)
  useEffect(() => {
    try {
      setVisto(window.localStorage.getItem(KEY) === "1")
    } catch {
      setVisto(false)
    }
  }, [])
  if (!mostrar || visto) return null

  const cerrar = () => {
    try {
      window.localStorage.setItem(KEY, "1")
    } catch {
      /* sin almacenamiento: volverá a salir la próxima vez */
    }
    setVisto(true)
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-stone-700">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-bold text-stone-800">Vender aquí son dos toques</p>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 rounded-full p-1 text-stone-400 hover:bg-violet-100 hover:text-stone-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="mt-2 space-y-1">
        <li>
          <strong>1.</strong> Toca el producto.
        </li>
        <li>
          <strong>2.</strong> Toca <strong>Cobrar</strong>. Listo.
        </li>
      </ol>
      <p className="mt-2 text-xs text-stone-500">
        Si el producto tiene extras (leche, shots), se preguntan al tocarlo; también se cambian después desde la línea del
        carrito.
        {tieneFavoritos && " Arriba, en «Más vendidos», está lo de siempre a un toque."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="gap-1.5 bg-violet-700 text-white hover:bg-violet-800"
          onClick={() => {
            onPracticar()
            cerrar()
          }}
        >
          <GraduationCap className="h-4 w-4" /> Practicar sin registrar
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/ayuda" target="_blank">
            <BookOpen className="h-4 w-4" /> Ver la guía
          </Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={cerrar}>
          Entendido
        </Button>
      </div>
      {instalar.puede && (
        <button
          type="button"
          onClick={instalar.instalar}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-left text-xs text-stone-600 hover:border-violet-400"
        >
          <Smartphone className="h-4 w-4 shrink-0 text-violet-700" />
          <span>
            <strong>Ponlo en tu pantalla de inicio</strong> para abrirlo como app, sin navegador.
          </span>
        </button>
      )}
      {instalar.esIOS && (
        <p className="mt-3 flex items-start gap-2 text-xs text-stone-500">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
          <span>
            En iPhone: toca <strong>Compartir</strong> y luego <strong>Agregar a pantalla de inicio</strong> para
            abrirlo como app.
          </span>
        </p>
      )}
    </div>
  )
}
