import { formatCurrency, formatDate, formatTime, paymentLabel } from "@/lib/format"
import type { BusinessInfo } from "@/lib/context-shape"
import type { TicketRecord } from "@/lib/tickets"
import { ticketItemLabel } from "@/lib/tickets"

/* ------------------------------------------------------------------ */
/*  Impresión en impresora térmica de 72 mm vía popup + window.print   */
/*  (32 columnas en Courier 11px). Lo usan el POS, el historial y el   */
/*  corte de caja.                                                     */
/* ------------------------------------------------------------------ */

const WIDTH = 32
const RULE = "=".repeat(WIDTH)
const THIN = "-".repeat(WIDTH)
const DEFAULT_FOOTER = "¡Gracias por tu compra!"

function center(text: string): string {
  const pad = Math.max(0, Math.floor((WIDTH - text.length) / 2))
  return " ".repeat(pad) + text
}

/** Parte un texto en líneas de máximo WIDTH columnas (respeta saltos de línea). */
function wrap(text: string, width: number = WIDTH): string[] {
  const out: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    let line = ""
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (candidate.length <= width) {
        line = candidate
      } else {
        if (line) out.push(line)
        // palabra más larga que el ancho: se corta
        line = w.length > width ? w.slice(0, width) : w
      }
    }
    if (line || words.length === 0) out.push(line)
  }
  return out
}

/** Datos del negocio que van en el encabezado/pie del ticket. */
export interface ReceiptBusiness {
  name: string
  timezone?: string
  address?: string | null
  phone?: string | null
  receiptHeader?: string | null
  receiptFooter?: string | null
}

export function receiptBusinessFrom(b: BusinessInfo): ReceiptBusiness {
  return {
    name: b.name,
    timezone: b.timezone,
    address: b.address,
    phone: b.phone,
    receiptHeader: b.receiptHeader,
    receiptFooter: b.receiptFooter,
  }
}

function headerLines(biz: ReceiptBusiness, subtitle?: string): string[] {
  const lines: string[] = [RULE, ...wrap(biz.name.toUpperCase()).map(center)]
  if (subtitle) lines.push(center(subtitle))
  if (biz.receiptHeader) lines.push(...wrap(biz.receiptHeader).map(center))
  if (biz.address) lines.push(...wrap(biz.address).map(center))
  if (biz.phone) lines.push(center(`Tel. ${biz.phone}`))
  lines.push(RULE)
  return lines
}

function footerLines(biz: ReceiptBusiness): string[] {
  return [RULE, ...wrap(biz.receiptFooter?.trim() || DEFAULT_FOOTER).map(center), RULE]
}

/** Alinea `label` a la izquierda y `value` a la derecha en una línea. */
function row(label: string, value: string): string {
  const gap = WIDTH - label.length - value.length
  return gap >= 1 ? label + " ".repeat(gap) + value : `${label} ${value}`
}

export interface ReceiptItem {
  label: string
  quantity: number
  /** Precio unitario ya incluyendo modificadores. */
  unitPrice: number
  lineTotal: number
  notes?: string | null
  modifiers?: Array<{ name: string; price: number }>
}

export interface ReceiptData {
  folio: number
  date: Date
  paymentMethod: string
  notes?: string | null
  items: ReceiptItem[]
  subtotal?: number
  discountTotal?: number
  discountReason?: string | null
  total: number
  cashReceived?: number | null
  changeDue?: number | null
  status?: "completado" | "cancelado"
  cancelReason?: string | null
  reprint?: boolean
}

export function receiptFromTicket(ticket: TicketRecord, reprint = false): ReceiptData {
  return {
    folio: ticket.folio,
    date: new Date(ticket.createdAt),
    paymentMethod: ticket.paymentMethod,
    notes: ticket.notes,
    items: ticket.items.map((i) => ({
      label: ticketItemLabel(i),
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      notes: i.notes,
      modifiers: i.modifiers.map((m) => ({ name: m.name, price: m.price })),
    })),
    subtotal: ticket.subtotal,
    discountTotal: ticket.discountTotal,
    discountReason: ticket.discountReason,
    total: ticket.total,
    cashReceived: ticket.cashReceived,
    changeDue: ticket.changeDue,
    status: ticket.status,
    cancelReason: ticket.cancelReason,
    reprint,
  }
}

