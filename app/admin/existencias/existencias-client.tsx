"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowDownToLine,
  Boxes,
  ClipboardCheck,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react"
import { dejarDeContar, marcarPorPieza } from "@/app/actions/existencias"
import { MovimientoDialog } from "@/components/movimiento-existencia-dialog"
import {
  describirMovimiento,
  estadoExistencia,
  type EstadoExistencia,
  type KindManual,
  type KindMovimiento,
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

export interface ItemExistencia {
  variantId: string
  nombre: string
  categoria: string
  categoriaOrden: number
  qty: number
  minQty: number
  cost: number
  price: number
  /** false = el producto o la variante se desactivó: sigue contándose, pero se avisa. */
  activo: boolean
  updatedAt: string
}

export interface Candidato {
  variantId: string
  nombre: string
  categoria: string
  categoriaOrden: number
}

export interface Movimiento {
  id: string
  variantId: string
  kind: KindMovimiento
  qty: number
  qtyAfter: number
  unitCost: number | null
  reason: string | null
  folio: number | null
  actor: string | null
  at: string
}

const ESTADO: Record<EstadoExistencia, { clase: string; texto: string | null }> = {
  ok: { clase: "text-stone-800", texto: null },
  bajo: { clase: "text-amber-700", texto: "Se está acabando" },
  agotado: { clase: "text-red-700", texto: "Agotado" },
  negativo: { clase: "text-red-700", texto: "Vendiste más de lo que había: cuéntalo" },
}

/**
 * Existencias: lo que se cuenta por pieza. Es el ÚNICO punto de entrada del
 * módulo: quien no agrega nada aquí no ve nada nuevo en ningún lado.
 * Diseño en docs/inventario.md.
 */
export function ExistenciasClient({
  items,
  candidatos,
  movimientos,
  timezone,
}: {
  items: ItemExistencia[]
  candidatos: Candidato[]
  movimientos: Movimiento[]
  timezone: string
}) {
  const router = useRouter()
  const [agregar, setAgregar] = useState(false)
  const [mov, setMov] = useState<{ item: ItemExistencia; kind: KindManual } | null>(null)
  const [historial, setHistorial] = useState<ItemExistencia | null>(null)
  const [minimo, setMinimo] = useState<ItemExistencia | null>(null)
  const [quitar, setQuitar] = useState<ItemExistencia | null>(null)
  const [isPending, startTransition] = useTransition()

  const avisos = items.filter((i) => estadoExistencia(i.qty, i.minQty) !== "ok")
  const porVariante = useMemo(() => {
    const m = new Map<string, Movimiento[]>()
    for (const x of movimientos) {
      const lista = m.get(x.variantId) ?? []
      lista.push(x)
      m.set(x.variantId, lista)
    }
    return m
  }, [movimientos])

  function dejar(item: ItemExistencia) {
    startTransition(async () => {
      const r = await dejarDeContar(item.variantId)
      setQuitar(null)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${item.nombre} ya no se cuenta. Su historial se conserva.`)
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
            Lo que se compra y se vende por pieza: pan, botellas, pasteles. Baja solo con cada venta; tú registras
            lo que llega y lo que se pierde.
          </p>
        </div>
        <Button onClick={() => setAgregar(true)} className="blanco-comodo bg-amber-700 hover:bg-amber-800 text-white">
          <Plus className="h-4 w-4 mr-2" /> Contar un artículo
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Todavía no cuentas nada por pieza</CardTitle>
            <CardDescription>
              Elige qué contar con «Contar un artículo»: lo que se compra hecho y se vende tal cual. Las bebidas que
              se preparan no van aquí — para eso está el costo de cada producto en{" "}
              <Link href="/admin/productos" className="text-amber-700 underline underline-offset-2">
                Productos
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {avisos.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">
                {avisos.length === 1 ? "1 artículo pide atención" : `${avisos.length} artículos piden atención`}
              </span>
              : {avisos.map((a) => a.nombre).join(", ")}.
            </div>
          )}

          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {items.map((item) => {
              const estado = estadoExistencia(item.qty, item.minQty)
              const e = ESTADO[estado]
              return (
                <li key={item.variantId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="font-semibold text-stone-800 truncate">
                      {item.nombre}
                      {!item.activo && (
                        <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-500">
                          fuera del menú
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-stone-500">
                      {item.categoria}
                      {item.minQty > 0 && ` · avisa en ${item.minQty}`}
                      {item.cost > 0 && ` · costo ${formatCurrency(item.cost)} c/u`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold tabular-nums leading-none ${e.clase}`}>{item.qty}</p>
                    {e.texto && <p className={`mt-1 text-xs ${e.clase}`}>{e.texto}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="blanco-comodo"
                      onClick={() => setMov({ item, kind: "entrada" })}
                    >
                      <ArrowDownToLine className="h-4 w-4 sm:mr-1.5" />
                      <span className="hidden sm:inline">Entrada</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="blanco-comodo"
                      onClick={() => setMov({ item, kind: "merma" })}
                    >
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
                        <DropdownMenuItem onSelect={() => setMov({ item, kind: "conteo" })}>
                          <ClipboardCheck className="h-4 w-4 mr-2" /> Contar lo que hay
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setHistorial(item)}>
                          <History className="h-4 w-4 mr-2" /> Historial
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setMinimo(item)}>Cambiar el mínimo</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onSelect={() => setQuitar(item)}>
                          Dejar de contar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <AgregarDialog open={agregar} onOpenChange={setAgregar} candidatos={candidatos} />
      {mov && <MovimientoDialog item={mov.item} kind={mov.kind} onClose={() => setMov(null)} />}
      {historial && (
        <HistorialDialog
          item={historial}
          movimientos={porVariante.get(historial.variantId) ?? []}
          timezone={timezone}
          onClose={() => setHistorial(null)}
        />
      )}
      {minimo && <MinimoDialog item={minimo} onClose={() => setMinimo(null)} />}

      <AlertDialog open={!!quitar} onOpenChange={(o) => !o && setQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dejar de contar {quitar?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de bajar con las ventas y sale de esta lista. Su historial se conserva, y puedes volver a contarlo
              cuando quieras.
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
/*  Contar un artículo: elegirlo del menú y decir cuántos hay hoy.      */
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
  const [q, setQ] = useState("")
  const [elegido, setElegido] = useState<Candidato | null>(null)
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
      setQ("")
      setElegido(null)
      setQty("")
      setMin("")
    }
    onOpenChange(o)
  }

  function guardar() {
    if (!elegido) return
    const nQty = qty.trim() === "" ? 0 : Number(qty)
    const nMin = min.trim() === "" ? 0 : Number(min)
    if (!Number.isInteger(nQty) || nQty < 0) return toast.error("Escribe cuántas piezas hay (un número entero).")
    if (!Number.isInteger(nMin) || nMin < 0) return toast.error("El mínimo tiene que ser un número entero.")
    startTransition(async () => {
      const r = await marcarPorPieza({ variantId: elegido.variantId, qty: nQty, minQty: nMin })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(`${elegido.nombre}: se cuenta desde hoy, con ${nQty}.`)
      cerrar(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="overflow-y-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{elegido ? elegido.nombre : "¿Qué se cuenta por pieza?"}</DialogTitle>
          <DialogDescription>
            {elegido
              ? "Cuántas hay ahora mismo y, si quieres, a partir de cuántas avisar."
              : "Lo que se compra hecho y se vende tal cual. Toca uno para empezar a contarlo."}
          </DialogDescription>
        </DialogHeader>

        {!elegido ? (
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
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="qty-inicial" className="text-sm font-medium text-stone-700">
                ¿Cuántas hay ahora?
              </label>
              <Input
                id="qty-inicial"
                autoFocus
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
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
                inputMode="numeric"
                min={0}
                step={1}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder="Sin aviso"
                className="blanco-comodo"
              />
              <p className="text-xs text-stone-400">
                Con 3, el POS enseña «quedan 3» en la tarjeta y aquí aparece en ámbar.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="blanco-comodo" onClick={() => setElegido(null)}>
                Elegir otro
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Historial: el diario como estado de cuenta.                         */
/* ------------------------------------------------------------------ */

function HistorialDialog({
  item,
  movimientos,
  timezone,
  onClose,
}: {
  item: ItemExistencia
  movimientos: Movimiento[]
  timezone: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-y-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{item.nombre}</DialogTitle>
          <DialogDescription>Cada renglón dice qué pasó y cuántas quedaron. Lo más reciente arriba.</DialogDescription>
        </DialogHeader>
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
          {movimientos.length === 0 && (
            <li className="py-8 text-center text-sm text-stone-400">Sin movimientos todavía.</li>
          )}
          {movimientos.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="text-stone-800">{describirMovimiento(m)}</p>
                <p className="text-xs text-stone-400">
                  {formatDateTime(m.at, timezone)}
                  {m.actor && ` · ${m.actor}`}
                </p>
              </div>
              <p className="shrink-0 tabular-nums text-stone-500">
                <span className={m.qty > 0 ? "text-emerald-700" : "text-red-700"}>
                  {m.qty > 0 ? `+${m.qty}` : m.qty}
                </span>{" "}
                → <span className="font-semibold text-stone-800">{m.qtyAfter}</span>
              </p>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Cambiar el mínimo.                                                  */
/* ------------------------------------------------------------------ */

function MinimoDialog({ item, onClose }: { item: ItemExistencia; onClose: () => void }) {
  const router = useRouter()
  const [min, setMin] = useState(String(item.minQty || ""))
  const [isPending, startTransition] = useTransition()

  function guardar() {
    const n = min.trim() === "" ? 0 : Number(min)
    if (!Number.isInteger(n) || n < 0) return toast.error("El mínimo tiene que ser un número entero.")
    startTransition(async () => {
      const r = await marcarPorPieza({ variantId: item.variantId, qty: null, minQty: n })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(n === 0 ? `${item.nombre}: sin aviso.` : `${item.nombre}: avisa cuando queden ${n}.`)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿A partir de cuántas avisar?</DialogTitle>
          <DialogDescription>{item.nombre}. Vacío o 0 = sin aviso.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="Sin aviso"
          className="blanco-comodo text-lg"
        />
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
