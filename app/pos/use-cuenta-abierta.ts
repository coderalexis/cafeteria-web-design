"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { reportClientError } from "@/app/actions/errors"
import { serializeCart, type CartLine, type CartState, type PersistedCart } from "./cart"
import { applyCartDelta, conflictName, esFiado, mergeParkedCarts, mismaCuenta, repartirCuenta } from "./parked"
import { vibra } from "./pos-utils"
import type { useParkedOrders } from "./use-parked-orders"

type Cuentas = ReturnType<typeof useParkedOrders>

/** La cuenta abierta en el carrito: a qué fila del servidor apunta y cómo estaba al abrirla. */
export type CuentaAbierta = {
  id: string
  name: string
  openedAt: number
  /** Sello de la última escritura; se manda al guardar para no pisar a nadie. */
  updatedAt: string
  /** La cuenta tal como estaba al abrirla: con eso se junta si cambió mientras tanto. */
  cartAtOpen?: PersistedCart
}

/**
 * Qué pasó al poner a salvo la ronda que estaba en el carrito: si se pudo
 * seguir adelante y bajo qué nombre quedó, para que quien llama pueda
 * contarlo en su propio mensaje en vez de soltar otro aviso encima.
 */
export type Guardado = { ok: boolean; guardadaComo: string | null }

/**
 * La cuenta abierta en este carrito: el puntero, lo que sobrevive a una
 * recarga, y el aviso si otro aparato la cobró o la descartó. Vivía dentro de
 * pos-client.tsx; salió tal cual.
 */
export function useCuentaAbierta({
  businessId,
  cashierId,
  parked,
}: {
  businessId: string
  cashierId: string
  parked: Cuentas
}) {
  /**
   * La cuenta que está ABIERTA en este carrito, si la hay.
   *
   * Es lo que le da continuidad entre rondas: el carrito deja de ser una venta
   * suelta y pasa a ser «lo que lleva la mesa 3». Sin esto cada ronda creaba
   * una cuenta nueva y había que reescribir el nombre.
   *
   * Vive también en localStorage porque el carrito sobrevive a una recarga: si
   * el puntero no sobreviviera con él, guardar después de recargar crearía una
   * cuenta duplicada de la misma mesa.
   */
  const [openAccount, setOpenAccount] = useState<CuentaAbierta | null>(null)
  const openAccountKey = `pos-open-account:${businessId}:${cashierId}`
  /**
   * La cuenta que se está editando no se lista: ya está aquí, en el carrito.
   * Verla también en la bandeja invitaría a abrirla dos veces y a acabar con
   * dos versiones de la misma mesa.
   */
  const cuentasVisibles = useMemo(
    () => parked.orders.filter((o) => !mismaCuenta(o.id, openAccount?.id)),
    [parked.orders, openAccount],
  )

  /**
   * Pasa una cuenta a «Por cobrar». Si era la que estaba abierta en este
   * carrito, se suelta el puntero: ya no se le va a seguir agregando.
   */
  const marcarFiado = useCallback(
    async (id: string, contact: string | undefined) => {
      const ok = await parked.fiar(id, contact)
      if (ok) {
        if (mismaCuenta(openAccount?.id, id)) setOpenAccount(null)
        toast.success("Pasó a «Por cobrar». No se registró ninguna venta.")
      }
      return ok
    },
    [parked, openAccount],
  )

  /** Recuperar a qué cuenta pertenece el carrito que sobrevivió a la recarga. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(openAccountKey)
      if (raw) setOpenAccount(JSON.parse(raw))
    } catch {
      /* dato corrupto: se trata como carrito suelto */
    }
  }, [openAccountKey])

  useEffect(() => {
    try {
      if (openAccount) window.localStorage.setItem(openAccountKey, JSON.stringify(openAccount))
      else window.localStorage.removeItem(openAccountKey)
    } catch {
      /* sin espacio: solo se pierde la continuidad tras recargar */
    }
  }, [openAccount, openAccountKey])

  /**
   * La cuenta apuntada puede haber desaparecido mientras este aparato no
   * miraba: otra persona la cobró o la descartó. Guardar sobre una cuenta que
   * ya no existe no fallaría —el update afecta 0 filas— pero se vería como si
   * hubiera guardado. Mejor avisarlo y soltar el puntero: lo que hay en el
   * carrito no se toca y se guardará como cuenta nueva.
   */
  useEffect(() => {
    if (!openAccount || !parked.listo) return
    const enLista = parked.orders.find((o) => mismaCuenta(o.id, openAccount.id))
    if (enLista) {
      // Guardada sin señal y ya subió: su id cambió de `local-<uuid>` a
      // `<uuid>`. Es la MISMA cuenta; antes esto soltaba el puntero, avisaba
      // «ya no existe» y la cuenta reaparecía en la barra con sus productos
      // todavía en el carrito (cobrable dos veces).
      if (enLista.id !== openAccount.id) {
        setOpenAccount({ ...openAccount, id: enLista.id, updatedAt: enLista.updatedAt || openAccount.updatedAt })
      }
      return
    }
    setOpenAccount(null)
    toast.warning(
      `La cuenta «${openAccount.name}» ya no existe: alguien la cobró o la descartó. Lo que tienes en el carrito sigue aquí.`,
    )
  }, [openAccount, parked.listo, parked.orders])

  /**
   * La cuenta ya se cobró: se borra del servidor y se suelta el puntero.
   *
   * Es el único momento en que una cuenta desaparece por buenas razones —el
   * resto de las veces sobrevive a propósito—. Se hace después de que el
   * servidor confirmó la venta (o de que quedó en la cola), nunca antes.
   */
  const cerrarCuentaCobrada = useCallback(() => {
    if (!openAccount) return
    parked.remove(openAccount.id)
    setOpenAccount(null)
  }, [openAccount, parked])

  return { openAccount, setOpenAccount, cuentasVisibles, marcarFiado, cerrarCuentaCobrada }
}

