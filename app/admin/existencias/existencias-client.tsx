"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowDownToLine,
  Boxes,
  ClipboardCheck,
  Coffee,
  History,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react"
import { contarDelMenu, dejarDeContar, guardarInsumo, historialDe } from "@/app/actions/existencias"
import { MovimientoDialog, type ItemMovimiento } from "@/components/movimiento-existencia-dialog"
import {
  UNIDADES,
  conUnidad,
  describirMovimiento,
  estadoExistencia,
  formatCantidad,
  type EstadoExistencia,
  type KindManual,
  type Movimiento,
  type Unidad,
} from "@/lib/existencias"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface Fila {
  itemId: string
  variantId: string | null
  supplyId: string | null
  esInsumo: boolean
  nombre: string
  unidad: Unidad
  categoria: string
  categoriaOrden: number
  qty: number
  minQty: number
  cost: number
  /** false = el producto o la variante se desactivó: sigue contándose, pero se avisa. */
  activo: boolean
}

export interface Candidato {
  variantId: string
  nombre: string
  categoria: string
  categoriaOrden: number
}

const ESTADO: Record<EstadoExistencia, { clase: string; texto: string | null }> = {
  ok: { clase: "text-stone-800", texto: null },
  bajo: { clase: "text-amber-700", texto: "Se está acabando" },
  agotado: { clase: "text-red-700", texto: "Se acabó" },
  negativo: { clase: "text-red-700", texto: "Salió más de lo que había: cuéntalo" },
}

function movimientoDe(f: Fila): ItemMovimiento {
  return { itemId: f.itemId, nombre: f.nombre, qty: f.qty, unidad: f.unidad, esDelMenu: !f.esInsumo }
}

/**
 * Existencias: lo que el café cuenta. Es el ÚNICO punto de entrada del módulo:
 * quien no agrega nada aquí no ve nada nuevo en ningún lado.
 * Diseño en docs/inventario.md.
 */
