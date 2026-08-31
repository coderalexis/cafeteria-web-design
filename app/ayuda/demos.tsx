"use client"

import { useRef, useState } from "react"
import { Delete } from "lucide-react"
import QRCode from "react-qr-code"
import { COLOR_CLASSES, DEFAULT_CHIP_ACTIVE } from "@/lib/category-colors"
import { formatCurrency } from "@/lib/format"

/**
 * Demos de la guía. Las visuales usan las MISMAS clases que el POS real, y las
 * interactivas la misma aritmética: si el sistema cambia, esto se toca junto.
 * En papel no sirven (print:hidden); el texto de cada sección se basta solo.
 */

function MarcoDemo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-stone-200 bg-stone-100/60 p-3 print:hidden">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{titulo}</p>
      {children}
    </div>
  )
}

/* ── Mini POS: chips de colores, más vendidos y tarjetas ──────────── */
export function DemoPOS() {
  const [activa, setActiva] = useState("todos")
  const chips = [
    { id: "todos", label: "Todos", clases: null },
    { id: "cafe", label: "Con café", clases: COLOR_CLASSES.amber },
    { id: "leche", label: "A base de leche", clases: COLOR_CLASSES.emerald },
    { id: "crepas", label: "Crepas", clases: COLOR_CLASSES.rose },
  ]
  return (
    <MarcoDemo titulo="Así se ve — puedes tocar las pestañas">
      <div className="rounded-lg bg-stone-50 p-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiva(c.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activa === c.id
                  ? (c.clases?.chipActive ?? DEFAULT_CHIP_ACTIVE)
                  : (c.clases?.chip ?? "border-stone-300 text-stone-600 hover:bg-stone-100")
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {activa === "todos" && (
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">★ Más vendidos</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {["Latte · Grande", "Espresso · Chico"].map((f) => (
                <span key={f} className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700">
                  {f} <span className="font-bold text-amber-700">$60</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { n: "Latte", p: "$45 – $60", tono: COLOR_CLASSES.emerald },
            { n: "Crepa de cajeta", p: "$65", tono: COLOR_CLASSES.rose },
          ].map((prod) => (
            <div key={prod.n} className="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-2.5">
              <span aria-hidden className={`absolute bottom-0 left-0 top-0 w-1 ${prod.tono.accent}`} />
              <p className="text-xs font-semibold text-stone-800">{prod.n}</p>
              <p className="text-sm font-bold text-amber-700">{prod.p}</p>
            </div>
          ))}
        </div>
      </div>
    </MarcoDemo>
  )
}

/* ── Efectivo: practica el cambio con la misma lógica del POS ─────── */
export function DemoEfectivo() {
  const TOTAL = 97
  const [recibido, setRecibido] = useState("")
  const n = recibido === "" ? null : Number(recibido)
  const cambio = n === null || Number.isNaN(n) ? null : Math.round((n - TOTAL) * 100) / 100

  // Mismo actualizador funcional que el POS: dos toques seguidos se encadenan.
  const teclear = (k: string) => setRecibido((prev) => (prev + k).replace(/^0+(?=\d)/, "").slice(0, 6))

  return (
    <MarcoDemo titulo="Pruébalo — un cliente te paga una cuenta de $97.00">
      <div className="max-w-xs space-y-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-stone-500">Efectivo recibido</p>

        <div className="rounded-lg border border-green-200 bg-green-50/60 p-3 text-center">
          <p className="text-[11px] font-medium text-green-800">A cobrar {formatCurrency(TOTAL)}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-green-900">
            {recibido === "" ? "—" : formatCurrency(Number(recibido))}
          </p>
          <p
            className={`mt-0.5 text-xs font-semibold ${
              cambio === null ? "text-stone-400" : cambio < 0 ? "text-red-600" : "text-green-700"
            }`}
          >
            {cambio === null
              ? "Cambio —"
              : cambio < 0
                ? `Faltan ${formatCurrency(-cambio)}`
                : `Cambio ${formatCurrency(cambio)}`}
          </p>
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setRecibido(String(TOTAL))}
            className="flex-1 rounded-lg border border-green-300 bg-white py-1.5 text-xs font-semibold text-green-800 hover:bg-green-50"
          >
            Exacto
          </button>
          {[50, 100, 200].map((m) => (
            <button
              key={m}
              type="button"
              disabled={m < TOTAL}
              onClick={() => setRecibido(String(m))}
              className="flex-1 rounded-lg border border-green-300 bg-white py-1.5 text-xs font-semibold text-green-800 hover:bg-green-50 disabled:opacity-40"
            >
              ${m}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => teclear(k)}
              className="rounded-lg border border-stone-200 bg-white py-2.5 text-base font-semibold text-stone-800 hover:bg-stone-50 active:bg-stone-100"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRecibido((prev) => prev.slice(0, -1))}
            aria-label="Borrar el último dígito"
            className="flex items-center justify-center rounded-lg border border-stone-200 bg-white py-2.5 text-stone-600 hover:bg-stone-50 active:bg-stone-100"
          >
            <Delete className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[11px] text-stone-500">
          El $50 aparece apagado porque no alcanza para $97 — el POS hace lo mismo.
        </p>
      </div>
    </MarcoDemo>
  )
}

