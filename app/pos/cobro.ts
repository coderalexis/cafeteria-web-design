import type { CreateTicketData } from "@/app/actions/sales"
import { getLineLabel, getLinePrice, type CartLine, type PaymentMethod } from "./cart"
import { serializeLines, type QueuedSale } from "./queue"
import type { CompletedSale } from "./receipt-view"

/**
 * Lo que comparten los dos cobros del POS (el del carrito y «Cobrar» de una
 * cuenta desde la barra). Estaba escrito dos veces dentro de pos-client.tsx
 * y cualquier campo nuevo del recibo había que acordarse de ponerlo en los
 * dos. Puro y probado.
 */

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
