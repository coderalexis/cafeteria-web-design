import {
  cartItemCount,
  cartSubtotal,
  getLineLabel,
  getLinePrice,
  rehydrateCart,
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

/**
 * Cuánto puede vivir una cuenta sin cobrar. Debe coincidir con
 * `CADUCIDAD_HORAS` del servidor: si el carrito caducara antes que la fila,
 * la cuenta seguiría en la lista pero no se podría abrir ni cobrar.
 */
export const PARKED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** A partir de aquí una cuenta ya no es «de ahorita» y hay que señalarla. */
export const PARKED_VIEJA_MS = 8 * 60 * 60 * 1000

export interface ParkedOrder {
  id: string
  /** Cómo la llamó el cajero ("Mesa 3", "Sra. suéter rojo"). */
  name: string
  /** Cuándo se abrió la cuenta. No se mueve al agregar rondas. */
  savedAt: number
  cart: PersistedCart
  /** Sello de la última escritura; se devuelve al guardar para no pisar a nadie. */
  updatedAt: string
  /**
   * Desde cuándo se debe. Nulo = cuenta del día; con fecha = fiado.
   *
   * Son dos cosas distintas y por eso viven en listas distintas: la cuenta
   * del día es de una mesa que está comiendo ahora, el fiado es de alguien
   * que ya se fue. Mezclarlas convertía el aviso del corte en ruido.
   */
  owedSince: number | null
  /** Teléfono o nota para poder cobrarle. */
  owedContact: string | null
}

/** ¿Esta cuenta es un fiado (alguien se fue sin pagar)? */
export function esFiado(o: ParkedOrder): boolean {
  return o.owedSince !== null
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
  const state = rehydrateCart(order.cart, products, now, PARKED_MAX_AGE_MS)
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
  const state = rehydrateCart(order.cart, products, now, PARKED_MAX_AGE_MS)
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
): {
  ok: boolean
  expired: boolean
  count: number
  total: number
  label: string
  /** Renglones que se cayeron porque su producto ya no está en el menú. */
  faltantes: number
} {
  const expired = now - order.savedAt > PARKED_MAX_AGE_MS
  const state = expired ? null : rehydrateCart(order.cart, products, now, PARKED_MAX_AGE_MS)
  // Lo que traía guardado vs. lo que sobrevivió al menú de hoy.
  const faltantes = Math.max(0, (order.cart?.lines?.length ?? 0) - (state?.lines.length ?? 0))
  if (!state || state.lines.length === 0) {
    return {
      ok: false,
      expired,
      count: 0,
      total: 0,
      faltantes,
      label: expired ? "Caducada" : "Ya no está en el menú",
    }
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
    faltantes,
    total: cartSubtotal(state.lines),
    label: state.lines.length > 3 ? `${label}…` : label,
  }
}

/**
 * "hace 4 min" / "hace 2 h" / "hace 4 días" — cuánto lleva abierta.
 *
 * Llega hasta días a propósito: una cuenta del viernes que se cobra el martes
 * existe de verdad, y «hace 96 h» no se lee.
 */
export function waitingLabel(savedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - savedAt) / 60000))
  if (min < 1) return "recién"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? "desde ayer" : `hace ${d} días`
}

