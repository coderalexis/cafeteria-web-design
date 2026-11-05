"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createTicket } from "@/app/actions/sales"
import { reportClientError } from "@/app/actions/errors"
import type { CambioExistencia } from "@/lib/existencias"
import {
  canEnqueue,
  clasificarRechazo,
  clearDiffs,
  dropSale,
  enqueue,
  esperaParaReintentar,
  markNeedsReview,
  markRetry,
  markUploaded,
  pendingCount,
  queueKey,
  readQueue,
  reintentarVenta,
  reviewCount,
  type QueuedSale,
  type QueueState,
} from "./queue"
import { DESFASE_PARA_AVISAR_MS, desfaseGuardado, horaParaElServidor, medirHoraDelServidor } from "./hora-servidor"

/** Lo guardado en el aparato, o null si no se puede leer. */
function leerDisco(key: string): QueueState | null {
  try {
    const raw = window.localStorage.getItem(key)
    return readQueue(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}

/** Ventas de esta cafetería que siguen sin subir en este aparato. */
export function ventasSinSubir(businessId: string): number {
  if (typeof window === "undefined") return 0
  return leerDisco(queueKey(businessId))?.sales.length ?? 0
}

/**
 * ¿Se puede cerrar sesión ya? Si quedan ventas sin subir se pregunta antes: la
 * cola es de la cafetería, así que las subiría quien entre después, y el
 * servidor las registraría a SU nombre.
 */
export function puedeSalirConCola(businessId: string | undefined): boolean {
  if (!businessId) return true
  const n = ventasSinSubir(businessId)
  if (n === 0) return true
  const s = n === 1 ? "" : "s"
  return window.confirm(
    `Hay ${n} venta${s} cobrada${s} sin subir en este aparato. Si cierras sesión, se subirán cuando entre otra persona y quedarán a su nombre. ¿Cerrar sesión de todos modos?`,
  )
}

/**
 * Cola de ventas sin internet: guarda, sube en orden y avisa.
 *
 * Un solo trabajador, no uno por venta: subir en paralelo desordenaría los
 * folios y multiplicaría los reintentos justo cuando la red está mal. El
 * candado `subiendoRef` garantiza que solo haya un ciclo vivo en la pestaña,
 * y `navigator.locks` que solo una pestaña suba a la vez.
 *
 * Cada cambio se aplica sobre lo que está GUARDADO, no sobre lo que esta
 * pestaña cree que hay: con dos pestañas abiertas, escribir la copia en
 * memoria borraba las ventas que la otra había encolado.
 *
 * `onStock`: lo que cada venta subida descontó de las existencias (P45), para
 * que la esquina «quedan 3» del POS no se quede vieja después de una racha
 * sin internet. Va por ref: cambiar el callback no reinicia el trabajador.
 */
export function useOfflineQueue(businessId: string, onStock?: (cambios: CambioExistencia[]) => void) {
  const [state, setState] = useState<QueueState>(() => readQueue(null))
  const [subiendo, setSubiendo] = useState<{ hecho: number; total: number } | null>(null)
  const [hidratada, setHidratada] = useState(false)
  /** El aparato no pudo guardar la cola: vive solo en memoria y se pierde si se cierra la app. */
  const [soloEnMemoria, setSoloEnMemoria] = useState(false)
  /** Por qué no se puede subir ahora mismo (sesión vencida, café suspendido…), o null. */
  const [atorada, setAtorada] = useState<string | null>(null)
  /** Intentos seguidos que fallaron por red: marca la espera hasta el siguiente. */
  const [fallos, setFallos] = useState(0)
  const subiendoRef = useRef(false)
  const estadoRef = useRef(state)
  estadoRef.current = state
  const onStockRef = useRef(onStock)
  onStockRef.current = onStock

  const key = queueKey(businessId)

  /**
   * Aplica un cambio sobre lo guardado y lo guarda. Devuelve el estado nuevo
   * y si quedó guardado en el aparato.
   */
  const actualizar = useCallback(
    (cambio: (q: QueueState) => QueueState): { next: QueueState; guardada: boolean } => {
      const next = cambio(leerDisco(key) ?? estadoRef.current)
      estadoRef.current = next
      setState(next)
      let guardada = true
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        guardada = false
      }
      setSoloEnMemoria(!guardada)
      return { next, guardada }
    },
    [key],
  )

  useEffect(() => {
    const q = leerDisco(key)
    if (q) {
      estadoRef.current = q
      setState(q)
    }
    setHidratada(true)
    // Otra pestaña cambió la cola: verla igual aquí.
    const alCambiar = (e: StorageEvent) => {
      if (e.key !== key) return
      const nueva = leerDisco(key)
      if (!nueva) return
      estadoRef.current = nueva
      setState(nueva)
    }
    window.addEventListener("storage", alCambiar)
    return () => window.removeEventListener("storage", alCambiar)
  }, [key])

  /**
   * Guarda una venta que no se pudo cobrar en línea. `guardada: false` quiere
   * decir que el aparato no la pudo escribir (modo privado, sin espacio): está
   * capturada pero solo en memoria, y quien cobra tiene que saberlo.
   */
  const encolar = useCallback(
    (sale: Omit<QueuedSale, "provisional" | "status" | "attempts">): { provisional: string; guardada: boolean } | null => {
      const base = leerDisco(key) ?? estadoRef.current
      if (!canEnqueue(base)) return null
      // La desviación del reloj que se conocía AL COBRAR viaja con la venta.
      const { next, guardada } = actualizar(() => enqueue(base, { ...sale, desfase: sale.desfase ?? desfaseGuardado() }))
      return { provisional: next.sales[next.sales.length - 1].provisional, guardada }
    },
    [actualizar, key],
  )

  /**
   * Sube todo lo pendiente, en orden de captura. Cada venta lleva su
   * `clientRef` original: si una ya había entrado y solo se perdió la
   * respuesta, el servidor devuelve el mismo folio en vez de duplicarla.
   */
  const correr = useCallback(async () => {
    const pendientes = (leerDisco(key) ?? estadoRef.current).sales.filter((s) => s.status === "pendiente")
    if (pendientes.length === 0) return
    setSubiendo({ hecho: 0, total: pendientes.length })

    // Antes de subir, cuánto se desvía HOY el reloj del teléfono: con eso la
    // hora de cada venta va en el reloj del servidor y nunca «en el futuro».
    const desfaseAhora = (await medirHoraDelServidor()) ?? desfaseGuardado()
    if (desfaseAhora !== null && Math.abs(desfaseAhora) >= DESFASE_PARA_AVISAR_MS) {
      const min = Math.round(Math.abs(desfaseAhora) / 60_000)
      void reportClientError({
        route: "/pos",
        message: `El reloj del teléfono va ${min} min ${desfaseAhora < 0 ? "adelantado" : "atrasado"}: la cola sube con la hora del servidor`,
        digest: "reloj-desfasado",
      })
    }

    let hecho = 0
    let fallo = false
    for (const venta of pendientes) {
      // Otra pestaña pudo subirla mientras tanto.
      if (!estadoRef.current.sales.some((s) => s.clientRef === venta.clientRef && s.status === "pendiente")) continue
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
          loyaltyRedeem: venta.loyaltyRedeem,
          capturedAt: new Date(horaParaElServidor(venta.capturedAt, venta.desfase, desfaseAhora, Date.now())).toISOString(),
          items: venta.items,
        })
        if (r.success) {
          actualizar((q) => markUploaded(q, venta.clientRef, r.folio, r.total))
          setAtorada(null)
          onStockRef.current?.(r.stock)
          // Que quede cuánto esperó: una racha de ventas que subieron tarde es
          // un día de mala señal, y se ve en el correo de la mañana.
          const minutos = Math.round((Date.now() - venta.capturedAt) / 60_000)
          void reportClientError({
            route: "/pos",
            message: `Venta #${r.folio} subió desde la cola sin internet tras ${minutos} min`,
            digest: "cola-subida",
          })
        } else {
          const tipo = clasificarRechazo(r.error)
          if (tipo === "contenido") {
            actualizar((q) => markNeedsReview(q, venta.clientRef, r.error))
            // Esto es lo grave: una venta capturada que el servidor rechazó.
            void reportClientError({
              route: "/pos",
              message: `Venta en cola necesita revisión: ${r.error}`,
              digest: "cola-revision",
            })
          } else {
            // Red o sesión: la venta está bien, solo no se puede subir ahora.
            // Se corta el ciclo —insistir con las demás gasta batería— y se
            // deja dicho por qué.
            actualizar((q) => markRetry(q, venta.clientRef))
            if (tipo === "sesion") setAtorada(r.error)
            fallo = true
            break
          }
        }
      } catch {
        actualizar((q) => markRetry(q, venta.clientRef))
        fallo = true
        break
      }
      hecho += 1
      setSubiendo({ hecho, total: pendientes.length })
    }
    setFallos((n) => (fallo ? n + 1 : 0))
    setSubiendo(null)
  }, [actualizar, businessId, key])

  const subir = useCallback(async () => {
    if (subiendoRef.current) return
    subiendoRef.current = true
    try {
      // Una sola pestaña sube a la vez; si otra ya está subiendo, esta no espera.
      if (typeof navigator !== "undefined" && navigator.locks?.request) {
        await navigator.locks.request(`subir-${key}`, { ifAvailable: true }, async (lock) => {
          if (lock) await correr()
        })
      } else {
        await correr()
      }
    } catch {
      // Sin Web Locks o algo raro al pedirlo: el siguiente intento lo vuelve a probar.
    } finally {
      subiendoRef.current = false
    }
  }, [correr, key])

  const pendientes = pendingCount(state)

  // Al volver la conexión o al regresar a la app, y un intento al abrir por si quedó cola de antes.
  useEffect(() => {
    if (!hidratada) return
    const alVolver = () => {
      if (document.visibilityState === "visible") void subir()
    }
    window.addEventListener("online", alVolver)
    document.addEventListener("visibilitychange", alVolver)
    if (navigator.onLine) void subir()
    return () => {
      window.removeEventListener("online", alVolver)
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [hidratada, subir])

  // La desviación del reloj se mide al abrir y al volver la señal, no solo al
  // subir: así la primera venta sin señal ya lleva la suya, aunque nunca haya
  // habido cola. Es una petición mínima que no toca la base.
  useEffect(() => {
    const medir = () => void medirHoraDelServidor()
    if (navigator.onLine) medir()
    window.addEventListener("online", medir)
    return () => window.removeEventListener("online", medir)
  }, [])

  // Y sola, cada vez más espaciado mientras quede algo: con señal débil el
  // evento `online` nunca llega.
  useEffect(() => {
    if (!hidratada || pendientes === 0 || subiendo) return
    const t = window.setTimeout(() => void subir(), esperaParaReintentar(fallos))
    return () => window.clearTimeout(t)
  }, [hidratada, pendientes, subiendo, fallos, subir])

  return {
    state,
    pendientes,
    porRevisar: reviewCount(state),
    subiendo,
    soloEnMemoria,
    atorada,
    encolar,
    subir,
    quitar: useCallback((ref: string) => void actualizar((q) => dropSale(q, ref)), [actualizar]),
    reintentar: useCallback(
      (ref: string) => {
        actualizar((q) => reintentarVenta(q, ref))
        void subir()
      },
      [actualizar, subir],
    ),
    limpiarDiferencias: useCallback(() => void actualizar((q) => clearDiffs(q)), [actualizar]),
  }
}
