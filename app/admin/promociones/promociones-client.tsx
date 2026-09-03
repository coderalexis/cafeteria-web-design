"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BarChart3, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { deletePromotion, savePromotion, togglePromotion } from "@/app/actions/promotions"
import {
  DIAS,
  cuandoLegible,
  ejemploPromo,
  empalmeLegible,
  horaLegible,
  promosEmpalmadas,
  queDaLegible,
  validarPromo,
  type AmbitoPromo,
  type BorradorPromo,
  type EjemploProducto,
  type Promocion,
  type TipoPromo,
} from "@/lib/promotions"
import { formatCurrency } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ResultadoPromos } from "./page"

type Borrador = Partial<Promocion>

export function PromocionesClient({
  promociones,
  categorias,
  resultado,
  ejemplos,
}: {
  promociones: Promocion[]
  categorias: Array<{ id: string; name: string }>
  resultado: ResultadoPromos | null
  /** Un producto de muestra por categoría (id → nombre y precio), para la vista previa. */
  ejemplos: Record<string, EjemploProducto>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState<Borrador | null>(null)

  const conVentas = new Map((resultado?.by_promotion ?? []).map((r) => [r.id, r]))

  function guardar(datos: Borrador) {
    startTransition(async () => {
      const r = await savePromotion({
        id: datos.id,
        name: datos.name ?? "",
        kind: datos.kind ?? "porcentaje",
        value: datos.value ?? 0,
        scope: datos.scope ?? "ticket",
        categoryId: datos.categoryId ?? null,
        weekdays: datos.weekdays ?? [],
        startHour: datos.startHour ?? 0,
        endHour: datos.endHour ?? 1,
        minTicket: datos.minTicket ?? 0,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      setEditando(null)
      toast.success(datos.id ? "Promoción actualizada." : `«${datos.name}» ya está corriendo.`)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setEditando({ kind: "porcentaje", scope: "ticket", weekdays: [], startHour: 15, endHour: 18, minTicket: 0 })
          }
        >
          <Plus className="h-4 w-4" />
          Nueva promoción
        </Button>
      </div>

      {promociones.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="font-semibold text-stone-700">Todavía no tienes promociones</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
              Sirven para llenar las horas en las que casi no entra nadie. Si no sabes cuáles son, el sistema ya lo
              sabe: el mapa de calor te dice a qué hora y qué día está más flojo.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/admin/analisis">
                <BarChart3 className="h-4 w-4" />
                Ver mis horas flojas
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promociones.map((p) => {
            const r = conVentas.get(p.id)
            return (
              <Card key={p.id} className={p.isActive ? undefined : "bg-stone-50"}>
                <CardContent className="flex flex-wrap items-start gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-bold ${p.isActive ? "text-stone-800" : "text-stone-400"}`}>{p.name}</h3>
                      {!p.isActive && (
                        <Badge variant="secondary" className="text-[10px]">
                          apagada
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-stone-600">
                      <strong>{queDaLegible(p)}</strong> · {cuandoLegible(p)}
                      {p.minTicket > 0 && ` · desde ${formatCurrency(p.minTicket)}`}
                    </p>
                    {r && r.tickets > 0 ? (
                      <p className="mt-1.5 text-xs text-stone-500">
                        Últimos {resultado?.days} días: <strong className="text-stone-700">{r.tickets} ventas</strong>{" "}
                        y {formatCurrency(r.revenue)} cobrados, con {formatCurrency(r.discount)} de descuento.
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-stone-400">
                        {p.isActive ? "Sin ventas todavía con esta promoción." : "No alcanzó a cobrar ventas."}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={p.isActive}
                      disabled={isPending}
                      aria-label={p.isActive ? `Apagar ${p.name}` : `Encender ${p.name}`}
                      onCheckedChange={(v) =>
                        startTransition(async () => {
                          const res = await togglePromotion(p.id, v)
                          if (!res.success) {
                            toast.error(res.error)
                            return
                          }
                          router.refresh()
                        })
                      }
                    />
                    <Button variant="ghost" size="icon" onClick={() => setEditando(p)} aria-label={`Editar ${p.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar ${p.name}`}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await deletePromotion(p.id)
                          if (!res.success) {
                            toast.error(res.error)
                            return
                          }
                          toast.success("Promoción borrada.")
                          router.refresh()
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {promociones.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cómo se lee esto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm text-stone-600">
            <p>
              El descuento sale solo al cobrar, dentro del horario que pusiste. La cajera lo ve en el carrito antes de
              cerrar la venta, así se lo puede decir al cliente.
            </p>
            <p>
              <strong className="text-stone-700">No se acumulan.</strong> Si dos promociones caen a la misma hora, se
              aplica la que más descuenta. Y si la venta ya lleva un descuento a mano o un premio de lealtad, la
              promoción no entra: un ticket lleva un solo descuento.
            </p>
          </CardContent>
        </Card>
      )}

      <DialogPromo
        valor={editando}
        categorias={categorias}
        otras={promociones}
        ejemplos={ejemplos}
        pendiente={isPending}
        onCerrar={() => setEditando(null)}
        onGuardar={guardar}
      />
    </>
  )
}

function DialogPromo({
  valor,
  categorias,
  otras,
  ejemplos,
  pendiente,
  onCerrar,
  onGuardar,
}: {
  valor: Borrador | null
  categorias: Array<{ id: string; name: string }>
  otras: Promocion[]
  ejemplos: Record<string, EjemploProducto>
  pendiente: boolean
  onCerrar: () => void
  onGuardar: (d: Borrador) => void
}) {
  const [d, setD] = useState<Borrador>({})
  const [clave, setClave] = useState<string | null>(null)

  const claveActual = valor ? (valor.id ?? "nueva") : null
  if (claveActual !== clave) {
    setClave(claveActual)
    setD(valor ?? {})
  }

  function set<K extends keyof Borrador>(k: K, v: Borrador[K]) {
    setD((prev) => ({ ...prev, [k]: v }))
  }

  const dias = d.weekdays ?? []
  // Lo que se va a guardar, dicho antes de guardarlo: la regla en palabras,
  // un ejemplo con precio real, los empalmes con otras promociones vivas y
  // lo primero que falta. Guardar se abre solo cuando ya no falta nada.
  const borrador: BorradorPromo = {
    id: d.id,
    name: d.name ?? "",
    kind: d.kind ?? "porcentaje",
    value: d.value ?? 0,
    scope: d.scope ?? "ticket",
    categoryId: d.categoryId ?? null,
    weekdays: dias,
    startHour: d.startHour ?? 15,
    endHour: d.endHour ?? 18,
    minTicket: d.minTicket ?? 0,
  }
  const problema = validarPromo(borrador)
  const ejemplo = ejemploPromo(borrador, ejemplos)
  const empalmes = promosEmpalmadas(borrador, otras)
  const categoriaNombre = categorias.find((c) => c.id === d.categoryId)?.name ?? null
  const regla = `${cuandoLegible(borrador).toLowerCase()}${borrador.minTicket > 0 ? `, en compras desde ${formatCurrency(borrador.minTicket)}` : ""}`

  return (
    <Dialog open={valor != null} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d.id ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
          <DialogDescription>
            El cliente ve el nombre impreso en su ticket, así que ponle uno que se entienda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="promo-nombre">Nombre</Label>
            <Input
              id="promo-nombre"
              value={d.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Tarde de frappés"
              autoFocus
            />
          </div>

          {/* Cuánto */}
          <div className="space-y-1.5">
            <Label>Cuánto descuenta</Label>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-stone-200 p-0.5">
                {(["porcentaje", "monto"] as TipoPromo[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("kind", k)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      (d.kind ?? "porcentaje") === k
                        ? "bg-stone-800 font-semibold text-white"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {k === "porcentaje" ? "%" : "$"}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="flex-1"
                value={d.value ?? ""}
                onChange={(e) => set("value", Number(e.target.value))}
                placeholder={(d.kind ?? "porcentaje") === "porcentaje" ? "20" : "25"}
              />
            </div>
          </div>

          {/* Sobre qué */}
          <div className="space-y-1.5">
            <Label>Sobre qué</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["ticket", "categoria"] as AmbitoPromo[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("scope", s)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    (d.scope ?? "ticket") === s
                      ? "border-amber-600 bg-amber-600 font-semibold text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {s === "ticket" ? "Toda la venta" : "Una categoría"}
                </button>
              ))}
            </div>
            {d.scope === "categoria" && (
              <select
                className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                value={d.categoryId ?? ""}
                onChange={(e) => set("categoryId", e.target.value || null)}
              >
                <option value="">Elige una categoría…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Cuándo */}
          <div className="space-y-1.5">
            <Label>Qué días</Label>
            <div className="flex gap-1.5">
              {DIAS.map((dia) => {
                const activo = dias.includes(dia.valor)
                return (
                  <button
                    key={dia.valor}
                    type="button"
                    aria-label={dia.largo}
                    aria-pressed={activo}
                    onClick={() =>
                      set(
                        "weekdays",
                        activo ? dias.filter((x) => x !== dia.valor) : [...dias, dia.valor],
                      )
                    }
                    className={`h-10 w-10 rounded-full border text-sm font-semibold transition-colors ${
                      activo
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                    }`}
                  >
                    {dia.corto}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="promo-desde">Desde</Label>
              <select
                id="promo-desde"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                value={d.startHour ?? 15}
                onChange={(e) => set("startHour", Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {horaLegible(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-hasta">Hasta</Label>
              <select
                id="promo-hasta"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                value={d.endHour ?? 18}
                onChange={(e) => set("endHour", Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {horaLegible(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="promo-min">Compra mínima (opcional)</Label>
            <Input
              id="promo-min"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={d.minTicket ?? 0}
              onChange={(e) => set("minTicket", Number(e.target.value))}
              placeholder="0"
            />
            <p className="text-xs text-stone-400">Déjalo en 0 si aplica sin importar cuánto lleve el cliente.</p>
          </div>

          {/* Vista previa: la regla en voz alta, un ejemplo con precio real,
              los empalmes y lo que falta, todo antes de guardar. */}
          <div className="space-y-1.5 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600" data-promo-vista-previa>
            {problema ? (
              <p className="text-stone-500" role="status">
                {problema}
              </p>
            ) : (
              <p>
                Queda así:{" "}
                <strong className="text-stone-800">
                  {queDaLegible({ kind: borrador.kind, value: borrador.value, scope: borrador.scope, categoryName: categoriaNombre })}
                </strong>
                , {regla}
                {regla.endsWith(".") ? "" : "."}
              </p>
            )}
            {ejemplo && (
              <p data-promo-ejemplo>
                Por ejemplo, {ejemplo.sujeto} quedará en <strong className="text-stone-800">{formatCurrency(ejemplo.despues)}</strong>{" "}
                (ahorra {formatCurrency(ejemplo.ahorro)}).
              </p>
            )}
            {empalmes.length > 0 && (
              <p className="text-amber-800" data-promo-empalme>
                Se empalma con {empalmes.map(empalmeLegible).join(" y ")}. No se acumulan: a esa hora se aplica la que más
                descuente.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={pendiente || problema !== null} onClick={() => onGuardar({ ...d, name: (d.name ?? "").trim() })}>
            {pendiente && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
