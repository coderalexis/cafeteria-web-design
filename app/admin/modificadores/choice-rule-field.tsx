"use client"

import { useState } from "react"
import { Eye, TriangleAlert } from "lucide-react"
import {
  CHOICE_PRESETS,
  choiceHint,
  choiceToRule,
  ruleToChoice,
  type ChoiceKey,
} from "@/lib/modifiers"
import { Input } from "@/components/ui/input"

/**
 * «¿Cuántas puede elegir el cajero?» en una sola pregunta.
 *
 * Antes eran tres campos —mínimo, máximo y una casilla de obligatorio— que
 * describen las columnas de la base, no lo que la persona quiere lograr, y que
 * además se pisan entre sí. Aquí se elige la intención y los tres valores se
 * calculan solos en campos ocultos, así que la action del servidor no cambia.
 *
 * La vista previa usa la MISMA función que el POS: lo que dice aquí es
 * literalmente lo que verá quien cobra.
 */
export function ChoiceRuleField({
  min,
  max,
  optionCount,
  compact = false,
}: {
  min: number
  max: number | null
  /** Cuántas opciones tiene hoy el grupo; sirve para avisar de reglas imposibles. */
  optionCount?: number
  compact?: boolean
}) {
  const inicial = ruleToChoice({ min, max })
  const [key, setKey] = useState<ChoiceKey>(inicial.key)
  const [count, setCount] = useState<number>(inicial.count)

  const preset = CHOICE_PRESETS.find((p) => p.key === key) ?? CHOICE_PRESETS[0]
  const regla = choiceToRule(key, count)

  // Pedir más opciones de las que hay deja la venta imposible de cerrar: el
  // POS no deja agregar hasta cumplir el mínimo, y el mínimo no se alcanza.
  const imposible = optionCount !== undefined && regla.min > optionCount

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <label htmlFor={`regla-${min}-${max}`} className="text-xs font-medium text-stone-500">
        ¿Cuántas puede elegir el cajero?
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={key}
          onChange={(e) => setKey(e.target.value as ChoiceKey)}
          className="h-10 min-w-[13rem] flex-1 rounded-md border border-stone-200 bg-white px-3 text-sm"
          aria-label="Cuántas opciones puede elegir el cajero"
        >
          {CHOICE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {preset.needsNumber && (
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-10 w-20"
            aria-label="Cuántas"
          />
        )}
      </div>

      <p className="text-xs text-stone-400">{preset.hint}</p>
      <p className="flex items-center gap-1.5 text-xs text-stone-500">
        <Eye className="h-3.5 w-3.5 shrink-0 text-stone-400" />
        En el POS se verá: <strong className="text-stone-700">{choiceHint(regla)}</strong>
      </p>
      {imposible && (
        <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Este grupo tiene {optionCount} {optionCount === 1 ? "opción" : "opciones"} y estás pidiendo {regla.min}.
            Así nadie va a poder cobrar el producto: agrega opciones o baja el número.
          </span>
        </p>
      )}

      {/* Lo que espera la action: se calcula, no se teclea. */}
      <input type="hidden" name="min_select" value={regla.min} />
      <input type="hidden" name="max_select" value={regla.max ?? ""} />
      {regla.min >= 1 && <input type="hidden" name="is_required" value="true" />}
    </div>
  )
}
