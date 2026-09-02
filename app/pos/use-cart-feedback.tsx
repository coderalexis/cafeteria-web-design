"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { m, useAnimationControls, useReducedMotion } from "framer-motion"
import { getLinePrice, type CartLine } from "./cart"
import { vibra } from "./pos-utils"

/** ¿El navegador sabe animar sobre una curva? (Safari viejo no; ahí el
 *  vuelo cae al arco de tres cuadros.) En SSR no existe CSS. */
const FLIGHT_PATH_SUPPORTED =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("offset-path", 'path("M 0 0 L 1 1")')

type Flight = { id: number; from: { x: number; y: number }; to: { x: number; y: number }; kind: "main" | "trail"; delay: number; duration: number }
type Landing = { id: number; x: number; y: number }

/**
 * Lo que confirma un toque en el menú: el punto que vuela al carrito (con su
 * estela y su aterrizaje) y, en celular, el aviso en la barra de abajo con lo
 * que acaba de entrar. Vive en un hook porque necesita comparar el carrito
 * anterior con el nuevo, y esa comparación es una sola aunque la pinten dos
 * cosas distintas.
 */
export function useCartFeedback({ lines, isMobile, cartOpen }: { lines: CartLine[]; isMobile: boolean; cartOpen: boolean }) {
  // ── "¿Sí lo agregó?" (móvil) ──
  // En tablet ves el carrito crecer al tocar un producto; en celular solo
  // cambia un numerito en la barra de abajo. Ese silencio provoca dobles
  // toques. Se detecta la línea nueva (o la cantidad que subió) comparando
  // con el carrito anterior y la barra lo dice con nombre, precio y una
  // vibración corta. Con la hoja abierta no hace falta: el carrito se ve.
  const [lastAdded, setLastAdded] = useState<{ label: string; price: number; key: number } | null>(null)
  const prevLinesRef = useRef<CartLine[]>(lines)

  // ── Vuelo al carrito ──
  // Un punto sale de la tarjeta tocada y aterriza en el carrito: barra
  // inferior en celular, panel en tablet/escritorio. El origen se apunta en el
  // onClick de la tarjeta/chip — si el producto abre modificadores, el punto
  // vuela al confirmar DESDE esa tarjeta, que es lo que el ojo espera. Las
  // altas que no nacen de un toque en el menú (repetir venta, duplicar línea,
  // retomar pedido) no vuelan: ahí el carrito ya está a la vista.
  const reducedMotion = useReducedMotion()
  const flyOriginRef = useRef<{ x: number; y: number } | null>(null)
  const flightSeq = useRef(0)
  const [flights, setFlights] = useState<
    { id: number; from: { x: number; y: number }; to: { x: number; y: number }; kind: "main" | "trail"; delay: number; duration: number }[]
  >([])
  // Aterrizajes: el anillo que se expande y el «+1» que rebota donde cayó el
  // punto. Los dispara SOLO el punto principal — la estela aterriza muda.
  const [landings, setLandings] = useState<{ id: number; x: number; y: number }[]>([])
  const [cartPulse, setCartPulse] = useState(0)
  const barDip = useAnimationControls()
  const barTargetRef = useRef<HTMLButtonElement>(null)
  const bagTargetRef = useRef<HTMLSpanElement>(null)
  // `useCallback` sin dependencias: solo escribe en un ref. Estable a propósito
  // —viaja como prop a cada tarjeta de producto, y una función nueva en cada
  // render volvería inútil el `memo` de ProductCard.
  const markFlyOrigin = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    flyOriginRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, [])

  useEffect(() => {
    const prev = prevLinesRef.current
    prevLinesRef.current = lines
    let added: CartLine | null = null
    for (const line of lines) {
      const before = prev.find((x) => x.lineId === line.lineId)
      if (!before || line.quantity > before.quantity) {
        added = line
        break
      }
    }
    // El origen se consume aunque no haya alta (p. ej. abrió el picker y no
    // eligió): así no vuela después desde una tarjeta que ya nadie tocó.
    const origin = flyOriginRef.current
    flyOriginRef.current = null
    if (!added) return
    if (origin && !reducedMotion) {
      const targetEl = isMobile ? barTargetRef.current : bagTargetRef.current
      if (targetEl) {
        const r = targetEl.getBoundingClientRect()
        const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        // Principal + dos rezagados (la estela): más chicos, translúcidos y
        // con salida escalonada, como en la demo que eligió el usuario.
        setFlights((cur) => [
          ...cur,
          { id: ++flightSeq.current, from: origin, to, kind: "main", delay: 0, duration: 0.48 },
          { id: ++flightSeq.current, from: origin, to, kind: "trail", delay: 0.09, duration: 0.42 },
          { id: ++flightSeq.current, from: origin, to, kind: "trail", delay: 0.16, duration: 0.36 },
        ])
      }
    }
    if (!isMobile || cartOpen) return
    vibra(15)
    setLastAdded({
      label: added.size ? `${added.product.name} · ${added.size.label}` : added.product.name,
      price: getLinePrice(added),
      key: Date.now(),
    })
  }, [lines, isMobile, cartOpen, reducedMotion])
  useEffect(() => {
    if (!lastAdded) return
    const t = setTimeout(() => setLastAdded(null), 1800)
    return () => clearTimeout(t)
  }, [lastAdded])

  /** Terminó de volar un punto: se retira y, si era el principal, aterriza. */
  const completeFlight = useCallback(
    (flight: Flight) => {
      setFlights((cur) => cur.filter((x) => x.id !== flight.id))
      if (flight.kind === "trail") return
      // Solo el principal aterriza: rebote de la bolsa (escritorio),
      // anillo + «+1», y el hundimiento de la barra (celular).
      setCartPulse((c) => c + 1)
      setLandings((cur) => [...cur, { id: ++flightSeq.current, x: flight.to.x, y: flight.to.y }])
      if (isMobile) {
        barDip.start({ y: [0, 3, 0], transition: { duration: 0.26, ease: "easeOut" } })
      }
    },
    [isMobile, barDip],
  )
  const completeLanding = useCallback((id: number) => {
    setLandings((cur) => cur.filter((x) => x.id !== id))
  }, [])

  return { lastAdded, markFlyOrigin, flights, landings, cartPulse, barDip, barTargetRef, bagTargetRef, completeFlight, completeLanding }
}

