"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { m, useAnimationControls, useReducedMotion } from "framer-motion"
import { getLinePrice, type CartLine } from "./cart"
import { avisoRecuperada, type Recuperada } from "./parked"
import { factorDeLlegada, vibra } from "./pos-utils"

/** ¿El navegador sabe animar sobre una curva? (Safari viejo no; ahí el
 *  vuelo cae al arco de tres cuadros.) En SSR no existe CSS. */
const FLIGHT_PATH_SUPPORTED =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("offset-path", 'path("M 0 0 L 1 1")')

type Tono = "ambar" | "verde"
type Flight = {
  id: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  kind: "main" | "trail"
  delay: number
  duration: number
  /** Ambar = «entró un artículo»; verde = «volvió una cuenta entera». */
  tono: Tono
  /** Altura del arco en px (por omisión 90): variarla abre el chorro en abanico. */
  arco?: number
  /** Lo que dice la burbuja al aterrizar: «+1» o cuántos artículos volvieron. */
  etiqueta: string
}
type Landing = { id: number; x: number; y: number; tono: Tono; etiqueta: string }

/**
 * Lo que confirma un toque en el menú: el punto que vuela al carrito (con su
 * estela y su aterrizaje) y, en celular, el aviso en la barra de abajo con lo
 * que acaba de entrar. Vive en un hook porque necesita comparar el carrito
 * anterior con el nuevo, y esa comparación es una sola aunque la pinten dos
 * cosas distintas.
 */
