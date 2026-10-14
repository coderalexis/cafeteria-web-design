"use client"

import { ArrowRightLeft, Check, Loader2, Mic, Minus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import type { Dictado } from "./use-dictado"

/**
 * La tarjeta del modo ayudante. Flota sobre la rejilla (escritorio) o bajo el
 * encabezado (celular) y NUNCA tapa el botón de cobrar. Dice qué oyó, qué
 * entró al carrito y qué falta: lo que falta se completa aquí mismo con un
 * toque, sin abrir la rejilla ni buscar el producto.
 */
export function DictadoPanel({ dictado, isMobile }: { dictado: Dictado; isMobile: boolean }) {
  const { estado, oyendo, oido, acciones, pendientes, noEncontrados, error, ofrecerRecarga } = dictado
  const activo = estado === "conectando" || estado === "escuchando"
  if (!activo && pendientes.length === 0 && noEncontrados.length === 0 && !error) return null

  return (
    <div
      className={`fixed z-40 flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-lg ${
        isMobile ? "inset-x-3 top-2" : "bottom-4 left-4 w-[22rem]"
      }`}
      data-dictado-panel
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {estado === "conectando" ? (
          <Loader2 className="h-4 w-4 animate-spin text-stone-500" />
        ) : activo ? (
          <span className={`h-2.5 w-2.5 rounded-full ${oyendo ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-emerald-300"}`} />
        ) : (
          <Mic className="h-4 w-4 text-stone-400" />
        )}
        <span className="flex-1 font-medium text-stone-700" data-dictado-estado>
          {estado === "conectando" ? "Conectando…" : activo ? (oyendo ? "Te oigo…" : "Dicta el pedido") : "Dictado apagado"}
        </span>
        {activo && (
          <Button size="sm" variant="outline" className="blanco-comodo h-8" onClick={dictado.detener}>
            Detener
          </Button>
        )}
      </div>

      {oido && <p className="truncate text-xs text-stone-500">Oí: «{oido}»</p>}

      {acciones.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-dictado-agregados>
          {acciones.map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-1.5 ${a.tipo === "agregado" ? "text-emerald-800" : a.tipo === "quitado" ? "text-red-700" : "text-sky-800"}`}
              data-dictado-accion={a.tipo}
            >
              {a.tipo === "agregado" ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : a.tipo === "quitado" ? (
                <Minus className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{a.texto}</span>
              {a.deshacer && (
                <button
                  type="button"
                  className="blanco-comodo shrink-0 rounded px-1.5 text-xs font-medium text-stone-600 underline-offset-2 hover:underline"
                  onClick={() => dictado.deshacer(a.id)}
                  data-dictado-deshacer
                >
                  Deshacer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendientes.map((p) => (
        <div key={p.id} className="rounded-lg bg-amber-50 p-2" data-dictado-pendiente>
          <div className="flex items-start gap-2">
            <p className="flex-1 font-medium text-amber-900">
              {p.cantidad > 1 ? `${p.cantidad} × ` : ""}
              {p.product.name}
              <span className="font-normal text-amber-800">
                {p.falta.tipo === "tamano" ? " — ¿tamaño?" : ` — falta «${p.falta.grupo.name}»`}
              </span>
            </p>
            <button
              type="button"
              className="blanco-comodo -m-1 p-1 text-amber-700 hover:text-amber-900"
              aria-label={`Quitar ${p.product.name} de pendientes`}
              onClick={() => dictado.descartarPendiente(p.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.falta.tipo === "tamano" ? (
              (p.product.sizes ?? []).map((s) => (
                <Button
                  key={s.variantId}
                  size="sm"
                  variant="outline"
                  className="blanco-comodo h-8 bg-white"
                  onClick={() => dictado.elegirTamano(p.id, s)}
                >
                  {s.label} <span className="ml-1 tabular-nums text-stone-500">{formatCurrency(s.price)}</span>
                </Button>
              ))
            ) : (
              <Button size="sm" variant="outline" className="blanco-comodo h-8 bg-white" onClick={() => dictado.abrirHoja(p.id)}>
                Elegir
              </Button>
            )}
          </div>
        </div>
      ))}

      {noEncontrados.map((n) => (
        <div key={n.id} className="flex items-start gap-2 rounded-lg bg-stone-100 px-2 py-1.5 text-stone-700" data-dictado-no-encontrado>
          <p className="flex-1">{n.texto}</p>
          <button
            type="button"
            className="blanco-comodo -m-1 p-1 text-stone-500 hover:text-stone-700"
            aria-label="Descartar aviso"
            onClick={() => dictado.descartarNoEncontrado(n.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {error && (
        <div className="flex flex-col gap-2 rounded-lg bg-red-50 p-2 text-red-700" role="alert">
          <div className="flex items-start gap-2">
            <p className="flex-1">{error}</p>
            <button
              type="button"
              className="blanco-comodo -m-1 p-1 text-red-500 hover:text-red-700"
              aria-label="Cerrar aviso"
              onClick={dictado.descartarError}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {ofrecerRecarga && (
            <Button size="sm" variant="outline" className="self-start bg-white" onClick={() => window.location.reload()}>
              Recargar la página
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