/* ── Propina: porcentajes sobre el total, cobro aparte ────────────── */
export function DemoPropina() {
  const TOTAL = 158
  const [tip, setTip] = useState<number | "otro">(0)
  const [otro, setOtro] = useState("")
  const monto = tip === "otro" ? Math.max(0, Number(otro) || 0) : Math.round(TOTAL * tip) / 100
  const cobrar = Math.round((TOTAL + monto) * 100) / 100

  return (
    <MarcoDemo titulo="Pruébalo — la cuenta es de $158.00">
      <div className="max-w-sm space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-stone-500">Propina</span>
          {([0, 5, 10, 15, "otro"] as const).map((op) => (
            <button
              key={String(op)}
              type="button"
              onClick={() => setTip(op)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                tip === op
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-stone-200 bg-white text-stone-500 hover:border-emerald-300"
              }`}
            >
              {op === "otro" ? "Otro" : op === 0 ? "Sin" : `${op}%`}
            </button>
          ))}
          {tip === "otro" && (
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              placeholder="$"
              className="h-7 w-20 rounded-md border border-stone-200 px-2 text-sm font-semibold"
            />
          )}
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-2.5 text-sm">
          <div className="flex justify-between text-stone-500">
            <span>Total (tu venta)</span>
            <span className="font-semibold text-stone-700">{formatCurrency(TOTAL)}</span>
          </div>
          {monto > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Propina (aparte)</span>
              <span>+{formatCurrency(monto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-stone-100 pt-1 font-bold text-stone-800">
            <span>El botón dirá</span>
            <span>Cobrar {formatCurrency(cobrar)}</span>
          </div>
        </div>
      </div>
    </MarcoDemo>
  )
}

/* ── Corte: cuenta el efectivo y ve la diferencia ─────────────────── */
export function DemoDiferencia() {
  const ESPERADO = 1540
  const [contado, setContado] = useState("")
  const n = contado === "" ? null : Number(contado)
  const diff = n === null || Number.isNaN(n) ? null : Math.round((n - ESPERADO) * 100) / 100

  return (
    <MarcoDemo titulo="Pruébalo — el sistema espera $1,540.00 en el cajón">
      <div className="flex max-w-sm flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={contado}
          onChange={(e) => setContado(e.target.value)}
          placeholder="¿Cuánto contaste?"
          className="h-9 w-40 rounded-md border border-stone-200 bg-white px-2.5 text-sm font-semibold"
        />
        {diff !== null && (
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              diff === 0
                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                : diff > 0
                ? "border-blue-200 bg-blue-100 text-blue-700"
                : "border-red-200 bg-red-100 text-red-700"
            }`}
          >
            {diff === 0 ? "Cuadró" : diff > 0 ? `Sobrante ${formatCurrency(diff)}` : `Faltante ${formatCurrency(-diff)}`}
          </span>
        )}
        <p className="w-full text-[11px] text-stone-500">
          Prueba 1540, 1600 y 1500: verde cuadró, azul sobrante, rojo faltante — los mismos colores del panel de cortes.
        </p>
      </div>
    </MarcoDemo>
  )
}

