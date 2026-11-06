import type { CreateTicketData } from "@/app/actions/sales"
import { getLineLabel, getLinePrice, type CartLine, type PaymentMethod } from "./cart"
import { idDeServidor } from "./parked"
import { serializeLines, type QueuedSale } from "./queue"
import type { CompletedSale } from "./receipt-view"

/**
 * Lo que comparten los dos cobros del POS (el del carrito y «Cobrar» de una
 * cuenta desde la barra). Estaba escrito dos veces dentro de pos-client.tsx
 * y cualquier campo nuevo del recibo había que acordarse de ponerlo en los
 * dos. Puro y probado.
 */

/**
 * La referencia (client_ref) para cobrar ESTA versión de una cuenta: siempre
 * la misma para la misma cuenta y el mismo sello. create_ticket ya devuelve la
 * venta existente si le llega una referencia repetida, así que cobrar dos
 * veces la misma cuenta —varios toques antes de que React se entere, o dos
 * aparatos a la vez, o una venta en la cola y otra en línea— da UNA venta.
 * Antes cada toque estrenaba un randomUUID(): prueba de caos del 2026-11-05,
 * seis toques seguidos en «Cobrar» de la barra = seis ventas de una cuenta.
 *
 * Es un UUID versión 5 de verdad (sha-256 recortado, bits de versión y de
 * variante puestos): lo acepta la validación del servidor. Si el navegador no
 * tiene crypto.subtle (sin https), se cae a uno al azar como antes.
 */
export async function refDeCobroDeCuenta(id: string, updatedAt: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return crypto.randomUUID()
  const datos = new TextEncoder().encode(`cobro-de-cuenta:${idDeServidor(id)}:${updatedAt}`)
  const h = new Uint8Array(await subtle.digest("SHA-256", datos)).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = [...h].map((b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** El recibo de una venta que el servidor acaba de registrar. */
export function ventaCompletada(
  r: Omit<CreateTicketData, "stock">,
  venta: { lines: CartLine[]; paymentMethod: PaymentMethod; notes?: string; discountReason?: string | null },
  fecha: Date = new Date(),
): CompletedSale {
  return {
    ticketId: r.ticketId,
    folio: r.folio,
    lines: venta.lines,
    subtotal: r.subtotal,
    discountTotal: r.discountTotal,
    discountReason: venta.discountReason ?? null,
    total: r.total,
    takeoutFee: r.takeoutFee,
    tip: r.tip,
    paymentMethod: venta.paymentMethod,
    date: fecha,
    notes: venta.notes || undefined,
    cashReceived: r.cashReceived,
    changeDue: r.changeDue,
    loyalty: r.loyalty ? { stamps: r.loyalty.stamps, target: r.loyalty.target, redeemed: r.loyalty.redeemed } : null,
    credit: r.credit ? { name: r.credit.name, balance: r.credit.balance } : null,
  }
}

/**
 * Una venta que no llegó al servidor, lista para la cola sin internet. Con su
 * MISMO `clientRef`: si en realidad sí había entrado, al subir no se duplica.
 * `chargedTotal` es el total de la venta SIN propina, que es lo que el
 * servidor recalcula y devuelve como `total`.
 */
export function ventaParaLaCola(
  v: Omit<QueuedSale, "provisional" | "status" | "attempts" | "capturedAt" | "lines"> & { lines: CartLine[] },
  capturedAt: number = Date.now(),
): Omit<QueuedSale, "provisional" | "status" | "attempts"> {
  const { lines, ...resto } = v
  return { ...resto, capturedAt, lines: serializeLines(lines, getLinePrice, getLineLabel) }
}