export function useCartFeedback({
  lines,
  isMobile,
  cartOpen,
  recuperada,
}: {
  lines: CartLine[]
  isMobile: boolean
  cartOpen: boolean
  /** Una cuenta (o la última venta) que acaba de volver entera al carrito. */
  recuperada: Recuperada | null
}) {
  // ── "¿Sí lo agregó?" (móvil) ──
  // En tablet ves el carrito crecer al tocar un producto; en celular solo
  // cambia un numerito en la barra de abajo. Ese silencio provoca dobles
  // toques. Se detecta la línea nueva (o la cantidad que subió) comparando
  // con el carrito anterior y la barra lo dice con nombre, precio y una
  // vibración corta. Con la hoja abierta no hace falta: el carrito se ve.
  const [lastAdded, setLastAdded] = useState<{ label: string; price: number; key: number } | null>(null)
  const prevLinesRef = useRef<CartLine[]>(lines)
  // ── "Volvió la cuenta" (móvil) ──
  // Al abrir una cuenta el carrito cambia entero; eso no es «un artículo
  // más» y la barra no debe decir «+ Latte $40» como si se hubiera tocado
  // algo. Dice lo que pasó: qué cuenta volvió y con cuántos artículos.
  const [aviso, setAviso] = useState<{ label: string; key: number } | null>(null)
  const recuperadaKeyRef = useRef<number | null>(null)

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
  const [flights, setFlights] = useState<Flight[]>([])
  // Aterrizajes: el anillo que se expande y el «+1» que rebota donde cayó el
  // punto. Los dispara SOLO el punto principal — la estela aterriza muda.
  const [landings, setLandings] = useState<Landing[]>([])
  const [cartPulse, setCartPulse] = useState(0)
  /**
   * Cuánto del total se enseña mientras la cuenta aterriza: 1 es «ya está
   * todo». Sube de 0 a 1 solo al recuperar una cuenta, nunca al agregar un
   * artículo — ahí el número tiene que ser exacto desde el primer cuadro,
   * porque puede haber una mano yendo al botón de cobrar.
   */
  const [factorLlegada, setFactorLlegada] = useState(1)
  const cuentaRegresiva = useRef<number | null>(null)
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
  // Para retomar una cuenta: el chip se mide al tocarlo, pero el vuelo se
  // apunta DESPUÉS de las comprobaciones que pueden abortar (productos que ya
  // no están en el menú), para no dejar un origen colgado que luego haga
  // volar un punto desde un chip que nadie tocó.
  const marcarOrigenEn = useCallback((x: number, y: number) => {
    flyOriginRef.current = { x, y }
  }, [])

  useEffect(() => {
    if (recuperada && recuperada.key !== recuperadaKeyRef.current) {
      // Volvió una cuenta entera. No es «+ Latte», así que no se dice como un
      // alta suelta: desde el chip que se tocó sale un CHORRO de puntos verdes
      // hacia el carrito, y al aterrizar la burbuja dice cuántos artículos
      // volvieron. Es el mismo gesto que ya se entiende al agregar un
      // producto, en plural y en otro color, porque lo que pasó es otra cosa.
      recuperadaKeyRef.current = recuperada.key
      prevLinesRef.current = lines
      const origen = flyOriginRef.current
      flyOriginRef.current = null
      setLastAdded(null)
      if (isMobile && !cartOpen) {
        setAviso({ label: avisoRecuperada(recuperada.name, recuperada.articulos), key: recuperada.key })
      }
      if (!reducedMotion) {
        // El total sube mientras caen los puntos. Con movimiento reducido no:
        // ahí el número aparece completo de una vez.
        if (cuentaRegresiva.current !== null) cancelAnimationFrame(cuentaRegresiva.current)
        const t0 = performance.now()
        setFactorLlegada(0)
        const paso = () => {
          const f = factorDeLlegada(performance.now() - t0)
          setFactorLlegada(f)
          if (f < 1) cuentaRegresiva.current = requestAnimationFrame(paso)
          else cuentaRegresiva.current = null
        }
        cuentaRegresiva.current = requestAnimationFrame(paso)
      }
      if (origen && !reducedMotion) {
        const targetEl = isMobile ? barTargetRef.current : bagTargetRef.current
        if (targetEl) {
          const r = targetEl.getBoundingClientRect()
          const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          // Un punto por artículo, entre 3 y 6: menos no se lee como «varios»
          // y más convierte la pantalla en confeti. Salen escalonados y con
          // arcos distintos, así que se ven como un chorro y no como un punto
          // gordo. El primero es el principal: el que aterriza y pone la cifra.
          const cuantos = Math.min(Math.max(recuperada.articulos, 3), 6)
          const etiqueta = String(recuperada.articulos)
          setFlights((cur) => [
            ...cur,
            ...Array.from({ length: cuantos }, (_, i) => ({
              id: ++flightSeq.current,
              from: origen,
              to,
              kind: (i === 0 ? "main" : "trail") as "main" | "trail",
              delay: i * 0.09,
              duration: 0.52,
              tono: "verde" as const,
              arco: 80 + i * 22,
              etiqueta,
            })),
          ])
        }
      }
      return
    }
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
          { id: ++flightSeq.current, from: origin, to, kind: "main", delay: 0, duration: 0.48, tono: "ambar", etiqueta: "+1" },
          { id: ++flightSeq.current, from: origin, to, kind: "trail", delay: 0.09, duration: 0.42, tono: "ambar", etiqueta: "+1" },
          { id: ++flightSeq.current, from: origin, to, kind: "trail", delay: 0.16, duration: 0.36, tono: "ambar", etiqueta: "+1" },
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
  }, [lines, isMobile, cartOpen, reducedMotion, recuperada])
  useEffect(() => {
    if (!lastAdded) return
    const t = setTimeout(() => setLastAdded(null), 1800)
    return () => clearTimeout(t)
  }, [lastAdded])
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 2600)
    return () => clearTimeout(t)
  }, [aviso])
  useEffect(
    () => () => {
      if (cuentaRegresiva.current !== null) cancelAnimationFrame(cuentaRegresiva.current)
    },
    [],
  )

  /** Terminó de volar un punto: se retira y, si era el principal, aterriza. */
  const completeFlight = useCallback(
    (flight: Flight) => {
      setFlights((cur) => cur.filter((x) => x.id !== flight.id))
      if (flight.kind === "trail") return
      // Solo el principal aterriza: rebote de la bolsa (escritorio),
      // anillo + «+1», y el hundimiento de la barra (celular).
      setCartPulse((c) => c + 1)
      setLandings((cur) => [...cur, { id: ++flightSeq.current, x: flight.to.x, y: flight.to.y, tono: flight.tono, etiqueta: flight.etiqueta }])
      if (isMobile) {
        barDip.start({ y: [0, 3, 0], transition: { duration: 0.26, ease: "easeOut" } })
      }
    },
    [isMobile, barDip],
  )
  const completeLanding = useCallback((id: number) => {
    setLandings((cur) => cur.filter((x) => x.id !== id))
  }, [])

  return { lastAdded, aviso, markFlyOrigin, marcarOrigenEn, flights, landings, cartPulse, factorLlegada, barDip, barTargetRef, bagTargetRef, completeFlight, completeLanding }
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
        const verde = flight.tono === "verde"
        // Control de la curva: 25% del camino en x y 90px por encima del
        // punto más alto — el mismo trazo que la demo aprobada. El chorro de
        // una cuenta recuperada manda su propio arco para abrirse en abanico.
        const cx = flight.from.x + (flight.to.x - flight.from.x) * 0.25
        // La cima del arco no sale de la pantalla: los chips de cuentas viven
        // pegados al borde de arriba y con 90px de arco los puntos volaban
        // fuera del cuadro —se veía un salto, no un vuelo—. Con el tope, desde
        // arriba el trazo se aplana en vez de perderse.
        const cy = Math.max(14, Math.min(flight.from.y, flight.to.y) - (flight.arco ?? 90))
        const finish = () => onFlightDone(flight)
        // Los puntos verdes son un poco más grandes y menos translúcidos que
        // la estela ámbar: aquí la estela ES el mensaje, no un adorno.
        const opacidadFinal = trail ? (verde ? 0.75 : 0.35) : 0.9
        const medio = trail ? (verde ? 7 : 5.5) : 8
        const common = {
          "data-fly-dot": "",
          className: `pointer-events-none fixed left-0 top-0 z-[60] rounded-full shadow-md ${
            verde ? "bg-emerald-500" : "bg-amber-600"
          } ${trail ? (verde ? "h-3.5 w-3.5" : "h-[11px] w-[11px]") : "h-4 w-4"}`,
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
            animate={{ offsetDistance: "100%", scale: verde ? 0.55 : 0.4, opacity: opacidadFinal }}
          />
        ) : (
          <m.span
            key={flight.id}
            {...common}
            // Centrado con márgenes y no con translate de Tailwind: framer
            // escribe transform completo y pisaría esas clases.
            style={{ marginLeft: -medio, marginTop: -medio }}
            initial={{ x: flight.from.x, y: flight.from.y, scale: 1, opacity: trail ? 0 : 0.95 }}
            animate={{
              x: flight.to.x,
              y: [flight.from.y, Math.max(14, Math.min(flight.from.y, flight.to.y) - 40), flight.to.y],
              scale: verde ? 0.55 : 0.4,
              opacity: opacidadFinal,
            }}
          />
        )
      })}

      {/* Aterrizajes: anillo que se expande + «+1» que sube y se apaga. El
          par se retira cuando termina el «+1», que es el que dura más. */}
      {landings.map((landing) => (
        <span key={landing.id} className="pointer-events-none">
          <m.span
            className={`pointer-events-none fixed z-[60] h-11 w-11 rounded-full border-[3px] ${
              landing.tono === "verde" ? "border-emerald-500" : "border-amber-600"
            }`}
            style={{ left: landing.x - 22, top: landing.y - 22 }}
            initial={{ scale: 0.25, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
          />
          <m.span
            className={`pointer-events-none fixed z-[61] flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${
              landing.tono === "verde" ? "bg-emerald-600" : "bg-amber-700"
            }`}
            style={{ left: landing.x - 10, top: landing.y - 40 }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.15, 1, 0.9], opacity: [0, 1, 1, 0], y: [0, 0, 0, -6] }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            onAnimationComplete={() => onLandingDone(landing.id)}
          >
            {landing.etiqueta}
          </m.span>
        </span>
      ))}
    </>
  )
}
