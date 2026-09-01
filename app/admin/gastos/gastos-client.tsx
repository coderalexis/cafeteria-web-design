"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Target, Trash2, TriangleAlert } from "lucide-react"
import {
  deleteExpense,
  deleteFixedExpense,
  saveExpense,
  saveFixedExpense,
  toggleFixedExpense,
  applyBreakEvenGoal,
} from "@/app/actions/expenses"
import {
  CATEGORIAS_GASTO,
  ETIQUETA_CATEGORIA,
  FORMAS_PAGO,
  type CategoriaGasto,
  type Gasto,
  type GastoFijo,
} from "@/lib/expenses"
import { formatCurrency, formatDate } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ReporteUtilidad } from "./types"

/** Los tres que casi toda cafetería paga: se ofrecen de un clic al arrancar. */
const SUGERENCIAS: Array<{ name: string; category: CategoriaGasto }> = [
  { name: "Renta del local", category: "renta" },
  { name: "Sueldos", category: "sueldos" },
  { name: "Luz, agua y gas", category: "servicios" },
]

/** Un «2026-09-01» es un día, no un instante: se pinta en UTC para que no
 *  retroceda al día anterior al convertirlo a la hora local. */
function fechaDia(iso: string): string {
  return formatDate(iso, "UTC")
}

