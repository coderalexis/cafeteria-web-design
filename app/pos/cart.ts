/**
 * Modelo del carrito del POS: tipos, cálculo de precios y persistencia.
 * Sin React ni imports de servidor para poder probarlo aislado.
 */

export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta_clip"

export interface SizeOption {
  variantId: string
  label: string
  oz: string
  price: number
}

export interface ModifierOption {
  id: string
  name: string
  priceDelta: number
}

export interface ModifierGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number | null
  options: ModifierOption[]
}

export interface Product {
  id: string
  name: string
  price?: number
  variantId?: string
  sizes?: SizeOption[]
  category: string
  subcategory: string
  description?: string
  modifierGroups?: ModifierGroup[]
}

export interface Category {
  id: string
  label: string
}

/** Una línea del carrito. `lineId` es su identidad; `mergeKey` decide si dos altas se juntan. */
export interface CartLine {
  lineId: string
  product: Product
  size?: SizeOption
  modifiers: ModifierOption[]
  quantity: number
  /** Nota por artículo ("sin azúcar"); las líneas con nota no se fusionan. */
  notes: string
  isNew?: boolean
}

export interface TicketDiscount {
  type: "percent" | "amount"
  value: number
  reason: string
}

/* ------------------------------------------------------------------ */
/*  Precios y etiquetas                                                */
/* ------------------------------------------------------------------ */

export function getDisplayPrice(p: Product): string {
  if (p.price !== undefined) return `$${p.price}`
  if (p.sizes && p.sizes.length > 0) {
    const min = Math.min(...p.sizes.map((s) => s.price))
    const max = Math.max(...p.sizes.map((s) => s.price))
    return min === max ? `$${min}` : `$${min} - $${max}`
  }
  return ""
}

/** Precio unitario = variante + suma de modificadores. */
export function getLinePrice(line: CartLine): number {
  const base = line.size ? line.size.price : line.product.price ?? 0
  return base + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)
}

export function getLineVariantId(line: CartLine): string | undefined {
  return line.size ? line.size.variantId : line.product.variantId
}

export function getLineLabel(line: CartLine): string {
  return line.size ? `${line.product.name} (${line.size.label})` : line.product.name
}

export function cartSubtotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((s, l) => s + getLinePrice(l) * l.quantity, 0) * 100) / 100
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0)
}

/** Descuento calculado en el cliente (el servidor lo recalcula y valida). */
export function computeDiscount(subtotal: number, discount: TicketDiscount | null): number {
  if (!discount || subtotal <= 0) return 0
  const raw = discount.type === "percent" ? (subtotal * discount.value) / 100 : discount.value
  return Math.min(Math.round(raw * 100) / 100, subtotal)
}

export function parseCash(value: string): number | null {
  const n = Number(value.replace(",", "."))
  return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n
}

/* ------------------------------------------------------------------ */
/*  Altas y fusión de líneas                                           */
/* ------------------------------------------------------------------ */

export function mergeKey(product: Product, size: SizeOption | undefined, modifiers: ModifierOption[]): string {
  const modKey = modifiers
    .map((m) => m.id)
    .sort()
    .join(",")
  return [product.id, size?.label ?? "", modKey].join("__")
}

/**
 * Agrega una unidad: se fusiona con una línea igual (producto + tamaño +
 * modificadores) que no tenga nota; si no, crea línea nueva al final.
 * Marca `isNew` en la línea tocada para el resaltado visual.
 */
export function addUnit(
  lines: CartLine[],
  product: Product,
  size: SizeOption | undefined,
  modifiers: ModifierOption[],
  newLineId: () => string,
): CartLine[] {
  const key = mergeKey(product, size, modifiers)
  const target = lines.find((l) => !l.notes && mergeKey(l.product, l.size, l.modifiers) === key)
  if (target) {
    return lines.map((l) =>
      l.lineId === target.lineId ? { ...l, quantity: l.quantity + 1, isNew: true } : { ...l, isNew: false },
    )
  }
  return [
    ...lines.map((l) => ({ ...l, isNew: false })),
    { lineId: newLineId(), product, size, modifiers, quantity: 1, notes: "", isNew: true },
  ]
}

