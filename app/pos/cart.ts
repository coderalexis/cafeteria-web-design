/**
 * Modelo del carrito del POS: tipos, cálculo de precios y persistencia.
 * Sin React ni imports de servidor para poder probarlo aislado.
 */

export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta_clip" | "fiado"

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
  /**
   * Opción que la pantalla propone sola: marcada al abrir la hoja, o puesta
   * sin preguntar cuando la hoja no se abre. Siempre es una de `options`
   * (la base lo garantiza y el POS lo vuelve a comprobar al cargar).
   */
  defaultOptionId?: string | null
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
  /** false = la dueña apagó la pregunta al tocar: entra directo con las opciones por omisión (P34). */
  promptModifiers?: boolean
  /** Fuera de menú (P39): nombre y precio decididos en caja; no existe en el menú. */
  custom?: boolean
}

export const CUSTOM_CATEGORY = "fuera-de-menu"
export const CUSTOM_PRICE_MAX = 9999.99

/**
 * Un producto que no está en el menú, con el nombre y el precio que se
 * escribieron en caja. Cada uno lleva su propio id: dos «fruta sin yogurt»
 * a precios distintos son dos renglones, no uno con cantidad 2.
 */
export function customProduct(name: string, price: number, id?: string): Product {
  return {
    id: id ?? `custom:${crypto.randomUUID()}`,
    name: name.trim().replace(/\s+/g, " ").slice(0, 80),
    price: Math.round(price * 100) / 100,
    category: CUSTOM_CATEGORY,
    subcategory: "Fuera de menú",
    custom: true,
  }
}

/** Un renglón tal como lo acepta el servidor: del menú (variante + extras) o fuera de menú (nombre + precio). */
export type TicketItemInput =
  | { variant_id: string; quantity: number; notes?: string; modifiers?: string[] }
  | { custom: { name: string; price: number }; quantity: number; notes?: string }

/** Los renglones del carrito como los manda el POS. Una sola conversión para cobrar, corregir y encolar. */
export function linesToItems(lines: CartLine[]): TicketItemInput[] {
  return lines.map((line) =>
    line.product.custom
      ? {
          custom: { name: line.product.name, price: Math.round((line.product.price ?? 0) * 100) / 100 },
          quantity: line.quantity,
          notes: line.notes.trim() || undefined,
        }
      : {
          variant_id: getLineVariantId(line) ?? "",
          quantity: line.quantity,
          notes: line.notes.trim() || undefined,
          modifiers: line.modifiers.length > 0 ? line.modifiers.map((m) => m.id) : undefined,
        },
  )
}

export interface Category {
  id: string
  label: string
  /** Color de la categoría (paleta de lib/category-colors). */
  color?: string | null
}

/** Ubica el producto y el tamaño de una variante (para la fila de favoritos). */
export function findVariant(
  products: Product[],
  variantId: string,
): { product: Product; size?: SizeOption } | null {
  for (const p of products) {
    if (p.variantId === variantId) return { product: p }
    const size = p.sizes?.find((s) => s.variantId === variantId)
    if (size) return { product: p, size }
  }
  return null
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
    /** Fuera de menú: lo que se escribió en caja (el producto no existe en el menú). */
    custom?: { name: string; price: number }
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
      ...(l.product.custom ? { custom: { name: l.product.name, price: l.product.price ?? 0 } } : {}),
    })),
  }
}

/** Un carrito guardado hace más de esto se descarta (turno distinto). */
export const CART_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * Reconstruye el carrito contra el menú actual: descarta líneas cuyo
 * producto, tamaño o modificadores ya no existen (el servidor las
 * rechazaría). Devuelve null si el dato guardado no sirve.
 *
 * `maxAgeMs` es parámetro porque el carrito de trabajo y una cuenta abierta
 * caducan por razones distintas: el primero es basura de un turno anterior a
 * las 12 h, la segunda es dinero que alguien debe y no puede evaporarse.
 */
export function rehydrateCart(
  raw: unknown,
  products: Product[],
  now: number,
  maxAgeMs: number = CART_MAX_AGE_MS,
): CartState | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Partial<PersistedCart>
  if (p.v !== CART_STORAGE_VERSION || !Array.isArray(p.lines)) return null
  if (typeof p.savedAt !== "number" || now - p.savedAt > maxAgeMs) return null

  const byId = new Map(products.map((prod) => [prod.id, prod]))
  const lines: CartLine[] = []

  for (const l of p.lines) {
    if (!l || typeof l !== "object") continue
    const quantity = Number(l.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue
    // Fuera de menú: no hay producto que buscar; vuelve con su nombre y su
    // precio. Si el dato viene roto, la línea se descarta como cualquier otra.
    if (l.custom && typeof l.custom === "object") {
      const nombre = typeof l.custom.name === "string" ? l.custom.name.trim() : ""
      const precio = Number(l.custom.price)
      if (!nombre || !Number.isFinite(precio) || precio < 0.01 || precio > CUSTOM_PRICE_MAX) continue
      const lineId = typeof l.lineId === "string" && l.lineId ? l.lineId : `custom-${lines.length}`
      lines.push({
        lineId,
        product: customProduct(nombre, precio, `custom:${lineId}`),
        modifiers: [],
        quantity,
        notes: typeof l.notes === "string" ? l.notes : "",
      })
      continue
    }
    const product = byId.get(l.productId)
    if (!product) continue

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
    p.paymentMethod === "transferencia" || p.paymentMethod === "tarjeta_clip" || p.paymentMethod === "fiado"
      ? p.paymentMethod
      : "efectivo"

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

/**
 * ¿Hay que abrir la hoja de extras al tocar este producto?
 *
 * Con «required» solo cuando algún grupo obliga a elegir (mínimo > 0): un
 * Americano con leches opcionales entra al carrito de un toque y los extras
 * se agregan desde «cambiar» en la línea. Con «always», como antes: siempre
 * que el producto tenga extras. Sin grupos, nunca.
 */
export function needsModifierPrompt(product: Product, mode: "required" | "always"): boolean {
  const groups = product.modifierGroups ?? []
  if (groups.length === 0) return false
  // La dueña apagó la pregunta para este producto: solo lo obligatorio detiene.
  if (product.promptModifiers === false) return groups.some((g) => g.minSelect > 0)
  if (mode === "always") return true
  return groups.some((g) => g.minSelect > 0)
}

/**
 * Los extras que el producto trae «de fábrica»: la opción por omisión de cada
 * grupo que la tenga. Es lo que se marca al abrir la hoja y lo que lleva la
 * línea cuando la hoja no se abre («¿su leche? deslactosada, siempre»).
 * Una opción por omisión que ya no esté entre las opciones vivas se ignora.
 */
export function defaultModifiers(product: Product): ModifierOption[] {
  const out: ModifierOption[] = []
  for (const g of product.modifierGroups ?? []) {
    if (!g.defaultOptionId) continue
    const opt = g.options.find((o) => o.id === g.defaultOptionId)
    if (opt) out.push(opt)
  }
  return out
}
