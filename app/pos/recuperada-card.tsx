"use client"

import { AnimatePresence, m } from "framer-motion"
import { ArchiveRestore } from "lucide-react"
import { formatCurrency } from "@/lib/format"
import type { Recuperada } from "./parked"

/**
 * El anuncio de «volvió esta cuenta» en celular.
 *
 * En el teléfono el carrito vive en una hoja que se cierra al retomar, así
 * que todo lo que confirmaba la vuelta cabía en el texto de la barra de
 * abajo: dos segundos y medio en el elemento más chico de la pantalla. Se
 * veía, pero no decía QUÉ volvió, y comprobar que era la mesa correcta
 * obligaba a abrir la hoja.
 *
 * Esta tarjeta baja de arriba con el nombre, los primeros artículos y el
 * total. Dos reglas la mantienen fuera del camino, que en hora pico es lo
 * único que importa:
 *
 *   · `pointer-events-none`: no se puede tocar. Un dedo que caiga encima
 *     llega al producto que está debajo, así que no roba ni un toque ni
 *     obliga a cerrarla.
 *   · No empuja nada: va por encima (fixed), no dentro del flujo, así que
 *     ningún botón se mueve —y menos el de cobrar— mientras aparece.
 *
 * Se va sola a los 2.6 s; quien ya siguió tocando productos ni la registra.
 */
export function RecuperadaCard({ recuperada }: { recuperada: Recuperada | null }) {
  return (
    <AnimatePresence>
      {recuperada && (
        <m.div
          key={recuperada.key}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          role="status"
          data-recuperada-card
          // Fondo OPACO, no translúcido: encima va el encabezado del POS y con
          // un velo se leían las dos capas a la vez. El desenfoque tampoco
          // sirve de red —no todos los navegadores lo pintan— así que el
          // color tapa por sí solo.
          className="pointer-events-none fixed inset-x-2 z-50 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-4 py-3 shadow-xl"
          // La muesca del iPhone: la tarjeta se cuelga debajo de ella, nunca
          // detrás. En un teléfono sin muesca, el mínimo la separa del borde.
          style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600">
              <ArchiveRestore className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-emerald-900">
                «{recuperada.name}» volvió al carrito
              </p>
              {recuperada.detalle && (
                <p className="truncate text-sm text-emerald-800">{recuperada.detalle}</p>
              )}
              <p className="text-sm font-semibold text-emerald-700">
                {recuperada.articulos} artículo{recuperada.articulos === 1 ? "" : "s"} ·{" "}
                {formatCurrency(recuperada.total)}
              </p>
              {/* Cambiar de cuenta son dos cosas a la vez; la segunda va aquí
                  y no en otro aviso, que salía encima de este. */}
              {recuperada.guardada && (
                <p className="mt-1 truncate border-t border-emerald-200 pt-1 text-xs text-emerald-700">
                  «{recuperada.guardada}» quedó guardada
                </p>
              )}
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