/** ¿Ya no es una cuenta «de ahorita»? Sirve para pintarla distinto y avisar. */
export function isVieja(savedAt: number, now: number): boolean {
  return now - savedAt > PARKED_VIEJA_MS
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

/**
 * Suma el carrito B a la cuenta A, al nivel del dato guardado (sin pasar por
 * el menú).
 *
 * Existe por la trampa del nombre repetido: tocar el chip «Mesa 1» cuando esa
 * cuenta ya existe creaba una SEGUNDA «Mesa 1», y no hay herramienta para
 * juntar dos cuentas. Ahora ese gesto —el más natural del mundo— significa
 * «súmale esto a la mesa».
 *
 * Se opera sobre los renglones crudos y NO sobre el carrito rehidratado a
 * propósito: rehidratar tira los renglones cuyo producto salió del menú, y
 * fusionarlos así los borraría de la cuenta en silencio. Aquí no se pierde
 * nada; los invendibles los sigue señalando `parkedSummary`.
 *
 * Renglones idénticos (producto, tamaño, opciones y nota) se juntan sumando
 * cantidades, para no acabar con tres líneas de «1× Capuchino».
 */
/**
 * Identidad de un renglon por su CONTENIDO: producto, tamano, opciones y nota.
 *
 * No se usa `lineId` a proposito. Ese identificador NO sobrevive el viaje al
 * carrito: `restoreLines` lo regenera al abrir una cuenta, asi que cualquier
 * cosa que quiera reconocer «el mismo renglon» entre rondas —fusionar, o
 * saber que ya se preparo— tiene que mirar el contenido.
 *
 * Y es lo correcto tambien conceptualmente: para la barra, dos capuchinos
 * iguales son lo mismo aunque el sistema les haya puesto numeros distintos,
 * y uno «sin azucar» es otra cosa aunque sea el mismo producto.
 */
export function lineKey(l: {
  productId?: string
  sizeLabel?: string | null
  modifierIds?: string[]
  notes?: string | null
  custom?: { name: string; price: number } | null
}): string {
  return [
    // Fuera de menú: dos renglones son «lo mismo» si dicen lo mismo y cuestan
    // lo mismo; el id del producto sintético cambia en cada aparato.
    l.custom ? `custom:${l.custom.name.trim().toLowerCase()}@${l.custom.price}` : (l.productId ?? ""),
    l.sizeLabel ?? "",
    [...(l.modifierIds ?? [])].sort().join("+"),
    (l.notes ?? "").trim(),
  ].join("|")
}

export function mergeParkedCarts(base: PersistedCart, extra: PersistedCart): PersistedCart {
  const lines = base.lines.map((l) => ({ ...l }))
  const porLlave = new Map(lines.map((l) => [lineKey(l), l]))
  for (const l of extra.lines) {
    const ya = porLlave.get(lineKey(l))
    if (ya && ya.quantity + l.quantity <= 99) {
      ya.quantity += l.quantity
    } else {
      const copia = { ...l }
      lines.push(copia)
      porLlave.set(lineKey(copia), copia)
    }
  }

  return {
    ...base,
    lines,
    // La nota de la cuenta manda; si no tenía, se adopta la del carrito.
    ticketNotes: base.ticketNotes?.trim() ? base.ticketNotes : extra.ticketNotes,
    savedAt: extra.savedAt,
  }
}

/**
 * Aplica sobre la versión del servidor lo que ESTE aparato cambió desde que
 * abrió la cuenta: la diferencia entre el carrito de ahora y el de entonces,
 * renglón por renglón (mismo contenido = mismo renglón, ver `lineKey`).
 *
 * Hace falta cuando dos aparatos tocan la misma cuenta, y también cuando el
 * mismo teléfono se reinició a media ronda y volvió con un sello viejo: en
 * vez de clonar la cuenta como «Mesa 1 (2)» —que nadie sabía juntar— se
 * suma lo agregado, se resta lo quitado, y la cuenta sigue siendo una. Lo
 * que el otro aparato agregó se respeta; lo que este quitó, se quita hasta
 * donde alcance.
 */
export function applyCartDelta(server: PersistedCart, atOpen: PersistedCart, mine: PersistedCart): PersistedCart {
  const cantidades = (cart: PersistedCart) => {
    const m = new Map<string, number>()
    for (const l of cart.lines) m.set(lineKey(l), (m.get(lineKey(l)) ?? 0) + l.quantity)
    return m
  }
  const antes = cantidades(atOpen)
  const ahora = cantidades(mine)
  const delta = new Map<string, number>()
  for (const [k, q] of ahora) delta.set(k, q - (antes.get(k) ?? 0))
  for (const [k, q] of antes) if (!ahora.has(k)) delta.set(k, -q)

  const lines = server.lines.map((l) => ({ ...l }))
  const porLlave = new Map(lines.map((l) => [lineKey(l), l]))
  const muestra = new Map(mine.lines.map((l) => [lineKey(l), l]))
  for (const [k, d] of delta) {
    if (d === 0) continue
    const ya = porLlave.get(k)
    if (ya) {
      ya.quantity = Math.max(0, Math.min(99, ya.quantity + d))
    } else if (d > 0) {
      const base = muestra.get(k)
      if (base) {
        const copia = { ...base, quantity: Math.min(99, d) }
        lines.push(copia)
        porLlave.set(k, copia)
      }
    }
  }
  return {
    ...server,
    lines: lines.filter((l) => l.quantity > 0),
    ticketNotes: mine.ticketNotes?.trim() ? mine.ticketNotes : server.ticketNotes,
    savedAt: mine.savedAt,
  }
}

/** Una fila de account_name_suggestions(): cuántas veces se abrió cuenta con ese nombre a esa hora. */
export interface AccountVisit {
  name: string
  hour: number
  n: number
}

/**
 * Quién suele venir a esta hora: los nombres con cuenta abierta en una franja
 * de dos horas alrededor de ahora (±1 h, con la medianoche como círculo),
 * los más frecuentes primero. Fuera quedan los chips fijos (mesas y
 * etiquetas, que ya están a un toque), los nombres automáticos «Pedido
 * 09:54» y las copias «(2)»: nada de eso es una persona.
 */
export function suggestAccountNames(visitas: AccountVisit[], hourNow: number, excluir: string[] = [], limite = 5): string[] {
  const fuera = new Set(excluir.map((e) => e.trim().toLowerCase()))
  const suma = new Map<string, { name: string; n: number }>()
  for (const v of visitas) {
    const diff = Math.abs(v.hour - hourNow)
    if (Math.min(diff, 24 - diff) > 1) continue
    const nombre = v.name.trim().replace(/ \(\d+\)$/, "")
    const k = nombre.toLowerCase()
    if (!k || fuera.has(k) || /^pedido \d{1,2}:\d{2}$/.test(k) || /^mesa \d+$/.test(k)) continue
    const cur = suma.get(k) ?? { name: nombre, n: 0 }
    cur.n += v.n
    suma.set(k, cur)
  }
  return [...suma.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"))
    .slice(0, limite)
    .map((x) => x.name)
}

/* ------------------------------------------------------------------ */
/*  Lo que acaba de volver al carrito                                   */
/* ------------------------------------------------------------------ */

/** Una cuenta (o la última venta) que se acaba de traer de vuelta al carrito. */
export interface Recuperada {
  key: number
  name: string
  articulos: number
}

/**
 * «"Mesa 3" recuperada · 3 artículos». Lo que se lee un instante en el
 * carrito —y en la barra de abajo, en celular— al abrir una cuenta: la
 * confirmación de que lo anotado volvió completo y con cuántos artículos.
 * Antes la cuenta aparecía sin más, y con prisa no se distinguía de haber
 * tocado un producto por error.
 */
export function avisoRecuperada(name: string, articulos: number): string {
  const n = Math.max(0, Math.floor(articulos))
  return `«${name}» recuperada · ${n} artículo${n === 1 ? "" : "s"}`
}

