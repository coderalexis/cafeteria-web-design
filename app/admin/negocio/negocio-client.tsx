"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Store,
  Loader2,
  Printer,
  Clock,
  LockKeyhole,
  Mail,
  Target,
  QrCode,
  PauseCircle,
  CalendarClock,
  HandCoins,
  Stamp,
} from "lucide-react"
import { updateBusinessSettings } from "@/app/actions/business"
import type { BusinessInfo } from "@/lib/context-shape"
import {
  LOCK_MINUTES_OPTIONS,
  parseBusinessSettings,
  MENU_NOTE_MAX,
  KITCHEN_POLL_MIN,
  KITCHEN_POLL_MAX,
  KITCHEN_POLL_HIDDEN_MIN,
  KITCHEN_POLL_HIDDEN_MAX,
} from "@/lib/settings"
import { trialState } from "@/lib/signup"
import { GRACIA_HORAS, HORAS_SIN_HORARIO } from "@/lib/cash-session"
import { MEXICO_TIMEZONES, dateStringInTz } from "@/lib/dates"
import { formatDate, formatDateTime } from "@/lib/format"
import { buildTicketLines } from "@/lib/receipt"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MenuQrCard } from "./qr-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const OTHER = "__other__"

export default function NegocioClient({ business }: { business: BusinessInfo }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const currentSettings = parseBusinessSettings(business.settings)
  const prueba = trialState(business.trialEndsAt)

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

      {/* Estado de la prueba. Aquí y no solo en la franja de aviso: la franja
          solo sale los últimos dos días, y quien se pregunta "¿cuántos me
          quedan?" el día tres no tenía dónde verlo. */}
      {prueba.state !== "none" && (
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-4 py-3 text-sm ${
            prueba.state === "expired" || prueba.state === "last-day"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="font-semibold">
            {prueba.state === "expired"
              ? "Tu prueba gratis terminó"
              : prueba.state === "last-day"
                ? "Hoy es el último día de tu prueba gratis"
                : `Prueba gratis · te ${prueba.daysLeft === 1 ? "queda 1 día" : `quedan ${prueba.daysLeft} días`}`}
          </span>
          <span className="opacity-80">
            {prueba.state === "expired"
              ? "La cafetería queda en pausa al cerrar tu caja. No se borra nada."
              : `Termina el ${formatDate(business.trialEndsAt!, business.timezone)}`}
          </span>
          <a href="mailto:soporte@cafecitopos.com" className="font-medium underline underline-offset-2">
            ¿Quieres continuar?
          </a>
        </div>
      )}

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
                <Target className="h-4 w-4 text-amber-700" />
                Metas de venta
              </CardTitle>
              <CardDescription>
                El dashboard muestra el avance del día y del mes contra estas metas. Deja el campo vacío para no usar meta.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="daily_goal" className="text-sm font-medium text-stone-700">
                  Meta diaria ($)
                </label>
                <Input
                  id="daily_goal"
                  name="daily_goal"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="Sin meta"
                  defaultValue={currentSettings.dailyGoal ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="monthly_goal" className="text-sm font-medium text-stone-700">
                  Meta mensual ($)
                </label>
                <Input
                  id="monthly_goal"
                  name="monthly_goal"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="Sin meta"
                  defaultValue={currentSettings.monthlyGoal ?? ""}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-amber-700" />
                Módulos del POS
              </CardTitle>
              <CardDescription>
                Funciones que aparecen o se ocultan en la pantalla de venta. Apaga las que tu cafetería no use para
                dejarle el POS más limpio a quien cobra.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <label htmlFor="parked_orders" className="text-sm font-medium text-stone-700">
                Cuentas abiertas
              </label>
              <select
                id="parked_orders"
                name="parked_orders"
                defaultValue={currentSettings.parkedOrders ? "on" : "off"}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                <option value="on">Activado</option>
                <option value="off">Desactivado</option>
              </select>
              <p className="text-xs text-stone-400">
                Para mesas que piden, se sientan y pagan al final: se le va sumando a la cuenta y se cobra cuando
                pidan la cuenta. Se guardan en el servidor, así que se toman en un aparato y se cobran en otro; nada
                se registra como venta hasta que se cobra.
              </p>

              {/* Los botones de un toque al abrir una cuenta. Eran fijos en
                  código («Mesa 1..4, Para llevar, Mostrador») e iguales para
                  toda cafetería: la del gym veía dos mesas que no tiene, y una
                  de ocho tecleaba de la 5 en adelante. */}
              <div className="mt-3 grid gap-3 rounded-lg border border-stone-100 bg-stone-50/60 p-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="table_count" className="text-sm font-medium text-stone-700">
                    ¿Cuántas mesas tienes?
                  </label>
                  <input
                    id="table_count"
                    name="table_count"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={30}
                    step={1}
                    defaultValue={String(currentSettings.tableCount)}
                    className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-stone-400">
                    Salen como botones «Mesa 1», «Mesa 2»… Pon <strong>0</strong> si no trabajas por mesas y
                    prefieres anotar el nombre de quien pide.
                  </p>
                </div>
                <div>
                  <label htmlFor="account_labels" className="text-sm font-medium text-stone-700">
                    Otros botones
                  </label>
                  <input
                    id="account_labels"
                    name="account_labels"
                    type="text"
                    maxLength={200}
                    defaultValue={currentSettings.accountLabels.join(", ")}
                    placeholder="Barra, Terraza, Para llevar"
                    className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-stone-400">
                    Separados por comas, hasta 8. Aparecen después de las mesas. Siempre puedes escribir cualquier
                    otro nombre a mano.
                  </p>
                </div>
              </div>

              {/* Ritmo de «Por preparar». Configurable porque no hay un numero
                  bueno para todos: una barra con fila quiere 2 s, y un cafe
                  con datos moviles caros prefiere 10. */}
              <div className="mt-3 grid gap-3 rounded-lg border border-stone-100 bg-stone-50/60 p-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium text-stone-700">Cada cuánto se actualiza «Por preparar»</p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    La pantalla de la comanda pregunta por pedidos nuevos cada tantos segundos. Más seguido es más
                    inmediato; menos seguido gasta menos batería y datos.
                  </p>
                </div>
                <div>
                  <label htmlFor="kitchen_poll_seconds" className="text-sm font-medium text-stone-700">
                    Con la pantalla a la vista
                  </label>
                  <input
                    id="kitchen_poll_seconds"
                    name="kitchen_poll_seconds"
                    type="number"
                    inputMode="numeric"
                    min={KITCHEN_POLL_MIN}
                    max={KITCHEN_POLL_MAX}
                    step={1}
                    defaultValue={String(currentSettings.kitchenPollSeconds)}
                    className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-stone-400">
                    Segundos ({KITCHEN_POLL_MIN}–{KITCHEN_POLL_MAX}). Por omisión 4.
                  </p>
                </div>
                <div>
                  <label htmlFor="kitchen_poll_hidden_seconds" className="text-sm font-medium text-stone-700">
                    Con la pantalla en segundo plano
                  </label>
                  <input
                    id="kitchen_poll_hidden_seconds"
                    name="kitchen_poll_hidden_seconds"
                    type="number"
                    inputMode="numeric"
                    min={KITCHEN_POLL_HIDDEN_MIN}
                    max={KITCHEN_POLL_HIDDEN_MAX}
                    step={1}
                    defaultValue={String(currentSettings.kitchenPollHiddenSeconds)}
                    className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-stone-400">
                    Segundos ({KITCHEN_POLL_HIDDEN_MIN}–{KITCHEN_POLL_HIDDEN_MAX}). Por omisión 30. Nunca más
                    rápido que el de arriba.
                  </p>
                </div>
              </div>

              <div className="border-t border-stone-100 pt-3">
                <label htmlFor="discount_max_cashier" className="text-sm font-medium text-stone-700">
                  Descuento máximo en caja
                </label>
                <select
                  id="discount_max_cashier"
                  name="discount_max_cashier"
                  defaultValue={String(currentSettings.discountMaxCashier)}
                  className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                >
                  <option value="0">Solo administradores</option>
                  <option value="5">Hasta 5 %</option>
                  <option value="10">Hasta 10 %</option>
                  <option value="15">Hasta 15 %</option>
                  <option value="20">Hasta 20 %</option>
                  <option value="50">Hasta 50 %</option>
                  <option value="100">Sin límite</option>
                </select>
                <p className="mt-1.5 text-xs text-stone-400">
                  Cuánto puede descontar quien está en caja. Dueños y administradores no tienen límite. El tope se
                  aplica en el servidor, así que vale también si alguien intenta rodearlo desde el navegador; los
                  descuentos por monto fijo cuentan por su porcentaje equivalente.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Printer className="h-4 w-4 text-amber-700" />
                Impresión al cobrar
              </CardTitle>
              <CardDescription>
                Imprime en automático en cuanto se registra la venta, sin que el cajero toque nada más. Si el navegador
                bloquea la ventana, el POS lo avisa y quedan los botones de siempre.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select
                name="auto_print"
                aria-label="Impresión automática al cobrar"
                defaultValue={currentSettings.autoPrint}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                <option value="none">No imprimir nada (botones manuales)</option>
                <option value="ticket">Ticket del cliente</option>
                <option value="comanda">Comanda para preparación</option>
                <option value="both">Ticket y comanda</option>
              </select>

              {/* La alternativa al papel: el cliente escanea y se lleva su
                  nota en el celular. Encendido por omisión — el enlace solo
                  lo tiene quien estuvo en el mostrador y caduca solo. */}
              <div className="mt-4 border-t border-stone-100 pt-3">
                <label htmlFor="public_receipt" className="text-sm font-medium text-stone-700">
                  Nota de compra en la web (QR)
                </label>
                <select
                  id="public_receipt"
                  name="public_receipt"
                  defaultValue={currentSettings.publicReceipt ? "on" : "off"}
                  className="mt-1.5 h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                >
                  <option value="on">Activado</option>
                  <option value="off">Desactivado</option>
                </select>
                <p className="mt-1 text-xs text-stone-400">
                  Al cobrar aparece un código QR: el cliente lo escanea y ve su nota en su celular, sin necesidad de
                  impresora. El enlace <strong>caduca a los 7 días</strong> y no muestra tus costos. Se avisa en la
                  página que es una nota de compra, no un comprobante fiscal.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={currentSettings.closingTime ? "" : "border-amber-200"}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-700" />
                Hora de cierre y caja olvidada
              </CardTitle>
              <CardDescription>
                Una caja que se queda abierta de un día para otro vuelve el arqueo imposible de cuadrar —el efectivo
                del cajón contra las ventas de varios días— y no deja abrir la del día siguiente ni registrar su fondo.
                Por eso, si se olvida, el sistema la cierra solo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1.5">
                <label htmlFor="closing_time" className="text-sm font-medium text-stone-700">
                  ¿A qué hora cierras?
                </label>
                <Input
                  id="closing_time"
                  name="closing_time"
                  type="time"
                  defaultValue={currentSettings.closingTime}
                  className="w-40"
                />
              </div>
              {currentSettings.closingTime ? (
                <p className="text-xs text-stone-400">
                  Si a las <strong>{currentSettings.closingTime}</strong> + {GRACIA_HORAS} h de gracia la caja sigue
                  abierta, se cierra sola <strong>sin arqueo</strong> (nadie contó el efectivo) y así queda anotado en
                  el corte. Lo mejor sigue siendo cerrarla tú y contar.
                </p>
              ) : (
                <p className="text-xs text-amber-700">
                  <strong>Sin configurar.</strong> Mientras tanto la caja se cierra sola a las{" "}
                  {HORAS_SIN_HORARIO} h de abierta. Pon tu hora de cierre para que el corte automático caiga cuando de
                  verdad cierras, y sobre todo <strong>no olvides cerrar tu caja</strong>: un cierre automático va sin
                  arqueo.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <HandCoins className="h-4 w-4 text-amber-700" />
                Para llevar y comisión de tarjeta
              </CardTitle>
              <CardDescription>
                Dos cobros que cada cafetería maneja distinto: lo que cobras de más por el empaque, y lo que tu
                terminal te descuenta por cobrar con tarjeta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="takeout_fee" className="text-sm font-medium text-stone-700">
                  Cargo por «Para llevar» ($)
                </label>
                <Input
                  id="takeout_fee"
                  name="takeout_fee"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={currentSettings.takeoutFee || ""}
                  placeholder="0 = sin cargo"
                  className="w-40"
                />
                <p className="text-xs text-stone-400">
                  Se suma solo cuando la venta se marca <strong>Para llevar</strong> (el chip del POS muestra el monto).
                  El cobro lo aplica el servidor con este valor — p. ej. $5 por el empaque.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="card_fee_pct" className="text-sm font-medium text-stone-700">
                  Comisión de tu terminal de tarjeta (%)
                </label>
                <Input
                  id="card_fee_pct"
                  name="card_fee_pct"
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  defaultValue={currentSettings.cardFeePct || ""}
                  placeholder="0 = no mostrar"
                  className="w-40"
                />
                <p className="text-xs text-stone-400">
                  Mercado Pago cobra ≈ 4%. <strong>Solo para tus reportes</strong>: al cliente no se le cobra de más;
                  Ventas y el corte te muestran la comisión estimada y tu <strong>neto</strong> de tarjeta.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Stamp className="h-4 w-4 text-amber-700" />
                Lealtad con sellos
              </CardTitle>
              <CardDescription>
                La tarjetita de «junta {currentSettings.loyaltyTarget} y el siguiente va gratis», sin cartón: el
                cliente da su teléfono en caja y sus sellos viven aquí. El canje sale como descuento del artículo
                elegido, validado por el sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                name="loyalty"
                aria-label="Lealtad con sellos"
                defaultValue={currentSettings.loyalty ? "on" : "off"}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                <option value="off">Desactivada</option>
                <option value="on">Activada</option>
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="loyalty_target" className="text-xs font-medium text-stone-500">
                    Sellos para el premio
                  </label>
                  <Input
                    id="loyalty_target"
                    name="loyalty_target"
                    type="number"
                    min={2}
                    max={30}
                    defaultValue={currentSettings.loyaltyTarget}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="loyalty_reward" className="text-xs font-medium text-stone-500">
                    ¿Cuál es el premio?
                  </label>
                  <Input
                    id="loyalty_reward"
                    name="loyalty_reward"
                    maxLength={60}
                    defaultValue={currentSettings.loyaltyReward}
                    placeholder="Bebida gratis"
                  />
                </div>
              </div>
              <p className="text-xs text-stone-400">
                Los clientes y sus sellos se ven en <strong>Lealtad</strong>, en el menú del panel. Cambiar la meta
                aplica también a los sellos ya juntados.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="h-4 w-4 text-amber-700" />
                Menú público (código QR)
              </CardTitle>
              <CardDescription>
                Publica tu menú y precios en una página que cualquiera puede abrir con el QR, sin instalar nada. No
                muestra tus costos ni tus ventas: solo lo que verían en una carta impresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <select
                name="public_menu"
                aria-label="Menú público"
                defaultValue={currentSettings.publicMenu ? "on" : "off"}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                <option value="off">No publicar</option>
                <option value="on">Publicar el menú</option>
              </select>
              <p className="text-xs text-stone-400">
                Se publica en <code className="rounded bg-stone-100 px-1 py-0.5">/menu/{business.slug}</code>. Los
                productos y variantes desactivados no aparecen.
              </p>

              <div className="space-y-1.5 pt-2">
                <label htmlFor="menu_note" className="text-sm font-medium text-stone-700">
                  Nota al pie del menú
                </label>
                <textarea
                  id="menu_note"
                  name="menu_note"
                  rows={2}
                  maxLength={MENU_NOTE_MAX}
                  defaultValue={currentSettings.menuNote}
                  placeholder="Nuestros jarabes son libres de azúcar."
                  className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
                />
                <p className="text-xs text-stone-400">
                  La letra chica de tu carta. Sale al final del menú público, no en el ticket. Si aplica solo a una
                  sección, ponla en la categoría desde <strong>Categorías</strong>.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4 text-amber-700" />
                Resumen semanal por correo
              </CardTitle>
              <CardDescription>
                Cada lunes por la mañana llega un resumen de la semana (ventas, propinas, más vendidos y por cajero) a los
                correos de los dueños y administradores.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select
                name="weekly_email"
                aria-label="Resumen semanal por correo"
                defaultValue={currentSettings.weeklyEmail ? "on" : "off"}
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                <option value="on">Enviar cada lunes</option>
                <option value="off">No enviar</option>
              </select>
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

        {/* Vista previa del ticket + QR */}
        <div className="lg:sticky lg:top-6 h-fit space-y-6">
          <MenuQrCard
            businessName={business.name}
            slug={business.slug}
            active={currentSettings.publicMenu}
          />
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
