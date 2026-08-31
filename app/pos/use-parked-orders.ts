"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { serializeCart, type CartState } from "./cart"
import { listParked, markOwed, parkOrder, removeParked, updateParked } from "@/app/actions/parked"
import { PARKED_MAX, type ParkedOrder } from "./parked"

/** Cada cuánto se vuelve a preguntar por la bandeja. */
const REFRESCO_MS = 10_000

/**
 * Cuentas abiertas de la CAFETERÍA, no del aparato.
 *
 * Antes vivía en `localStorage`. El razonamiento era correcto a medias —un
 * pedido en espera no es una venta, así que no puede ir en `tickets`— pero de
 * ahí no se seguía que no fuera a la base: le faltaba tabla propia. Guardado
 * en el navegador se perdía al borrar datos o en modo incógnito, y no se podía
 * tomar el pedido en el celular y cobrarlo en la tablet.
 *
 * Se consulta cada 10 s, más lento que la pantalla «Por preparar» (4 s) porque
 * aquí un pedido nuevo no urge: lo guarda quien está usando el POS, y quien lo
 * retoma es normalmente la misma persona.
 *
 * `ref` además del estado: al intercambiar pedidos se encadenan dos
 * operaciones (guardar el actual y sacar el que se retoma) dentro del mismo
 * evento, y leyendo el estado la segunda vería la lista previa a la primera.
 */
