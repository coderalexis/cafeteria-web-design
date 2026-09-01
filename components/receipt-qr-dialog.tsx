"use client"

import { useState } from "react"
import { toast } from "sonner"
import QRCode from "react-qr-code"
import { Copy, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * El QR de una venta YA cobrada, para cuando el cliente se arrepiente.
 *
 * El caso real: dijo que no quería ticket, se cerró la pantalla de cobro, y
 * al momento cambió de opinión. Sin esto había que rehacer la venta o
 * mandarla por WhatsApp pidiéndole el número — una fricción tonta para algo
 * que el sistema ya tiene listo.
 *
 * Vive en `components/` y no en `app/pos/` porque lo usan tanto la caja como
 * el panel del dueño, que es donde se busca una venta de hace días.
 */
export function ReceiptQrDialog({
  ticketId,
  folio,
  open,
  onOpenChange,
}: {
  ticketId: string | null
  folio: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const url = ticketId && typeof window !== "undefined" ? `${window.location.origin}/t/${ticketId}` : ""

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Enlace copiado: pégalo donde lo necesites.")
    } catch {
      toast.error("No se pudo copiar. Escribe el enlace a mano o usa el QR.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-amber-700" />
            Nota del folio #{folio}
          </DialogTitle>
          <DialogDescription>
            Que el cliente lo escanee con su celular. El enlace sirve 7 días desde la venta.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {url && (
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <QRCode value={url} size={168} bgColor="#ffffff" fgColor="#1c1917" />
            </div>
          )}
          {/* Copiar el enlace: sirve para mandarlo por WhatsApp cuando el
              cliente ya no está enfrente y solo dejó su teléfono. */}
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => void copiar()}>
            <Copy className="h-3.5 w-3.5" />
            Copiar enlace
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Estado listo para usar desde cualquier lista de ventas. */
export function useReceiptQr() {
  const [ticket, setTicket] = useState<{ id: string; folio: number } | null>(null)
  return {
    abrir: (id: string, folio: number) => setTicket({ id, folio }),
    props: {
      ticketId: ticket?.id ?? null,
      folio: ticket?.folio ?? null,
      open: ticket !== null,
      onOpenChange: (v: boolean) => {
        if (!v) setTicket(null)
      },
    },
  }
}
