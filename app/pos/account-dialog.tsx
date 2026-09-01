"use client"

import { toast } from "sonner"
import { Printer, Send, Receipt } from "lucide-react"
import { formatCurrency, formatTime } from "@/lib/format"
import {
  buildAccountLines,
  buildAccountShareText,
  printLines,
  receiptBusinessFrom,
  type AccountData,
  type ReceiptBusiness,
} from "@/lib/receipt"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * «¿Me trae la cuenta?» — lo que se le enseña a la mesa ANTES de cobrar.
 *
 * Deliberadamente NO cobra ni tiene botón para cobrar: es el papel que se
 * deja en la mesa mientras el cliente saca la cartera. Cobrar sigue siendo
 * abrir la cuenta y usar el botón de siempre, con su método de pago, su
 * propina y su folio.
 */
export function AccountDialog({
  account,
  business,
  onClose,
}: {
  account: AccountData | null
  business: Parameters<typeof receiptBusinessFrom>[0]
  onClose: () => void
}) {
  const biz: ReceiptBusiness | null = account ? receiptBusinessFrom(business) : null

  const imprimir = () => {
    if (!account || !biz) return
    // Sin await de por medio: `printLines` abre la ventana y el bloqueador
    // solo la perdona mientras siga dentro del gesto del toque.
    if (!printLines(buildAccountLines(account, biz), `Cuenta ${account.name}`, biz.widthMm)) {
      toast.error("El navegador bloqueó la ventana de impresión.")
    }
  }

  const compartir = async () => {
    if (!account || !biz) return
    const text = buildAccountShareText(account, biz)
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `Cuenta ${account.name}`, text })
        return
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Cuenta copiada: pégala en WhatsApp.")
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")
    }
  }

  return (
    <Dialog open={!!account} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {account && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-amber-700" />
                Cuenta de {account.name}
              </DialogTitle>
              {/* Sin punto tras la hora: `formatTime` ya devuelve «11:11 p.m.»
                  y encadenarle otro dejaba «p.m..» en pantalla. */}
              <DialogDescription>
                Abierta desde las {formatTime(account.openedAt, business.timezone)} — todavía no se ha cobrado nada.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-3">
              {account.items.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug text-stone-800">
                      <span className="text-amber-700">{item.quantity}×</span> {item.label}
                    </p>
                    {(item.modifiers ?? []).map((m, k) => (
                      <p key={k} className="pl-5 text-xs text-stone-500">
                        + {m.name}
                        {m.price > 0 && ` (${formatCurrency(m.price)})`}
                      </p>
                    ))}
                    {item.notes && <p className="pl-5 text-xs italic text-stone-500">* {item.notes}</p>}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-stone-700">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-stone-200 pt-2 text-base font-bold text-stone-800">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(account.total)}</span>
              </div>
            </div>

            {/* El aviso va también en pantalla, no solo en el papel: quien
                enseña el celular a la mesa está enseñando esto mismo. */}
            <p className="text-center text-xs font-medium text-amber-800">
              Pendiente de pago · no es comprobante
            </p>

            <DialogFooter className="gap-2 sm:justify-center">
              <Button variant="outline" className="flex-1 gap-2" onClick={compartir}>
                <Send className="h-4 w-4" />
                Compartir
              </Button>
              <Button className="flex-1 gap-2 bg-amber-600 text-white hover:bg-amber-700" onClick={imprimir}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
