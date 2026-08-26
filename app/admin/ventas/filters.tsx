"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { CalendarIcon, Download, Hash, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAYMENT_METHODS, PAYMENT_METHOD_KEYS, type PaymentMethodKey } from "@/lib/format"
import {
  RANGE_PRESETS,
  dateStringToLocalDate,
  formatDateString,
  localDateToDateString,
  matchPreset,
  presetRange,
} from "@/lib/dates"
import { filtersToSearchParams, type VentasFilters } from "./params"

interface Props {
  filters: VentasFilters
  cashiers: Array<{ id: string; name: string }>
  /** Día de operación del negocio (en su zona horaria), calculado en el servidor. */
  today: string
}

const ALL = "__all__"

export function VentasFiltersBar({ filters, cashiers, today }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>()
  const [folioDraft, setFolioDraft] = useState("")

  const activePreset = matchPreset(filters.from, filters.to, today)

  const apply = (next: Partial<VentasFilters>) => {
    // Cualquier cambio de filtro regresa a la página 1 y sale del modo folio.
    const merged: VentasFilters = { ...filters, page: 1, folio: null, ...next }
    const qs = filtersToSearchParams(merged).toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  const rangeLabel =
    filters.from === filters.to
      ? formatDateString(filters.from)
      : `${formatDateString(filters.from, { day: "numeric", month: "short" })} – ${formatDateString(filters.to)}`

  const exportHref = `/admin/ventas/export?${filtersToSearchParams({ ...filters, page: 1 }).toString()}`

  return (
    <div className={`space-y-3 ${isPending ? "opacity-70" : ""}`}>
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        {/* Presets de fecha */}
        <div className="flex gap-1.5 flex-wrap">
          {RANGE_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => apply(presetRange(key, today))}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activePreset === key
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Rango personalizado */}
          <Popover
            open={calendarOpen}
            onOpenChange={(open) => {
              setCalendarOpen(open)
              if (open) {
                setDraftRange({
                  from: dateStringToLocalDate(filters.from),
                  to: dateStringToLocalDate(filters.to),
                })
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${
                  activePreset === null
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {activePreset === null ? rangeLabel : "Rango…"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                locale={es}
                numberOfMonths={2}
                selected={draftRange}
                onSelect={setDraftRange}
                disabled={{ after: dateStringToLocalDate(today) }}
                defaultMonth={dateStringToLocalDate(filters.from)}
              />
              <div className="flex items-center justify-between gap-2 border-t border-stone-200 p-2">
                <p className="text-xs text-stone-500 px-1">
                  {draftRange?.from
                    ? `${formatDateString(localDateToDateString(draftRange.from))}${
                        draftRange.to ? ` – ${formatDateString(localDateToDateString(draftRange.to))}` : ""
                      }`
                    : "Elige inicio y fin"}
                </p>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={!draftRange?.from}
                  onClick={() => {
                    if (!draftRange?.from) return
                    const from = localDateToDateString(draftRange.from)
                    const to = localDateToDateString(draftRange.to ?? draftRange.from)
                    setCalendarOpen(false)
                    apply({ from, to })
                  }}
                >
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-2 flex-wrap lg:ml-auto items-center">
          {/* Cajero */}
          <Select
            value={filters.cajero ?? ALL}
            onValueChange={(value) => apply({ cajero: value === ALL ? null : value })}
          >
            <SelectTrigger className="h-9 w-[180px] bg-white text-sm">
              <Users className="h-3.5 w-3.5 text-stone-400 mr-1.5" />
              <SelectValue placeholder="Cajero" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los cajeros</SelectItem>
              {cashiers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Método de pago */}
          <div className="flex gap-1.5">
            <button
              onClick={() => apply({ pago: null })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filters.pago === null
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              Todos
            </button>
            {PAYMENT_METHOD_KEYS.map((key: PaymentMethodKey) => (
              <button
                key={key}
                onClick={() => apply({ pago: key })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filters.pago === key
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                }`}
              >
                {PAYMENT_METHODS[key].shortLabel}
              </button>
            ))}
          </div>

          {/* Búsqueda por folio */}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number.parseInt(folioDraft, 10)
              if (Number.isFinite(n) && n >= 1) {
                apply({ folio: n })
                setFolioDraft("")
              }
            }}
          >
            <div className="relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Folio"
                value={folioDraft}
                onChange={(e) => setFolioDraft(e.target.value)}
                className="h-9 w-24 pl-7 bg-white text-sm"
                aria-label="Buscar por folio"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!folioDraft.trim()}>
              Buscar
            </Button>
          </form>

          {/* Export */}
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
            <a href={exportHref}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          </Button>
        </div>
      </div>

      {/* Modo folio activo */}
      {filters.folio !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Hash className="h-4 w-4 shrink-0" />
          Mostrando el folio {filters.folio} (sin importar la fecha).
          <button
            onClick={() => apply({ folio: null })}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-white border border-amber-200 px-2 py-0.5 text-xs hover:bg-amber-100"
          >
            Quitar <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Resumen de filtros activos */}
      {(filters.cajero || filters.pago) && (
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span>Filtros:</span>
          {filters.cajero && (
            <button
              onClick={() => apply({ cajero: null })}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 hover:bg-stone-200"
            >
              {cashiers.find((c) => c.id === filters.cajero)?.name ?? "Cajero"}
              <X className="h-3 w-3" />
            </button>
          )}
          {filters.pago && (
            <button
              onClick={() => apply({ pago: null })}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 hover:bg-stone-200"
            >
              {PAYMENT_METHODS[filters.pago].label}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