/* ------------------------------------------------------------------ */
/*  Persistencia (localStorage) — el carrito sobrevive a recargas       */
/* ------------------------------------------------------------------ */

export const CART_STORAGE_VERSION = 1

export interface PersistedCart {
  v: typeof CART_STORAGE_VERSION
  savedAt: number
  saleRef: string
  paymentMethod: PaymentMethod
  ticketNotes: string
  cashReceivedInput: string
  discount: TicketDiscount | null
  lines: Array<{
    lineId: string
    productId: string
    sizeLabel: string | null
    modifierIds: string[]
    quantity: number
    notes: string
  }>
}

export interface CartState {
  saleRef: string
  paymentMethod: PaymentMethod
  ticketNotes: string
  cashReceivedInput: string
  discount: TicketDiscount | null
  lines: CartLine[]
}

export function serializeCart(state: CartState, now: number): PersistedCart {
  return {
    v: CART_STORAGE_VERSION,
    savedAt: now,
    saleRef: state.saleRef,
    paymentMethod: state.paymentMethod,
    ticketNotes: state.ticketNotes,
    cashReceivedInput: state.cashReceivedInput,
    discount: state.discount,
    lines: state.lines.map((l) => ({
      lineId: l.lineId,
      productId: l.product.id,
      sizeLabel: l.size?.label ?? null,
      modifierIds: l.modifiers.map((m) => m.id),
      quantity: l.quantity,
      notes: l.notes,
    })),
  }
}

/** Un carrito guardado hace más de esto se descarta (turno distinto). */
export const CART_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * Reconstruye el carrito contra el menú actual: descarta líneas cuyo
 * producto, tamaño o modificadores ya no existen (el servidor las
 * rechazaría). Devuelve null si el dato guardado no sirve.
 */
export function rehydrateCart(raw: unknown, products: Product[], now: number): CartState | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Partial<PersistedCart>
  if (p.v !== CART_STORAGE_VERSION || !Array.isArray(p.lines)) return null
  if (typeof p.savedAt !== "number" || now - p.savedAt > CART_MAX_AGE_MS) return null

  const byId = new Map(products.map((prod) => [prod.id, prod]))
  const lines: CartLine[] = []

  for (const l of p.lines) {
    if (!l || typeof l !== "object") continue
    const product = byId.get(l.productId)
    if (!product) continue
    const quantity = Number(l.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue

    let size: SizeOption | undefined
    if (l.sizeLabel) {
      size = product.sizes?.find((s) => s.label === l.sizeLabel)
      if (!size) continue
    } else if (product.sizes && product.sizes.length > 0) {
      continue // el producto ahora tiene tallas; la línea vieja ya no aplica
    }

    const options = new Map<string, ModifierOption>()
    for (const g of product.modifierGroups ?? []) for (const o of g.options) options.set(o.id, o)
    const modifiers: ModifierOption[] = []
    let missing = false
    for (const id of Array.isArray(l.modifierIds) ? l.modifierIds : []) {
      const opt = options.get(id)
      if (!opt) {
        missing = true
        break
      }
      modifiers.push(opt)
    }
    if (missing) continue

    lines.push({
      lineId: typeof l.lineId === "string" && l.lineId ? l.lineId : `${product.id}-${lines.length}`,
      product,
      size,
      modifiers,
      quantity,
      notes: typeof l.notes === "string" ? l.notes : "",
    })
  }

  const paymentMethod: PaymentMethod =
    p.paymentMethod === "transferencia" || p.paymentMethod === "tarjeta_clip" ? p.paymentMethod : "efectivo"

  const d = p.discount
  const discount: TicketDiscount | null =
    d && (d.type === "percent" || d.type === "amount") && typeof d.value === "number" && d.value > 0 && typeof d.reason === "string"
      ? { type: d.type, value: d.value, reason: d.reason }
      : null

  return {
    saleRef: typeof p.saleRef === "string" && p.saleRef ? p.saleRef : "",
    paymentMethod,
    ticketNotes: typeof p.ticketNotes === "string" ? p.ticketNotes : "",
    cashReceivedInput: typeof p.cashReceivedInput === "string" ? p.cashReceivedInput : "",
    discount,
    lines,
  }
}
