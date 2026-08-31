import {
  cartItemCount,
  cartSubtotal,
  rehydrateCart,
  CART_MAX_AGE_MS,
  type PersistedCart,
  type Product,
} from "./cart"

/**
 * Pedidos en espera (v1): viven en ESTE dispositivo, por cafetería.
 *
 * Un pedido en espera todavía no es una venta — es el mismo carrito de
 * siempre, guardado aparte. Por eso reutiliza `serializeCart`/`rehydrateCart`
 * y no toca la base de datos: nada llega a `tickets` hasta que se cobra.
 *
 * La clave es por NEGOCIO y no por cajero: si María guarda un pedido y entra
 * Pedro en la misma tablet, tiene que poder cobrarlo (la venta se atribuye a
 * quien cobra, que es lo correcto).
 */

export const PARKED_STORAGE_VERSION = 1
export const PARKED_MAX = 10

export interface ParkedOrder {
  id: string
  /** Cómo lo llamó el cajero ("Mesa 3", "Sra. suéter rojo"). */
  name: string
  savedAt: number
  cart: PersistedCart
}

export interface ParkedStore {
  v: typeof PARKED_STORAGE_VERSION
  orders: ParkedOrder[]
}

export function parkedStorageKey(businessId: string): string {
  return `pos-parked:${businessId}`
}

/** Nombre por defecto cuando el cajero no escribe uno: la hora de guardado. */
export function autoName(now: Date): string {
  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")
  return `Pedido ${hh}:${mm}`
}

/** Lee la lista guardada, descartando lo corrupto. Nunca lanza. */
export function parseParked(raw: unknown): ParkedOrder[] {
  if (!raw || typeof raw !== "object") return []
  const store = raw as Partial<ParkedStore>
  if (store.v !== PARKED_STORAGE_VERSION || !Array.isArray(store.orders)) return []

  const out: ParkedOrder[] = []
  for (const o of store.orders) {
    if (!o || typeof o !== "object") continue
    const { id, name, savedAt, cart } = o as Partial<ParkedOrder>
    if (typeof id !== "string" || !id) continue
    if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) continue
    if (!cart || typeof cart !== "object" || !Array.isArray((cart as PersistedCart).lines)) continue
    out.push({ id, name: typeof name === "string" ? name : "", savedAt, cart: cart as PersistedCart })
  }
  return out.slice(0, PARKED_MAX)
}

export function serializeParked(orders: ParkedOrder[]): ParkedStore {
  return { v: PARKED_STORAGE_VERSION, orders: orders.slice(0, PARKED_MAX) }
}

/**
 * Resumen para la tarjeta de la bandeja, calculado con el menú VIGENTE: si un
 * precio cambió, el total que se ve ya es el nuevo; si el pedido caducó o sus
 * productos desaparecieron, `ok` es false y la tarjeta lo dice en vez de
 * dejar que el cajero lo descubra al retomarlo.
 */
/** Un renglón del pedido tal como hay que prepararlo. */
export interface ParkedLine {
  label: string
  quantity: number
  notes: string | null
  modifiers: string[]
}

/**
 * Qué hay que PREPARAR de un pedido en espera, sin un solo precio.
 *
 * Existe porque hay cafeterías —como la del gym— donde se toma el pedido, se
 * sirve, y se cobra hasta el final. En ese flujo la comida se hace ANTES de
 * que exista la venta, así que la pantalla «Por preparar» (que muestra lo ya
 * cobrado) llega tarde: la lista de lo que falta hacer son justamente estos
 * pedidos en espera.
 *
 * El resumen de `parkedSummary` no sirve para eso —corta a tres productos y
 * lleva el total en pesos, porque está pensado para retomar y cobrar—. Esto
 * es lo mismo visto desde la barra: cantidades, tamaños, opciones y notas.
 */
export function parkedDetail(order: ParkedOrder, products: Product[], now: number): ParkedLine[] {
  const state = rehydrateCart(order.cart, products, now)
  if (!state) return []
  return state.lines.map((l) => ({
    label: l.size ? `${l.product.name} (${l.size.label})` : l.product.name,
    quantity: l.quantity,
    notes: l.notes.trim() || null,
    modifiers: l.modifiers.map((m) => m.name),
  }))
}

export function parkedSummary(
  order: ParkedOrder,
  products: Product[],
  now: number,
): { ok: boolean; expired: boolean; count: number; total: number; label: string } {
  const expired = now - order.savedAt > CART_MAX_AGE_MS
  const state = expired ? null : rehydrateCart(order.cart, products, now)
  if (!state || state.lines.length === 0) {
    return { ok: false, expired, count: 0, total: 0, label: expired ? "Caducado" : "Ya no está en el menú" }
  }
  const count = cartItemCount(state.lines)
  const label = state.lines
    .map((l) => `${l.quantity}× ${l.product.name}`)
    .slice(0, 3)
    .join(", ")
  return {
    ok: true,
    expired: false,
    count,
    total: cartSubtotal(state.lines),
    label: state.lines.length > 3 ? `${label}…` : label,
  }
}

/** "hace 4 min" / "hace 2 h" — cuánto lleva esperando. */
export function waitingLabel(savedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - savedAt) / 60000))
  if (min < 1) return "recién"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h`
}
