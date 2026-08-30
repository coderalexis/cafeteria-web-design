"use client"

import { useState } from "react"
import { createCategory, updateCategory, deleteCategory, moveCategory } from "@/app/actions/menu"
import { ActionForm } from "@/components/action-form"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_NOTE_MAX } from "@/lib/settings"
import { CATEGORY_COLORS, COLOR_CLASSES, isCategoryColor } from "@/lib/category-colors"
import { Tag, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight } from "lucide-react"

export interface CategoryRecord {
  id: string
  name: string
  color: string | null
  note: string | null
  productCount: number
}

/**
 * Selector de color con radios nativos: el POS pinta los chips de categoría y
 * la franja de las tarjetas con este color.
 */
function ColorPicker({ value }: { value?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer" title="Sin color">
        <input type="radio" name="color" value="" defaultChecked={!isCategoryColor(value)} className="peer sr-only" />
        <span className="block h-8 w-8 rounded-full border-2 border-dashed border-stone-300 bg-white peer-checked:ring-2 peer-checked:ring-stone-500 peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500" />
      </label>
      {CATEGORY_COLORS.map((color) => (
        <label key={color} className="cursor-pointer" title={COLOR_CLASSES[color].label}>
          <input type="radio" name="color" value={color} defaultChecked={value === color} className="peer sr-only" />
          <span
            className={`block h-8 w-8 rounded-full ${COLOR_CLASSES[color].dot} peer-checked:ring-2 peer-checked:ring-stone-500 peer-checked:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500`}
          />
        </label>
      ))}
    </div>
  )
}

/** Los campos que se llenan igual al crear y al editar. */
function CamposCategoria({ categoria }: { categoria?: CategoryRecord }) {
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-stone-500">Nombre</label>
        <Input name="name" defaultValue={categoria?.name} placeholder="ej. Bebidas calientes" required autoFocus={!categoria} />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-stone-500">Color en el POS</label>
        <ColorPicker value={categoria?.color} />
        <p className="text-xs text-stone-400">Ayuda al cajero a encontrar la categoría de un vistazo.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-stone-500">Nota para la carta pública (opcional)</label>
        <Input
          name="note"
          defaultValue={categoria?.note ?? ""}
          maxLength={CATEGORY_NOTE_MAX}
          placeholder="ej. Incluyen café del día y fruta"
        />
        <p className="text-xs text-stone-400">Aparece bajo el título de la categoría en el menú del QR.</p>
      </div>
    </>
  )
}

/**
 * Categorías: una lista que se lee, y la edición en una hoja aparte.
 *
 * Antes cada categoría traía su formulario completo abierto —dos campos,
 * siete colores, nota y botón— para las diez a la vez. La pantalla parecía
 * un formulario gigante en lugar de una lista, y en el teléfono cada
 * renglón medía 327 px: recorrer diez categorías eran más de tres mil
 * píxeles de deslizamiento.
 *
 * Ahora la lista dice lo que importa de un vistazo (orden, color, nombre y
 * cuántos productos tiene) y editar se abre al tocar, igual que en
 * Productos. Que las dos pantallas del menú se manejen igual es parte del
 * arreglo: eran dos formas distintas de hacer lo mismo.
 */
