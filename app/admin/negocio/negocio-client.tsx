"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Store, Loader2, Printer, Clock, LockKeyhole } from "lucide-react"
import { updateBusinessSettings } from "@/app/actions/business"
import type { BusinessInfo } from "@/lib/context-shape"
import { LOCK_MINUTES_OPTIONS, parseBusinessSettings } from "@/lib/settings"
import { MEXICO_TIMEZONES, dateStringInTz } from "@/lib/dates"
import { formatDateTime } from "@/lib/format"
import { buildTicketLines } from "@/lib/receipt"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const OTHER = "__other__"

export default function NegocioClient({ business }: { business: BusinessInfo }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentSettings = parseBusinessSettings(business.settings)

  const inList = MEXICO_TIMEZONES.some((t) => t.value === business.timezone)
  const [tzChoice, setTzChoice] = useState<string>(inList ? business.timezone : OTHER)
  const [tzOther, setTzOther] = useState<string>(inList ? "" : business.timezone)
  const timezone = tzChoice === OTHER ? tzOther.trim() : tzChoice

  // Vista previa del encabezado/pie del ticket con lo que se está escribiendo
  const [preview, setPreview] = useState({
    name: business.name,
    address: business.address ?? "",
    phone: business.phone ?? "",
    receiptHeader: business.receiptHeader ?? "",
    receiptFooter: business.receiptFooter ?? "",
  })

  const previewLines = useMemo(() => {
    const lines = buildTicketLines(
      {
        folio: 123,
        date: new Date(),
        paymentMethod: "efectivo",
        items: [{ label: "Latte (Grande)", quantity: 1, unitPrice: 55, lineTotal: 55 }],
        total: 55,
        cashReceived: 100,
        changeDue: 45,
      },
      {
        name: preview.name || "Mi cafetería",
        timezone: timezone || business.timezone,
        address: preview.address || null,
        phone: preview.phone || null,
        receiptHeader: preview.receiptHeader || null,
        receiptFooter: preview.receiptFooter || null,
      },
    )
    return lines
  }, [preview, timezone, business.timezone])

  const localNow = useMemo(() => {
    try {
      return timezone ? `${formatDateTime(new Date(), timezone)} · día de operación ${dateStringInTz(timezone)}` : ""
    } catch {
      return "Zona horaria no reconocida"
    }
  }, [timezone])

  function handleSubmit(formData: FormData) {
    formData.set("timezone", timezone)
    startTransition(async () => {
      const result = await updateBusinessSettings(formData)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success("Ajustes guardados")
      router.refresh()
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
          <Store className="h-6 w-6 text-amber-700" />
          Negocio
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Datos de la cafetería, zona horaria y lo que se imprime en el ticket. Identificador para el login de cajeros:{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">{business.slug}</code>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos generales</CardTitle>
              <CardDescription>El nombre aparece en el POS, el panel y los tickets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-stone-700">
                  Nombre de la cafetería
                </label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={business.name}
                  required
                  minLength={2}
                  maxLength={80}
                  onChange={(e) => setPreview((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="address" className="text-sm font-medium text-stone-700">
                    Dirección (opcional)
                  </label>
                  <Input
                    id="address"
                    name="address"
                    defaultValue={business.address ?? ""}
                    maxLength={200}
                    placeholder="Calle 5 #12, Centro"
                    onChange={(e) => setPreview((p) => ({ ...p, address: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="phone" className="text-sm font-medium text-stone-700">
                    Teléfono (opcional)
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={business.phone ?? ""}
                    maxLength={40}
                    placeholder="55 1234 5678"
                    onChange={(e) => setPreview((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-700" />
                Zona horaria
              </CardTitle>
              <CardDescription>
                Define el «día de operación» de reportes, cortes y el POS. México tiene varias zonas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                aria-label="Zona horaria"
                value={tzChoice}
                onChange={(e) => setTzChoice(e.target.value)}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                {MEXICO_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                <option value={OTHER}>Otra (escribir nombre IANA)…</option>
              </select>
              {tzChoice === OTHER && (
                <Input
                  aria-label="Zona horaria IANA"
                  value={tzOther}
                  onChange={(e) => setTzOther(e.target.value)}
                  placeholder="p. ej. America/Bogota"
                  spellCheck={false}
                  autoCapitalize="none"
                />
              )}
              <p className="text-xs text-stone-500">
                Ahora mismo en esa zona: <span className="font-medium text-stone-700">{localNow || "—"}</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4 text-amber-700" />
                Ticket impreso
              </CardTitle>
              <CardDescription>Textos que van bajo el nombre y al final del ticket (32 columnas).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="receipt_header" className="text-sm font-medium text-stone-700">
                  Encabezado (opcional)
                </label>
                <Textarea
                  id="receipt_header"
                  name="receipt_header"
                  defaultValue={business.receiptHeader ?? ""}
                  maxLength={200}
                  rows={2}
                  placeholder="RFC, sucursal, redes sociales…"
                  onChange={(e) => setPreview((p) => ({ ...p, receiptHeader: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="receipt_footer" className="text-sm font-medium text-stone-700">
                  Pie de ticket (opcional)
                </label>
                <Textarea
                  id="receipt_footer"
                  name="receipt_footer"
                  defaultValue={business.receiptFooter ?? ""}
                  maxLength={200}
                  rows={2}
                  placeholder="¡Gracias por tu compra! (por defecto)"
                  onChange={(e) => setPreview((p) => ({ ...p, receiptFooter: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-amber-700" />
                Seguridad de caja
              </CardTitle>
              <CardDescription>
                Tras el tiempo elegido sin actividad, el POS se bloquea y pide el PIN de quien está en caja.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <select
                name="lock_minutes"
                aria-label="Bloqueo por inactividad"
                defaultValue={String(currentSettings.lockMinutes)}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                {LOCK_MINUTES_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "Desactivado" : m === 1 ? "Bloquear al minuto de inactividad" : `Bloquear a los ${m} minutos de inactividad`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-stone-400">
                Cada quien define su PIN en «Mi cuenta» (o al momento de desbloquear); un administrador puede
                asignarlo desde Equipo.
              </p>
            </CardContent>
          </Card>

          <Button type="submit" disabled={isPending} className="bg-amber-700 hover:bg-amber-800 text-white">
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar ajustes
          </Button>
        </form>

        {/* Vista previa del ticket */}
        <div className="lg:sticky lg:top-6 h-fit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vista previa del ticket</CardTitle>
              <CardDescription>Así se verá el encabezado y el pie.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="rounded-lg border border-stone-200 bg-white p-3 text-[11px] leading-[1.35] font-mono whitespace-pre overflow-x-auto text-stone-800">
                {previewLines.join("\n")}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