/* ── Impresión real: el mismo texto que sale de la térmica ────────── */
export function TicketImpreso({ lineas, titulo }: { lineas: string[]; titulo: string }) {
  return (
    <div className="mt-4 max-w-[19rem]">
      <div className="rounded-lg bg-white p-3 shadow-md ring-1 ring-stone-200">
        <pre className="overflow-x-auto whitespace-pre font-mono text-[10px] leading-[1.45] text-stone-700">
          {lineas.join("\n")}
        </pre>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-stone-400">{titulo}</p>
    </div>
  )
}

/* ── QR: cómo se ve el cartel del menú ────────────────────────────── */
export function DemoQR() {
  return (
    <MarcoDemo titulo="Así se ve el cartel para las mesas">
      <div className="w-fit rounded-xl border border-stone-200 bg-white p-4 text-center">
        <p className="text-sm font-bold text-stone-800">Tu cafetería</p>
        <p className="text-[11px] text-stone-500">Escanea para ver el menú</p>
        <div className="mx-auto mt-2 w-fit rounded bg-white p-1.5">
          <QRCode value="https://cafecitopos.com" size={88} level="M" />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">Este de muestra lleva a cafecitopos.com; el tuyo llevará a tu menú.</p>
    </MarcoDemo>
  )
}

/* ── Gestos del carrito: practica tocar, deslizar y mantener ──────── */
export function DemoGestos() {
  const [qty, setQty] = useState(1)
  const [estado, setEstado] = useState<"normal" | "detalle" | "nota" | "quitada">("normal")
  const [nota, setNota] = useState("")
  const [dx, setDx] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  // El gesto vivo va en un REF, como en el POS real: los pointermove de un
  // manotazo rápido llegan antes de que React re-renderice, y un estado aún
  // sin asentar los perdería. El estado solo pinta (dx mueve la tarjeta).
  const gestoRef = useRef<{ x: number; t: number; dx: number; timer: ReturnType<typeof setTimeout> } | null>(null)

  const abajo = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return
    const timer = setTimeout(() => {
      const g = gestoRef.current
      if (g && Math.abs(g.dx) <= 10) {
        g.t = 0 // ya no cuenta como toque
        setEstado("nota")
        setAviso(null)
      }
    }, 500)
    gestoRef.current = { x: e.clientX, t: Date.now(), dx: 0, timer }
  }
  const mueve = (e: React.PointerEvent) => {
    const g = gestoRef.current
    if (!g) return
    g.dx = e.clientX - g.x
    if (Math.abs(g.dx) > 10) clearTimeout(g.timer)
    setDx(Math.max(-120, Math.min(120, g.dx)))
  }
  const suelta = () => {
    const g = gestoRef.current
    gestoRef.current = null
    if (!g) return
    clearTimeout(g.timer)
    if (g.dx > 70) {
      setQty((q) => {
        setAviso("¡Duplicado! Ahora son " + (q + 1))
        return q + 1
      })
    } else if (g.dx < -70) {
      setEstado("quitada")
    } else if (Math.abs(g.dx) < 10 && g.t > 0 && Date.now() - g.t < 500 && estado === "normal") {
      setEstado("detalle")
      setAviso(null)
    }
    setDx(0)
  }

  const reinicia = () => {
    setQty(1)
    setNota("")
    setEstado("normal")
    setAviso(null)
  }

  return (
    <MarcoDemo titulo="Practica aquí mismo — esta línea responde como las del carrito">
      {estado === "quitada" ? (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-stone-300 bg-white px-3 py-4 text-sm text-stone-400">
          La línea se quitó del carrito.
          <button onClick={reinicia} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600 hover:border-amber-400">
            Traerla de vuelta
          </button>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg">
            <div aria-hidden className="absolute inset-0 flex items-center justify-between rounded-lg bg-stone-200/70 px-3 text-xs font-bold">
              <span className="text-emerald-700">→ Duplicar</span>
              <span className="text-red-600">Quitar ←</span>
            </div>
            <div
              onPointerDown={abajo}
              onPointerMove={mueve}
              onPointerUp={suelta}
              onPointerCancel={suelta}
              onContextMenu={(e) => e.preventDefault()}
              style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
              className="relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-stone-800">Latte · Grande</span>
                <span className="text-xs text-stone-400">{formatCurrency(50)}</span>
                {nota && <span className="block truncate text-[11px] italic text-stone-500">📝 {nota}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-bold text-stone-700">{qty}</span>
                <span className="text-sm font-bold text-stone-800">{formatCurrency(50 * qty)}</span>
                <span className="text-stone-300">⋯</span>
              </span>
            </div>
          </div>
          {aviso && <p className="mt-2 text-xs font-medium text-emerald-700">{aviso}</p>}
          {estado === "detalle" && (
            <div className="mt-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
              <p className="font-semibold text-stone-800">Latte · Grande</p>
              <p className="mt-1 text-xs text-stone-500">Así se ve la ventana de detalle: nombre completo, opciones, nota y las cuentas.</p>
              <div className="mt-2 flex justify-between text-xs text-stone-600">
                <span>Cantidad {qty} × {formatCurrency(50)}</span>
                <span className="font-bold text-stone-800">{formatCurrency(50 * qty)}</span>
              </div>
              <button onClick={() => setEstado("normal")} className="mt-2 rounded-md border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-600 hover:border-amber-400">
                Cerrar
              </button>
            </div>
          )}
          {estado === "nota" && (
            <input
              autoFocus
              placeholder="ej. sin azúcar — y toca afuera para guardar"
              defaultValue={nota}
              maxLength={60}
              onBlur={(e) => {
                setNota(e.target.value.trim())
                setEstado("normal")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur()
              }}
              className="mt-2 w-full rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-sm"
            />
          )}
          {qty > 1 && (
            <button onClick={reinicia} className="mt-2 text-[11px] text-stone-400 underline underline-offset-2 hover:text-stone-600">
              reiniciar la demo
            </button>
          )}
        </>
      )}
    </MarcoDemo>
  )
}

