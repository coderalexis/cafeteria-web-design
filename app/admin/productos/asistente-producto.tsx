"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Check, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { CHOICE_PRESETS, choiceHint, type ChoiceKey } from "@/lib/modifiers"
import { formatCurrency } from "@/lib/format"
import { createProductGuided } from "@/app/actions/menu"
import {
  NUEVA_CATEGORIA,
  PRESETS_PREGUNTA,
  armarPayload,
  ejemploTotal,
  estadoInicial,
  nuevaKey,
  pesos,
  pistaPregunta,
  validarPaso,
  type EstadoGuiado,
  type PreguntaNueva,
} from "@/lib/producto-guiado"
import type { ModifierGroupOption } from "./productos-client"

/**
 * «Nuevo producto», de la mano.
 *
 * Cuatro pasos con una sola pregunta cada uno —qué vendes, cuánto cuesta,
 * qué se le pregunta al cajero, así se verá— y en cada paso lo justo de
 * explicación. Los extras se crean AQUÍ, no en otra pantalla: el pretexto de
 * siempre era «no sé cómo poner que elijan la proteína», y la respuesta es
 * un botón que ya trae Pollo/Pescado/Res para corregir en vez de inventar.
 * Al final todo entra en una sola transacción (create_product_guided): no
 * hay forma de dejar el producto sin precio o la pregunta sin enganchar.
 */
const PASOS = ["¿Qué vendes?", "¿Cuánto cuesta?", "¿Se pregunta algo al cobrar?", "Así se verá"] as const

const PRESETS_TAMANO: { etiqueta: string; nombres: string[] }[] = [
  { etiqueta: "Chico / Grande", nombres: ["Chico", "Grande"] },
  { etiqueta: "Chico / Mediano / Grande", nombres: ["Chico", "Mediano", "Grande"] },
  { etiqueta: "1 porción / 2 porciones", nombres: ["1 porción", "2 porciones"] },
  { etiqueta: "Media / Completa", nombres: ["Media", "Completa"] },
]

