import type { CartLine, PaymentMethod, TicketDiscount } from "./cart"

/**
 * Cola de ventas capturadas sin internet.
 *
 * El diseño completo (y por qué NO hacemos sincronización bidireccional) está
 * en `docs/cola-sin-internet.md`. Lo esencial:
 *
 * - Es una cola de SALIDA. La venta se captura en el aparato y se sube en
 *   orden al volver la conexión. Todo lo demás (menú, cortes, reportes) sigue
 *   necesitando internet.
 * - La pieza que la hace viable ya existía: `create_ticket` es idempotente
 *   por `(business_id, client_ref)`. Reenviar una venta encolada no la
 *   duplica, así que el peor caso —subió pero la respuesta se perdió— es
 *   inofensivo: el reintento devuelve el mismo folio con `duplicate: true`.
 * - El total lo sigue calculando el SERVIDOR. Aquí se guarda lo que el cajero
 *   cobró (`chargedTotal`) solo para poder AVISAR si un precio cambió
 *   mientras la venta esperaba. Aceptar totales del cliente abriría la puerta
 *   a manipulación.
 *
 * Módulo puro (sin React): se prueba con `node --experimental-strip-types`.
 */

/** Tope de ventas en cola. Capturar cientos a ciegas es acumular riesgo. */
export const QUEUE_MAX = 30
/** Versión del formato: si cambia, la cola vieja se descarta al leer. */
const QUEUE_VERSION = 1

export type QueuedStatus = "pendiente" | "revisar"

export interface QueuedItem {
  variant_id: string
  quantity: number
  notes?: string
  modifiers?: string[]
}

export interface QueuedSale {
  /** Idempotencia: el MISMO uuid en cada reintento. */
  clientRef: string
  /** Folio provisional para el ticket impreso sin conexión (P-1, P-2…). */
  provisional: string
  /** Cuándo se cobró de verdad (epoch ms), no cuándo se sube. */
  capturedAt: number
  items: QueuedItem[]
  paymentMethod: PaymentMethod
  notes?: string
  tip?: number
  discount?: TicketDiscount
  cashReceived?: number
  takeout?: boolean
  loyaltyCustomerId?: string
  /** Lo que el cajero cobró, con los precios que el POS tenía entonces. */
  chargedTotal: number
  /** Copia de las líneas para reimprimir y para rehidratar si hay que revisar. */
  lines: SerializedLine[]
  status: QueuedStatus
  /** Por qué el servidor la rechazó (solo en «revisar»). */
  error?: string
  attempts: number
}

export interface SerializedLine {
  name: string
  size?: string
  quantity: number
  unitPrice: number
  notes?: string
  modifiers: { name: string; price: number }[]
}

export interface QueueState {
  v: number
  sales: QueuedSale[]
  /** Folios que ya subieron, para reimprimir: provisional → folio real. */
  folios: Record<string, number>
  /** Diferencias detectadas al subir: el servidor cobró distinto. */
  diffs: { provisional: string; folio: number; charged: number; registered: number }[]
}

const EMPTY: QueueState = { v: QUEUE_VERSION, sales: [], folios: {}, diffs: [] }

/** Una cola por CAFETERÍA (no por cajero): quien tenga la tablet la sube. */
export function queueKey(businessId: string): string {
  return `pos-cola:${businessId}`
}

export function readQueue(raw: unknown): QueueState {
  if (!raw || typeof raw !== "object") return { ...EMPTY }
  const q = raw as Partial<QueueState>
  if (q.v !== QUEUE_VERSION || !Array.isArray(q.sales)) return { ...EMPTY }
  return {
    v: QUEUE_VERSION,
    sales: q.sales.filter((s) => s && typeof s.clientRef === "string" && Array.isArray(s.items)),
    folios: q.folios && typeof q.folios === "object" ? q.folios : {},
    diffs: Array.isArray(q.diffs) ? q.diffs : [],
  }
}

/**
 * Siguiente número provisional. Cuenta sobre los folios YA subidos también:
 * si en el turno se subieron P-1 y P-2, el próximo es P-3 aunque la cola esté
 * vacía — dos tickets distintos con el mismo «P-1» serían un lío al cuadrar.
 */
