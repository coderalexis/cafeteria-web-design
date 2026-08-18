"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  RANGE_PRESETS,
  dateStringToLocalDate,
  formatDateString,
  localDateToDateString,
  matchPreset,
  presetRange,
  type DateString,
} from "@/lib/dates"

interface Props {
  from: DateString
  to: DateString
  /** Día de operación del negocio (en su zona), calculado en el servidor. */
  today: DateString
  /** Query params extra que se conservan al cambiar el periodo. */
  keep?: Record<string, string>
}

/**
 * Selector de periodo (presets + rango con calendario) que escribe `?from&to`
 * en la URL de la página actual. Lo usan Análisis (y puede reutilizarlo Ventas).
 */
export function PeriodPicker({ from, to, today, keep = {} }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>()

  const activePreset = matchPreset(from, to, today)

  const apply = (next: { from: DateString; to: DateString }) => {
    const sp = new URLSearchParams(keep)
    sp.set("from", next.from)
    sp.set("to", next.to)
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`)
    })
  }

  const rangeLabel =
    from === to
      ? formatDateString(from)
      : `${formatDateString(from, { day: "numeric", month: "short" })} – ${formatDateString(to)}`

  return (
    <div className={`flex gap-1.5 flex-wrap ${isPending ? "opacity-70" : ""}`}>
      {RANGE_PRESETS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
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

      <Popover
        open={calendarOpen}
        onOpenChange={(open) => {
          setCalendarOpen(open)
          if (open) {
            setDraftRange({ from: dateStringToLocalDate(from), to: dateStringToLocalDate(to) })
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
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
            defaultMonth={dateStringToLocalDate(from)}
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
                const f = localDateToDateString(draftRange.from)
                const t = localDateToDateString(draftRange.to ?? draftRange.from)
                setCalendarOpen(false)
                apply({ from: f, to: t })
              }}
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
