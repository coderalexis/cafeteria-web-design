"use client"

import type React from "react"
import { m } from "framer-motion"
import { ChevronRight, ChevronUp, Lock, PauseCircle, Plus, RotateCcw, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency, paymentLabel } from "@/lib/format"
import type { CartLine, PaymentMethod } from "./cart"
import type { OpenSession } from "./cash-session-dialog"
import type { ParkedOrder } from "./parked"
import type { useCartFeedback } from "./use-cart-feedback"

type Feedback = ReturnType<typeof useCartFeedback>

/**
 * La barra de abajo del POS en el celular: las cuentas abiertas junto al
 * pulgar, y el carrito con sus dos salidas (cuenta o cobrar). Salió de
 * pos-client.tsx tal cual, sin cambios de comportamiento.
 */
export function BarraMovil({
  barDip,
  barTargetRef,
  lastAdded,
  cuentasActivas,
  openAccount,
  chipsCuentas,
  setCartOpen,
  resumeParked,
  tocarCobro,
  cobrandoCuenta,
  confirmarCobro,
  openSession,
  setShowTray,
  lines,
  lastSale,
  ultimaTotal,
  repetirUltimaVenta,
  itemCount,
  total,
  due,
  saveToOpenAccount,
  setShowPark,
  practica,
  paymentMethod,
  canCharge,
  finalizeSale,
  isProcessing,
  setShowCashDialog,
}: {
  barDip: Feedback["barDip"]
  barTargetRef: Feedback["barTargetRef"]
  lastAdded: Feedback["lastAdded"]
  cuentasActivas: boolean
  openAccount: { name: string } | null
  chipsCuentas: Array<{ o: ParkedOrder; total: number; vieja: boolean }>
  setCartOpen: (abierto: boolean) => void
  resumeParked: (o: ParkedOrder, e?: React.MouseEvent<HTMLElement>) => unknown
  tocarCobro: (o: ParkedOrder) => void
  cobrandoCuenta: string | null
  confirmarCobro: string | null
  openSession: OpenSession | null
  setShowTray: (abierto: boolean) => void
  lines: CartLine[]
  lastSale: { folio: number } | null
  ultimaTotal: number | null
  repetirUltimaVenta: (e?: React.MouseEvent<HTMLElement>) => void
  itemCount: number
  total: number
  due: number
  saveToOpenAccount: () => Promise<unknown>
  setShowPark: (abierto: boolean) => void
  practica: boolean
  paymentMethod: PaymentMethod
  canCharge: boolean
  finalizeSale: () => unknown
  isProcessing: boolean
  setShowCashDialog: (abierto: boolean) => void
}) {
  return (
    <m.div
      animate={barDip}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {/* Cuentas abiertas junto al pulgar, siempre a la vista. Tocar el
          nombre la abre en el carrito; «Cobrar» la cobra directo en
          efectivo sin tocar el carrito, con un segundo toque de
          confirmación. En el encabezado se perdían al desplazarse. */}
      {cuentasActivas && (openAccount || chipsCuentas.length > 0) && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide" data-cuentas-barra>
          {openAccount && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
              title={`«${openAccount.name}» está en el carrito`}
            >
              <PauseCircle className="h-3.5 w-3.5" />
              {openAccount.name}
              <span className="opacity-80">· en el carrito</span>
            </button>
          )}
          {chipsCuentas.map(({ o, total, vieja }) => (
            <div
              key={o.id}
              className={`flex shrink-0 overflow-hidden rounded-full border ${vieja ? "border-amber-400" : "border-stone-200"}`}
            >
              <button
                type="button"
                onClick={(e) => void resumeParked(o, e)}
                className={`flex items-center gap-1.5 py-1.5 pl-3 pr-2 text-sm font-semibold ${vieja ? "bg-amber-50 text-amber-800" : "bg-white text-stone-700"}`}
                title={`Abrir «${o.name}» para agregarle`}
              >
                <PauseCircle className={`h-3.5 w-3.5 ${vieja ? "text-amber-600" : "text-amber-500"}`} />
                {o.name}
                <span className={vieja ? "text-amber-700" : "text-stone-400"}>{formatCurrency(total)}</span>
              </button>
              <button
                type="button"
                onClick={() => tocarCobro(o)}
                disabled={cobrandoCuenta !== null || !openSession}
                aria-label={`Cobrar «${o.name}» en efectivo`}
                title={openSession ? `Cobrar «${o.name}» en efectivo` : "Abre la caja para cobrar"}
                className={`border-l px-2.5 py-1.5 text-sm font-bold text-white disabled:opacity-40 ${
                  confirmarCobro === o.id ? "border-green-700 bg-green-700" : "border-green-600 bg-green-600"
                }`}
              >
                {cobrandoCuenta === o.id ? "…" : confirmarCobro === o.id ? `¿${formatCurrency(total)}? Sí` : "Cobrar"}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setShowTray(true)}
            className="shrink-0 rounded-full border border-stone-200 bg-white p-1.5 text-stone-400"
            aria-label="Ver todas las cuentas"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {lines.length === 0 ? (
        <div className="flex gap-2">
          <Button
            className="h-12 min-w-0 flex-1 rounded-xl text-base font-bold justify-between px-4 bg-stone-100 text-stone-500 hover:bg-stone-200"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Carrito vacío
            </span>
            <ChevronUp className="h-4 w-4 opacity-70" />
          </Button>
          {/* Después de una clase se venden cinco lattes iguales seguidos:
              la última venta, de vuelta al carrito en un toque. */}
          {lastSale && ultimaTotal !== null && (
            <Button
              variant="outline"
              className="h-12 shrink-0 gap-1.5 rounded-xl border-amber-300 px-3 text-base font-bold text-amber-800 hover:bg-amber-50"
              onClick={repetirUltimaVenta}
              title={`Repetir la última venta (#${lastSale.folio})`}
              data-otra-vez
            >
              <RotateCcw className="h-4 w-4" />
              Otra vez · {formatCurrency(ultimaTotal)}
            </Button>
          )}
        </div>
      ) : (
        /* Con artículos, la barra se parte: ver el carrito a la
           izquierda, Cobrar directo a la derecha. La venta común es "2
           cosas y ya" — abrir la hoja solo para tocar Cobrar era un
           viaje de más. Mismo finalizeSale y mismo color por método que
           el botón de la hoja: verde efectivo, violeta transferencia. */
        <div className="flex gap-2">
          <Button
            ref={barTargetRef}
            data-recorrido="carrito-barra"
            className="h-12 flex-1 min-w-0 rounded-xl border border-stone-200 bg-white text-base font-bold text-stone-800 hover:bg-stone-50 justify-between px-4"
            onClick={() => setCartOpen(true)}
          >
            {lastAdded ? (
              <span key={lastAdded.key} className="flex min-w-0 items-center gap-1.5 text-amber-700">
                <Plus className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{lastAdded.label}</span>
                <span className="shrink-0 text-sm">{formatCurrency(lastAdded.price)}</span>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <ShoppingBag className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {itemCount} artículo{itemCount === 1 ? "" : "s"} · {formatCurrency(total)}
                </span>
              </span>
            )}
            <ChevronUp className="h-4 w-4 shrink-0 opacity-70" />
          </Button>
          {/* La bifurcación real de una cafetería con mesas: tomado el
              pedido, o se cobra o se va a una cuenta. Las dos salidas al
              alcance del pulgar, en la misma ranura.

              Abrir la cuenta obligaba antes a abrir la hoja del carrito
              primero — dos toques para algo que pasa una vez por mesa.
              Cobrar sigue siendo el botón grande y a la derecha porque
              es, de lejos, lo más frecuente: degradarlo para acelerar lo
              ocasional saldría carísimo. */}
          {cuentasActivas && (
            <Button
              className="h-12 shrink-0 rounded-xl bg-amber-600 px-3 text-base font-bold text-white hover:bg-amber-700"
              onClick={() => (openAccount ? void saveToOpenAccount() : setShowPark(true))}
              title={
                openAccount
                  ? `Guardar esta ronda en «${openAccount.name}»`
                  : "Abrir una cuenta con esto para cobrarla al final"
              }
            >
              {openAccount ? "Guardar" : "Cuenta"}
            </Button>
          )}
          {openSession || practica ? (
            <Button
              className={`h-12 shrink-0 rounded-xl px-4 text-base font-bold text-white ${
                paymentMethod === "efectivo"
                  ? "bg-green-600 hover:bg-green-700"
                  : paymentMethod === "transferencia"
                  ? "bg-violet-600 hover:bg-violet-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
              disabled={!canCharge}
              onClick={finalizeSale}
              title={`Cobrar · ${paymentLabel(paymentMethod)}`}
              data-recorrido="cobrar"
            >
              {isProcessing ? "Procesando…" : `${practica ? "Práctica · " : ""}Cobrar ${formatCurrency(due)}`}
            </Button>
          ) : (
            <Button
              className="h-12 shrink-0 gap-1.5 rounded-xl bg-red-600 px-4 text-base font-bold text-white hover:bg-red-700"
              onClick={() => setShowCashDialog(true)}
            >
              <Lock className="h-4 w-4" />
              Abrir caja
            </Button>
          )}
        </div>
      )}
    </m.div>
  )
}
