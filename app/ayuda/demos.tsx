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
