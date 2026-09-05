"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { CheckCircle2, ChefHat, Printer, QrCode, Share2 } from "lucide-react"
import { formatCurrency, formatDate, formatTime, PAYMENT_METHODS } from "@/lib/format"
import {
  buildKitchenLines,
  buildShareText,
  buildTicketLines,
  printLines,
  receiptBusinessFrom,
  type ReceiptData,
} from "@/lib/receipt"
import { useBusiness } from "@/components/business-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getLineLabel, getLinePrice, type CartLine, type PaymentMethod } from "./cart"

/** Lo que el servidor confirmó de la venta, más lo que se ve del carrito. */
export interface CompletedSale {
  ticketId: string
  folio: number
  lines: CartLine[]
  subtotal: number
  discountTotal: number
  discountReason: string | null
  total: number
  /** Cargo por «Para llevar», ya incluido en total. */
  takeoutFee: number
  /** Propina cobrada encima del total (no cuenta como venta). */
  tip: number
  paymentMethod: PaymentMethod
  date: Date
  notes?: string
  cashReceived: number | null
  changeDue: number | null
  loyalty: { stamps: number; target: number; redeemed: boolean } | null
  /** Venta fiada: a quién y cuánto debe en total. */
  credit: { name: string; balance: number } | null
}

function saleToReceipt(sale: CompletedSale): ReceiptData {
  return {
    folio: sale.folio,
    date: sale.date,
    paymentMethod: sale.paymentMethod,
    notes: sale.notes,
    items: sale.lines.map((line) => ({
      label: getLineLabel(line),
      quantity: line.quantity,
      unitPrice: getLinePrice(line),
      lineTotal: getLinePrice(line) * line.quantity,
      notes: line.notes || undefined,
      modifiers: line.modifiers.map((m) => ({ name: m.name, price: m.priceDelta })),
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    discountReason: sale.discountReason,
    takeoutFee: sale.takeoutFee,
    total: sale.total,
    tip: sale.tip,
    cashReceived: sale.cashReceived,
    changeDue: sale.changeDue,
    loyalty: sale.loyalty,
    credit: sale.credit,
  }
}

export function ReceiptView({
  sale,
  autoPrint,
  publicReceipt,
  onClose,
}: {
  sale: CompletedSale
  autoPrint: "none" | "ticket" | "comanda" | "both"
  /** El cafe ofrece la nota en la web (QR para el cliente). */
  publicReceipt: boolean
  onClose: () => void
}) {
  const paymentInfo = PAYMENT_METHODS[sale.paymentMethod]
  const PaymentIcon = paymentInfo.icon
  const business = useBusiness()
  const receiptBiz = receiptBusinessFrom(business)

  const handlePrint = () => {
    if (!printLines(buildTicketLines(saleToReceipt(sale), receiptBiz), `Ticket ${sale.folio}`, receiptBiz.widthMm)) {
      toast.error("El navegador bloqueó la ventana de impresión. Puedes reimprimir desde «Tickets».")
    }
  }

  const handleKitchen = () => {
    if (!printLines(buildKitchenLines(saleToReceipt(sale), receiptBiz), `Comanda ${sale.folio}`, receiptBiz.widthMm)) {
      toast.error("El navegador bloqueó la ventana de impresión.")
    }
  }

  const [mostrarQr, setMostrarQr] = useState(false)
  // Ruta corta a proposito: mientras mas texto, mas denso el QR y mas cuesta
  // escanearlo con un celular viejo bajo la luz de una cafeteria.
  const urlNota = typeof window !== "undefined" ? `${window.location.origin}/t/${sale.ticketId}` : ""
  const [printedAuto, setPrintedAuto] = useState(false)
  useEffect(() => {
    if (autoPrint === "none") return
    const r = saleToReceipt(sale)
    const lineas =
      autoPrint === "ticket"
        ? buildTicketLines(r, receiptBiz)
        : autoPrint === "comanda"
        ? buildKitchenLines(r, receiptBiz)
        : [...buildTicketLines(r, receiptBiz), "", "", "- - - - - ✂ - - - - -", "", ...buildKitchenLines(r, receiptBiz)]
    if (printLines(lineas, `Venta ${sale.folio}`, receiptBiz.widthMm)) {
      setPrintedAuto(true)
    } else {
      toast.error("El navegador bloqueó la impresión automática; usa los botones.")
    }
    // Solo al montar: una venta = una impresión automática.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Manda el ticket por WhatsApp (o lo copia si el navegador no puede compartir). */
  const handleShare = async () => {
    const text = buildShareText(saleToReceipt(sale), receiptBiz)
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `Ticket #${sale.folio}`, text })
        return
      }
    } catch (err) {
      // El usuario cerró el diálogo: no es un error que valga la pena reportar.
      if (err instanceof DOMException && err.name === "AbortError") return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Ticket copiado: pégalo en WhatsApp.")
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Success header */}
      <div className="flex flex-col items-center gap-2 mb-5">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-green-700">¡Venta registrada!</h3>
        <p className="text-sm text-stone-500">Folio #{sale.folio}</p>
      </div>

      {/* Ticket preview */}
      <div className="w-full bg-stone-50 rounded-xl border border-stone-200 p-4 space-y-3">
        <div className="flex justify-between text-sm text-stone-500">
          <span>{formatDate(sale.date, business.timezone)}</span>
          <span>{formatTime(sale.date, business.timezone)}</span>
        </div>

        {sale.notes && (
          <p className="text-xs text-stone-500 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            📝 {sale.notes}
          </p>
        )}

        <Separator />

        {/* Items */}
        <div className="space-y-2">
          {sale.lines.map((line) => {
            const price = getLinePrice(line)
            return (
              <div key={line.lineId} className="text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-stone-700 font-medium">{line.quantity}x </span>
                    <span className="text-stone-700">{getLineLabel(line)}</span>
                  </div>
                  <span className="font-semibold text-stone-800 ml-3">
                    {formatCurrency(price * line.quantity)}
                  </span>
                </div>
                {line.modifiers.length > 0 && (
                  <p className="text-xs text-stone-400 pl-6">
                    {line.modifiers.map((m) => `+ ${m.name}`).join(", ")}
                  </p>
                )}
                {line.notes && <p className="text-xs text-amber-700 pl-6 italic">{line.notes}</p>}
              </div>
            )
          })}
        </div>

        <Separator />

        {/* Subtotal / descuento / para llevar: con cualquiera de los dos,
            el total no se explica solo y se enseña la suma completa. */}
        {(sale.discountTotal > 0 || sale.takeoutFee > 0) && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>
            {sale.discountTotal > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Descuento{sale.discountReason ? ` · ${sale.discountReason}` : ""}</span>
                <span>-{formatCurrency(sale.discountTotal)}</span>
              </div>
            )}
            {sale.takeoutFee > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Para llevar</span>
                <span>+{formatCurrency(sale.takeoutFee)}</span>
              </div>
            )}
          </div>
        )}

        {/* Total & payment */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PaymentIcon className={`h-4 w-4 ${paymentInfo.iconColor}`} />
            <span className="text-sm text-stone-500">{paymentInfo.label}</span>
          </div>
          <span className="text-xl font-bold text-stone-800">{formatCurrency(sale.total)}</span>
        </div>

        {/* Propina (se cobró aparte de la venta) */}
        {sale.tip > 0 && (
          <div className="flex justify-between items-center text-sm border-t border-stone-100 pt-2">
            <span className="text-stone-500">Propina</span>
            <span className="text-emerald-700 font-semibold">+{formatCurrency(sale.tip)}</span>
          </div>
        )}
        {sale.tip > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-stone-500">Cobrado</span>
            <span className="text-lg font-bold text-stone-800">{formatCurrency(sale.total + sale.tip)}</span>
          </div>
        )}

        {/* Cambio (solo efectivo con monto recibido) */}
        {sale.paymentMethod === "efectivo" && sale.cashReceived != null && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-green-700">Recibido {formatCurrency(sale.cashReceived)}</span>
            <span className="text-base font-bold text-green-700">Cambio: {formatCurrency(sale.changeDue ?? 0)}</span>
          </div>
        )}
      </div>

      {printedAuto && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <Printer className="h-3.5 w-3.5" />
          {autoPrint === "both" ? "Ticket y comanda enviados a imprimir" : autoPrint === "ticket" ? "Ticket enviado a imprimir" : "Comanda enviada a imprimir"}
        </p>
      )}

      {/* Nota de compra: el cliente la escanea de esta misma pantalla, que
          es el unico momento en que sigue enfrente. Se despliega en vez de
          estar siempre a la vista porque la mayoria de las ventas no la
          pide, y ocupar espacio fijo con eso empujaria «Nueva venta» —el
          boton que SI se toca siempre— fuera del alcance del pulgar. */}
      {publicReceipt && (
        <div className="mt-4 w-full">
          {mostrarQr ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 bg-white p-4">
              <QRCode value={urlNota} size={148} bgColor="#ffffff" fgColor="#1c1917" />
              <p className="text-center text-xs text-stone-500">
                Que lo escanee el cliente con su celular.
                <br />
                Disponible 7 días.
              </p>
              <button
                type="button"
                onClick={() => setMostrarQr(false)}
                className="text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600"
              >
                ocultar
              </button>
            </div>
          ) : (
            <Button variant="outline" className="w-full gap-2" onClick={() => setMostrarQr(true)}>
              <QrCode className="h-4 w-4" />
              Nota para el cliente (QR)
            </Button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mt-5 w-full">
        <Button variant="outline" className="gap-2" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Ticket
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleKitchen} title="Imprimir comanda para barra (sin precios)">
          <ChefHat className="h-4 w-4" />
          Comanda
        </Button>
        <Button
          variant="outline"
          className="col-span-2 gap-2"
          onClick={handleShare}
          title="Compartir el ticket por WhatsApp o copiarlo"
        >
          <Share2 className="h-4 w-4" />
          Compartir ticket
        </Button>
        <Button className="col-span-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={onClose} autoFocus>
          Nueva venta
        </Button>
      </div>
    </div>
  )
}
