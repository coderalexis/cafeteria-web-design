"use client"

import { useState } from "react"
import { ChevronRight, HandCoins, PauseCircle, Play, Receipt, Trash2, TriangleAlert } from "lucide-react"
import { formatCurrency } from "@/lib/format"
import { esFiado, isVieja, parkedDetail, parkedSummary, waitingLabel, type ParkedOrder } from "./parked"
import type { Product } from "./cart"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/* ── Guardar el pedido actual ─────────────────────────────────────── */
export function ParkDialog({
  open,
  onOpenChange,
  sugerido,
  onPark,
  abiertas = [],
  chips = [],
  sugeridos = [],
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  sugerido: string
  onPark: (name: string) => void
  /** Nombres de cuentas del día ya abiertas: elegir uno le SUMA, no duplica. */
  abiertas?: string[]
  /**
   * Chips de un toque, ya en orden (mesas ocupadas primero). Vienen de los
   * ajustes de LA cafetería: eran fijos en código e iguales para todas, así
   * que un café de dos mesas veía cuatro y uno de ocho tecleaba de la 5 en
   * adelante — justo en el camino más caliente.
   */
  chips?: string[]
  /** Quién suele venir a esta hora (P33): nombres con cuenta abierta en esta franja, los últimos 60 días. */
  sugeridos?: string[]
}) {
  const [nombre, setNombre] = useState("")
  const yaAbierta = (n: string) => abiertas.some((a) => a.trim().toLowerCase() === n.trim().toLowerCase())
  const escrita = nombre.trim() && yaAbierta(nombre)

  const guardar = (valor: string) => {
    onPark(valor.trim() || sugerido)
    setNombre("")
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setNombre("")
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir cuenta</DialogTitle>
          <DialogDescription>
            Se le puede seguir agregando y se cobra al final. El carrito queda libre para atender a alguien
            más; nadie paga nada todavía.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Quien suele venir a esta hora, primero: Juan pasa después de
              entrenar entre 8 y 10, y a las 9 su nombre debe estar a un toque
              sin que nadie lo haya registrado en ningún lado. */}
          {sugeridos.length > 0 && (
            <div data-sugeridos>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Suelen venir a esta hora</p>
              <div className="flex flex-wrap gap-1.5">
                {sugeridos.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => guardar(n)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      yaAbierta(n)
                        ? "border-amber-400 bg-amber-50 text-amber-800 hover:border-amber-500"
                        : "border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-400"
                    }`}
                    title={yaAbierta(n) ? `«${n}» ya está abierta: se le sumará` : "Suele venir a esta hora"}
                  >
                    {n}
                    {yaAbierta(n) && <span className="ml-1 opacity-70">+</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Una cafetería puede quedarse sin chips (cero mesas y sin
              etiquetas): ahí el campo de texto se basta solo. */}
          {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              /* La mesa con cuenta se distingue y lo dice: tocarla SUMA lo del
                 carrito a esa cuenta. Antes creaba una segunda «Mesa 1» que
                 nadie sabía juntar — el gesto más natural producía el estado
                 más confuso. */
              <button
                key={c}
                type="button"
                onClick={() => guardar(c)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  yaAbierta(c)
                    ? "border-amber-400 bg-amber-50 text-amber-800 hover:border-amber-500"
                    : "border-stone-200 bg-white text-stone-600 hover:border-amber-400 hover:text-amber-700"
                }`}
                title={yaAbierta(c) ? `«${c}» ya está abierta: se le sumará` : undefined}
              >
                {c}
                {yaAbierta(c) && <span className="ml-1 opacity-70">+</span>}
              </button>
            ))}
          </div>
          )}
          <Input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={sugerido}
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                guardar(nombre)
              }
            }}
          />
          {escrita ? (
            <p className="text-xs font-medium text-amber-800">
              «{nombre.trim()}» ya está abierta: esto se le sumará a esa cuenta.
            </p>
          ) : (
            <p className="text-xs text-stone-400">
              Un nombre ayuda a reconocerla después. Si lo dejas vacío se llamará «{sugerido}».
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => guardar(nombre)}>
            Abrir cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


/* ── Cuentas abiertas y fiado ─────────────────────────────────────── */

/**
 * Un renglón de la lista. Sirve igual para una cuenta del día que para un
 * fiado: lo único que cambia es qué se dice de la fecha y si se ofrece
 * marcarla como no pagada.
 */
function CuentaRow({
  o,
  products,
  ahora,
  onResume,
  onRemove,
  onViewAccount,
  onFiar,
  desplegado,
  onToggle,
}: {
  o: ParkedOrder
  products: Product[]
  ahora: number
  onResume: (order: ParkedOrder) => void
  onRemove: (id: string) => void
  onViewAccount: (order: ParkedOrder) => void
  /** Solo para cuentas del día: el fiado ya está marcado. */
  onFiar: ((order: ParkedOrder) => void) | null
  desplegado: boolean
  onToggle: () => void
}) {
  const r = parkedSummary(o, products, ahora)
  const fiado = esFiado(o)

  return (
    <div
      className={`rounded-xl border ${
        !r.ok
          ? "border-amber-200 bg-amber-50"
          : fiado
            ? "border-red-200 bg-red-50/50"
            : "border-stone-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Tocar el renglón despliega QUÉ PREPARAR. En una cafetería con
            mesas la comida se hace antes de cobrar, así que esta lista es la
            de pendientes de la barra — y el resumen de arriba (tres productos
            y el total) no alcanza para eso. */}
        <button
          type="button"
          onClick={onToggle}
          disabled={!r.ok}
          aria-expanded={desplegado}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div className="flex items-baseline gap-2">
            <p className="truncate font-semibold text-stone-800">{o.name}</p>
            {/* Un fiado se cuenta desde que quedó a deber; una cuenta del día,
                desde que llegó la mesa. Y una cuenta del día que ya lleva
                horas se pinta distinto: es la señal de que quizá se fueron. */}
            <span
              className={`shrink-0 text-xs ${
                fiado
                  ? "font-semibold text-red-700"
                  : isVieja(o.savedAt, ahora)
                    ? "font-semibold text-amber-700"
                    : "text-stone-400"
              }`}
            >
              {fiado ? `debe ${waitingLabel(o.owedSince!, ahora)}` : `abierta ${waitingLabel(o.savedAt, ahora)}`}
            </span>
            {r.ok && (
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-stone-300 transition-transform ${
                  desplegado ? "rotate-90" : ""
                }`}
              />
            )}
          </div>
          {r.ok ? (
            <>
              <p className="truncate text-xs text-stone-500">
                {r.count} artículo{r.count === 1 ? "" : "s"} · {formatCurrency(r.total)} · {r.label}
              </p>
              {fiado && o.owedContact && <p className="truncate text-xs text-stone-500">Tel. {o.owedContact}</p>}
              {/* Se cayeron renglones: el total de aquí YA no los incluye. Hay
                  que decirlo con el dinero de por medio, no con un «algo
                  cambió» que nadie relaciona con cobrar de menos. */}
              {r.faltantes > 0 && (
                <p className="flex items-start gap-1 text-xs font-medium text-amber-800">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {r.faltantes === 1
                      ? "1 artículo ya no está en el menú y no se está cobrando."
                      : `${r.faltantes} artículos ya no están en el menú y no se están cobrando.`}
                  </span>
                </p>
              )}
            </>
          ) : (
            /* No se puede cobrar lo que ya no está en el menú: el servidor
               exige variante ACTIVA y rechazaría la venta. Pero el café ya se
               sirvió, así que el aviso tiene que decir el remedio exacto, no
               solo que algo falla. */
            <p className="flex items-start gap-1 text-xs font-medium text-amber-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {r.expired
                  ? "Caducada (más de una semana sin cobrar)"
                  : "Sus productos ya no están en el menú. Reactívalos en Menú → Productos y podrás cobrarla."}
              </span>
            </p>
          )}
        </button>

        <Button
          size="sm"
          className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          disabled={!r.ok}
          title={fiado ? `Cobrarle a «${o.name}»` : `Abrir «${o.name}» para agregarle o cobrarla`}
          onClick={() => onResume(o)}
        >
          <Play className="h-3.5 w-3.5" />
          {fiado ? "Cobrar" : "Abrir"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-stone-300 hover:bg-red-50 hover:text-red-600"
          title={`Descartar «${o.name}»`}
          aria-label={`Descartar ${o.name}`}
          onClick={() => {
            if (window.confirm(`¿Descartar la cuenta «${o.name}»? Se pierde lo que lleva y no se puede recuperar.`))
              onRemove(o.id)
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {desplegado && (
        <div className="border-t border-stone-200 px-3 py-3">
          <ul className="space-y-2">
            {parkedDetail(o, products, ahora).map((l, i) => (
              <li key={i}>
                <p className="text-sm font-semibold leading-snug text-stone-800">
                  <span className="text-amber-700">{l.quantity}×</span> {l.label}
                </p>
                {l.modifiers.map((m, k) => (
                  <p key={k} className="pl-5 text-sm text-stone-600">
                    + {m}
                  </p>
                ))}
                {l.notes && <p className="pl-5 text-sm font-semibold uppercase text-amber-800">* {l.notes}</p>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            {/* El desglose de arriba es para preparar (sin precios). Cuando la
                mesa pide la cuenta hace falta el otro: con precios y total, y
                sin cobrar todavía. */}
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => onViewAccount(o)}>
              <Receipt className="h-3.5 w-3.5" />
              Ver la cuenta ({formatCurrency(r.total)})
            </Button>
            {onFiar && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2 text-stone-500 hover:bg-red-50 hover:text-red-700"
                onClick={() => onFiar(o)}
              >
                <HandCoins className="h-3.5 w-3.5" />
                Se fue sin pagar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ParkedTrayDialog({
  open,
  onOpenChange,
  orders,
  products,
  cartHasLines,
  onResume,
  onRemove,
  onViewAccount,
  onMarkOwed,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Todas las cuentas visibles: del día y fiadas. Se separan aquí dentro. */
  orders: ParkedOrder[]
  products: Product[]
  /** Si hay algo en el carrito, abrir otra cuenta guardará eso primero. */
  cartHasLines: boolean
  onResume: (order: ParkedOrder) => void
  onRemove: (id: string) => void
  /** «¿Me trae la cuenta?»: enseña el desglose con precios, sin cobrar. */
  onViewAccount: (order: ParkedOrder) => void
  /** Marca una cuenta como fiado. Devuelve si se pudo. */
  onMarkOwed: (id: string, contact: string | undefined) => Promise<boolean>
}) {
  const ahora = Date.now()
  /** Cuál se abrió para ver qué preparar. */
  const [abierto, setAbierto] = useState<string | null>(null)
  /** A cuál se le está marcando el fiado (y con qué teléfono). */
  const [fiando, setFiando] = useState<ParkedOrder | null>(null)
  const [contacto, setContacto] = useState("")
  const [guardandoFiado, setGuardandoFiado] = useState(false)

  // Dos listas porque son dos cosas distintas: la del día es una mesa que
  // está comiendo ahora; el fiado es alguien que ya se fue y hay que
  // buscarlo. Revueltas, el aviso del corte se volvía ruido de cada noche.
  const delDia = orders.filter((o) => !esFiado(o))
  const fiados = orders.filter(esFiado)

  const confirmarFiado = async () => {
    if (!fiando || guardandoFiado) return
    setGuardandoFiado(true)
    const ok = await onMarkOwed(fiando.id, contacto.trim() || undefined)
    setGuardandoFiado(false)
    if (ok) {
      setFiando(null)
      setContacto("")
      setAbierto(null)
    }
  }

  const fila = (o: ParkedOrder) => (
    <CuentaRow
      key={o.id}
      o={o}
      products={products}
      ahora={ahora}
      onResume={onResume}
      onRemove={onRemove}
      onViewAccount={onViewAccount}
      onFiar={esFiado(o) ? null : (x) => setFiando(x)}
      desplegado={abierto === o.id}
      onToggle={() => setAbierto(abierto === o.id ? null : o.id)}
    />
  )

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          onOpenChange(v)
          if (!v) setAbierto(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-amber-700" />
              Cuentas abiertas ({delDia.length})
            </DialogTitle>
            <DialogDescription>
              {cartHasLines
                ? "Toca una para ver qué lleva. Al abrirla, lo que tienes en el carrito se guarda solo."
                : "Toca una para ver qué lleva, o «Abrir» para agregarle más productos o cobrarla."}
            </DialogDescription>
          </DialogHeader>

          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">
              No hay cuentas abiertas. Usa «Abrir cuenta» cuando una mesa vaya a pagar al final.
            </p>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {delDia.length === 0 && (
                <p className="py-4 text-center text-sm text-stone-400">No hay cuentas abiertas ahora mismo.</p>
              )}
              {delDia.map(fila)}

              {fiados.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-3">
                    <HandCoins className="h-4 w-4 text-red-700" />
                    <p className="text-sm font-bold text-stone-700">Por cobrar ({fiados.length})</p>
                    <div className="h-px flex-1 bg-stone-200" />
                  </div>
                  <p className="pb-1 text-xs text-stone-400">
                    Se fueron sin pagar. Siguen aquí hasta que se cobren o se condonen.
                  </p>
                  {fiados.map(fila)}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Marcar el fiado. No cobra nada: la venta nace cuando entre el dinero. */}
      <Dialog
        open={!!fiando}
        onOpenChange={(v) => {
          if (!v) {
            setFiando(null)
            setContacto("")
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-red-700" />
              ¿Se fue sin pagar?
            </DialogTitle>
            <DialogDescription>
              «{fiando?.name}» pasa a <strong>Por cobrar</strong> y deja de estorbar la lista del día. No se registra
              ninguna venta: eso pasa cuando te pague.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              autoFocus
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Teléfono (opcional)"
              maxLength={60}
              inputMode="tel"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void confirmarFiado()
                }
              }}
            />
            <p className="text-xs text-stone-400">Un teléfono ayuda a cobrarle después. Lo puedes dejar vacío.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFiando(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={guardandoFiado}
              onClick={() => void confirmarFiado()}
            >
              {guardandoFiado ? "Guardando…" : "Pasar a Por cobrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