/* ── Cuentas: abrir, sumar rondas, cobrar (o fiar) ────────────────── */

interface DemoItem {
  nombre: string
  precio: number
}
interface DemoCuentaFila {
  id: number
  nombre: string
  items: DemoItem[]
  fiado: boolean
}

const CARTA: DemoItem[] = [
  { nombre: "Capuchino", precio: 45 },
  { nombre: "Croissant", precio: 35 },
]

/**
 * El ciclo completo de una cuenta, tocable.
 *
 * Es el concepto que más cuesta explicar por escrito —que el carrito deja de
 * ser «una venta» y pasa a ser «lo que lleva la mesa 3»—, y la parte que de
 * verdad se entiende al hacerla es que el nombre se escribe UNA vez: en la
 * segunda ronda el botón ya dice «Guardar en Mesa 1».
 *
 * El contador de «Vendido hoy» está a propósito: enseña, sin una línea de
 * texto, que abrir una cuenta o fiarla no mueve la venta, y que cobrar sí.
 */
export function DemoCuenta() {
  const [cuentas, setCuentas] = useState<DemoCuentaFila[]>([])
  const [carrito, setCarrito] = useState<DemoItem[]>([])
  /** Cuál cuenta está abierta EN el carrito (lo que le da continuidad). */
  const [abierta, setAbierta] = useState<number | null>(null)
  const [nombrando, setNombrando] = useState(false)
  const [verCuenta, setVerCuenta] = useState<number | null>(null)
  const [fiando, setFiando] = useState<number | null>(null)
  const [vendido, setVendido] = useState(0)
  const [narrador, setNarrador] = useState("Agrega algo y abre una cuenta a nombre de la mesa.")
  const siguienteId = useRef(1)

  const suma = (items: DemoItem[]) => items.reduce((s, i) => s + i.precio, 0)
  const cuentaAbierta = cuentas.find((c) => c.id === abierta) ?? null
  const enPantalla = cuentas.filter((c) => c.id !== abierta)
  const delDia = enPantalla.filter((c) => !c.fiado)
  const porCobrar = enPantalla.filter((c) => c.fiado)

  const reiniciar = () => {
    setCuentas([])
    setCarrito([])
    setAbierta(null)
    setNombrando(false)
    setVerCuenta(null)
    setFiando(null)
    setVendido(0)
    setNarrador("Agrega algo y abre una cuenta a nombre de la mesa.")
    siguienteId.current = 1
  }

  const abrirCuenta = (nombre: string) => {
    const id = siguienteId.current++
    setCuentas((cs) => [...cs, { id, nombre, items: carrito, fiado: false }])
    setCarrito([])
    setNombrando(false)
    setNarrador(`«${nombre}» quedó abierta y el carrito está libre. Nadie ha pagado nada.`)
  }

  const guardarRonda = () => {
    if (!cuentaAbierta) return
    setCuentas((cs) => cs.map((c) => (c.id === cuentaAbierta.id ? { ...c, items: carrito } : c)))
    setCarrito([])
    setAbierta(null)
    setNarrador(`Se guardó en «${cuentaAbierta.nombre}» — fíjate que no te volvió a pedir el nombre.`)
  }

  const abrir = (c: DemoCuentaFila) => {
    setAbierta(c.id)
    setCarrito(c.items)
    setVerCuenta(null)
    setNarrador(
      c.fiado
        ? `Volvió a pagar: «${c.nombre}» está en el carrito. Cóbrala como cualquier venta.`
        : `«${c.nombre}» está en el carrito. Agrégale otra ronda y guárdala.`,
    )
  }

  /** Sirve igual con cuenta abierta que para una venta suelta de mostrador. */
  const cobrar = () => {
    if (carrito.length === 0) return
    setVendido((v) => v + suma(carrito))
    if (cuentaAbierta) setCuentas((cs) => cs.filter((c) => c.id !== cuentaAbierta.id))
    setCarrito([])
    setAbierta(null)
    setNarrador(
      cuentaAbierta
        ? "Cobrada. AHORA sí subió «Vendido hoy»: la venta se registra el día que te pagan."
        : "Venta de mostrador: se cobra y se acabó, sin abrir ninguna cuenta.",
    )
  }

  const marcarFiado = (id: number) => {
    const c = cuentas.find((x) => x.id === id)
    setCuentas((cs) => cs.map((x) => (x.id === id ? { ...x, fiado: true } : x)))
    setFiando(null)
    setNarrador(`«${c?.nombre}» pasó a Por cobrar. «Vendido hoy» NO se movió: todavía nadie pagó.`)
  }

  const chip = "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"

  return (
    <MarcoDemo titulo="Pruébalo — así funciona una mesa que paga al final">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Carrito */}
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-bold text-stone-800">
              {cuentaAbierta ? cuentaAbierta.nombre : "Venta Actual"}
            </p>
            <span className="shrink-0 text-[11px] text-stone-400">Vendido hoy {formatCurrency(vendido)}</span>
          </div>

          <div className="mt-2 space-y-1">
            {carrito.length === 0 ? (
              <p className="py-2 text-xs text-stone-400">Carrito vacío.</p>
            ) : (
              carrito.map((i, k) => (
                <div key={k} className="flex justify-between text-sm text-stone-700">
                  <span>1× {i.nombre}</span>
                  <span className="font-semibold">{formatCurrency(i.precio)}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
            {CARTA.map((p) => (
              <button
                key={p.nombre}
                type="button"
                onClick={() => setCarrito((c) => [...c, p])}
                className={`${chip} border-stone-200 bg-white text-stone-600 hover:border-amber-400 hover:text-amber-700`}
              >
                + {p.nombre}
              </button>
            ))}
          </div>

          {carrito.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cuentaAbierta ? (
                <button
                  type="button"
                  onClick={guardarRonda}
                  className={`${chip} border-amber-600 bg-amber-600 text-white`}
                >
                  Guardar en {cuentaAbierta.nombre}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setNombrando(true)}
                  className={`${chip} border-amber-600 bg-amber-600 text-white`}
                >
                  Abrir cuenta
                </button>
              )}
              <button
                type="button"
                onClick={cobrar}
                className={`${chip} border-emerald-600 bg-emerald-600 text-white`}
              >
                Cobrar {formatCurrency(suma(carrito))}
              </button>
            </div>
          )}

          {nombrando && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
              <p className="text-[11px] font-semibold text-amber-900">¿A nombre de quién?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["Mesa 1", "Mesa 2", "Juan"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => abrirCuenta(n)}
                    className={`${chip} border-stone-200 bg-white text-stone-600 hover:border-amber-400`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lista de cuentas */}
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          <p className="text-sm font-bold text-stone-800">Cuentas abiertas ({delDia.length})</p>

          {delDia.length === 0 && porCobrar.length === 0 ? (
            <p className="py-3 text-xs text-stone-400">Ninguna todavía.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {delDia.map((c) => (
                <FilaCuenta
                  key={c.id}
                  c={c}
                  total={suma(c.items)}
                  onAbrir={() => abrir(c)}
                  onVer={() => setVerCuenta(verCuenta === c.id ? null : c.id)}
                  onFiar={() => setFiando(c.id)}
                  viendo={verCuenta === c.id}
                />
              ))}

              {porCobrar.length > 0 && (
                <>
                  <p className="pt-2 text-xs font-bold text-red-700">Por cobrar ({porCobrar.length})</p>
                  {porCobrar.map((c) => (
                    <FilaCuenta
                      key={c.id}
                      c={c}
                      total={suma(c.items)}
                      onAbrir={() => abrir(c)}
                      onVer={() => setVerCuenta(verCuenta === c.id ? null : c.id)}
                      onFiar={null}
                      viendo={verCuenta === c.id}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {fiando !== null && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
              <p className="text-[11px] text-red-900">
                Pasa a <strong>Por cobrar</strong> y deja de caducar. No se registra ninguna venta.
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => marcarFiado(fiando)}
                  className={`${chip} border-red-600 bg-red-600 text-white`}
                >
                  Pasar a Por cobrar
                </button>
                <button
                  type="button"
                  onClick={() => setFiando(null)}
                  className={`${chip} border-stone-200 bg-white text-stone-500`}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs font-medium text-amber-800">{narrador}</p>
      {(cuentas.length > 0 || vendido > 0) && (
        <button
          type="button"
          onClick={reiniciar}
          className="mt-1 text-[11px] text-stone-400 underline underline-offset-2 hover:text-stone-600"
        >
          reiniciar la demo
        </button>
      )}
    </MarcoDemo>
  )
}

function FilaCuenta({
  c,
  total,
  onAbrir,
  onVer,
  onFiar,
  viendo,
}: {
  c: DemoCuentaFila
  total: number
  onAbrir: () => void
  onVer: () => void
  onFiar: (() => void) | null
  viendo: boolean
}) {
  const chip = "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors"
  return (
    <div className={`rounded-lg border p-2 ${c.fiado ? "border-red-200 bg-red-50/60" : "border-stone-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onVer} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-stone-800">{c.nombre}</p>
          <p className="text-[11px] text-stone-500">
            <span className={c.fiado ? "font-semibold text-red-700" : ""}>
              {c.fiado ? "debe desde hoy" : "abierta recién"}
            </span>{" "}
            · {c.items.length} artículo{c.items.length === 1 ? "" : "s"} · {formatCurrency(total)}
          </p>
        </button>
        <button
          type="button"
          onClick={onAbrir}
          className={`${chip} shrink-0 border-amber-600 bg-amber-600 text-white`}
        >
          {c.fiado ? "Cobrar" : "Abrir"}
        </button>
      </div>

      {viendo && (
        <div className="mt-2 rounded-md border border-stone-200 bg-stone-50 p-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">La cuenta</p>
          {c.items.map((i, k) => (
            <div key={k} className="flex justify-between text-xs text-stone-600">
              <span>1× {i.nombre}</span>
              <span>{formatCurrency(i.precio)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-stone-200 pt-1 text-xs font-bold text-stone-800">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <p className="mt-1 text-center text-[10px] font-semibold text-amber-800">
            Pendiente de pago · no es comprobante
          </p>
          {onFiar && (
            <button
              type="button"
              onClick={onFiar}
              className="mt-1.5 w-full rounded-md border border-stone-200 bg-white py-1 text-[11px] font-semibold text-stone-500 hover:border-red-300 hover:text-red-700"
            >
              Se fue sin pagar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
