import type { Metadata } from "next"
import { buildCorteLines, buildTicketLines } from "@/lib/receipt"
import { AyudaClient } from "./ayuda-client"

export const metadata: Metadata = {
  title: "Guía de uso — Cafecito POS",
}

/* ------------------------------------------------------------------ */
/*  Guía de uso. El ticket y el corte de muestra se generan aquí con   */
/*  las MISMAS funciones que imprimen en el POS: si el formato cambia, */
/*  la guía cambia sola y nunca enseña algo viejo.                     */
/* ------------------------------------------------------------------ */

const NEGOCIO = {
  name: "Tu cafetería",
  timezone: "America/Mexico_City",
  receiptFooter: "¡Gracias por tu compra!",
}

const TICKET = buildTicketLines(
  {
    folio: 42,
    date: new Date("2026-03-14T16:20:00Z"),
    paymentMethod: "efectivo",
    items: [
      {
        label: "Latte (Grande)",
        quantity: 1,
        unitPrice: 72,
        lineTotal: 72,
        modifiers: [{ name: "Leche de avena", price: 12 }],
        notes: "sin azúcar",
      },
      { label: "Crepa de cajeta", quantity: 1, unitPrice: 65, lineTotal: 65 },
    ],
    subtotal: 137,
    total: 137,
    tip: 13,
    cashReceived: 200,
    changeDue: 50,
    notes: "Mesa 4",
  },
  NEGOCIO,
)

const CORTE = buildCorteLines(
  {
    session_id: "demo",
    status: "cerrada",
    opened_at: "2026-03-14T14:00:00Z",
    closed_at: "2026-03-14T22:05:00Z",
    opened_by: "María",
    closed_by: "María",
    opening_float: 500,
    opening_notes: null,
    closing_notes: null,
    expected_cash: 1540,
    counted_cash: 1540,
    difference: 0,
    tickets_count: 23,
    revenue: 2180,
    cash_sales: 980,
    cancelled_count: 1,
    cancelled_amount: 65,
    discount_total: 40,
    tips_total: 118,
    cash_tips: 60,
    movements_in: 0,
    movements_out: 0,
    movements: [],
    by_method: [
      { method: "efectivo", tickets: 11, revenue: 980 },
      { method: "transferencia", tickets: 7, revenue: 680 },
      { method: "tarjeta_clip", tickets: 5, revenue: 520 },
    ],
  },
  NEGOCIO,
)

export default function AyudaPage() {
  return <AyudaClient ticket={TICKET} corte={CORTE} />
}