export function nextProvisional(state: QueueState): string {
  const usados = [
    ...state.sales.map((s) => s.provisional),
    ...Object.keys(state.folios),
  ]
    .map((p) => Number(p.replace(/^P-/, "")))
    .filter((n) => Number.isFinite(n))
  const max = usados.length > 0 ? Math.max(...usados) : 0
  return `P-${max + 1}`
}

export function pendingCount(state: QueueState): number {
  return state.sales.filter((s) => s.status === "pendiente").length
}

export function reviewCount(state: QueueState): number {
  return state.sales.filter((s) => s.status === "revisar").length
}

/** ¿Se puede encolar una más? El tope cuenta TODO lo que sigue sin resolver. */
export function canEnqueue(state: QueueState): boolean {
  return state.sales.length < QUEUE_MAX
}

export function enqueue(state: QueueState, sale: Omit<QueuedSale, "provisional" | "status" | "attempts">): QueueState {
  return {
    ...state,
    sales: [...state.sales, { ...sale, provisional: nextProvisional(state), status: "pendiente", attempts: 0 }],
  }
}

/** Subió bien: sale de la cola y su folio queda guardado para reimprimir. */
export function markUploaded(
  state: QueueState,
  clientRef: string,
  folio: number,
  registeredTotal: number,
): QueueState {
  const sale = state.sales.find((s) => s.clientRef === clientRef)
  if (!sale) return state
  // Diferencia de precio: el servidor recalculó con los precios de AHORA y no
  // coincide con lo que el cajero cobró. No se corrige sola —el servidor
  // manda— pero se enseña para que el corte cuadre a conciencia.
  const hayDiff = Math.abs(registeredTotal - sale.chargedTotal) >= 0.01
  return {
    ...state,
    sales: state.sales.filter((s) => s.clientRef !== clientRef),
    folios: { ...state.folios, [sale.provisional]: folio },
    diffs: hayDiff
      ? [...state.diffs, { provisional: sale.provisional, folio, charged: sale.chargedTotal, registered: registeredTotal }]
      : state.diffs,
  }
}

/**
 * El servidor la rechazó por su contenido (un producto desactivado, un turno
 * que ya cerró). Se marca para revisión y NO detiene a las siguientes: cada
 * venta es independiente.
 */
export function markNeedsReview(state: QueueState, clientRef: string, error: string): QueueState {
  return {
    ...state,
    sales: state.sales.map((s) =>
      s.clientRef === clientRef ? { ...s, status: "revisar" as const, error, attempts: s.attempts + 1 } : s,
    ),
  }
}

/** Falló por RED: sigue pendiente, solo se cuenta el intento. */
export function markRetry(state: QueueState, clientRef: string): QueueState {
  return {
    ...state,
    sales: state.sales.map((s) => (s.clientRef === clientRef ? { ...s, attempts: s.attempts + 1 } : s)),
  }
}

/** Quitar una venta en revisión (el cajero ya la recobró a mano). */
export function dropSale(state: QueueState, clientRef: string): QueueState {
  return { ...state, sales: state.sales.filter((s) => s.clientRef !== clientRef) }
}

export function clearDiffs(state: QueueState): QueueState {
  return { ...state, diffs: [] }
}

/**
 * ¿Un error del servidor es de RED (reintentar) o del CONTENIDO (revisar)?
 *
 * Importa distinguirlos: reintentar en bucle algo que el servidor siempre va
 * a rechazar deja la cola atorada para siempre; mandar a revisión manual algo
 * que era solo un bache de señal le da trabajo al cajero de a gratis.
 */
export function isNetworkError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("fetch") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("conexión") ||
    m.includes("conexion")
  )
}

/** Líneas del carrito → copia plana para reimprimir sin el menú vivo. */
export function serializeLines(
  lines: CartLine[],
  precio: (l: CartLine) => number,
  etiqueta: (l: CartLine) => string,
): SerializedLine[] {
  return lines.map((l) => ({
    name: etiqueta(l),
    size: l.size?.label,
    quantity: l.quantity,
    unitPrice: precio(l),
    notes: l.notes || undefined,
    modifiers: l.modifiers.map((m) => ({ name: m.name, price: m.priceDelta })),
  }))
}