export function useParkedOrders(businessId: string) {
  const [orders, setOrders] = useState<ParkedOrder[]>([])
  /** Ya sabemos qué hay en el servidor (aunque sea nada). */
  const [listo, setListo] = useState(false)
  const ref = useRef<ParkedOrder[]>([])
  const cargando = useRef(false)

  const aplicar = useCallback((next: ParkedOrder[]) => {
    ref.current = next
    setOrders(next)
  }, [])

  const refrescar = useCallback(async () => {
    if (cargando.current) return
    cargando.current = true
    try {
      const r = await listParked()
      if (r.success) {
        // Más reciente primero: es el que más probablemente se retoma.
        aplicar(
          r.orders
            .map((o) => ({
              id: o.id,
              name: o.name,
              savedAt: o.savedAt,
              cart: o.cart as ParkedOrder["cart"],
              updatedAt: o.updatedAt,
              owedSince: o.owedSince,
              owedContact: o.owedContact,
            }))
            .reverse(),
        )
        setListo(true)
      }
    } catch {
      /* sin señal: la bandeja se queda con lo último que supo */
    } finally {
      cargando.current = false
    }
  }, [aplicar])

  /**
   * Rescate por única vez de los pedidos que quedaron en el navegador.
   *
   * Antes de esto la bandeja vivía en `localStorage`. Al pasar a la base, los
   * pedidos que alguien tuviera guardados en su aparato desaparecerían de un
   * día para otro — y perder la cuenta de una mesa por un cambio nuestro sería
   * exactamente la falla que este cambio venía a evitar. Así que en la primera
   * carga se suben y se borra la llave vieja.
   */
  useEffect(() => {
    const llaveVieja = `pos-parked:${businessId}`
    let crudo: string | null = null
    try {
      crudo = window.localStorage.getItem(llaveVieja)
    } catch {
      return
    }
    if (!crudo) return

    void (async () => {
      try {
        const guardados = (JSON.parse(crudo) as { orders?: unknown[] })?.orders
        if (Array.isArray(guardados)) {
          for (const o of guardados) {
            const p = o as { name?: string; cart?: unknown }
            if (!p?.cart) continue
            await parkOrder({ name: String(p.name ?? "").slice(0, 40), cart: p.cart })
          }
          if (guardados.length > 0) {
            toast.success(
              `Se recuperaron ${guardados.length} cuenta${guardados.length === 1 ? "" : "s"} abierta${guardados.length === 1 ? "" : "s"} de este aparato.`,
            )
          }
        }
      } catch {
        /* ilegible: no hay nada que rescatar */
      } finally {
        // Se quita pase lo que pase: si falló, reintentarlo cada carga
        // duplicaría los pedidos que sí subieron.
        try {
          window.localStorage.removeItem(llaveVieja)
        } catch {
          /* sin almacenamiento */
        }
        void refrescar()
      }
    })()
  }, [businessId, refrescar])

  useEffect(() => {
    void refrescar()
    const tic = setInterval(() => void refrescar(), REFRESCO_MS)
    const alVolver = () => void refrescar()
    window.addEventListener("focus", alVolver)
    window.addEventListener("online", alVolver)
    return () => {
      clearInterval(tic)
      window.removeEventListener("focus", alVolver)
      window.removeEventListener("online", alVolver)
    }
    // `businessId` para volver a cargar si se cambia de cafetería en otra pestaña.
  }, [refrescar, businessId])

  /**
   * Guarda el carrito actual. Devuelve false si la bandeja está llena.
   *
   * Se agrega a la lista al instante y luego se confirma con el servidor:
   * quien guarda un pedido ya soltó el carrito mentalmente, y esperar a la red
   * para verlo aparecer se siente roto. Si el servidor protesta, se quita y se
   * avisa —perder un pedido en silencio sería lo peor que podría pasar aquí—.
   */
  const park = useCallback(
    (state: CartState, name: string): boolean => {
      if (ref.current.length >= PARKED_MAX) return false

      const provisional: ParkedOrder = {
        id: `local-${crypto.randomUUID()}`,
        name: name.trim().slice(0, 40),
        savedAt: Date.now(),
        cart: serializeCart(state, Date.now()),
        updatedAt: "",
        owedSince: null,
        owedContact: null,
      }
      aplicar([provisional, ...ref.current])
      ;(async () => {
        const r = await parkOrder({ name: provisional.name, cart: provisional.cart })
        if (r?.success) {
          // Le ponemos el id de verdad: con el provisional, descartarla después
          // no borraría nada en el servidor y la cuenta reaparecería sola.
          aplicar(
            ref.current.map((o) =>
              o.id === provisional.id ? { ...o, id: r.id, updatedAt: r.updatedAt } : o,
            ),
          )
          return
        }
        aplicar(ref.current.filter((o) => o.id !== provisional.id))
        toast.error(r?.error ?? "No se pudo guardar la cuenta. Vuelve a intentar.")
      })()
      return true
    },
    [aplicar],
  )

  /**
   * Guarda una ronda nueva en una cuenta que ya existe.
   *
   * Devuelve `saved: false` cuando otro aparato la movió mientras tanto: aquí
   * NO se decide qué hacer con eso, solo se reporta. Quien llama es el que
   * sabe que lo suyo son productos ya servidos y hay que ponerlos a salvo.
   */
  const update = useCallback(
    async (
      id: string,
      expectedUpdatedAt: string,
      state: CartState,
    ): Promise<{ saved: boolean; updatedAt: string | null } | null> => {
      const cart = serializeCart(state, Date.now())
      const r = await updateParked({ id, cart, expectedUpdatedAt })
      if (!r?.success) {
        toast.error(r?.error ?? "No se pudo guardar la cuenta. Vuelve a intentar.")
        return null
      }
      if (r.saved) {
        aplicar(
          ref.current.map((o) => (o.id === id ? { ...o, cart, updatedAt: r.updatedAt ?? o.updatedAt } : o)),
        )
      } else {
        void refrescar() // la versión buena es la del servidor
      }
      return { saved: r.saved, updatedAt: r.updatedAt }
    },
    [aplicar, refrescar],
  )

  const remove = useCallback(
    (id: string) => {
      aplicar(ref.current.filter((o) => o.id !== id))
      if (id.startsWith("local-")) return // nunca llegó al servidor
      void (async () => {
        const r = await removeParked(id)
        if (r?.error) {
          toast.error(r.error)
          void refrescar() // la verdad la tiene el servidor
        }
      })()
    },
    [aplicar, refrescar],
  )

  /**
   * Marca una cuenta como fiado. No cobra nada: solo la saca de la lista del
   * día y la manda a «Por cobrar», donde ya no caduca.
   */
  const fiar = useCallback(
    async (id: string, contact: string | undefined): Promise<boolean> => {
      const r = await markOwed({ id, contact })
      if (!r?.success) {
        toast.error(r?.error ?? "No se pudo marcar como fiado.")
        return false
      }
      aplicar(
        ref.current.map((o) =>
          o.id === id ? { ...o, owedSince: r.owedSince, owedContact: contact ?? null } : o,
        ),
      )
      return true
    },
    [aplicar],
  )

  return { orders, listo, park, update, remove, fiar, refrescar, full: orders.length >= PARKED_MAX }
}