export function buildTicketLines(r: ReceiptData, biz: ReceiptBusiness): string[] {
  const tz = biz.timezone
  const lines: string[] = [
    ...headerLines(biz),
    "",
    `Folio: ${r.folio}`,
    `Fecha: ${formatDate(r.date, tz)}`,
    `Hora: ${formatTime(r.date, tz)}`,
    `Pago: ${paymentLabel(r.paymentMethod)}`,
  ]
  if (r.notes) lines.push(`Nota: ${r.notes}`)
  if (r.reprint) lines.push("(Reimpresión)")
  lines.push("", THIN)

  for (const item of r.items) {
    lines.push(`${item.quantity}x ${item.label}`)
    for (const m of item.modifiers ?? []) {
      lines.push(row(`   + ${m.name}`, m.price > 0 ? `+${formatCurrency(m.price)}` : ""))
    }
    lines.push(row(`     ${formatCurrency(item.unitPrice)} c/u`, formatCurrency(item.lineTotal)))
    if (item.notes) lines.push(`     * ${item.notes}`)
  }

  lines.push(THIN, "")
  const hasDiscount = (r.discountTotal ?? 0) > 0
  if (hasDiscount) {
    lines.push(row("  Subtotal:", formatCurrency(r.subtotal ?? r.total + (r.discountTotal ?? 0))))
    lines.push(row("  Descuento:", `-${formatCurrency(r.discountTotal ?? 0)}`))
    if (r.discountReason) lines.push(`  (${r.discountReason})`)
  }
  lines.push(row("  TOTAL:", formatCurrency(r.total)))
  if (r.paymentMethod === "efectivo" && r.cashReceived != null) {
    lines.push(row("  Recibido:", formatCurrency(r.cashReceived)))
    lines.push(row("  Cambio:", formatCurrency(r.changeDue ?? 0)))
  }
  lines.push("")

  if (r.status === "cancelado") {
    lines.push(RULE, center("*** CANCELADO ***"))
    if (r.cancelReason) lines.push(`Motivo: ${r.cancelReason}`)
    lines.push(RULE)
  } else {
    lines.push(...footerLines(biz))
  }
  return lines
}

/* ------------------------------------------------------------------ */
/*  Ticket como texto (WhatsApp, notas, copiar y pegar)                */
/* ------------------------------------------------------------------ */

/** Versión legible del ticket para mandar por mensaje (sin monoespaciado). */
export function buildShareText(r: ReceiptData, biz: ReceiptBusiness): string {
  const tz = biz.timezone
  const lines: string[] = [biz.name, `Ticket #${r.folio} · ${formatDate(r.date, tz)} ${formatTime(r.date, tz)}`, ""]
  for (const item of r.items) {
    lines.push(`${item.quantity}x ${item.label} — ${formatCurrency(item.lineTotal)}`)
    for (const m of item.modifiers ?? []) lines.push(`   + ${m.name}`)
    if (item.notes) lines.push(`   * ${item.notes}`)
  }
  lines.push("")
  if ((r.discountTotal ?? 0) > 0) {
    lines.push(`Subtotal: ${formatCurrency(r.subtotal ?? r.total + (r.discountTotal ?? 0))}`)
    lines.push(`Descuento: -${formatCurrency(r.discountTotal ?? 0)}`)
  }
  lines.push(`Total: ${formatCurrency(r.total)}`)
  lines.push(`Pago: ${paymentLabel(r.paymentMethod)}`)
  if (biz.phone) lines.push("", `Tel. ${biz.phone}`)
  lines.push("", biz.receiptFooter?.trim() || DEFAULT_FOOTER)
  return lines.join("\n")
}

/* ------------------------------------------------------------------ */
/*  Comanda para barra/cocina (sin precios: qué preparar y cómo)       */
/* ------------------------------------------------------------------ */

export function buildKitchenLines(r: ReceiptData, biz?: Pick<ReceiptBusiness, "timezone">): string[] {
  const lines: string[] = [
    RULE,
    center("COMANDA"),
    RULE,
    row(`Folio: ${r.folio}`, formatTime(r.date, biz?.timezone)),
  ]
  if (r.notes) lines.push(`Nota: ${r.notes}`)
  lines.push(THIN)
  for (const item of r.items) {
    lines.push(`${item.quantity}x ${item.label.toUpperCase()}`)
    for (const m of item.modifiers ?? []) lines.push(`   + ${m.name}`)
    if (item.notes) lines.push(`   * ${item.notes.toUpperCase()}`)
    lines.push("")
  }
  lines.push(THIN)
  if (r.status === "cancelado") lines.push(center("*** CANCELADO ***"))
  return lines
}

/* ------------------------------------------------------------------ */
/*  Corte de caja                                                      */
/* ------------------------------------------------------------------ */

