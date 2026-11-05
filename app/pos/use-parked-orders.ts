"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { serializeCart, type CartState } from "./cart"
// (serializeCart se usa en `park`; `update` ya recibe el carrito serializado)
import { markOwed, parkOrder, removeParked, updateParked } from "@/app/actions/parked"
import type { listParked } from "@/app/actions/parked"
import {
  PARKED_MAX,
  borradasVigentes,
  esProvisional,
  idDeServidor,
  idProvisional,
  leerBorradas,
  leerPendientes,
  mismoCarrito,
  reconciliarLista,
  sinBorradas,
  borradasTrasSondeo,
  conservarRecientes,
  type CuentaBorrada,
  type ParkedOrder,
} from "./parked"
import { BUILD_ID, esErrorDeVersion, hayVersionNueva, mensajeDeFallo } from "@/lib/version"
import { reportClientError } from "@/app/actions/errors"

/** Cada cuánto se vuelve a preguntar por la bandeja. */
const REFRESCO_MS = 10_000
// En un teléfono, cada consulta cuesta batería y datos, y el POS del celular
// casi siempre es el único aparato de la cafetería: con 30 s alcanza.
const REFRESCO_MOVIL_MS = 30_000
/** Un sondeo que lleve más de esto sin contestar deja de bloquear al siguiente. */
const SONDEO_MAX_MS = 15_000

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
  const cargandoDesde = useRef(0)
  /**
   * Cuántos sondeos seguidos han visto un build más nuevo en el servidor
   * (0 = ninguno). Es un contador y no un booleano para que quien lo mira
   * vuelva a intentar la recarga en cada sondeo, no solo la primera vez.
   */
  const [versionNueva, setVersionNueva] = useState(0)

  const aplicar = useCallback((next: ParkedOrder[]) => {
    ref.current = next
    setOrders(next)
  }, [])

  /*
   * Sin señal. Dos listas que viven también en el aparato, para sobrevivir a
   * una recarga o a que iOS cierre la app: las cuentas guardadas que todavía
   * no llegan al servidor, y las borradas (casi siempre: cobradas) cuyo
   * borrado quizá no llegó. Se ponen al día tras cada sondeo que contesta.
   */
  const pendientes = useRef<ParkedOrder[]>([])
  const borradas = useRef<CuentaBorrada[]>([])
  /** Cuentas que el servidor confirmó hace poco (id → cuándo): ver conservarRecientes. */
  const recientes = useRef(new Map<string, number>())
  const sincronizando = useRef(false)
  /** A qué pendientes ya se les avisó que el servidor no las acepta (un aviso, no uno por sondeo). */
  const avisadas = useRef(new Set<string>())
  const claveP = `pos-cuentas-pendientes:${businessId}`
  const claveB = `pos-cuentas-borradas:${businessId}`

  const persistir = useCallback(() => {
    try {
      window.localStorage.setItem(claveP, JSON.stringify(pendientes.current))
      window.localStorage.setItem(claveB, JSON.stringify(borradas.current))
    } catch {
      // Sin almacenamiento (modo privado, sin espacio): sigue en memoria.
    }
  }, [claveP, claveB])

  // Antes que el primer sondeo (los efectos corren en orden): lo que quedó en
  // el aparato de la última vez, a la vista desde el principio.
  useEffect(() => {
    try {
      pendientes.current = leerPendientes(window.localStorage.getItem(claveP))
      borradas.current = borradasVigentes(leerBorradas(window.localStorage.getItem(claveB)), Date.now())
    } catch {
      pendientes.current = []
      borradas.current = []
    }
    if (pendientes.current.length > 0) {
      aplicar([...pendientes.current, ...ref.current.filter((o) => !esProvisional(o.id))])
    }
  }, [claveP, claveB, aplicar])

  /** La provisional ya llegó: desde ahora se usa su id de servidor y su sello. */
  const confirmar = useCallback(
    (provisionalId: string, id: string, updatedAt: string) => {
      recientes.current.set(id, Date.now())
      aplicar(ref.current.map((o) => (o.id === provisionalId ? { ...o, id, updatedAt } : o)))
    },
    [aplicar],
  )

  /**
   * Borra en el servidor lo que aquí ya se borró y sube lo que se guardó sin
   * señal. En orden y de uno en uno: si la señal se vuelve a caer a la mitad,
   * lo que falta espera al siguiente sondeo.
   */
  const sincronizar = useCallback(async () => {
    if (sincronizando.current) return
    if (borradas.current.length === 0 && pendientes.current.length === 0) return
    sincronizando.current = true
    try {
      for (const b of borradas.current.filter((x) => x.confirmada === undefined)) {
        try {
          const r = await removeParked(b.id)
          // Solo con éxito se marca confirmada: si el servidor dijo que no, la
          // cuenta sigue escondida aquí (este aparato ya la cobró) y se reintenta.
          // Y confirmada no es olvidada: ver borradasTrasSondeo.
          if (r?.success) borradas.current = borradas.current.map((x) => (x.id === b.id ? { ...x, confirmada: Date.now() } : x))
        } catch {
          return // sin señal otra vez
        }
      }
      for (const p of [...pendientes.current]) {
        try {
          const r = await parkOrder({ id: idDeServidor(p.id), name: p.name, cart: p.cart })
          if (r?.success) {
            pendientes.current = pendientes.current.filter((x) => x.id !== p.id)
            confirmar(p.id, r.id, r.updatedAt)
          } else if (!avisadas.current.has(p.id)) {
            avisadas.current.add(p.id)
            toast.error(`La cuenta «${p.name}» no se pudo subir: ${r?.error ?? "error desconocido"}. Sigue en este aparato.`)
          }
        } catch {
          return
        }
      }
    } finally {
      sincronizando.current = false
      persistir()
    }
  }, [confirmar, persistir])

  const refrescar = useCallback(async () => {
    // Un sondeo que no contesta (señal a medias) no puede bloquear a los que
    // siguen para siempre: pasado un rato se deja pasar al siguiente, y si el
    // viejo llega tarde, reconciliarLista lo pone en su lugar.
    if (cargando.current) {
      if (Date.now() - cargandoDesde.current < SONDEO_MAX_MS) return
      // El anterior sigue sin contestar: se deja pasar a este, y queda rastro
      // porque una señal así es justo lo que precede a los choques falsos.
      void reportClientError({
        route: "/pos",
        message: `Sondeo de cuentas sin respuesta más de ${Math.round(SONDEO_MAX_MS / 1000)} s`,
        digest: "sondeo-lento",
      })
    }
    cargando.current = true
    cargandoDesde.current = Date.now()
    // Cuándo SALIÓ este sondeo: lo que el servidor confirmó después, esta
    // respuesta no lo puede saber (borradasTrasSondeo, conservarRecientes).
    const enviado = Date.now()
    try {
      // `fetch` y no la server action: las acciones van en fila y un sondeo
      // lento hacía esperar al cobro (app/pos/datos/cuentas). Con tope: uno
      // que no contesta no se queda colgado.
      const res = await fetch("/pos/datos/cuentas", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(SONDEO_MAX_MS) : undefined,
      })
      // Sin sesión, el middleware manda al login (HTML): eso no es una lista.
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) {
        throw new Error("Failed to fetch")
      }
      const r = (await res.json()) as Awaited<ReturnType<typeof listParked>>
      if (r.success) {
        if (hayVersionNueva(BUILD_ID, r.build)) setVersionNueva((n) => n + 1)
        // Más reciente primero: es el que más probablemente se retoma. Y
        // reconciliado con lo que este aparato ya sabe: una respuesta que llega
        // tarde no puede regresar el sello de una cuenta recién guardada.
        const todas: ParkedOrder[] = r.orders
          .map((o) => ({
            id: o.id,
            name: o.name,
            savedAt: o.savedAt,
            cart: o.cart as ParkedOrder["cart"],
            updatedAt: o.updatedAt,
            owedSince: o.owedSince,
            owedContact: o.owedContact,
          }))
          .reverse()
        // Pendientes que en realidad sí llegaron (se perdió la respuesta).
        const ids = new Set(todas.map((o) => o.id))
        const antes = pendientes.current.length
        pendientes.current = pendientes.current.filter((p) => !ids.has(idDeServidor(p.id)))
        if (pendientes.current.length !== antes) persistir()
        // Lo que este aparato ya borró no vuelve, aunque el servidor aún no se entere.
        aplicar(
          conservarRecientes(
            reconciliarLista(ref.current, sinBorradas(todas, borradas.current)),
            ref.current,
            recientes.current,
            enviado,
          ),
        )
        // Lo que este sondeo ya vio después de confirmarse deja de necesitar marca.
        for (const [id, cuando] of recientes.current) if (cuando < enviado) recientes.current.delete(id)
        const quedan = borradasTrasSondeo(borradas.current, enviado)
        if (quedan.length !== borradas.current.length) {
          borradas.current = quedan
          persistir()
        }
        setListo(true)
        // Contestó: hay señal, buen momento para lo que quedó pendiente.
        void sincronizar()
      }
    } catch (e) {
      // Tras un deploy que rotó la sal de las acciones, el servidor ya no
      // reconoce el id de esta (404): también es «hay versión nueva». Si no,
      // es falta de señal y la bandeja se queda con lo último que supo.
      if (esErrorDeVersion(e)) setVersionNueva((n) => n + 1)
    } finally {
      cargando.current = false
    }
  }, [aplicar, persistir, sincronizar])

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
    const movil = window.matchMedia("(max-width: 767px)").matches
    // Con la app en segundo plano no se consulta: al volver se refresca de
    // inmediato (visibilitychange es lo que sí dispara iOS al regresar).
    const tic = setInterval(() => {
      if (!document.hidden) void refrescar()
    }, movil ? REFRESCO_MOVIL_MS : REFRESCO_MS)
    const alVolver = () => {
      if (!document.hidden) void refrescar()
    }
    window.addEventListener("focus", alVolver)
    window.addEventListener("online", alVolver)
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      clearInterval(tic)
      window.removeEventListener("focus", alVolver)
      window.removeEventListener("online", alVolver)
      document.removeEventListener("visibilitychange", alVolver)
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

      const uuid = crypto.randomUUID()
      const provisional: ParkedOrder = {
        id: idProvisional(uuid),
        name: name.trim().slice(0, 40),
        savedAt: Date.now(),
        cart: serializeCart(state, Date.now()),
        updatedAt: "",
        owedSince: null,
        owedContact: null,
      }
      aplicar([provisional, ...ref.current])
      ;(async () => {
        let r: Awaited<ReturnType<typeof parkOrder>>
        try {
          r = await parkOrder({ id: uuid, name: provisional.name, cart: provisional.cart })
        } catch {
          // La borraron (o la cobraron) mientras se guardaba: no se revive. La
          // marca de borrada ya está, y si el guardado sí llegó, el borrado sale
          // detrás de él.
          if (borradas.current.some((b) => b.id === uuid) || !ref.current.some((o) => o.id === provisional.id)) return
          // Sin señal (o un deploy a medias). Antes la cuenta se quedaba solo
          // en memoria: parecía guardada y una recarga se la llevaba. Ahora
          // vive en el aparato y se sube sola con el mismo uuid, así que si sí
          // había llegado no se duplica.
          pendientes.current = [...pendientes.current, provisional]
          persistir()
          toast.warning(`Sin conexión: «${provisional.name}» quedó guardada en este aparato y se sube sola al volver la señal.`)
          return
        }
        if (r?.success) {
          // Le ponemos el id de verdad: con el provisional, descartarla después
          // no borraría nada en el servidor y la cuenta reaparecería sola.
          confirmar(provisional.id, r.id, r.updatedAt)
          return
        }
        aplicar(ref.current.filter((o) => o.id !== provisional.id))
        toast.error(r?.error ?? "No se pudo guardar la cuenta. Vuelve a intentar.")
      })()
      return true
    },
    [aplicar, confirmar, persistir],
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
      cart: ParkedOrder["cart"],
    ): Promise<{
      saved: boolean
      updatedAt: string | null
      /** Al chocar: lo que sí está en el servidor (null si la cuenta ya no existe). */
      current: { cart: ParkedOrder["cart"]; updatedAt: string } | null
    } | null> => {
      // Guardada sin señal y todavía sin subir: la ronda se suma ahí mismo y
      // viaja junto con la cuenta cuando vuelva la señal.
      if (pendientes.current.some((p) => p.id === id)) {
        pendientes.current = pendientes.current.map((p) => (p.id === id ? { ...p, cart } : p))
        persistir()
        aplicar(ref.current.map((o) => (o.id === id ? { ...o, cart } : o)))
        return { saved: true, updatedAt: "", current: null }
      }
      // Una provisional que ya subió: quien la tiene abierta guarda el id viejo.
      if (esProvisional(id)) {
        id = idDeServidor(id)
        if (!expectedUpdatedAt) expectedUpdatedAt = ref.current.find((o) => o.id === id)?.updatedAt ?? ""
      }
      let r: Awaited<ReturnType<typeof updateParked>>
      try {
        r = await updateParked({ id, cart, expectedUpdatedAt })
      } catch (e) {
        // Sin señal: el carrito se queda donde está (quien llama no lo toca con null).
        toast.error(mensajeDeFallo(e))
        return null
      }
      if (!r?.success) {
        toast.error(r?.error ?? "No se pudo guardar la cuenta. Vuelve a intentar.")
        return null
      }
      // Choque FALSO: el servidor tiene exactamente lo que este aparato ya
      // sabía de la cuenta y solo el sello iba viejo (un sondeo lento llegó
      // después de un guardado). No lo movió nadie: se reintenta una vez con
      // el sello del servidor. Si el carrito de allá es otro, sí es un choque
      // y se trata como siempre.
      if (!r.saved && r.current) {
        const mia = ref.current.find((o) => o.id === id)
        if (mia && mismoCarrito(mia.cart, r.current.cart)) {
          let otra: Awaited<ReturnType<typeof updateParked>>
          try {
            otra = await updateParked({ id, cart, expectedUpdatedAt: r.current.updatedAt })
          } catch (e) {
            toast.error(mensajeDeFallo(e))
            return null
          }
          if (!otra?.success) {
            toast.error(otra?.error ?? "No se pudo guardar la cuenta. Vuelve a intentar.")
            return null
          }
          r = otra
          // Se resolvió solo, pero que quede: si se repite mucho, algo anda
          // mal con la señal o con el sondeo, y hay que verlo antes de que
          // vuelva a estorbar en la barra.
          void reportClientError({
            route: "/pos",
            message: `Cuenta «${mia.name}»: choque falso (mismo contenido), se reintentó y ${otra.saved ? "se guardó" : "volvió a chocar"}`,
            digest: "cuenta-choque-falso",
          })
        }
      }
      if (r.saved) {
        aplicar(
          ref.current.map((o) => (o.id === id ? { ...o, cart, updatedAt: r.updatedAt ?? o.updatedAt } : o)),
        )
      } else {
        void refrescar() // la versión buena es la del servidor
      }
      return {
        saved: r.saved,
        updatedAt: r.updatedAt,
        current: r.current ? { cart: r.current.cart as ParkedOrder["cart"], updatedAt: r.current.updatedAt } : null,
      }
    },
    [aplicar, refrescar, persistir],
  )

  /**
   * Quita una cuenta (casi siempre porque se acaba de cobrar).
   *
   * Queda anotada como borrada HASTA que el servidor confirme. Antes, si no
   * había señal, el borrado fallaba en silencio y el siguiente sondeo traía
   * la cuenta de regreso, cobrable otra vez. También se anota la provisional
   * (por su uuid): si su guardado sí llegó, el servidor la tiene.
   */
  const remove = useCallback(
    (id: string) => {
      const real = idDeServidor(id)
      aplicar(ref.current.filter((o) => o.id !== id && o.id !== real))
      pendientes.current = pendientes.current.filter((p) => p.id !== id)
      borradas.current = [...borradas.current.filter((b) => b.id !== real), { id: real, desde: Date.now() }]
      persistir()
      void (async () => {
        try {
          const r = await removeParked(real)
          if (r?.success) {
            // Confirmada, no olvidada: un sondeo que salió antes de esto y llega
            // tarde la traería de vuelta, cobrable otra vez (borradasTrasSondeo).
            borradas.current = borradas.current.map((b) => (b.id === real ? { ...b, confirmada: Date.now() } : b))
            persistir()
          } else if (r?.error) {
            toast.error(r.error)
          }
        } catch {
          // Sin señal: sigue anotada y se reintenta tras el próximo sondeo que conteste.
        }
      })()
    },
    [aplicar, persistir],
  )

  /**
   * Marca una cuenta como fiado. No cobra nada: solo la saca de la lista del
   * día y la manda a «Por cobrar», donde ya no caduca.
   */
  const fiar = useCallback(
    async (id: string, contact: string | undefined): Promise<boolean> => {
      if (pendientes.current.some((p) => p.id === id)) {
        toast.error("Esta cuenta se guardó sin señal y todavía no sube. Márcala como fiado cuando vuelva la conexión.")
        return false
      }
      const real = idDeServidor(id)
      let r: Awaited<ReturnType<typeof markOwed>>
      try {
        r = await markOwed({ id: real, contact })
      } catch (e) {
        toast.error(mensajeDeFallo(e))
        return false
      }
      if (!r?.success) {
        toast.error(r?.error ?? "No se pudo marcar como fiado.")
        return false
      }
      aplicar(
        ref.current.map((o) =>
          o.id === id || o.id === real ? { ...o, owedSince: r.owedSince, owedContact: contact ?? null } : o,
        ),
      )
      return true
    },
    [aplicar],
  )

  return { orders, listo, park, update, remove, fiar, refrescar, versionNueva, full: orders.length >= PARKED_MAX }
}
