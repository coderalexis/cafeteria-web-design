"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Wallet, Printer, Unlock, Lock, StickyNote } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getCashSessionSummary } from "@/app/actions/cash"
import { formatCurrency, formatDate, formatTime } from "@/lib/format"
import { buildCorteLines, printLines } from "@/lib/receipt"

export interface CashSessionRecord {
  id: string
  status: "abierta" | "cerrada"
  openedAt: string
  openedByName: string
  openingFloat: number
  openingNotes: string | null
  closedAt: string | null
  closedByName: string | null
  expectedCash: number | null
  countedCash: number | null
  difference: number | null
  closingNotes: string | null
}

function DifferenceBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-stone-300">—</span>
  if (value === 0) {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Cuadró</Badge>
  }
  const positive = value > 0
  return (
    <Badge
      className={
        positive
          ? "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100"
          : "bg-red-100 text-red-700 border-red-200 hover:bg-red-100"
      }
    >
      {positive ? "Sobrante " : "Faltante "}
      {formatCurrency(Math.abs(value))}
    </Badge>
  )
}

export default function CortesClient({ sessions }: { sessions: CashSessionRecord[] }) {
  const [printingId, setPrintingId] = useState<string | null>(null)

  const openSession = sessions.find((s) => s.status === "abierta")
  const closed = sessions.filter((s) => s.status === "cerrada")
  const totalDiff = closed.reduce((sum, s) => sum + (s.difference ?? 0), 0)

  const reprint = async (session: CashSessionRecord) => {
    setPrintingId(session.id)
    const result = await getCashSessionSummary(session.id)
    setPrintingId(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (!printLines(buildCorteLines(result.summary), "Corte de caja")) {
      toast.error("El navegador bloqueó la ventana de impresión.")
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-amber-600" />
          Cortes de caja
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          {closed.length} corte{closed.length === 1 ? "" : "s"} registrado{closed.length === 1 ? "" : "s"}
          {closed.length > 0 && (
            <>
              {" · diferencia acumulada "}
              <span className={totalDiff === 0 ? "text-emerald-600" : totalDiff > 0 ? "text-blue-600" : "text-red-600"}>
                {totalDiff > 0 ? "+" : ""}
                {formatCurrency(totalDiff)}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Caja actual */}
      <Card className={openSession ? "border-green-200 bg-green-50/40" : "border-stone-200"}>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${openSession ? "bg-green-100" : "bg-stone-100"}`}>
              {openSession ? (
                <Unlock className="h-6 w-6 text-green-700" />
              ) : (
                <Lock className="h-6 w-6 text-stone-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">
                {openSession ? "Caja abierta" : "Caja cerrada"}
              </p>
              <p className="text-xs text-stone-500">
                {openSession
                  ? `Desde ${formatDate(openSession.openedAt)} ${formatTime(openSession.openedAt)} por ${openSession.openedByName} · fondo ${formatCurrency(openSession.openingFloat)}`
                  : "La caja se abre y se cierra desde el POS."}
              </p>
            </div>
          </div>
          {openSession && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => reprint(openSession)}
              disabled={printingId === openSession.id}
            >
              <Printer className="h-3.5 w-3.5" />
              Corte parcial
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Historial */}
      <Card>
        <CardContent className="p-0">
          {closed.length === 0 ? (
            <div className="py-16 text-center">
              <Wallet className="h-10 w-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm text-stone-400">Aún no hay cortes cerrados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50">
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Turno</th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Abrió / Cerró</th>
                    <th className="text-right px-4 py-3 font-medium text-stone-500">Fondo</th>
                    <th className="text-right px-4 py-3 font-medium text-stone-500">Efectivo vendido</th>
                    <th className="text-right px-4 py-3 font-medium text-stone-500">Esperado</th>
                    <th className="text-right px-4 py-3 font-medium text-stone-500">Contado</th>
                    <th className="text-left px-4 py-3 font-medium text-stone-500">Diferencia</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {closed.map((s) => {
                    const cashSales = (s.expectedCash ?? 0) - s.openingFloat
                    return (
                      <tr key={s.id} className="border-b border-stone-100 last:border-0 hover:bg-amber-50/40">
                        <td className="px-4 py-3 text-stone-700">
                          <p className="font-medium">{formatDate(s.openedAt)}</p>
                          <p className="text-xs text-stone-400">
                            {formatTime(s.openedAt)} → {s.closedAt ? formatTime(s.closedAt) : "—"}
                            {s.closedAt && formatDate(s.closedAt) !== formatDate(s.openedAt) && (
                              <span> ({formatDate(s.closedAt)})</span>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          <p>{s.openedByName}</p>
                          {s.closedByName && s.closedByName !== s.openedByName && (
                            <p className="text-xs text-stone-400">cerró {s.closedByName}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-600">{formatCurrency(s.openingFloat)}</td>
                        <td className="px-4 py-3 text-right text-stone-600">{formatCurrency(cashSales)}</td>
                        <td className="px-4 py-3 text-right font-medium text-stone-800">
                          {s.expectedCash != null ? formatCurrency(s.expectedCash) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-stone-800">
                          {s.countedCash != null ? formatCurrency(s.countedCash) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <DifferenceBadge value={s.difference} />
                            {(s.openingNotes || s.closingNotes) && (
                              <span
                                className="inline-flex"
                                title={[s.openingNotes && `Apertura: ${s.openingNotes}`, s.closingNotes && `Cierre: ${s.closingNotes}`]
                                  .filter(Boolean)
                                  .join("\n")}
                              >
                                <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Reimprimir corte"
                            onClick={() => reprint(s)}
                            disabled={printingId === s.id}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
