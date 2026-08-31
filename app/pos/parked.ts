import {
  cartItemCount,
  cartSubtotal,
  getLineLabel,
  getLinePrice,
  rehydrateCart,
  CART_MAX_AGE_MS,
  type PersistedCart,
  type Product,
} from "./cart"
import type { AccountData } from "@/lib/receipt"

/**
 * Cuentas abiertas: cómo se LEEN. El guardado vive en `app/actions/parked.ts`.
 *
 * Una cuenta abierta todavía no es una venta —es el mismo carrito de siempre,
 * guardado aparte—, así que nada llega a `tickets` hasta que se cobra. Pero sí
 * vive en la base, en su propia tabla: antes se guardaba en el navegador de
 * cada aparato y eso significaba perderla al borrar datos, y no poder tomar el
 * pedido en el celular para cobrarlo en la tablet.
 *
 * Son de la CAFETERÍA y no de quien las abrió: si María toma la mesa 3 y llega
 * Pedro, tiene que poder cobrarla (la venta se atribuye a quien cobra, que es
 * lo correcto).
 *
 * Una cuenta CONSERVA SU IDENTIDAD entre rondas: se abre una vez con su nombre
 * y su hora, y cada ronda nueva se guarda en la misma fila. Antes cada ronda
 * borraba la fila y creaba otra, así que había que reescribir «Mesa 1» cada
 * vez y el reloj volvía a cero — un carrito con botón de pausa, no una cuenta.
 */

/**
 * Tope de cuentas abiertas a la vez. Es una guía de uso, no una regla del
 * sistema: vive aquí y no en las acciones de servidor porque un archivo
 * «use server» solo puede exportar funciones —exportar esta constante desde
 * ahí tumbaba el POS entero con un 500—.
 */
export const PARKED_MAX = 10

export interface ParkedOrder {
  id: string
  /** Cómo la llamó el cajero ("Mesa 3", "Sra. suéter rojo"). */
  name: string
  /** Cuándo se abrió la cuenta. No se mueve al agregar rondas. */
  savedAt: number
  cart: PersistedCart
  /** Sello de la última escritura; se devuelve al guardar para no pisar a nadie. */
  updatedAt: string
}

export function autoName(now: Date): string {
  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")
  return `Pedido ${hh}:${mm}`
}

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

/**
 * La cuenta con precios, para enseñársela al cliente antes de cobrar.
 *
 * Los precios se recalculan contra el menú VIGENTE, igual que al cobrar: si
 * algo subió de precio desde que se abrió la mesa, lo que se enseña es lo que
 * se va a cobrar. Enseñar un total y cobrar otro es la peor manera de terminar
 * una comida.
 */
export function parkedAccount(order: ParkedOrder, products: Product[], now: number): AccountData | null {
  const state = rehydrateCart(order.cart, products, now)
  if (!state || state.lines.length === 0) return null
  return {
    name: order.name,
    openedAt: new Date(order.savedAt),
    items: state.lines.map((l) => ({
      label: getLineLabel(l),
      quantity: l.quantity,
      unitPrice: getLinePrice(l),
      lineTotal: getLinePrice(l) * l.quantity,
      notes: l.notes.trim() || undefined,
      modifiers: l.modifiers.map((m) => ({ name: m.name, price: m.priceDelta })),
    })),
    total: cartSubtotal(state.lines),
  }
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

/** "hace 4 min" / "hace 2 h" — cuánto lleva abierta. */
export function waitingLabel(savedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - savedAt) / 60000))
  if (min < 1) return "recién"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h`
}

/**
 * Nombre para la copia que se guarda cuando otro aparato ya movió la cuenta.
 *
 * Ante un choque no se pisa ni se tira nada: lo que este aparato agregó se
 * guarda aparte con nombre reconocible y quien atiende junta las dos. Perder
 * una ronda en silencio sería comida servida que nunca se cobra; dos cuentas
 * a la vista son un problema de treinta segundos.
 */
export function conflictName(name: string, existentes: string[]): string {
  const base = name.replace(/ \(\d+\)$/, "")
  for (let n = 2; n < 99; n++) {
    const intento = `${base} (${n})`.slice(0, 40)
    if (!existentes.includes(intento)) return intento
  }
  return `${base} (+)`.slice(0, 40)
}
