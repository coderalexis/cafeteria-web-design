"use client"

import type { ReactElement } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

/**
 * La gráfica de barras de ingresos, en su propio archivo.
 *
 * No es por reutilizar código —eran dos gráficas casi idénticas, sí, pero eso
 * se podía vivir— sino por PESO. `recharts` son unos 100 KB de JavaScript, y
 * viajaban con la primera carga de Ventas y de Análisis aunque la gráfica esté
 * abajo del pliegue y el dueño muchas veces solo venga a mirar la tabla. Al
 * vivir aparte, quien la importa con `next/dynamic` la baja después: la página
 * aparece primero y la gráfica llega en cuanto está lista.
 *
 * Por eso el `export default`: `next/dynamic` lo necesita.
 */

export interface RevenueBarChartProps {
  data: Array<Record<string, unknown>>
  /** Campo del dato que dibuja la altura de la barra. */
  dataKey: string
  /** Tooltip propio de cada pantalla (formatea fechas o días de la semana). */
  tooltip: ReactElement
  /** Cada cuántas etiquetas se enseña una en el eje X (0 = todas). */
  xInterval?: number
  maxBarSize?: number
}

export default function RevenueBarChart({
  data,
  dataKey,
  tooltip,
  xInterval = 0,
  maxBarSize = 40,
}: RevenueBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          axisLine={false}
          interval={xInterval}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#78716c" }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v}`)}
        />
        <Tooltip cursor={{ fill: "#fef3c7", opacity: 0.5 }} content={tooltip} />
        <Bar dataKey={dataKey} fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={maxBarSize} />
      </BarChart>
    </ResponsiveContainer>
  )
}