/**
 * Lo que pone el carrito a salvo en una cuenta: abrir una nueva (o sumarle a
 * la del mismo nombre), guardar la ronda en la cuenta abierta, y separarla.
 * Vivía dentro de pos-client.tsx; salió tal cual.
 */
export function useGuardarCuenta({
  parked,
  openAccount,
  setOpenAccount,
  lines,
  cartStateNow,
  clearCart,
  clearTip,
  restoreLines,
}: {
  parked: Cuentas
  openAccount: CuentaAbierta | null
  setOpenAccount: (cuenta: CuentaAbierta | null) => void
  lines: CartLine[]
  cartStateNow: () => CartState
  clearCart: () => void
  clearTip: () => void
  restoreLines: (lines: CartLine[]) => void
}) {
  const parkCurrent = useCallback(
    (name: string) => {
      if (lines.length === 0) return
      const limpio = name.trim().slice(0, 40)

      /* Nombre repetido = SUMARLE a esa cuenta, no crear otra. Tocar el chip
         «Mesa 1» cuando la mesa ya tiene cuenta es el gesto más natural para
         mandarle otra ronda — y antes creaba una segunda «Mesa 1» que nadie
         sabía juntar. Solo cuentas del día: a un fiado (alguien que YA se
         fue) no se le suma un pedido nuevo. */
      const existente = parked.orders.find(
        (o) => !esFiado(o) && o.name.trim().toLowerCase() === limpio.toLowerCase(),
      )
      if (existente) {
        void (async () => {
          const combinado = mergeParkedCarts(existente.cart, serializeCart(cartStateNow(), Date.now()))
          const r = await parked.update(existente.id, existente.updatedAt, combinado)
          if (!r) return // el hook ya avisó; el carrito no se toca
          if (r.saved) {
            clearTip()
            clearCart()
            setOpenAccount(null)
            vibra(12)
            toast.success(`Se sumó a la cuenta «${existente.name}».`)
            return
          }
          // Otro aparato la movió justo ahora: mismo trato que en
          // saveToOpenAccount — no se pisa ni se tira, se guarda aparte.
          const alterno = conflictName(existente.name, parked.orders.map((o) => o.name))
          if (!parked.park(cartStateNow(), alterno)) {
            toast.error("La bandeja está llena: cobra o descarta una cuenta y vuelve a guardar.")
            return
          }
          void reportClientError({
            route: "/pos",
            message: `Cuenta «${existente.name}»: chocó al sumarle y se guardó como copia «${alterno}»`,
            digest: "cuenta-copia",
          })
          clearTip()
          clearCart()
          setOpenAccount(null)
          toast.warning(
            `«${existente.name}» se movió en otro aparato. Esto se guardó como «${alterno}»: júntalas antes de cobrar.`,
            { duration: 12000 },
          )
        })()
        return
      }

      if (!parked.park(cartStateNow(), limpio)) {
        toast.error(`Ya hay ${parked.orders.length} cuentas abiertas; cobra o descarta alguna.`)
        return
      }
      clearTip()
      clearCart()
      setOpenAccount(null)
      vibra(12)
      toast.success(`Cuenta «${limpio}» abierta.`)
    },
    [lines.length, parked, cartStateNow, clearCart, clearTip, setOpenAccount],
  )


  /**
   * Guarda la ronda actual EN la cuenta que está abierta.
   *
   * Este es el camino normal de una cafetería con mesas: la cuenta se abre una
   * vez y cada ronda se le suma, sin volver a escribir el nombre ni reiniciar
   * el reloj de «abierta hace 40 min».
   *
   * Si otro aparato la movió mientras tanto, lo de aquí NO se pisa ni se tira:
   * se guarda aparte con nombre reconocible. Son productos ya servidos; una
   * ronda perdida en silencio es comida que nunca se cobra.
   */
  const saveToOpenAccount = useCallback(async ({ callado = false } = {}): Promise<Guardado> => {
    if (!openAccount || lines.length === 0) return { ok: false, guardadaComo: null }
    // El sello más fresco que se conoce: el de la lista que el sondeo mantiene
    // al día, no el de cuando se abrió la cuenta. Con el de entonces, un
    // teléfono que se reiniciaba a media ronda «chocaba» contra su propia
    // ronda anterior y fabricaba una «Mesa 1 (2)».
    const enLista = parked.orders.find((o) => o.id === openAccount.id)
    const mio = serializeCart(cartStateNow(), Date.now())
    let r = await parked.update(openAccount.id, enLista?.updatedAt || openAccount.updatedAt, mio)
    if (!r) return { ok: false, guardadaComo: null } // el hook ya avisó
    if (!r.saved && r.current && openAccount.cartAtOpen) {
      // Sí cambió mientras estaba abierta: se junta en la misma cuenta.
      const junto = applyCartDelta(r.current.cart, openAccount.cartAtOpen, mio)
      r = await parked.update(openAccount.id, r.current.updatedAt, junto)
      if (!r) return { ok: false, guardadaComo: null }
      if (r.saved) toast.info(`«${openAccount.name}» tenía cambios de otro aparato: se juntaron en la misma cuenta.`)
    }
    if (r.saved) {
      clearTip()
      clearCart()
      setOpenAccount(null)
      vibra(12)
      // Callado cuando quien llama va a decirlo mejor: al cambiar de cuenta,
      // este aviso y el de «volvió la otra» salían los dos arriba y se
      // encimaban. Uno solo cuenta las dos mitades del mismo movimiento.
      if (!callado) toast.success(`Guardado en «${openAccount.name}».`)
      return { ok: true, guardadaComo: openAccount.name }
    }
    const alterno = conflictName(
      openAccount.name,
      parked.orders.map((o) => o.name),
    )
    if (!parked.park(cartStateNow(), alterno)) {
      toast.error(
        `«${openAccount.name}» cambió en otro aparato y la bandeja está llena. Cobra o descarta una cuenta y vuelve a guardar.`,
      )
      return { ok: false, guardadaComo: null }
    }
    clearTip()
    clearCart()
    setOpenAccount(null)
    vibra(12)
    void reportClientError({
      route: "/pos",
      message: `Cuenta «${openAccount.name}»: ${r.current === null ? "ya no existía" : "chocó al guardar la ronda"} y se guardó como copia «${alterno}»`,
      digest: "cuenta-copia",
    })
    toast.warning(
      r.current === null
        ? `«${openAccount.name}» ya no existe: se cobró o se descartó en otro aparato. Para no perder nada, esto se guardó como «${alterno}».`
        : `«${openAccount.name}» volvió a cambiar mientras se guardaba. Para no perder nada, esto se guardó como «${alterno}»: ábrela y júntalas.`,
      { duration: 12000 },
    )
    // Se guardó, pero con otro nombre y con su propia explicación larga: la
    // tarjeta no debe decir además «quedó guardada», que sería media verdad.
    return { ok: true, guardadaComo: null }
  }, [openAccount, lines.length, parked, cartStateNow, clearCart, clearTip, setOpenAccount])

  /**
   * Separar la cuenta: se cobra una parte y el resto sigue abierto.
   *
   * «Somos dos, cada quien lo suyo» es lo que más pasa en una mesa, y NO es
   * un pago mixto: son dos ventas, cada una con su método. Por eso se
   * reparten artículos y no se parte el cobro — partirlo obligaría a
   * redefinir qué significa «ventas en efectivo» en el corte y en todos los
   * reportes.
   *
   * Lo que se queda vuelve a la cuenta ANTES de tocar el carrito: si el
   * servidor rechaza el guardado, no se ha perdido ni un artículo.
   */
  const dividirCuenta = useCallback(
    async (elegido: Record<string, number>) => {
      if (!openAccount) return
      const { cobrar, queda } = repartirCuenta(lines, elegido, () => crypto.randomUUID())
      if (cobrar.length === 0 || queda.length === 0) return
      // El sello más fresco que se conoce, igual que al guardar una ronda: el
      // de la lista que el sondeo mantiene al día, no el de cuando se abrió.
      const enLista = parked.orders.find((o) => o.id === openAccount.id)
      const r = await parked.update(
        openAccount.id,
        enLista?.updatedAt || openAccount.updatedAt,
        serializeCart({ ...cartStateNow(), lines: queda }, Date.now()),
      )
      if (!r?.saved) {
        toast.error(
          `Alguien movió «${openAccount.name}» desde otro aparato. Ábrela otra vez y sepárala.`,
          { duration: 8000 },
        )
        return
      }
      const nombre = openAccount.name
      restoreLines(cobrar)
      // El carrito deja de ser la cuenta: lo que se cobre ahora es una venta
      // suelta, y la cuenta sigue viva con el resto. Si esto no se limpiara,
      // al cobrar se borraría la cuenta entera con todo y lo que queda.
      setOpenAccount(null)
      toast.success(`Separaste «${nombre}»: cobra esto y el resto sigue abierto.`, { duration: 6000 })
    },
    [openAccount, lines, parked, cartStateNow, restoreLines, setOpenAccount],
  )

  return { parkCurrent, saveToOpenAccount, dividirCuenta }
}
