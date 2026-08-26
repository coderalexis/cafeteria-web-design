"use client"

import { useState } from "react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { Copy, ExternalLink, Printer, QrCode } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * QR del menú público. El cartel se imprime en una ventana aparte (el panel
 * tiene altura fija y scroll interno, así que window.print() cortaría la hoja).
 */
export function MenuQrCard({
  businessName,
  slug,
  active,
}: {
  businessName: string
  slug: string
  active: boolean
}) {
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""))
  const url = `${origin}/menu/${slug}`

  const printPoster = () => {
    const svg = document.getElementById("menu-qr")?.querySelector("svg")?.outerHTML
    if (!svg) {
      toast.error("No se pudo preparar el cartel.")
      return
    }
    const win = window.open("", "_blank", "width=460,height=680")
    if (!win) {
      toast.error("El navegador bloqueó la ventana de impresión.")
      return
    }
    win.document.write(
      `<html><head><title>Menú de ${businessName}</title><style>
        body { font-family: system-ui, Arial, sans-serif; text-align: center; padding: 48px 24px; margin: 0; }
        h1 { font-size: 28px; margin: 0 0 4px; }
        p.sub { color: #78716c; margin: 0 0 28px; font-size: 15px; }
        svg { width: 260px; height: 260px; }
        p.url { color: #a8a29e; font-size: 12px; margin-top: 24px; word-break: break-all; }
        @page { margin: 12mm; }
      </style></head><body>
        <h1>${businessName}</h1>
        <p class="sub">Escanea para ver el menú</p>
        ${svg}
        <p class="url">${url}</p>
        <script>window.onload = function () { window.print() }<\/script>
      </body></html>`,
    )
    win.document.close()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Enlace copiado.")
    } catch {
      toast.error("No se pudo copiar; selecciona el enlace a mano.")
    }
  }

  if (!active) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4 text-amber-700" />
            Código QR del menú
          </CardTitle>
          <CardDescription>
            Activa el menú público arriba y guarda los ajustes; aquí aparecerá el QR para imprimir y ponerlo en las
            mesas.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="h-4 w-4 text-amber-700" />
          Código QR del menú
        </CardTitle>
        <CardDescription>
          Imprímelo y ponlo en las mesas o en el mostrador. El menú se actualiza solo cuando cambias precios o
          productos: el QR nunca cambia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Cartel imprimible */}
        <div id="menu-qr" className="rounded-xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-lg font-bold text-stone-800">{businessName}</p>
          <p className="mt-0.5 text-sm text-stone-500">Escanea para ver el menú</p>
          <div className="mx-auto mt-4 w-fit rounded-lg bg-white p-3">
            <QRCode value={url} size={180} level="M" />
          </div>
          <p className="mt-3 break-all text-xs text-stone-400">{url}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={printPoster}>
            <Printer className="h-3.5 w-3.5" />
            Imprimir cartel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
            <Copy className="h-3.5 w-3.5" />
            Copiar enlace
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ver menú
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
