"use client"

import { useState } from "react"
import { Eye, EyeOff, Plus, SlidersHorizontal, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ActionForm } from "@/components/action-form"
import {
  createModifier,
  createModifierGroup,
  deleteModifier,
  deleteModifierGroup,
  toggleModifierActive,
  toggleModifierGroupActive,
  updateModifier,
  updateModifierGroup,
} from "@/app/actions/modifiers"
import { formatCurrency } from "@/lib/format"
import { ChoiceRuleField } from "./choice-rule-field"

export interface ModifierGroupRecord {
  id: string
  name: string
  minSelect: number
  maxSelect: number | null
  isRequired: boolean
  isActive: boolean
  options: Array<{ id: string; name: string; priceDelta: number; isActive: boolean }>
  products: Array<{ id: string; name: string }>
}

export default function ModificadoresClient({ groups }: { groups: ModifierGroupRecord[] }) {
  const [showNew, setShowNew] = useState(groups.length === 0)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      {/* El botón baja bajo el título en el teléfono: al lado del texto se
          salía del recuadro, porque el `shrink-0` le impedía encogerse y la
          explicación de arriba es larga a propósito. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6 text-amber-600" />
            Opciones y extras
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Preguntas que el POS le hace al cajero al vender un producto: «¿tipo de leche?», «¿con pollo o huevo?».
            Cada grupo se asigna a sus productos desde el editor de <strong>Productos</strong>.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          Nuevo grupo
        </Button>
      </div>

      {/* Nuevo grupo */}
      {showNew && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nuevo grupo de opciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createModifierGroup} className="grid gap-4 sm:grid-cols-2" successMessage="Grupo creado" resetOnSuccess>
              <div className="space-y-1.5">
                <label htmlFor="nuevo-grupo" className="text-xs font-medium text-stone-500">
                  ¿Qué se le pregunta al cajero?
                </label>
                <Input id="nuevo-grupo" name="name" placeholder="ej. Tipo de leche" required />
                <p className="text-xs text-stone-400">
                  Es el título que aparece al cobrar. Escríbelo como pregunta o como etiqueta corta.
                </p>
              </div>
              <ChoiceRuleField min={0} max={1} />
              <div className="sm:col-span-2">
                <Button type="submit" className="bg-amber-600 text-white hover:bg-amber-700">
                  Crear grupo
                </Button>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 && !showNew && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-stone-400">
            Aún no hay grupos de modificadores.
          </CardContent>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.id} className={g.isActive ? "" : "border-amber-200 bg-amber-50/30"}>
          <CardHeader className="pb-3">
            <ActionForm action={updateModifierGroup} className="grid gap-4 sm:grid-cols-2" successMessage="Cambios guardados">
              <input type="hidden" name="id" value={g.id} />
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">¿Qué se le pregunta al cajero?</label>
                <Input name="name" defaultValue={g.name} required className="font-semibold" />
              </div>
              <ChoiceRuleField
                min={Math.max(g.minSelect, g.isRequired ? 1 : 0)}
                max={g.maxSelect}
                optionCount={g.options.filter((o) => o.isActive).length}
                compact
              />
              <div className="sm:col-span-2">
                <Button type="submit" variant="secondary" size="sm">
                  Guardar cambios
                </Button>
              </div>
            </ActionForm>

            <div className="flex items-center justify-between pt-3">
              <div className="flex items-center gap-2 flex-wrap text-xs text-stone-500">
                {!g.isActive && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Inactivo</Badge>
                )}
                <span>
                  {g.products.length === 0
                    ? "Sin productos asignados"
                    : `En: ${g.products.map((p) => p.name).join(", ")}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <ActionForm action={toggleModifierGroupActive}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="is_active" value={g.isActive ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm" className="gap-1.5 text-stone-500" title={g.isActive ? "Desactivar grupo" : "Activar grupo"}>
                    {g.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {g.isActive ? "Desactivar" : "Activar"}
                  </Button>
                </ActionForm>
                <ActionForm action={deleteModifierGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-stone-400 hover:text-red-600 hover:bg-red-50" title="Eliminar grupo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ActionForm>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-2">
            <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">Opciones</p>
            {g.options.map((opt) => (
              <div
                key={opt.id}
                className={`rounded-lg border p-2.5 ${opt.isActive ? "border-stone-200" : "border-amber-200 bg-amber-50/40"}`}
              >
                <div className="grid grid-cols-12 gap-2 items-center">
                  <ActionForm action={updateModifier} className="contents">
                    <input type="hidden" name="id" value={opt.id} />
                    {/* El nombre ocupa el renglón completo en el teléfono: a
                        media rejilla se quedaba en 122 px y «Leche
                        deslactosada» no cabía —había que desplazar dentro del
                        campo para leer lo que uno mismo escribió—. */}
                    <div className="col-span-12 sm:col-span-6">
                      <Input name="name" defaultValue={opt.name} required className="text-sm h-9" />
                    </div>
                    <div className="col-span-6 sm:col-span-3 relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">+$</span>
                      <Input
                        name="price_delta"
                        type="number"
                        step="0.01"
                        defaultValue={opt.priceDelta}
                        required
                        className="text-sm h-9 pl-7 font-semibold"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-1">
                      <Button type="submit" variant="secondary" size="sm" className="w-full h-9">
                        Guardar
                      </Button>
                    </div>
                  </ActionForm>
                  <div className="col-span-12 sm:col-span-2 flex justify-end gap-1">
                    <ActionForm action={toggleModifierActive}>
                      <input type="hidden" name="id" value={opt.id} />
                      <input type="hidden" name="is_active" value={opt.isActive ? "false" : "true"} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className={opt.isActive ? "text-stone-400 hover:text-amber-700" : "text-amber-700 hover:text-emerald-700"}
                        title={opt.isActive ? "Ocultar del POS" : "Mostrar en el POS"}
                      >
                        {opt.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </ActionForm>
                    <ActionForm action={deleteModifier}>
                      <input type="hidden" name="id" value={opt.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-stone-400 hover:text-red-600 hover:bg-red-50" title="Eliminar opción">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </ActionForm>
                  </div>
                </div>
              </div>
            ))}

            {/* Nueva opción */}
            <ActionForm action={createModifier} className="grid grid-cols-12 gap-2 items-center rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-2.5" successMessage="Opción agregada" resetOnSuccess>
              <input type="hidden" name="group_id" value={g.id} />
              {/* Mismo reparto que las opciones de arriba: en el teléfono el
                  nombre va solo en su renglón, y precio y botón se reparten el
                  siguiente. */}
              <div className="col-span-12 sm:col-span-6">
                <Input name="name" placeholder="Nueva opción (ej. Leche de coco)" required className="text-sm h-9 bg-white" />
              </div>
              <div className="col-span-6 sm:col-span-3 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">+$</span>
                <Input name="price_delta" type="number" step="0.01" defaultValue={0} required className="text-sm h-9 pl-7 bg-white" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Button type="submit" variant="outline" size="sm" className="w-full h-9 border-dashed gap-1">
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
            </ActionForm>
            <p className="text-[11px] text-stone-400">
              {formatCurrency(0)} = sin costo extra. Las opciones usadas en ventas no se pueden borrar (desactívalas).
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