export default function CategoriasClient({ categories }: { categories: CategoryRecord[] }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const seleccionada = categories.find((c) => c.id === abierta) ?? null
  const hojaAbierta = creando || seleccionada !== null

  const cerrar = () => {
    setCreando(false)
    setAbierta(null)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            Categorías
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {categories.length === 0
              ? "Son las secciones de tu carta: Bebidas, Postres, Desayunos…"
              : `${categories.length} ${categories.length === 1 ? "categoría" : "categorías"} · toca una para editarla`}
          </p>
        </div>
        <Button onClick={() => setCreando(true)} className="bg-blue-600 hover:bg-blue-700 gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nueva categoría
        </Button>
      </div>

      {/* Lista */}
      {categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 py-12 text-center">
          <Tag className="mx-auto h-8 w-8 text-stone-300" />
          <p className="mt-3 text-sm font-medium text-stone-600">Aún no tienes categorías</p>
          <p className="mt-1 text-sm text-stone-400">Crea la primera y luego agrégale productos.</p>
          <Button onClick={() => setCreando(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />
            Nueva categoría
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-stone-400">
            El orden de esta lista es el orden de las pestañas en el POS.
          </p>
          {categories.map((c, index) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white transition-colors hover:border-blue-300"
            >
              {/* Orden. Va fuera del botón que abre la hoja —un botón dentro
                  de otro no es HTML válido— y detiene la propagación para que
                  reordenar no abra la edición. */}
              <div className="flex shrink-0 flex-col pl-2" onClick={(e) => e.stopPropagation()}>
                <ActionForm action={moveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={index === 0}
                    title="Subir"
                    className="flex h-6 w-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </ActionForm>
                <ActionForm action={moveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={index === categories.length - 1}
                    title="Bajar"
                    className="flex h-6 w-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </ActionForm>
              </div>

              <button
                type="button"
                onClick={() => setAbierta(c.id)}
                className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left"
              >
                <span
                  aria-hidden
                  className={`h-3 w-3 shrink-0 rounded-full ${
                    isCategoryColor(c.color) ? COLOR_CLASSES[c.color].dot : "border border-dashed border-stone-300"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-stone-800">{c.name}</span>
                  {c.note && <span className="block truncate text-xs text-stone-400">{c.note}</span>}
                </span>
                <Badge variant="outline" className="shrink-0 border-stone-200 text-stone-500">
                  {c.productCount} prod.
                </Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hoja de crear / editar */}
      <Sheet open={hojaAbierta} onOpenChange={(v) => !v && cerrar()}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          {creando ? (
            <>
              <SheetHeader className="shrink-0 border-b border-stone-200 px-6 pt-6 pb-4">
                <SheetTitle className="text-lg">Nueva categoría</SheetTitle>
                <SheetDescription className="text-sm">
                  Una sección de tu carta. Después le agregas productos.
                </SheetDescription>
              </SheetHeader>
              <ActionForm
                action={createCategory}
                className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
                successMessage="Categoría creada"
                onSuccess={cerrar}
              >
                <CamposCategoria />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                  Crear categoría
                </Button>
              </ActionForm>
            </>
          ) : seleccionada ? (
            <>
              <SheetHeader className="shrink-0 border-b border-stone-200 px-6 pt-6 pb-4">
                <SheetTitle className="text-lg">{seleccionada.name}</SheetTitle>
                <SheetDescription className="text-sm">
                  {seleccionada.productCount === 0
                    ? "Todavía sin productos."
                    : `${seleccionada.productCount} ${seleccionada.productCount === 1 ? "producto" : "productos"} en esta categoría.`}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                {/* `key` con el id: al cambiar de categoría sin cerrar la hoja,
                    React reconstruye el formulario y los campos toman los
                    valores de la nueva en vez de quedarse con los anteriores. */}
                <ActionForm
                  key={seleccionada.id}
                  action={updateCategory}
                  className="px-6 py-5 space-y-5"
                  successMessage="Cambios guardados"
                  onSuccess={cerrar}
                >
                  <input type="hidden" name="id" value={seleccionada.id} />
                  <CamposCategoria categoria={seleccionada} />
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                    Guardar cambios
                  </Button>
                </ActionForm>

                <div className="border-t border-stone-200 px-6 py-5">
                  <ActionForm action={deleteCategory} successMessage="Categoría eliminada" onSuccess={cerrar}>
                    <input type="hidden" name="id" value={seleccionada.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={seleccionada.productCount > 0}
                      className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:border-stone-200 disabled:text-stone-400"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar categoría
                    </Button>
                  </ActionForm>
                  {seleccionada.productCount > 0 && (
                    <p className="mt-2 text-xs text-stone-400">
                      Primero mueve o elimina sus {seleccionada.productCount}{" "}
                      {seleccionada.productCount === 1 ? "producto" : "productos"}.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