function mesLegible(mes: string): string {
  const d = new Date(`${mes}T12:00:00Z`)
  const txt = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(d)
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function correrMes(mes: string, meses: number): string {
  const d = new Date(`${mes}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + meses)
  return d.toISOString().slice(0, 7)
}

export function GastosClient({
  mes,
  hoy,
  reporte,
  fijos,
  gastos,
}: {
  mes: string
  hoy: string
  reporte: ReporteUtilidad | null
  fijos: GastoFijo[]
  gastos: Gasto[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editandoFijo, setEditandoFijo] = useState<Partial<GastoFijo> | null>(null)
  const [editandoGasto, setEditandoGasto] = useState<Partial<Gasto> | null>(null)

  const mesActual = mes.slice(0, 7) === hoy.slice(0, 7)
  const totalFijos = useMemo(
    () => fijos.filter((f) => f.isActive).reduce((s, f) => s + f.monthlyAmount, 0),
    [fijos],
  )

  function refrescar(mensaje: string) {
    toast.success(mensaje)
    router.refresh()
  }

  function guardarFijo(datos: { id?: string; name: string; category: CategoriaGasto; monthlyAmount: number }) {
    startTransition(async () => {
      const r = await saveFixedExpense(datos)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setEditandoFijo(null)
      refrescar(datos.id ? "Gasto fijo actualizado." : `«${datos.name}» quedó en tus gastos de cada mes.`)
    })
  }

  function guardarGasto(datos: {
    id?: string
    spentOn: string
    category: CategoriaGasto
    description: string
    amount: number
    paidWith: string | null
  }) {
    startTransition(async () => {
      const r = await saveExpense(datos)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setEditandoGasto(null)
      refrescar(datos.id ? "Gasto actualizado." : "Gasto registrado.")
    })
  }

  return (
    <>
      {/* ── Mes ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/gastos?mes=${correrMes(mes, -1)}`} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-center font-semibold text-stone-700">
          {mesLegible(mes)}
          {mesActual && <span className="ml-2 text-xs font-normal text-stone-400">(en curso)</span>}
        </p>
        <Button variant="outline" size="sm" asChild disabled={mesActual}>
          <Link
            href={mesActual ? "/admin/gastos" : `/admin/gastos?mes=${correrMes(mes, 1)}`}
            aria-label="Mes siguiente"
            className={mesActual ? "pointer-events-none opacity-40" : undefined}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* ── La cuenta del mes ───────────────────────────────────── */}
      {reporte && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">La cuenta de {mesLegible(mes).toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Renglon etiqueta="Ingresos" monto={reporte.revenue} />
            <Renglon etiqueta="Costo de lo que vendiste" monto={-reporte.cost_of_goods} />
            <div className="border-t border-stone-200 pt-1">
              <Renglon
                etiqueta="Margen bruto"
                monto={reporte.gross_margin}
                nota={`${reporte.margin_pct}% de lo que vendiste`}
                fuerte
              />
            </div>
            <Renglon
              etiqueta="Gastos del negocio"
              monto={-reporte.expenses_total}
              nota={`Fijos ${formatCurrency(reporte.fixed_total)} · De este mes ${formatCurrency(reporte.variable_total)}`}
            />
            {/* Un mes EN CURSO no ha perdido la renta completa el dia 2: los
                gastos fijos son de todo el mes y las ventas van a la mitad.
                Mientras no se cubran se dice lo que FALTA, que es la verdad y
                ademas es accionable; «perdiste $80,400» el dia 1 no es ninguna
                de las dos cosas. Un mes cerrado si se llama por su nombre. */}
            <div className="mt-2 border-t-2 border-stone-300 pt-2">
              {reporte.is_current_month && reporte.net_profit < 0 ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-bold text-stone-800">Te faltan</span>
                    <span className="text-2xl font-bold tabular-nums text-amber-700">
                      {formatCurrency(-reporte.net_profit)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400">para cubrir los gastos de este mes</p>
                </>
              ) : (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-bold text-stone-800">
                    {reporte.net_profit >= 0 ? (reporte.is_current_month ? "Llevas ganado" : "Ganaste") : "Perdiste"}
                  </span>
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      reporte.net_profit >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(Math.abs(reporte.net_profit))}
                  </span>
                </div>
              )}
            </div>

            {reporte.covered_on ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Cubriste todos tus gastos el <strong>{fechaDia(reporte.covered_on)}</strong>. Lo de después es
                ganancia.
              </p>
            ) : (
              reporte.expenses_total > 0 && (
                <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  Todavía no cubres los gastos del mes: te faltan{" "}
                  <strong>{formatCurrency(reporte.expenses_total - reporte.gross_margin)}</strong> de margen.
                </p>
              )
            )}

            {/* Los fijos no llevan historia: al mirar un mes viejo se aplican los
                de HOY. Es una aproximacion razonable y hay que decirlo, no
                dejar que el dueno descubra solo que su renta de marzo cambio. */}
            {!reporte.is_current_month && reporte.fixed_total > 0 && (
              <p className="mt-2 text-xs text-stone-400">
                Los gastos fijos que se usan aquí son los que tienes hoy. Si cambiaron desde entonces, este mes se ve
                con los de ahora.
              </p>
            )}

            {reporte.sold_without_cost > 0 && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {reporte.sold_without_cost} piezas se vendieron sin costo capturado, así que el margen se ve mejor de
                  lo que es.{" "}
                  <Link href="/admin/productos" className="font-semibold underline underline-offset-2">
                    Captura sus costos
                  </Link>{" "}
                  para que esta cuenta sea real.
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Punto de equilibrio ─────────────────────────────────── */}
      {reporte && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-amber-700" />
              Cuánto necesitas vender
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reporte.break_even.daily == null || reporte.fixed_total === 0 ? (
              <p className="text-sm text-stone-600">
                Para calcularlo hacen falta dos cosas: tus gastos fijos aquí abajo y los costos de tus productos. En
                cuanto estén, aquí sale el número.
              </p>
            ) : (
              <>
                <p className="text-3xl font-bold tabular-nums text-stone-800">
                  {formatCurrency(reporte.break_even.daily)}
                  <span className="ml-2 text-base font-normal text-stone-500">al día</span>
                </p>
                <p className="mt-2 text-sm text-stone-600">
                  Es lo que tienes que vender cada día para cubrir tus{" "}
                  <strong>{formatCurrency(reporte.fixed_total)}</strong> de gastos fijos —{" "}
                  {formatCurrency(reporte.break_even.monthly ?? 0)} al mes. Sale de tu margen real de los últimos 60
                  días ({reporte.break_even.margin_pct}%) y de que abres {reporte.break_even.days_open} días al mes.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 bg-white"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await applyBreakEvenGoal()
                      if (!r.success) {
                        toast.error(r.error)
                        return
                      }
                      refrescar(`Tu meta del día quedó en ${formatCurrency(r.goal)}.`)
                    })
                  }
                >
                  <Target className="h-4 w-4" />
                  Usar como meta del día
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Gastos fijos ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">Cada mes pagas lo mismo</CardTitle>
            <p className="mt-1 text-sm text-stone-500">
              Se capturan una vez. Suman {formatCurrency(totalFijos)} al mes.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditandoFijo({ category: "otros" })}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent>
          {fijos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-300 p-5 text-center">
              <p className="text-sm text-stone-600">
                Empieza por aquí: sin esto el sistema no puede decirte si ganas dinero.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <Button
                    key={s.name}
                    variant="outline"
                    size="sm"
                    onClick={() => setEditandoFijo({ name: s.name, category: s.category })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {s.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {fijos.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${f.isActive ? "text-stone-800" : "text-stone-400"}`}>
                      {f.name}
                    </p>
                    <p className="text-xs text-stone-500">{ETIQUETA_CATEGORIA[f.category]}</p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${f.isActive ? "text-stone-700" : "text-stone-400 line-through"}`}
                  >
                    {formatCurrency(f.monthlyAmount)}
                  </span>
                  <Switch
                    checked={f.isActive}
                    disabled={isPending}
                    aria-label={f.isActive ? `Dejar de contar ${f.name}` : `Volver a contar ${f.name}`}
                    onCheckedChange={(v) =>
                      startTransition(async () => {
                        const r = await toggleFixedExpense(f.id, v)
                        if (!r.success) {
        toast.error(r.error)
        return
      }
                        router.refresh()
                      })
                    }
                  />
                  <Button variant="ghost" size="icon" onClick={() => setEditandoFijo(f)} aria-label={`Editar ${f.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Borrar ${f.name}`}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await deleteFixedExpense(f.id)
                        if (!r.success) {
        toast.error(r.error)
        return
      }
                        refrescar("Gasto fijo borrado.")
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Gastos del mes ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">Gastos de este mes</CardTitle>
            <p className="mt-1 text-sm text-stone-500">
              Compras, reparaciones, lo que no se repite. No metas aquí los de arriba: contarían doble.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setEditandoGasto({ spentOn: mesActual ? hoy : mes, category: "insumos", paidWith: "efectivo" })
            }
          >
            <Plus className="h-4 w-4" />
            Registrar
          </Button>
        </CardHeader>
        <CardContent>
          {gastos.length === 0 ? (
            <p className="py-3 text-center text-sm text-stone-500">Sin gastos registrados en {mesLegible(mes).toLowerCase()}.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {gastos.map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800">{g.description}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                      {fechaDia(g.spentOn)} · {ETIQUETA_CATEGORIA[g.category]}
                      {g.paidWith && ` · ${g.paidWith}`}
                      {g.fromCashMovement && (
                        <Badge variant="secondary" className="text-[10px]">
                          salió de la caja
                        </Badge>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-stone-700">{formatCurrency(g.amount)}</span>
                  <Button variant="ghost" size="icon" onClick={() => setEditandoGasto(g)} aria-label="Editar gasto">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Borrar gasto"
                    onClick={() =>
                      startTransition(async () => {
                        const r = await deleteExpense(g.id)
                        if (!r.success) {
        toast.error(r.error)
        return
      }
                        refrescar("Gasto borrado.")
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DialogFijo
        valor={editandoFijo}
        pendiente={isPending}
        onCerrar={() => setEditandoFijo(null)}
        onGuardar={guardarFijo}
      />
      <DialogGasto
        valor={editandoGasto}
        pendiente={isPending}
        onCerrar={() => setEditandoGasto(null)}
        onGuardar={guardarGasto}
      />
    </>
  )
}

/** Un renglón de la cuenta: etiqueta a la izquierda, monto alineado a la derecha. */
function Renglon({
  etiqueta,
  monto,
  nota,
  fuerte,
}: {
  etiqueta: string
  monto: number
  nota?: string
  fuerte?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <span className={fuerte ? "font-semibold text-stone-800" : "text-stone-600"}>{etiqueta}</span>
        {nota && <p className="text-xs text-stone-400">{nota}</p>}
      </div>
      <span
        className={`shrink-0 tabular-nums ${fuerte ? "font-semibold text-stone-800" : "text-stone-600"}`}
      >
        {monto < 0 ? "−" : ""}
        {formatCurrency(Math.abs(monto))}
      </span>
    </div>
  )
}

function SelectorCategoria({
  valor,
  onCambio,
}: {
  valor: CategoriaGasto
  onCambio: (v: CategoriaGasto) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIAS_GASTO.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onCambio(c)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            valor === c
              ? "border-amber-600 bg-amber-600 font-semibold text-white"
              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
          }`}
        >
          {ETIQUETA_CATEGORIA[c]}
        </button>
      ))}
    </div>
  )
}

function DialogFijo({
  valor,
  pendiente,
  onCerrar,
  onGuardar,
}: {
  valor: Partial<GastoFijo> | null
  pendiente: boolean
  onCerrar: () => void
  onGuardar: (d: { id?: string; name: string; category: CategoriaGasto; monthlyAmount: number }) => void
}) {
  const [nombre, setNombre] = useState("")
  const [cat, setCat] = useState<CategoriaGasto>("otros")
  const [importe, setImporte] = useState("")
  const [clave, setClave] = useState<string | null>(null)

  // Sincroniza el formulario cuando cambia el gasto que se está editando.
  const claveActual = valor ? `${valor.id ?? "nuevo"}:${valor.name ?? ""}` : null
  if (claveActual !== clave) {
    setClave(claveActual)
    setNombre(valor?.name ?? "")
    setCat(valor?.category ?? "otros")
    setImporte(valor?.monthlyAmount != null ? String(valor.monthlyAmount) : "")
  }

  return (
    <Dialog open={valor != null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{valor?.id ? "Editar gasto fijo" : "Nuevo gasto de cada mes"}</DialogTitle>
          <DialogDescription>
            El monto es siempre <strong>mensual</strong>. Si pagas cada quincena, suma las dos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fijo-nombre">Nombre</Label>
            <Input
              id="fijo-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Renta del local"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fijo-monto">Cuánto pagas al mes</Label>
            <Input
              id="fijo-monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="8000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <SelectorCategoria valor={cat} onCambio={setCat} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={pendiente}
            onClick={() =>
              onGuardar({ id: valor?.id, name: nombre.trim(), category: cat, monthlyAmount: Number(importe) })
            }
          >
            {pendiente && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DialogGasto({
  valor,
  pendiente,
  onCerrar,
  onGuardar,
}: {
  valor: Partial<Gasto> | null
  pendiente: boolean
  onCerrar: () => void
  onGuardar: (d: {
    id?: string
    spentOn: string
    category: CategoriaGasto
    description: string
    amount: number
    paidWith: string | null
  }) => void
}) {
  const [fecha, setFecha] = useState("")
  const [desc, setDesc] = useState("")
  const [cat, setCat] = useState<CategoriaGasto>("insumos")
  const [importe, setImporte] = useState("")
  const [pago, setPago] = useState<string>("efectivo")
  const [clave, setClave] = useState<string | null>(null)

  const claveActual = valor ? `${valor.id ?? "nuevo"}:${valor.spentOn ?? ""}` : null
  if (claveActual !== clave) {
    setClave(claveActual)
    setFecha(valor?.spentOn ?? "")
    setDesc(valor?.description ?? "")
    setCat(valor?.category ?? "insumos")
    setImporte(valor?.amount != null ? String(valor.amount) : "")
    setPago(valor?.paidWith ?? "efectivo")
  }

  return (
    <Dialog open={valor != null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{valor?.id ? "Editar gasto" : "Registrar un gasto"}</DialogTitle>
          <DialogDescription>Lo que saliste a pagar hoy: proveedor, reparación, lo que sea.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gasto-fecha">Fecha</Label>
              <Input id="gasto-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gasto-monto">Monto</Label>
              <Input
                id="gasto-monto"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="350"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gasto-desc">De qué fue</Label>
            <Input
              id="gasto-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Proveedor de café"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <SelectorCategoria valor={cat} onCambio={setCat} />
          </div>
          {/* La trampa mas facil de caer: el cafe y la leche YA se cuentan en
              el costo de cada producto vendido. Capturar ademas la compra al
              proveedor los contaria dos veces y la utilidad saldria peor de lo
              que es. Se avisa justo donde se comete, no en un manual. */}
          {cat === "insumos" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Vasos, servilletas, limpieza: eso va aquí. <strong>El café y la leche no</strong>: ya se cuentan en el
              costo de cada producto que vendes, y capturarlos otra vez haría que tu utilidad se vea peor de lo que es.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Cómo lo pagaste</Label>
            <div className="flex flex-wrap gap-1.5">
              {FORMAS_PAGO.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPago(p)}
                  className={`rounded-full border px-3 py-1.5 text-sm capitalize transition-colors ${
                    pago === p
                      ? "border-stone-800 bg-stone-800 font-semibold text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={pendiente}
            onClick={() =>
              onGuardar({
                id: valor?.id,
                spentOn: fecha,
                category: cat,
                description: desc.trim(),
                amount: Number(importe),
                paidWith: pago,
              })
            }
          >
            {pendiente && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
