"use client"

import { useState } from "react"
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

  const teclear = (k: string) =>
    setRecibido((prev) => (k === "C" ? "" : (prev + k).replace(/^0+(?=\d)/, "").slice(0, 6)))

  return (
    <MarcoDemo titulo="Pruébalo — un cliente te paga una cuenta de $97.00">
      <div className="max-w-sm space-y-2 rounded-lg border border-green-200 bg-green-50/60 p-2.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-green-800">Recibido</span>
          <div className="h-9 flex-1 rounded-md border border-green-200 bg-white px-2.5 text-sm font-semibold leading-9 text-stone-800">
            {recibido || <span className="font-normal text-stone-300">Toca el teclado</span>}
          </div>
          <span
            className={`min-w-[7rem] shrink-0 text-right text-sm font-bold ${
              cambio === null ? "text-stone-400" : cambio < 0 ? "text-red-600" : "text-green-700"
            }`}
          >
            {cambio === null ? "Cambio —" : cambio < 0 ? `Faltan ${formatCurrency(-cambio)}` : `Cambio ${formatCurrency(cambio)}`}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "C"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => teclear(k)}
              className="rounded-md border border-green-200 bg-white py-1.5 text-sm font-semibold text-green-900 hover:bg-green-100 active:bg-green-200"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setRecibido(String(TOTAL))}
            className="flex-1 rounded-md border border-green-200 bg-white py-1 text-xs font-semibold text-green-800 hover:bg-green-100"
          >
            Exacto
          </button>
          {[50, 100, 200].map((m) => (
            <button
              key={m}
              type="button"
              disabled={m < TOTAL}
              onClick={() => setRecibido(String(m))}
              className="flex-1 rounded-md border border-green-200 bg-white py-1 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-40"
            >
              ${m}
            </button>
          ))}
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