export function ExistenciasClient({
  items,
  candidatos,
  timezone,
}: {
  items: Fila[]
  candidatos: Candidato[]
  timezone: string
}) {
  const router = useRouter()
  const [agregar, setAgregar] = useState(false)
  const [mov, setMov] = useState<{ item: Fila; kind: KindManual } | null>(null)
  const [historial, setHistorial] = useState<Fila | null>(null)
  const [editar, setEditar] = useState<Fila | null>(null)
  const [quitar, setQuitar] = useState<Fila | null>(null)
  const [isPending, startTransition] = useTransition()

  const avisos = items.filter((i) => estadoExistencia(i.qty, i.minQty) !== "ok")
  const insumos = items.filter((i) => i.esInsumo)
  const delMenu = items.filter((i) => !i.esInsumo)

  function dejar(f: Fila) {
    startTransition(async () => {
      const r = await dejarDeContar({ variantId: f.variantId, supplyId: f.supplyId, nombre: f.nombre })
      setQuitar(null)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${f.nombre} ya no se cuenta. Su historial se conserva.`)
      router.refresh()
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Boxes className="h-6 w-6 text-amber-700" />
            Existencias
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Lo que se acaba: el café en grano, los vasos, las servilletas, y lo que compras hecho y vendes tal
            cual. Tú registras lo que llega y lo que se pierde; lo del menú baja solo con cada venta.
          </p>
        </div>
        <Button onClick={() => setAgregar(true)} className="blanco-comodo bg-amber-700 hover:bg-amber-800 text-white">
          <Plus className="h-4 w-4 mr-2" /> Agregar
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Todavía no cuentas nada</CardTitle>
            <CardDescription className="space-y-2">
              <span className="block">
                Con «Agregar» eliges qué llevar contado. Hay dos clases de cosas y se manejan distinto:
              </span>
              <span className="block">
                <strong>Insumos</strong>: lo que compras para preparar, como café en grano, leche, vasos, tapas,
                servilletas o azúcar. No están en tu menú, así que nadie puede adivinar cuánto se usa por bebida:
                los cuentas tú de vez en cuando y el sistema te avisa cuando bajan del mínimo.
              </span>
              <span className="block">
                <strong>De tu menú</strong>: lo que compras hecho y vendes igualito, como panqués, galletas o
                botellas. Eso sí baja solo con cada venta. Para lo que cuesta preparar una bebida sigue estando
                el costo de cada producto en{" "}
                <Link href="/admin/productos" className="text-amber-700 underline underline-offset-2">
                  Productos
                </Link>
                .
              </span>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {avisos.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">
                {avisos.length === 1 ? "1 cosa pide atención" : `${avisos.length} cosas piden atención`}
              </span>
              : {avisos.map((a) => a.nombre).join(", ")}.
            </div>
          )}

          {insumos.length > 0 && (
            <Seccion
              titulo="Insumos"
              nota="lo que compras para preparar; se cuenta a mano"
              icono={<Package className="h-4 w-4" />}
              filas={insumos}
              onMov={(item, kind) => setMov({ item, kind })}
              onHistorial={setHistorial}
              onEditar={setEditar}
              onQuitar={setQuitar}
            />
          )}
          {delMenu.length > 0 && (
            <Seccion
              titulo="De tu menú"
              nota="baja solo con cada venta"
              icono={<Coffee className="h-4 w-4" />}
              filas={delMenu}
              onMov={(item, kind) => setMov({ item, kind })}
              onHistorial={setHistorial}
              onEditar={setEditar}
              onQuitar={setQuitar}
            />
          )}
        </>
      )}

      <AgregarDialog open={agregar} onOpenChange={setAgregar} candidatos={candidatos} />
      {mov && <MovimientoDialog item={movimientoDe(mov.item)} kind={mov.kind} onClose={() => setMov(null)} />}
      {historial && <HistorialDialog item={historial} timezone={timezone} onClose={() => setHistorial(null)} />}
      {editar && <EditarDialog item={editar} onClose={() => setEditar(null)} />}

      <AlertDialog open={!!quitar} onOpenChange={(o) => !o && setQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dejar de contar {quitar?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sale de esta lista{quitar?.esInsumo ? "" : " y deja de bajar con las ventas"}. Su historial se
              conserva, y puedes volver a contarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="blanco-comodo">Seguir contando</AlertDialogCancel>
            <AlertDialogAction
              className="blanco-comodo bg-red-600 hover:bg-red-700"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault()
                if (quitar) dejar(quitar)
              }}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dejar de contar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Una sección de la lista: insumos o menú.                            */
/* ------------------------------------------------------------------ */

function Seccion({
  titulo,
  nota,
  icono,
  filas,
  onMov,
  onHistorial,
  onEditar,
  onQuitar,
}: {
  titulo: string
  nota: string
  icono: ReactNode
  filas: Fila[]
  onMov: (f: Fila, kind: KindManual) => void
  onHistorial: (f: Fila) => void
  onEditar: (f: Fila) => void
  onQuitar: (f: Fila) => void
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-stone-600">
        {icono}
        {titulo}
        <span className="font-normal text-stone-400">· {nota}</span>
      </h2>
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
        {filas.map((item) => {
          const estado = estadoExistencia(item.qty, item.minQty)
          const e = ESTADO[estado]
          const detalle = [
            item.categoria,
            item.minQty > 0 ? `avisa en ${formatCantidad(item.minQty)}` : null,
            item.cost > 0 ? `costo ${formatCurrency(item.cost)} c/u` : null,
          ]
            .filter(Boolean)
            .join(" · ")
          return (
            <li key={item.itemId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-40">
                <p className="font-semibold text-stone-800 truncate">
                  {item.nombre}
                  {!item.activo && (
                    <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-500">
                      fuera del menú
                    </span>
                  )}
                </p>
                {detalle && <p className="text-xs text-stone-500">{detalle}</p>}
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold tabular-nums leading-none ${e.clase}`}>
                  {formatCantidad(item.qty)}
                </p>
                <p className={`mt-1 text-xs ${e.texto ? e.clase : "text-stone-400"}`}>
                  {e.texto ?? UNIDADES.find((u) => u.id === item.unidad)?.varios ?? "piezas"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="blanco-comodo" onClick={() => onMov(item, "entrada")}>
                  <ArrowDownToLine className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Entrada</span>
                </Button>
                <Button variant="outline" size="sm" className="blanco-comodo" onClick={() => onMov(item, "merma")}>
                  <TriangleAlert className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Merma</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="blanco-comodo" aria-label={`Más de ${item.nombre}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onMov(item, "conteo")}>
                      <ClipboardCheck className="h-4 w-4 mr-2" /> Contar lo que hay
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onHistorial(item)}>
                      <History className="h-4 w-4 mr-2" /> Historial
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onEditar(item)}>
                      {item.esInsumo ? "Cambiar nombre, unidad o aviso" : "Cambiar el mínimo"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600" onSelect={() => onQuitar(item)}>
                      Dejar de contar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Agregar: un insumo, o algo del menú.                                */
/* ------------------------------------------------------------------ */

function AgregarDialog({
  open,
  onOpenChange,
  candidatos,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  candidatos: Candidato[]
}) {
  const router = useRouter()
  const [clase, setClase] = useState<"insumo" | "menu" | null>(null)
  const [q, setQ] = useState("")
  const [elegido, setElegido] = useState<Candidato | null>(null)
  const [nombre, setNombre] = useState("")
  const [unidad, setUnidad] = useState<Unidad>("pieza")
  const [qty, setQty] = useState("")
  const [min, setMin] = useState("")
  const [isPending, startTransition] = useTransition()

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return candidatos
    return candidatos.filter((c) => `${c.nombre} ${c.categoria}`.toLowerCase().includes(t))
  }, [q, candidatos])

  function cerrar(o: boolean) {
    if (!o) {
      setClase(null)
      setQ("")
      setElegido(null)
      setNombre("")
      setUnidad("pieza")
      setQty("")
      setMin("")
    }
    onOpenChange(o)
  }

  function guardar() {
    const nQty = qty.trim() === "" ? 0 : Number(qty)
    const nMin = min.trim() === "" ? 0 : Number(min)
    if (!Number.isFinite(nQty) || nQty < 0) return toast.error("Escribe cuánto hay.")
    if (!Number.isFinite(nMin) || nMin < 0) return toast.error("El mínimo no es válido.")
    if (clase === "menu") {
      if (!elegido) return
      if (!Number.isInteger(nQty) || !Number.isInteger(nMin)) {
        return toast.error("Lo del menú se cuenta en piezas enteras.")
      }
      startTransition(async () => {
        const r = await contarDelMenu({ variantId: elegido.variantId, qty: nQty, minQty: nMin })
        if (!r.success) {
          toast.error(r.error)
          return
        }
        toast.success(`${elegido.nombre}: se cuenta desde hoy, con ${nQty}.`)
        cerrar(false)
        router.refresh()
      })
      return
    }
    if (!nombre.trim()) return toast.error("Escribe el nombre del insumo.")
    startTransition(async () => {
      const r = await guardarInsumo({ nombre: nombre.trim(), unidad, qty: nQty, minQty: nMin })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${nombre.trim()}: se cuenta desde hoy, con ${conUnidad(nQty, unidad)}.`)
      cerrar(false)
      router.refresh()
    })
  }

  const titulo =
    clase === null
      ? "¿Qué quieres contar?"
      : clase === "insumo"
        ? "Un insumo"
        : (elegido?.nombre ?? "Algo de tu menú")

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="overflow-y-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {clase === null
              ? "Las dos se cuentan igual; la diferencia es si baja sola con la venta."
              : clase === "insumo"
                ? "Lo que compras para preparar y no está en tu menú."
                : elegido
                  ? "Cuánto hay ahora mismo y, si quieres, a partir de cuánto avisar."
                  : "Lo que compras hecho y vendes tal cual. Toca uno para empezar a contarlo."}
          </DialogDescription>
        </DialogHeader>

        {clase === null && (
          <div className="flex-1 min-h-0 overflow-y-auto content-start grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setClase("insumo")}
              className="blanco-comodo rounded-xl border border-stone-200 p-4 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
            >
              <Package className="h-5 w-5 text-amber-700" />
              <span className="mt-2 block font-semibold text-stone-800">Un insumo</span>
              <span className="mt-1 block text-xs text-stone-500">
                Café en grano, leche, vasos, servilletas, azúcar. Lo cuentas tú.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setClase("menu")}
              className="blanco-comodo rounded-xl border border-stone-200 p-4 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
            >
              <Coffee className="h-5 w-5 text-amber-700" />
              <span className="mt-2 block font-semibold text-stone-800">Algo de tu menú</span>
              <span className="mt-1 block text-xs text-stone-500">
                Panqués, galletas, botellas: lo que vendes tal cual. Baja solo.
              </span>
            </button>
          </div>
        )}

        {clase === "menu" && !elegido && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en tu menú…"
                className="blanco-comodo pl-9"
              />
            </div>
            <ul className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2 divide-y divide-stone-100">
              {filtrados.length === 0 && (
                <li className="py-8 text-center text-sm text-stone-400">
                  {candidatos.length === 0 ? "Ya cuentas todo lo que hay en el menú." : "Nada con ese nombre."}
                </li>
              )}
              {filtrados.map((c) => (
                <li key={c.variantId}>
                  <button
                    type="button"
                    onClick={() => setElegido(c)}
                    className="blanco-comodo w-full text-left px-2 py-2 hover:bg-amber-50 rounded-md"
                  >
                    <span className="block text-sm font-medium text-stone-800">{c.nombre}</span>
                    <span className="block text-xs text-stone-500">{c.categoria}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {(clase === "insumo" || (clase === "menu" && elegido)) && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 -mx-1 px-1">
            {clase === "insumo" && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="ins-nombre" className="text-sm font-medium text-stone-700">
                    ¿Qué es?
                  </label>
                  <Input
                    id="ins-nombre"
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="p. ej. Vasos chicos"
                    maxLength={80}
                    className="blanco-comodo"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-stone-700">¿Cómo lo cuentas?</p>
                  <div className="flex flex-wrap gap-2">
                    {UNIDADES.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setUnidad(u.id)}
                        className={`blanco-comodo rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          unidad === u.id
                            ? "border-amber-600 bg-amber-600 text-white"
                            : "border-stone-300 text-stone-700 hover:bg-stone-50"
                        }`}
                      >
                        {u.varios}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <label htmlFor="qty-inicial" className="text-sm font-medium text-stone-700">
                ¿Cuánto hay ahora?
              </label>
              <Input
                id="qty-inicial"
                autoFocus={clase === "menu"}
                type="number"
                inputMode={clase === "menu" ? "numeric" : "decimal"}
                min={0}
                step={clase === "menu" ? 1 : "any"}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="blanco-comodo text-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="min-inicial" className="text-sm font-medium text-stone-700">
                Avísame cuando queden (opcional)
              </label>
              <Input
                id="min-inicial"
                type="number"
                inputMode={clase === "menu" ? "numeric" : "decimal"}
                min={0}
                step={clase === "menu" ? 1 : "any"}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="Sin aviso"
                className="blanco-comodo"
              />
              <p className="text-xs text-stone-400">
                {clase === "menu"
                  ? "Con 3, el POS enseña «quedan 3» en la tarjeta y aquí aparece en ámbar."
                  : "Con 2, aparece en ámbar aquí para que sepas que toca comprar."}
              </p>
            </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="blanco-comodo"
                onClick={() => (clase === "menu" ? setElegido(null) : setClase(null))}
              >
                Atrás
              </Button>
              <Button
                type="button"
                className="blanco-comodo bg-amber-700 hover:bg-amber-800 text-white"
                disabled={isPending}
                onClick={guardar}
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Empezar a contar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Historial: el diario como estado de cuenta. Se pide al abrirlo y    */
/*  solo el de este artículo: así nunca se corta por lo que movió el    */
/*  resto del café.                                                     */
/* ------------------------------------------------------------------ */

function HistorialDialog({ item, timezone, onClose }: { item: Fila; timezone: string; onClose: () => void }) {
  const [historial, setHistorial] = useState<{ movimientos: Movimiento[]; completo: boolean } | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    historialDe(item.itemId).then((r) => {
      if (!vivo) return
      if (!r.success) setFallo(r.error || "No se pudo leer el historial.")
      else setHistorial({ movimientos: r.movimientos, completo: r.completo })
    })
    return () => {
      vivo = false
    }
  }, [item.itemId])
  const movimientos = historial?.movimientos ?? []
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-y-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{item.nombre}</DialogTitle>
          <DialogDescription>Cada renglón dice qué pasó y cuánto quedó. Lo más reciente arriba.</DialogDescription>
        </DialogHeader>
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
          {!historial && !fallo && (
            <li className="py-8 flex justify-center text-stone-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </li>
          )}
          {fallo && <li className="py-8 text-center text-sm text-red-700">{fallo}</li>}
          {historial && movimientos.length === 0 && (
            <li className="py-8 text-center text-sm text-stone-400">Sin movimientos todavía.</li>
          )}
          {movimientos.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="text-stone-800">{describirMovimiento(m, item.unidad)}</p>
                <p className="text-xs text-stone-400">
                  {formatDateTime(m.at, timezone)}
                  {m.actor && ` · ${m.actor}`}
                </p>
              </div>
              <p className="shrink-0 tabular-nums text-stone-500">
                <span className={m.qty > 0 ? "text-emerald-700" : "text-red-700"}>
                  {m.qty > 0 ? `+${formatCantidad(m.qty)}` : formatCantidad(m.qty)}
                </span>{" "}
                → <span className="font-semibold text-stone-800">{formatCantidad(m.qtyAfter)}</span>
              </p>
            </li>
          ))}
        </ul>
        {historial && !historial.completo && (
          <p className="text-xs text-stone-400">Se muestran los últimos {movimientos.length} movimientos.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Editar: el aviso siempre; nombre y unidad solo en un insumo.        */
/* ------------------------------------------------------------------ */

function EditarDialog({ item, onClose }: { item: Fila; onClose: () => void }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(item.nombre)
  const [unidad, setUnidad] = useState<Unidad>(item.unidad)
  const [min, setMin] = useState(item.minQty ? formatCantidad(item.minQty) : "")
  const [isPending, startTransition] = useTransition()

  function guardar() {
    const n = min.trim() === "" ? 0 : Number(min)
    if (!Number.isFinite(n) || n < 0) return toast.error("El mínimo no es válido.")
    if (!item.esInsumo && !Number.isInteger(n)) return toast.error("Lo del menú se cuenta en piezas enteras.")
    if (item.esInsumo && !nombre.trim()) return toast.error("Escribe el nombre del insumo.")
    startTransition(async () => {
      const r = item.esInsumo
        ? await guardarInsumo({ supplyId: item.supplyId, nombre: nombre.trim(), unidad, minQty: n })
        : await contarDelMenu({ variantId: item.variantId ?? "", qty: null, minQty: n })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(
        n === 0 ? `${nombre.trim()}: sin aviso.` : `${nombre.trim()}: avisa en ${formatCantidad(n)}.`,
      )
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.esInsumo ? "Cambiar este insumo" : "¿A partir de cuántas avisar?"}</DialogTitle>
          <DialogDescription>{item.nombre}. Vacío o 0 = sin aviso.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {item.esInsumo && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="ed-nombre" className="text-sm font-medium text-stone-700">
                  Nombre
                </label>
                <Input
                  id="ed-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  maxLength={80}
                  className="blanco-comodo"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-stone-700">¿Cómo lo cuentas?</p>
                <div className="flex flex-wrap gap-2">
                  {UNIDADES.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnidad(u.id)}
                      className={`blanco-comodo rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        unidad === u.id
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-stone-300 text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      {u.varios}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-stone-400">
                  Cambiar la unidad no convierte lo que ya tienes contado: el número se queda igual.
                </p>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <label htmlFor="ed-min" className="text-sm font-medium text-stone-700">
              Avísame cuando queden
            </label>
            <Input
              id="ed-min"
              autoFocus={!item.esInsumo}
              type="number"
              inputMode={item.esInsumo ? "decimal" : "numeric"}
              min={0}
              step={item.esInsumo ? "any" : 1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="Sin aviso"
              className="blanco-comodo text-lg"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="blanco-comodo" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="blanco-comodo bg-amber-700 hover:bg-amber-800 text-white"
            disabled={isPending}
            onClick={guardar}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
