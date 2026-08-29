"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createTicket } from "@/app/actions/sales"
import {
  canEnqueue,
  clearDiffs,
  dropSale,
  enqueue,
  isNetworkError,
  markNeedsReview,
  markRetry,
  markUploaded,
  pendingCount,
  queueKey,
  readQueue,
  reviewCount,
  type QueuedSale,
  type QueueState,
} from "./queue"

/**
 * Cola de ventas sin internet: guarda, sube en orden y avisa.
 *
 * Un solo trabajador, no uno por venta: subir en paralelo desordenaría los
 * folios y multiplicaría los reintentos justo cuando la red está mal. El
 * candado `subiendoRef` garantiza que solo haya un ciclo vivo.
 */
export function useOfflineQueue(businessId: string) {
  const [state, setState] = useState<QueueState>(() => readQueue(null))
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number } | null>(null)
  const [hidratada, setHidratada] = useState(false)
  const subiendoRef = useRef(false)
  const estadoRef = useRef(state)
  estadoRef.current = state

  const key = queueKey(businessId)

  const guardar = useCallback(
    (next: QueueState) => {
      estadoRef.current = next
      setState(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* sin espacio: la cola vive en memoria hasta recargar */
      }
    },
    [key],
  )

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      const q = readQueue(raw ? JSON.parse(raw) : null)
      estadoRef.current = q
      setState(q)
    } catch {
      /* ilegible: se arranca con cola vacía */
    }
    setHidratada(true)
  }, [key])

  /** Guarda una venta que no se pudo cobrar en línea. */
  const encolar = useCallback(
    (sale: Omit<QueuedSale, "provisional" | "status" | "attempts">): string | null => {
      const actual = estadoRef.current
      if (!canEnqueue(actual)) return null
      const next = enqueue(actual, sale)
      guardar(next)
      return next.sales[next.sales.length - 1].provisional
    },
    [guardar],
  )

  /**
   * Sube todo lo pendiente, en orden de captura. Cada venta lleva su
   * `clientRef` original: si una ya había entrado y solo se perdió la
   * respuesta, el servidor devuelve el mismo folio en vez de duplicarla.
   */
  const subir = useCallback(async () => {
    if (subiendoRef.current) return
    const pendientes = estadoRef.current.sales.filter((s) => s.status === "pendiente")
    if (pendientes.length === 0) return
    subiendoRef.current = true
    setSubiendo({ hecho: 0, total: pendientes.length })

    let hecho = 0
    for (const venta of pendientes) {
      try {
        const r = await createTicket({
          clientRef: venta.clientRef,
          expectedBusinessId: businessId,
          paymentMethod: venta.paymentMethod,
          notes: venta.notes,
          cashReceived: venta.cashReceived,
          tip: venta.tip,
          discount: venta.discount,
          takeout: venta.takeout,
          loyaltyCustomerId: venta.loyaltyCustomerId,
          capturedAt: new Date(venta.capturedAt).toISOString(),
          items: venta.items,
        })
        if (r.success) {
          guardar(markUploaded(estadoRef.current, venta.clientRef, r.folio, r.total))
        } else if (isNetworkError(r.error)) {
          // Volvió a caerse: se deja pendiente y se corta el ciclo — insistir
          // con las demás sin red solo gasta batería.
          guardar(markRetry(estadoRef.current, venta.clientRef))
          break
        } else {
          guardar(markNeedsReview(estadoRef.current, venta.clientRef, r.error))
        }
      } catch (e) {
        guardar(markRetry(estadoRef.current, venta.clientRef))
        void e
        break
      }
      hecho += 1
      setSubiendo({ hecho, total: pendientes.length })
    }

    subiendoRef.current = false
    setSubiendo(null)
  }, [businessId, guardar])

  // Al volver la conexión, y un intento al abrir por si quedó cola de antes.
  useEffect(() => {
    if (!hidratada) return
    const alVolver = () => {
      void subir()
    }
    window.addEventListener("online", alVolver)
    if (navigator.onLine) void subir()
    return () => window.removeEventListener("online", alVolver)
  }, [hidratada, subir])

  return {
    state,
    pendientes: pendingCount(state),
    porRevisar: reviewCount(state),
    subiendo,
    encolar,
    subir,
    quitar: useCallback((ref: string) => guardar(dropSale(estadoRef.current, ref)), [guardar]),
    limpiarDiferencias: useCallback(() => guardar(clearDiffs(estadoRef.current)), [guardar]),
  }
}
