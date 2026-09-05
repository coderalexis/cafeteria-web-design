import { formatCurrency, formatDate, formatTime, paymentLabel } from "@/lib/format"
import type { BusinessInfo } from "@/lib/context-shape"
import type { TicketRecord } from "@/lib/tickets"
import { ticketItemLabel } from "@/lib/tickets"
import { parseBusinessSettings, printableWidthMm } from "@/lib/settings"

/* ------------------------------------------------------------------ */
/*  Impresión térmica vía popup + window.print. Lo usan el POS, el      */
/*  historial y el corte de caja.                                       */
/*                                                                      */
/*  32 columnas: es la medida NATIVA del rollo de 58 mm (384 puntos a   */
/*  12 por caracter). El ANCHO DE LA HOJA lo pone cada cafeteria segun  */
/*  su papel — antes estaba fijo en 72 mm, que es el de 80, y con 32    */
/*  columnas no calzaba en ninguno de los dos.                          */
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
  /** Rollo de la impresora en mm (58 por omision). */
  widthMm?: 58 | 80
}

export function receiptBusinessFrom(b: BusinessInfo): ReceiptBusiness {
  return {
    widthMm: parseBusinessSettings(b.settings).receiptWidthMm,
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
  /** Cargo por «Para llevar», ya incluido en total. */
  takeoutFee?: number
  total: number
  /** Propina: se cobra encima del total, no forma parte de la venta. */
  tip?: number
  cashReceived?: number | null
  changeDue?: number | null
  status?: "completado" | "cancelado"
  cancelReason?: string | null
  reprint?: boolean
  /** Estado de la tarjeta de sellos tras esta venta (si hubo cliente). */
  loyalty?: { stamps: number; target: number; redeemed: boolean } | null
  /** Venta fiada: a quién y cuánto debe en total después de esta. */
  credit?: { name: string; balance: number } | null
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
    takeoutFee: ticket.takeoutFee,
    total: ticket.total,
    tip: ticket.tip,
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
  if (r.credit) lines.push(`A nombre de: ${r.credit.name}`)
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
  const takeout = r.takeoutFee ?? 0
  // Con descuento O cargo, el total no se explica solo: se enseña la suma.
  if (hasDiscount || takeout > 0) {
    lines.push(row("  Subtotal:", formatCurrency(r.subtotal ?? r.total + (r.discountTotal ?? 0) - takeout)))
  }
  if (hasDiscount) {
    lines.push(row("  Descuento:", `-${formatCurrency(r.discountTotal ?? 0)}`))
    if (r.discountReason) lines.push(`  (${r.discountReason})`)
  }
  if (takeout > 0) {
    lines.push(row("  Para llevar:", `+${formatCurrency(takeout)}`))
  }
  lines.push(row("  TOTAL:", formatCurrency(r.total)))
  const tip = r.tip ?? 0
  if (tip > 0) {
    lines.push(row("  Propina:", formatCurrency(tip)))
    lines.push(row("  A COBRAR:", formatCurrency(r.total + tip)))
  }
  if (r.paymentMethod === "efectivo" && r.cashReceived != null) {
    lines.push(row("  Recibido:", formatCurrency(r.cashReceived)))
    lines.push(row("  Cambio:", formatCurrency(r.changeDue ?? 0)))
  }
  lines.push("")

  // Tarjeta de sellos: el cliente se lleva su avance impreso, como en el cartón.
  if (r.credit) {
    lines.push("", `Saldo de ${r.credit.name}: ${formatCurrency(r.credit.balance)}`)
  }
  if (r.loyalty) {
    lines.push(
      center(
        r.loyalty.redeemed
          ? "* PREMIO CANJEADO *"
          : `Sellos: ${r.loyalty.stamps} de ${r.loyalty.target}`,
      ),
    )
    if (!r.loyalty.redeemed && r.loyalty.stamps >= r.loyalty.target) {
      lines.push(center("¡Tienes un premio por canjear!"))
    }
    lines.push("")
  }

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
  if ((r.tip ?? 0) > 0) {
    lines.push(`Propina: ${formatCurrency(r.tip ?? 0)}`)
    lines.push(`Total a cobrar: ${formatCurrency(r.total + (r.tip ?? 0))}`)
  }
  lines.push(`Pago: ${paymentLabel(r.paymentMethod)}`)
  if (biz.phone) lines.push("", `Tel. ${biz.phone}`)
  lines.push("", biz.receiptFooter?.trim() || DEFAULT_FOOTER)
  return lines.join("\n")
}

/* ------------------------------------------------------------------ */
/*  Cuenta de la mesa («¿me trae la cuenta?»)                          */
/* ------------------------------------------------------------------ */

export interface AccountData {
  /** Cómo se llama la cuenta: "Mesa 3", "Sra. suéter rojo". */
  name: string
  /** Cuándo se abrió. */
  openedAt: Date
  items: ReceiptItem[]
  total: number
}

/**
 * Lo que se le lleva a la mesa cuando piden la cuenta, ANTES de cobrar.
 *
 * No es un ticket y el papel tiene que decirlo con todas sus letras: no lleva
 * folio (todavía no existe la venta), no dice método de pago, y el pie avisa
 * que no es comprobante. Un papel con productos y total se parece demasiado a
 * un comprobante de pago como para dejar la distinción al contexto — y quien
 * lo recibe es el cliente, no el cajero.
 */
export function buildAccountLines(a: AccountData, biz: ReceiptBusiness): string[] {
  const tz = biz.timezone
  const lines: string[] = [
    ...headerLines(biz, "CUENTA"),
    "",
    `${a.name}`,
    `Abierta: ${formatDate(a.openedAt, tz)} ${formatTime(a.openedAt, tz)}`,
    "",
    THIN,
  ]

  for (const item of a.items) {
    lines.push(`${item.quantity}x ${item.label}`)
    for (const m of item.modifiers ?? []) {
      lines.push(row(`   + ${m.name}`, m.price > 0 ? `+${formatCurrency(m.price)}` : ""))
    }
    lines.push(row(`     ${formatCurrency(item.unitPrice)} c/u`, formatCurrency(item.lineTotal)))
    if (item.notes) lines.push(`     * ${item.notes}`)
  }

  lines.push(THIN, "", row("  TOTAL:", formatCurrency(a.total)), "")
  lines.push(RULE, center("PENDIENTE DE PAGO"), center("No es comprobante fiscal"), RULE)
  return lines
}

/** La misma cuenta como texto, para mandarla por mensaje. */
export function buildAccountShareText(a: AccountData, biz: ReceiptBusiness): string {
  const tz = biz.timezone
  const lines: string[] = [
    `${biz.name} — Cuenta`,
    `${a.name} · abierta ${formatDate(a.openedAt, tz)} ${formatTime(a.openedAt, tz)}`,
    "",
  ]
  for (const item of a.items) {
    lines.push(`${item.quantity}x ${item.label} — ${formatCurrency(item.lineTotal)}`)
    for (const m of item.modifiers ?? []) lines.push(`   + ${m.name}`)
    if (item.notes) lines.push(`   * ${item.notes}`)
  }
  lines.push("", `Total: ${formatCurrency(a.total)}`, "", "Pendiente de pago (no es comprobante).")
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
  /** Conteo por denominación al cerrar (P27); nulo si se escribió el total. */
  count_detail?: Array<{ value: number; qty: number }> | null
  /** Lo que se dejó en el cajón como fondo del siguiente turno (P27). */
  next_float?: number | null
  tickets_count: number
  revenue: number
  cash_sales: number
  cancelled_count: number
  cancelled_amount: number
  /** Suma de descuentos del turno (lo agrega cash_session_summary desde Fase 3; opcional por compatibilidad). */
  discount_total?: number
  /** Propinas del turno (P2): no son venta, pero las de efectivo sí están en la caja. */
  tips_total?: number
  cash_tips?: number
  /** Entradas/salidas de efectivo a mitad de turno (Fase 4b). */
  movements_in?: number
  /** Ventas fiadas del turno: venta sí, dinero en caja no (P38). */
  credit_sales?: number
  /** Abonos de fiados recibidos en efectivo en el turno (ya incluidos en movements_in). */
  credit_paid_cash?: number
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
  if ((s.tips_total ?? 0) > 0) {
    lines.push(row("Propinas (aparte)", formatCurrency(s.tips_total ?? 0)))
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
  if ((s.credit_sales ?? 0) > 0) lines.push(row("Fiado (no entra a caja)", formatCurrency(s.credit_sales ?? 0)))
  const cashTips = s.cash_tips ?? 0
  if (cashTips > 0) lines.push(row("Propinas efectivo", `+${formatCurrency(cashTips)}`))
  if (movIn > 0) lines.push(row("Entradas", `+${formatCurrency(movIn)}`))
  if ((s.credit_paid_cash ?? 0) > 0) lines.push(row("  de abonos fiados", formatCurrency(s.credit_paid_cash ?? 0)))
  if (movOut > 0) lines.push(row("Salidas", `-${formatCurrency(movOut)}`))
  lines.push(row("Esperado", formatCurrency(s.expected_cash ?? s.opening_float + s.cash_sales + cashTips + movIn - movOut)))
  if (s.counted_cash != null) {
    lines.push(row("Contado", formatCurrency(s.counted_cash)))
    const diff = s.difference ?? 0
    const sign = diff > 0 ? "+" : ""
    lines.push(row("Diferencia", `${sign}${formatCurrency(diff)}`))
  }
  // El conteo billete por billete y el fondo que quedó: es lo que permite
  // revisar una diferencia al día siguiente sin volver a contar.
  if (s.count_detail && s.count_detail.length > 0) {
    lines.push("", THIN, "CONTEO")
    for (const d of s.count_detail) lines.push(row(`${d.qty} x ${formatCurrency(d.value)}`, formatCurrency(d.qty * d.value)))
  }
  if (s.next_float != null && s.counted_cash != null) {
    lines.push(row("Queda de fondo", formatCurrency(s.next_float)))
    lines.push(row("Retiro", formatCurrency(Math.round((s.counted_cash - s.next_float) * 100) / 100)))
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
export function printLines(lines: string[], title: string, paperMm: 58 | 80 = 58): boolean {
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
            /* Lo que de verdad imprime: la hoja mide el ancho util del rollo,
               asi las 32 columnas caen en su tamano nativo y no escaladas. */
            body { width: ${printableWidthMm(paperMm)}mm; font-size: 11px; }
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
