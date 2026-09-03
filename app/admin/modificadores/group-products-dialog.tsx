"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Package, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { setGroupProducts } from "@/app/actions/modifiers"
import type { ProductChoice } from "./modificadores-client"

/**
 * «¿En qué productos va esta opción?», desde la pantalla del grupo.
 *
 * Antes el vínculo solo se podía armar desde el editor de Productos, entrando
 * uno por uno. Pero nadie piensa así: uno piensa «este extra va en los
 * chilaquiles y en las enchiladas» y quiere decirlo de una vez. La pantalla
 * del grupo solo informaba «Sin productos asignados», sin nada que tocar —una
 * dueña real se quedó exactamente ahí—.
 *
 * Se guarda con un botón explícito y no al marcar cada casilla: marcar diez
 * productos serían diez guardados, diez avisos y diez entradas en el registro
 * de actividad para una sola decisión.
 */
export function GroupProductsDialog({
  open,
  onOpenChange,
  groupName,
  groupId,
  catalogo,
  seleccionInicial,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  groupName: string
  groupId: string
  catalogo: ProductChoice[]
  seleccionInicial: string[]
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState("")
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(seleccionInicial))
  const [guardando, setGuardando] = useState(false)

  const porCategoria = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const filtrados = q
      ? catalogo.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      : catalogo
    const mapa = new Map<string, ProductChoice[]>()
    for (const p of filtrados) {
      const lista = mapa.get(p.category) ?? []
      lista.push(p)
      mapa.set(p.category, lista)
    }
    return [...mapa.entries()]
  }, [catalogo, busqueda])

  const alternar = (id: string) => {
    setElegidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Toda la categoría de un toque: «Tipo de leche» va en las 20 bebidas calientes, no una por una. */
  const alternarTodos = (ids: string[], marcar: boolean) => {
    setElegidos((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (marcar) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const r = await setGroupProducts({ groupId, productIds: [...elegidos] })
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success(
        elegidos.size === 0
          ? `«${groupName}» ya no se pregunta en ningún producto`
          : `«${groupName}» se preguntará en ${elegidos.size} ${elegidos.size === 1 ? "producto" : "productos"}`,
      )
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error("No se guardó: falló la conexión. Vuelve a intentar.")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 flex max-h-[85vh] flex-col">
        <DialogHeader className="shrink-0 border-b border-stone-200 px-5 pt-5 pb-4">
          <DialogTitle className="text-lg">¿En qué productos va?</DialogTitle>
          <DialogDescription>
            Al vender uno de estos, el POS preguntará <strong>«{groupName}»</strong>. Marca «Toda la categoría» para
            engancharla a todos los de esa categoría de un toque.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o categoría…"
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-5 py-3">
          {catalogo.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">
              Aún no tienes productos. Créalos primero en Productos.
            </p>
          ) : porCategoria.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">Ningún producto coincide con «{busqueda}».</p>
          ) : (
            <div className="space-y-4">
              {porCategoria.map(([categoria, productos]) => (
                <div key={categoria}>
                  {(() => {
                    const ids = productos.map((p) => p.id)
                    const marcados = ids.filter((id) => elegidos.has(id)).length
                    const todos = marcados === ids.length
                    return (
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{categoria}</p>
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-600">
                          <input
                            type="checkbox"
                            checked={todos}
                            ref={(el) => {
                              if (el) el.indeterminate = !todos && marcados > 0
                            }}
                            onChange={() => alternarTodos(ids, !todos)}
                            aria-label={`Toda la categoría ${categoria}`}
                            className="h-4 w-4 rounded border-stone-300 accent-amber-600"
                          />
                          Toda la categoría{marcados > 0 && !todos ? ` (${marcados} de ${ids.length})` : ""}
                        </label>
                      </div>
                    )
                  })()}
                  <div className="space-y-1">
                    {productos.map((p) => {
                      const on = elegidos.has(p.id)
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            on
                              ? "border-amber-300 bg-amber-50 text-stone-800"
                              : "border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => alternar(p.id)}
                            className="h-4 w-4 shrink-0 rounded border-stone-300 accent-amber-600"
                          />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="shrink-0 border-t border-stone-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-stone-500">
              <Package className="mr-1.5 inline h-4 w-4 text-stone-400" />
              {elegidos.size === 0 ? "Ningún producto" : `${elegidos.size} seleccionado${elegidos.size === 1 ? "" : "s"}`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando} className="bg-amber-600 hover:bg-amber-700">
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
