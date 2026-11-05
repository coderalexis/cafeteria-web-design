"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { createTicket } from "@/app/actions/sales"
import type { CambioExistencia } from "@/lib/existencias"
import { formatCurrency } from "@/lib/format"
import { esErrorDeVersion } from "@/lib/version"
import { avisarEncolada, avisarVersionNueva } from "./avisos-cobro"
import { cartSubtotal, linesToItems, rehydrateCart, type Product } from "./cart"
import type { OpenSession } from "./cash-session-dialog"
import { ventaCompletada, ventaParaLaCola } from "./cobro"
import { PARKED_MAX_AGE_MS, type ParkedOrder } from "./parked"
import { vibra } from "./pos-utils"
import { QUEUE_MAX } from "./queue"
import type { CompletedSale } from "./receipt-view"
import type { useOfflineQueue } from "./use-offline-queue"
import type { useParkedOrders } from "./use-parked-orders"

/**
 * «Cobrar» una cuenta directo desde la barra del POS, sin pasar por el
 * carrito. Vivía dentro de pos-client.tsx; salió tal cual, con su estado.
 */
export function useCobrarCuenta({
  products,
  openSession,
  businessId,
  parked,
  openAccount,
  setOpenAccount,
  clearCart,
  cola,
  aplicarExistencias,
  setCompletedSale,
  setTotalSales,
}: {
  products: Product[]
  openSession: OpenSession | null
  businessId: string
  parked: ReturnType<typeof useParkedOrders>
  openAccount: { id: string } | null
  setOpenAccount: (cuenta: null) => void
  clearCart: () => void
  cola: ReturnType<typeof useOfflineQueue>
  aplicarExistencias: (cambios: CambioExistencia[]) => void
  setCompletedSale: (venta: CompletedSale | null) => void
  setTotalSales: (cambio: (prev: number) => number) => void
}) {
  // ── Cobrar una cuenta directo desde la barra ──
  // Un socio vuelve a pagar mientras se está tomando otro pedido: la cuenta
  // se cobra sin tocar el carrito. En efectivo, sin propina ni descuento; si
  // hace falta algo de eso, se abre la cuenta y se cobra como siempre. Dos
  // toques en el mismo lugar («Cobrar» → «¿$85? Sí») para que un roce no
  // cobre nada.
  const [cobrandoCuenta, setCobrandoCuenta] = useState<string | null>(null)
  const [confirmarCobro, setConfirmarCobro] = useState<string | null>(null)
  const cobrarCuenta = useCallback(
    async (o: ParkedOrder) => {
      if (cobrandoCuenta || !openSession) return
      const estado = rehydrateCart(o.cart, products, Date.now(), PARKED_MAX_AGE_MS)
      if (!estado || estado.lines.length === 0) {
        toast.error("Esta cuenta no se puede cobrar: sus productos ya no están en el menú. Reactívalos en Menú → Productos.", {
          duration: 10000,
        })
        return
      }
      if (o.cart.lines.length > estado.lines.length) {
        // Cobrar de menos sin decirlo sería peor que no cobrar: que la abra y lo vea.
        toast.error("Algún artículo de esta cuenta ya no está en el menú. Ábrela para revisarla antes de cobrar.")
        return
      }
      setCobrandoCuenta(o.id)
      const clientRef = crypto.randomUUID()
      const items = linesToItems(estado.lines)
      const notas = estado.ticketNotes.trim() || undefined
      try {
        const result = await createTicket({
          clientRef,
          expectedBusinessId: businessId,
          paymentMethod: "efectivo",
          notes: notas,
          items,
        })
        if (!result.success) {
          toast.error(result.error || "Error al registrar la venta")
          return
        }
        aplicarExistencias(result.stock)
        parked.remove(o.id)
        if (openAccount?.id === o.id) {
          // También estaba en el carrito: ya se cobró, no hay ronda que guardar.
          setOpenAccount(null)
          clearCart()
        }
        const venta = ventaCompletada(result, { lines: estado.lines, paymentMethod: "efectivo", notes: notas })
        toast.success(`Venta #${result.folio} · ${formatCurrency(result.total)} · Efectivo · «${o.name}»`, {
          duration: 5000,
          action: { label: "Ver ticket", onClick: () => setCompletedSale(venta) },
        })
        setTotalSales((prev) => prev + result.total)
        vibra(30)
      } catch (e) {
        if (esErrorDeVersion(e)) {
          // Deploy nuevo: la cuenta sigue abierta y se cobra tras recargar.
          avisarVersionNueva()
          return
        }
        // Sin señal: a la cola, como cualquier venta. La cuenta se cierra
        // igual porque la venta ya está capturada.
        const encolada = cola.encolar(
          ventaParaLaCola({
            clientRef,
            items,
            paymentMethod: "efectivo",
            notes: notas,
            chargedTotal: cartSubtotal(estado.lines),
            lines: estado.lines,
          }),
        )
        if (encolada) {
          parked.remove(o.id)
          avisarEncolada(encolada)
          vibra(30)
        } else {
          toast.error(`Ya hay ${QUEUE_MAX} ventas esperando internet. Recupera la señal antes de seguir cobrando.`)
        }
      } finally {
        setCobrandoCuenta(null)
        setConfirmarCobro(null)
      }
    },
    [cobrandoCuenta, openSession, products, businessId, parked, openAccount, setOpenAccount, clearCart, cola, aplicarExistencias, setCompletedSale, setTotalSales],
  )
  const tocarCobro = useCallback(
    (o: ParkedOrder) => {
      if (confirmarCobro === o.id) {
        void cobrarCuenta(o)
        return
      }
      setConfirmarCobro(o.id)
      window.setTimeout(() => setConfirmarCobro((c) => (c === o.id ? null : c)), 4000)
    },
    [confirmarCobro, cobrarCuenta],
  )

  return { cobrandoCuenta, confirmarCobro, tocarCobro }
}