/** Los puntos en vuelo y los aterrizajes, encima de todo el POS. */
export function FlyLayer({
  flights,
  landings,
  onFlightDone,
  onLandingDone,
}: {
  flights: Flight[]
  landings: Landing[]
  onFlightDone: (flight: Flight) => void
  onLandingDone: (id: number) => void
}) {
  return (
    <>
      {/* Puntos volando al carrito, en curva Bézier (offset-path) con el
          arco de tres cuadros como reserva para navegadores viejos. Sin
          AnimatePresence a propósito: el punto desaparece justo al llegar —
          "entró al carrito" — y así onAnimationComplete corre una sola vez
          (con exit correría dos y el aterrizaje se duplicaba). */}
      {flights.map((flight) => {
        const trail = flight.kind === "trail"
        // Control de la curva: 25% del camino en x y 90px por encima del
        // punto más alto — el mismo trazo que la demo aprobada.
        const cx = flight.from.x + (flight.to.x - flight.from.x) * 0.25
        const cy = Math.min(flight.from.y, flight.to.y) - 90
        const finish = () => onFlightDone(flight)
        const common = {
          "data-fly-dot": "",
          className: `pointer-events-none fixed left-0 top-0 z-[60] rounded-full bg-amber-600 shadow-md ${
            trail ? "h-[11px] w-[11px]" : "h-4 w-4"
          }`,
          transition: { duration: flight.duration, delay: flight.delay, ease: [0.5, 0.05, 0.75, 0.5] as const },
          onAnimationComplete: finish,
        }
        // La estela nace invisible: con delay de framer el elemento ya existe
        // en el DOM, y sin esto se verían tres puntos apilados en el origen.
        return FLIGHT_PATH_SUPPORTED ? (
          <m.span
            key={flight.id}
            {...common}
            // offset-anchor por defecto centra la caja sobre el trazo: sin
            // márgenes ni translate, o quedaría corrido media caja.
            style={{
              offsetPath: `path("M ${flight.from.x} ${flight.from.y} Q ${cx} ${cy} ${flight.to.x} ${flight.to.y}")`,
              offsetRotate: "0deg",
            }}
            initial={{ offsetDistance: "0%", scale: 1, opacity: trail ? 0 : 0.95 }}
            animate={{ offsetDistance: "100%", scale: 0.4, opacity: trail ? 0.35 : 0.9 }}
          />
        ) : (
          <m.span
            key={flight.id}
            {...common}
            // Centrado con márgenes y no con translate de Tailwind: framer
            // escribe transform completo y pisaría esas clases.
            style={trail ? { marginLeft: -5.5, marginTop: -5.5 } : { marginLeft: -8, marginTop: -8 }}
            initial={{ x: flight.from.x, y: flight.from.y, scale: 1, opacity: trail ? 0 : 0.95 }}
            animate={{
              x: flight.to.x,
              y: [flight.from.y, Math.min(flight.from.y, flight.to.y) - 40, flight.to.y],
              scale: 0.4,
              opacity: trail ? 0.35 : 0.9,
            }}
          />
        )
      })}

      {/* Aterrizajes: anillo que se expande + «+1» que sube y se apaga. El
          par se retira cuando termina el «+1», que es el que dura más. */}
      {landings.map((landing) => (
        <span key={landing.id} className="pointer-events-none">
          <m.span
            className="pointer-events-none fixed z-[60] h-11 w-11 rounded-full border-[3px] border-amber-600"
            style={{ left: landing.x - 22, top: landing.y - 22 }}
            initial={{ scale: 0.25, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
          />
          <m.span
            className="pointer-events-none fixed z-[61] flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-700 px-1 text-[11px] font-bold text-white"
            style={{ left: landing.x - 10, top: landing.y - 40 }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.15, 1, 0.9], opacity: [0, 1, 1, 0], y: [0, 0, 0, -6] }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            onAnimationComplete={() => onLandingDone(landing.id)}
          >
            +1
          </m.span>
        </span>
      ))}
    </>
  )
}