export function AsistenteProducto({
  categories,
  groups,
  onClose,
}: {
  categories: { id: string; name: string }[]
  groups: ModifierGroupOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1)
  const [e, setE] = useState<EstadoGuiado>(estadoInicial)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()
  const set = (patch: Partial<EstadoGuiado>) => {
    setAviso(null)
    setE((cur) => ({ ...cur, ...patch }))
  }
  const existentesVivos = groups.filter((g) => g.isActive && g.options.length > 0)

  const siguiente = () => {
    if (paso === 4) return
    const falta = validarPaso(e, paso)
    if (falta) {
      setAviso(falta)
      return
    }
    setAviso(null)
    setPaso((p) => (p + 1) as 1 | 2 | 3 | 4)
  }
  const atras = () => {
    setAviso(null)
    setPaso((p) => Math.max(1, p - 1) as 1 | 2 | 3 | 4)
  }
  const crear = () => {
    for (const p of [1, 2, 3] as const) {
      const falta = validarPaso(e, p)
      if (falta) {
        setAviso(falta)
        setPaso(p)
        return
      }
    }
    startTransition(async () => {
      const r = await createProductGuided(armarPayload(e))
      if ("error" in r) {
        setAviso(r.error)
        return
      }
      toast.success(`«${e.nombre.trim()}» ya está en el POS.`)
      router.refresh()
      onClose()
    })
  }

  // ── Preguntas nuevas: ayudas de edición ──
  const editarPregunta = (key: string, patch: Partial<PreguntaNueva>) =>
    set({ nuevas: e.nuevas.map((p) => (p.key === key ? { ...p, ...patch } : p)) })
  const agregarPregunta = (presetKey: string) => {
    const preset = PRESETS_PREGUNTA.find((p) => p.key === presetKey)
    if (!preset) return
    set({ nuevas: [...e.nuevas, { key: nuevaKey(), ...preset.pregunta, opciones: preset.pregunta.opciones.map((o) => ({ ...o })) }] })
  }

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-stone-200 px-6 pb-4 pt-6">
        <SheetTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          Nuevo producto
        </SheetTitle>
        <SheetDescription className="text-sm">
          Paso {paso} de 4 · <span className="font-medium text-stone-700">{PASOS[paso - 1]}</span>
        </SheetDescription>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {PASOS.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < paso ? "bg-emerald-500" : "bg-stone-200"}`} />
          ))}
        </div>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-6 py-5">
          {paso === 1 && (
            <>
              <Campo etiqueta="¿Cómo se llama?" ayuda="Como lo dirías en el mostrador. Es lo que verá el cajero en el botón.">
                <Input
                  autoFocus
                  value={e.nombre}
                  onChange={(ev) => set({ nombre: ev.target.value })}
                  placeholder="ej. Comida fit, Latte, Concha"
                  maxLength={80}
                />
              </Campo>
              <Campo etiqueta="¿En qué categoría va?" ayuda="Las categorías son las pestañas del POS. Si no existe la que necesitas, créala aquí mismo.">
                <select
                  value={e.categoriaId}
                  onChange={(ev) => set({ categoriaId: ev.target.value })}
                  className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                >
                  <option value="">Elige una…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={NUEVA_CATEGORIA}>＋ Nueva categoría…</option>
                </select>
                {e.categoriaId === NUEVA_CATEGORIA && (
                  <Input
                    autoFocus
                    className="mt-2"
                    value={e.categoriaNueva}
                    onChange={(ev) => set({ categoriaNueva: ev.target.value })}
                    placeholder="ej. Comidas, Bebidas frías, Panadería"
                    maxLength={60}
                  />
                )}
              </Campo>
              <Campo etiqueta="¿Qué lleva? (opcional)" ayuda="Sale en el menú público y en la «i» del POS para contestar «¿qué trae?».">
                <Input
                  value={e.descripcion}
                  onChange={(ev) => set({ descripcion: ev.target.value })}
                  placeholder="ej. Proteína a elegir con dos guarniciones"
                  maxLength={300}
                />
              </Campo>
            </>
          )}

          {paso === 2 && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Tarjeta
                  activa={e.modoPrecio === "uno"}
                  onClick={() => set({ modoPrecio: "uno" })}
                  titulo="Un solo precio"
                  texto="Un pan, una comida, un jugo. Un botón, un precio."
                />
                <Tarjeta
                  activa={e.modoPrecio === "tamanos"}
                  onClick={() => set({ modoPrecio: "tamanos" })}
                  titulo="Depende del tamaño o la porción"
                  texto="Chico/Grande, 1 o 2 porciones. El cajero elige uno."
                />
              </div>
              <Nota>
                Lo que se <strong>agrega encima</strong> (leche, proteína extra, una guarnición de más) no va aquí: va
                en el siguiente paso, con su costo extra.
              </Nota>

              {e.modoPrecio === "uno" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Precio" ayuda="Lo que paga el cliente.">
                    <Dinero value={e.precio} onChange={(v) => set({ precio: v })} autoFocus />
                  </Campo>
                  <Campo etiqueta="Costo (opcional)" ayuda="Lo que te cuesta prepararlo. Con esto el panel te dice tu margen.">
                    <Dinero value={e.costo} onChange={(v) => set({ costo: v })} placeholder="0" />
                  </Campo>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="self-center text-xs text-stone-500">Empieza con:</span>
                    {PRESETS_TAMANO.map((p) => (
                      <button
                        key={p.etiqueta}
                        type="button"
                        onClick={() =>
                          set({ tamanos: p.nombres.map((n) => ({ nombre: n, medida: "", precio: "", costo: "" })) })
                        }
                        className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 hover:border-emerald-300 hover:text-emerald-700"
                      >
                        {p.etiqueta}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="hidden grid-cols-[1fr_5rem_5.5rem_5.5rem_2rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-stone-400 sm:grid">
                      <span>Tamaño</span>
                      <span>Medida</span>
                      <span>Precio</span>
                      <span>Costo</span>
                      <span />
                    </div>
                    {e.tamanos.map((t, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-white p-2 sm:grid-cols-[1fr_5rem_5.5rem_5.5rem_2rem] sm:border-0 sm:bg-transparent sm:p-0">
                        <Input
                          value={t.nombre}
                          onChange={(ev) => set({ tamanos: e.tamanos.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)) })}
                          placeholder="Chico"
                          className="col-span-2 sm:col-span-1"
                          maxLength={40}
                        />
                        <Input
                          value={t.medida}
                          onChange={(ev) => set({ tamanos: e.tamanos.map((x, j) => (j === i ? { ...x, medida: ev.target.value } : x)) })}
                          placeholder="12 oz"
                          maxLength={20}
                        />
                        <Dinero
                          value={t.precio}
                          onChange={(v) => set({ tamanos: e.tamanos.map((x, j) => (j === i ? { ...x, precio: v } : x)) })}
                          placeholder="Precio"
                        />
                        <Dinero
                          value={t.costo}
                          onChange={(v) => set({ tamanos: e.tamanos.map((x, j) => (j === i ? { ...x, costo: v } : x)) })}
                          placeholder="Costo"
                        />
                        <button
                          type="button"
                          aria-label={`Quitar ${t.nombre || "tamaño"}`}
                          onClick={() => set({ tamanos: e.tamanos.filter((_, j) => j !== i) })}
                          className="flex h-10 w-full items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600 sm:w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => set({ tamanos: [...e.tamanos, { nombre: "", medida: "", precio: "", costo: "" }] })}
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar tamaño
                  </Button>
                  <p className="text-xs text-stone-400">
                    La medida («12 oz», «350 g») es opcional y solo se muestra chiquita bajo el nombre. El costo también
                    es opcional.
                  </p>
                </div>
              )}
            </>
          )}

          {paso === 3 && (
            <>
              <Nota>
                Cada <strong>pregunta</strong> se hace al tocar el producto: «¿Qué proteína?», «¿Tipo de leche?». Tú
                decides cuántas opciones puede elegir el cajero y cuáles cuestan extra (0 = sin costo). Si este
                producto no pregunta nada, sigue adelante.
              </Nota>

              {existentesVivos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-stone-700">Preguntas que ya tienes</p>
                  <div className="space-y-1.5">
                    {existentesVivos.map((g) => {
                      const marcada = e.existentes.includes(g.id)
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            set({ existentes: marcada ? e.existentes.filter((id) => id !== g.id) : [...e.existentes, g.id] })
                          }
                          className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                            marcada ? "border-emerald-400 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-200"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              marcada ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300"
                            }`}
                          >
                            {marcada && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-stone-800">
                              {g.name}{" "}
                              <span className="font-normal text-stone-400">
                                · {choiceHint({ min: g.minSelect, max: g.maxSelect })}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-stone-500">
                              {g.options.map((o) => (o.priceDelta > 0 ? `${o.name} +${formatCurrency(o.priceDelta)}` : o.name)).join(", ")}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">
                  {e.nuevas.length > 0 ? "Preguntas nuevas" : "Crear una pregunta nueva"}
                </p>
                {e.nuevas.map((p) => (
                  <PreguntaCard
                    key={p.key}
                    pregunta={p}
                    onChange={(patch) => editarPregunta(p.key, patch)}
                    onRemove={() => set({ nuevas: e.nuevas.filter((x) => x.key !== p.key) })}
                  />
                ))}
                <div className="flex flex-wrap gap-1.5">
                  <span className="self-center text-xs text-stone-500">Empieza con un ejemplo:</span>
                  {PRESETS_PREGUNTA.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => agregarPregunta(p.key)}
                      className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 hover:border-emerald-300 hover:text-emerald-700"
                    >
                      {p.key === "blanco" ? "" : "＋ "}
                      {p.etiqueta}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-stone-400">
                  Todo se puede renombrar o borrar. Una pregunta creada aquí queda guardada y la puedes reusar en otros
                  productos desde Opciones y extras.
                </p>
              </div>
            </>
          )}

          {paso === 4 && <Resumen e={e} existentes={existentesVivos} categorias={categories} />}
        </div>
      </ScrollArea>

      <div className="shrink-0 space-y-3 border-t border-stone-200 px-6 py-4">
        {aviso && (
          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {aviso}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {paso > 1 ? (
            <Button type="button" variant="ghost" onClick={atras} className="gap-1.5" disabled={enviando}>
              <ArrowLeft className="h-4 w-4" /> Atrás
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
          )}
          {paso < 4 ? (
            <Button type="button" onClick={siguiente} className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
              Siguiente <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={crear} disabled={enviando} className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
              <Check className="h-4 w-4" /> {enviando ? "Creando…" : "Crear producto"}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

/* ────────────────────────────────────────────── piezas ── */

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-stone-700">{etiqueta}</label>
      {children}
      {ayuda && <p className="text-xs text-stone-400">{ayuda}</p>}
    </div>
  )
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">{children}</p>
}

function Tarjeta({ activa, onClick, titulo, texto }: { activa: boolean; onClick: () => void; titulo: string; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`rounded-lg border p-3 text-left transition-colors ${
        activa ? "border-emerald-500 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-200"
      }`}
    >
      <span className="block text-sm font-semibold text-stone-800">{titulo}</span>
      <span className="block text-xs text-stone-500">{texto}</span>
    </button>
  )
}

/** Un campo de pesos: teclado numérico en celular y el «$» a la vista. */
function Dinero({
  value,
  onChange,
  placeholder = "0.00",
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
      <Input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        className={`pl-6 ${value !== "" && Number.isNaN(pesos(value)) ? "border-red-400" : ""}`}
      />
    </div>
  )
}

function PreguntaCard({
  pregunta: p,
  onChange,
  onRemove,
}: {
  pregunta: PreguntaNueva
  onChange: (patch: Partial<PreguntaNueva>) => void
  onRemove: () => void
}) {
  const preset = CHOICE_PRESETS.find((c) => c.key === p.regla)
  const editarOpcion = (i: number, patch: Partial<PreguntaNueva["opciones"][number]>) =>
    onChange({ opciones: p.opciones.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-xs font-medium text-stone-500">¿Qué se pregunta?</label>
          <Input
            value={p.nombre}
            onChange={(ev) => onChange({ nombre: ev.target.value })}
            placeholder="ej. Proteína, Guarniciones, Tipo de leche"
            maxLength={60}
            className="font-medium"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar esta pregunta"
          className="mt-5 rounded-md p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_5rem]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-500">¿Cuántas puede elegir el cajero?</label>
          <select
            value={p.regla}
            onChange={(ev) => onChange({ regla: ev.target.value as ChoiceKey })}
            className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
          >
            {CHOICE_PRESETS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {preset?.needsNumber && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-500">Número</label>
            <Input
              inputMode="numeric"
              value={String(p.cantidad)}
              onChange={(ev) => onChange({ cantidad: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) })}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-stone-500">
        {preset?.hint} El cajero verá: <strong className="text-stone-700">«{pistaPregunta(p)}»</strong>
      </p>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_5.5rem_2rem_2rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
          <span>Opción</span>
          <span>Extra</span>
          <span title="Sale ya marcada al vender">Omisión</span>
          <span />
        </div>
        {p.opciones.map((o, i) => (
          <div key={i} className="grid grid-cols-[1fr_5.5rem_2rem_2rem] items-center gap-2">
            <Input
              value={o.nombre}
              onChange={(ev) => editarOpcion(i, { nombre: ev.target.value })}
              placeholder="ej. Pollo"
              maxLength={60}
            />
            <Dinero value={o.extra} onChange={(v) => editarOpcion(i, { extra: v })} placeholder="0" />
            <button
              type="button"
              role="radio"
              aria-checked={o.omision}
              aria-label={`${o.nombre || "Opción"} por omisión`}
              onClick={() => onChange({ opciones: p.opciones.map((x, j) => ({ ...x, omision: j === i ? !o.omision : false })) })}
              className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                o.omision ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-300 text-transparent hover:border-emerald-400"
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Quitar ${o.nombre || "opción"}`}
              onClick={() => onChange({ opciones: p.opciones.filter((_, j) => j !== i) })}
              className="flex h-8 w-8 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onChange({ opciones: [...p.opciones, { nombre: "", extra: "", omision: false }] })}
        >
          <Plus className="h-3.5 w-3.5" /> Agregar opción
        </Button>
      </div>
    </div>
  )
}

function Resumen({
  e,
  existentes,
  categorias,
}: {
  e: EstadoGuiado
  existentes: ModifierGroupOption[]
  categorias: { id: string; name: string }[]
}) {
  const payload = armarPayload(e)
  const totales = ejemploTotal(e, existentes)
  const categoria = e.categoriaId === NUEVA_CATEGORIA ? `${e.categoriaNueva.trim()} (nueva)` : categorias.find((c) => c.id === e.categoriaId)?.name ?? ""
  const preguntas = [
    ...existentes.filter((g) => e.existentes.includes(g.id)).map((g) => ({
      nombre: g.name,
      pista: choiceHint({ min: g.minSelect, max: g.maxSelect }),
      opciones: g.options.map((o) => ({ nombre: o.name, extra: o.priceDelta, omision: false })),
      nueva: false,
    })),
    ...e.nuevas.map((p) => ({
      nombre: p.nombre.trim(),
      pista: pistaPregunta(p),
      opciones: p.opciones.filter((o) => o.nombre.trim()).map((o) => ({ nombre: o.nombre.trim(), extra: pesos(o.extra), omision: o.omision })),
      nueva: true,
    })),
  ]
  return (
    <div className="space-y-4">
      <Nota>Revisa que diga lo que quieres. Al crear, aparece de inmediato en el POS y en el menú.</Nota>
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-lg font-bold text-stone-800">{payload.name}</p>
        <p className="text-sm text-stone-500">{categoria}</p>
        {payload.description && <p className="mt-1 text-sm text-stone-600">{payload.description}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {payload.variants.map((v, i) => (
            <span key={i} className="rounded-md bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-900">
              {v.name ? `${v.name}${v.size_label ? ` · ${v.size_label}` : ""} ` : ""}
              {formatCurrency(v.price)}
            </span>
          ))}
        </div>
      </div>

      {preguntas.length === 0 ? (
        <p className="text-sm text-stone-500">Al tocarlo entra directo al carrito, sin preguntas.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">Al tocarlo se pregunta, en este orden:</p>
          {preguntas.map((p, i) => (
            <div key={i} className="rounded-lg border border-stone-200 bg-white p-3">
              <p className="text-sm font-semibold text-stone-800">
                {i + 1}. {p.nombre} <span className="font-normal text-stone-400">· {p.pista}</span>
                {p.nueva && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">nueva</span>}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {p.opciones
                  .map((o) => `${o.nombre}${o.extra > 0 ? ` +${formatCurrency(o.extra)}` : ""}${o.omision ? " (por omisión)" : ""}`)
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Desde <strong>{formatCurrency(totales.base)}</strong>
        {totales.conObligatorios > totales.base && (
          <>
            {" "}
            · con lo obligatorio más caro: <strong>{formatCurrency(totales.conObligatorios)}</strong>
          </>
        )}
        . Los extras opcionales se suman al cobrar.
      </div>
    </div>
  )
}
