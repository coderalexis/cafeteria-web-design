import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Coffee, MapPin, Phone } from "lucide-react"
import { createPublicClient } from "@/lib/supabase/public"
import { buildTicketLines, type ReceiptBusiness, type ReceiptData } from "@/lib/receipt"

/**
 * Nota de compra del cliente: lo que abre al escanear el QR después de pagar.
 *
 * SIN SESIÓN, como el menú público. Todo sale del RPC `public_receipt`, que
 * es quien decide si esta nota se puede ver: caduca a los 7 días, respeta el
 * interruptor del café y nunca devuelve costos.
 *
 * NO se cachea, al revés que el menú: una carta la ven cientos de personas y
 * cambia poco; una nota la ve una persona una vez, y guardarla en caché sería
 * pagar memoria por nada — además de arriesgarse a servirla ya caducada.
 *
 * El ticket se pinta con `buildTicketLines`, el MISMO armador del papel. Así
 * lo que ve en su celular es exactamente lo que habría salido impreso, sin
 * una segunda versión que se desincronice.
 */
export const dynamic = "force-dynamic"

interface NotaPublica {
  business: {
    name: string
    address: string | null
    phone: string | null
    receiptHeader: string | null
    receiptFooter: string | null
    timezone: string
  }
  folio: number
  date: string
  paymentMethod: string
  notes: string | null
  subtotal: number
  discountTotal: number
  discountReason: string | null
  takeoutFee: number
  total: number
  tip: number
  cashReceived: number | null
  changeDue: number | null
  status: "completado" | "cancelado"
  cancelReason: string | null
  items: Array<{
    label: string
    quantity: number
    unitPrice: number
    lineTotal: number
    notes: string | null
    modifiers: Array<{ name: string; price: number }>
  }>
}

async function getNota(id: string): Promise<NotaPublica | null> {
  // El id viaja en la URL del QR: si no es un uuid, ni se consulta.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = createPublicClient()
  const { data } = await supabase.rpc("public_receipt", { p_ticket: id })
  return (data as NotaPublica | null) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const nota = await getNota(id)
  if (!nota) return { title: "Nota no disponible" }
  return {
    title: `Nota de compra · ${nota.business.name}`,
    description: `Nota #${nota.folio} de ${nota.business.name}.`,
    // Es la compra de una persona: no tiene por qué acabar en un buscador.
    robots: { index: false, follow: false },
  }
}

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nota = await getNota(id)
  if (!nota) notFound()

  const biz: ReceiptBusiness = {
    name: nota.business.name,
    timezone: nota.business.timezone,
    address: nota.business.address,
    phone: nota.business.phone,
    receiptHeader: nota.business.receiptHeader,
    receiptFooter: nota.business.receiptFooter,
  }
  const datos: ReceiptData = {
    folio: nota.folio,
    date: new Date(nota.date),
    paymentMethod: nota.paymentMethod,
    notes: nota.notes,
    items: nota.items.map((i) => ({
      label: i.label,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      notes: i.notes,
      modifiers: i.modifiers.map((m) => ({ name: m.name, price: Number(m.price) })),
    })),
    subtotal: Number(nota.subtotal),
    discountTotal: Number(nota.discountTotal),
    discountReason: nota.discountReason,
    takeoutFee: Number(nota.takeoutFee),
    total: Number(nota.total),
    tip: Number(nota.tip),
    cashReceived: nota.cashReceived === null ? null : Number(nota.cashReceived),
    changeDue: nota.changeDue === null ? null : Number(nota.changeDue),
    status: nota.status,
    cancelReason: nota.cancelReason,
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-4 flex items-center justify-center gap-2 text-stone-500">
          <Coffee className="h-4 w-4 text-amber-700" />
          <span className="text-sm font-semibold">Nota de compra</span>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-stone-800">
            {buildTicketLines(datos, biz).join("\n")}
          </pre>
        </div>

        {/* El aviso mas importante de la pagina. En Mexico «nota» y «factura»
            se confunden todo el tiempo y alguien va a intentar deducir esto:
            mas vale decirlo con todas sus letras que dejarlo al contexto. */}
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900">
          Esta es tu <strong>nota de compra</strong>, no un comprobante fiscal. Si necesitas factura, pídela en la
          cafetería.
        </p>

        {(nota.business.address || nota.business.phone) && (
          <div className="mt-4 space-y-1 text-center text-sm text-stone-500">
            {nota.business.address && (
              <p className="flex items-center justify-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {nota.business.address}
              </p>
            )}
            {nota.business.phone && (
              <p className="flex items-center justify-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {nota.business.phone}
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-stone-400">
          Guarda esta página o tómale una captura: el enlace deja de funcionar a los 7 días.
        </p>
      </div>
    </main>
  )
}
