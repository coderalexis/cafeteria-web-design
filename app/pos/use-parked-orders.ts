"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { serializeCart, type CartState } from "./cart"
import {
  PARKED_MAX,
  parkedStorageKey,
  parseParked,
  serializeParked,
  type ParkedOrder,
} from "./parked"

/**
 * Bandeja de pedidos en espera de ESTE dispositivo, por cafetería.
 * No habla con el servidor: mientras un pedido espera no es una venta.
 *
 * La lista viva se guarda en una ref además del estado, porque al intercambiar
 * pedidos se encadenan dos operaciones (guardar el actual y sacar el que se
 * retoma) dentro del mismo evento: leyendo el estado, la segunda vería la
 * lista previa a la primera y borraría lo recién guardado.
 */
export function useParkedOrders(businessId: string) {
  const key = parkedStorageKey(businessId)
  const [orders, setOrders] = useState<ParkedOrder[]>([])
  const ref = useRef<ParkedOrder[]>([])

  useEffect(() => {
    let inicial: ParkedOrder[] = []
    try {
      const raw = window.localStorage.getItem(key)
      inicial = raw ? parseParked(JSON.parse(raw)) : []
    } catch {
      inicial = []
    }
    ref.current = inicial
    setOrders(inicial)
  }, [key])

  const apply = useCallback(
    (next: ParkedOrder[]) => {
      ref.current = next
      setOrders(next)
      try {
        if (next.length === 0) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, JSON.stringify(serializeParked(next)))
      } catch {
        /* almacenamiento lleno: la bandeja sigue viva en memoria */
      }
    },
    [key],
  )

  /** Guarda el carrito actual. Devuelve false si la bandeja está llena. */
  const park = useCallback(
    (state: CartState, name: string): boolean => {
      if (ref.current.length >= PARKED_MAX) return false
      const nuevo: ParkedOrder = {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 40),
        savedAt: Date.now(),
        cart: serializeCart(state, Date.now()),
      }
      // El más reciente primero: es el que más probablemente se retoma.
      apply([nuevo, ...ref.current])
      return true
    },
    [apply],
  )

  const remove = useCallback((id: string) => apply(ref.current.filter((o) => o.id !== id)), [apply])

  return { orders, park, remove, full: orders.length >= PARKED_MAX }
}