export interface CashSessionSummary {
  session_id: string
  status: "abierta" | "cerrada"
  opened_at: string
  closed_at: string | null
  opened_by: string
  closed_by: string | null
  opening_float: number
  opening_notes: string | null
  closing_notes: string | null
  expected_cash: number | null
  counted_cash: number | null
  difference: number | null
  tickets_count: number
  revenue: number
  cash_sales: number
  cancelled_count: number
  cancelled_amount: number
  /** Suma de descuentos del turno (lo agrega cash_session_summary desde Fase 3; opcional por compatibilidad). */
  discount_total?: number
  /** Entradas/salidas de efectivo a mitad de turno (Fase 4b). */
  movements_in?: number
  movements_out?: number
  movements?: Array<{
    id: string
    kind: "entrada" | "salida"
    amount: number
    reason: string
    created_at: string
    created_by: string
  }>
  by_method: Array<{ method: string; tickets: number; revenue: number }>
}

export function buildCorteLines(s: CashSessionSummary, biz: ReceiptBusiness): string[] {
  const tz = biz.timezone
  const opened = new Date(s.opened_at)
  const closed = s.closed_at ? new Date(s.closed_at) : null
  const lines: string[] = [
    ...headerLines({ name: biz.name, timezone: tz }, "CORTE DE CAJA"),
    "",
    `Apertura: ${formatDate(opened, tz)} ${formatTime(opened, tz)}`,
    `Abrió: ${s.opened_by}`,
  ]
  if (closed) {
    lines.push(`Cierre: ${formatDate(closed, tz)} ${formatTime(closed, tz)}`)
    if (s.closed_by) lines.push(`Cerró: ${s.closed_by}`)
  }
  lines.push("", THIN, "VENTAS POR MÉTODO")
  for (const m of s.by_method) {
    lines.push(row(`${paymentLabel(m.method)} (${m.tickets})`, formatCurrency(m.revenue)))
  }
  lines.push(THIN)
  lines.push(row(`Ventas (${s.tickets_count})`, formatCurrency(s.revenue)))
  if ((s.discount_total ?? 0) > 0) {
    lines.push(row("Descuentos aplicados", `-${formatCurrency(s.discount_total ?? 0)}`))
  }
  if (s.cancelled_count > 0) {
    lines.push(row(`Canceladas (${s.cancelled_count})`, formatCurrency(s.cancelled_amount)))
  }
  const movIn = s.movements_in ?? 0
  const movOut = s.movements_out ?? 0
  if ((s.movements ?? []).length > 0) {
    lines.push("", THIN, "MOVIMIENTOS DE EFECTIVO")
    for (const m of s.movements ?? []) {
      const sign = m.kind === "entrada" ? "+" : "-"
      lines.push(row(`${formatTime(new Date(m.created_at), tz)} ${m.reason}`.slice(0, 22), `${sign}${formatCurrency(m.amount)}`))
    }
  }
  lines.push("", THIN, "EFECTIVO EN CAJA")
  lines.push(row("Fondo inicial", formatCurrency(s.opening_float)))
  lines.push(row("Ventas efectivo", formatCurrency(s.cash_sales)))
  if (movIn > 0) lines.push(row("Entradas", `+${formatCurrency(movIn)}`))
  if (movOut > 0) lines.push(row("Salidas", `-${formatCurrency(movOut)}`))
  lines.push(row("Esperado", formatCurrency(s.expected_cash ?? s.opening_float + s.cash_sales + movIn - movOut)))
  if (s.counted_cash != null) {
    lines.push(row("Contado", formatCurrency(s.counted_cash)))
    const diff = s.difference ?? 0
    const sign = diff > 0 ? "+" : ""
    lines.push(row("Diferencia", `${sign}${formatCurrency(diff)}`))
  }
  if (s.opening_notes) lines.push("", `Nota apertura: ${s.opening_notes}`)
  if (s.closing_notes) lines.push(`Nota cierre: ${s.closing_notes}`)
  lines.push("", RULE)
  return lines
}

/* ------------------------------------------------------------------ */
/*  Popup de impresión                                                 */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Abre el popup e imprime. Devuelve false si el navegador lo bloqueó. */
export function printLines(lines: string[], title: string): boolean {
  const printWindow = window.open("", "_blank", "width=320,height=600")
  if (!printWindow) return false

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: 280px;
            margin: 0 auto;
            padding: 10px 0;
            line-height: 1.4;
          }
          pre { margin: 0; white-space: pre-wrap; }
          @media print {
            body { width: 72mm; font-size: 11px; }
          }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(lines.join("\n"))}</pre>
        <script>
          window.onload = function() { window.print(); };
        <\/script>
      </body>
    </html>
  `)
  printWindow.document.close()
  return true
}
