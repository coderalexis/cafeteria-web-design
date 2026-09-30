/**
 * Inventario (P45): lo puro. Las reglas de permisos y de dinero viven en los
 * RPC (`stock_track`, `supply_save`, `stock_move`; migraciones 57 y 58); aquí
 * solo lo que la pantalla necesita decidir sin ir al servidor: qué avisar,
 * cómo leer el diario y cómo aplicar lo que un cobro devuelve.
 *
 * Se cuentan DOS clases de cosas, y la diferencia es una sola:
 *   · de tu menú  → baja sola con la venta (el panqué que se compra hecho);
 *   · insumo      → no está en el menú y se cuenta a mano (café en grano,
 *                   vasos, servilletas). Nunca baja solo: no hay recetas.
 *
 * Diseño completo en docs/inventario.md.
 */

export type KindMovimiento = "entrada" | "venta" | "cancelacion" | "merma" | "conteo"

/** Lo que registran las personas; venta y cancelación las escribe el sistema. */
export type KindManual = "entrada" | "merma" | "conteo"

export type Unidad = "pieza" | "paquete" | "caja" | "bolsa" | "kilo" | "litro"

/**
 * Cómo se cuenta cada cosa. Sin conversiones a propósito: se cuenta en lo que
 * el dueño cuenta. «Compro costales de 5 kg y uso gramos» es por donde se
 * mueren estos sistemas.
 */
export const UNIDADES: { id: Unidad; uno: string; varios: string }[] = [
  { id: "pieza", uno: "pieza", varios: "piezas" },
  { id: "paquete", uno: "paquete", varios: "paquetes" },
  { id: "caja", uno: "caja", varios: "cajas" },
  { id: "bolsa", uno: "bolsa", varios: "bolsas" },
  { id: "kilo", uno: "kilo", varios: "kilos" },
  { id: "litro", uno: "litro", varios: "litros" },
]

export function esUnidad(x: string): x is Unidad {
  return UNIDADES.some((u) => u.id === x)
}

/** Un número de existencias como se escribe: sin ceros de adorno. */
export function formatCantidad(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(3)))
}

/** «3 piezas», «1 kilo», «2.5 kilos». La unidad en singular solo con el 1 exacto. */
export function conUnidad(qty: number, unidad: Unidad = "pieza"): string {
  const u = UNIDADES.find((x) => x.id === unidad) ?? UNIDADES[0]
  return `${formatCantidad(qty)} ${Math.abs(qty) === 1 ? u.uno : u.varios}`
}

/** Lo que se cuenta, tal como lo pinta cualquier pantalla. */
export interface ItemExistencia {
  itemId: string
  /** Del menú: la variante que baja con la venta. Insumo: null. */
  variantId: string | null
  /** Insumo: su ficha (para renombrarlo o cambiarle la unidad). Del menú: null. */
  supplyId: string | null
  nombre: string
  unidad: Unidad
  qty: number
  minQty: number
}

/** Lo que devuelven create_ticket, cancel_ticket y stock_move: la existencia nueva. */
export interface CambioExistencia {
  /** Las ventas hablan de variantes (es lo que se cobra)… */
  variant_id?: string | null
  /** …y los movimientos a mano, del artículo contado (que puede ser un insumo). */
  item_id?: string | null
  qty: number
}

/**
 * Motivos de merma. Una lista corta a propósito: si hay que pensar el motivo,
 * la merma no se registra. «Otro» pide texto.
 */
export const MOTIVOS_MERMA = [
  { id: "cayo", label: "Se cayó o se rompió" },
  { id: "caduco", label: "Caducó" },
  { id: "cortesia", label: "Cortesía" },
  { id: "personal", label: "Consumo del personal" },
  { id: "otro", label: "Otro" },
] as const

export type MotivoMerma = (typeof MOTIVOS_MERMA)[number]["id"]

export const KIND_LABEL: Record<KindMovimiento, string> = {
  entrada: "Entrada",
  venta: "Venta",
  cancelacion: "Cancelación",
  merma: "Merma",
  conteo: "Conteo",
}

export type EstadoExistencia = "ok" | "bajo" | "agotado" | "negativo"

/**
 * Qué tan grave está. `min` = 0 significa «sin aviso», así que un artículo sin
 * mínimo solo avisa al llegar a cero.
 */
export function estadoExistencia(qty: number, minQty: number): EstadoExistencia {
  if (qty < 0) return "negativo"
  if (qty === 0) return "agotado"
  if (minQty > 0 && qty <= minQty) return "bajo"
  return "ok"
}

/**
 * La esquina de la tarjeta del POS: null cuando no hay nada que decir. Dice
 * «Agotado» también en negativo: para quien cobra, es lo mismo.
 */
export function esquinaExistencia(qty: number, minQty: number): string | null {
  const estado = estadoExistencia(qty, minQty)
  if (estado === "ok") return null
  if (estado === "bajo") return qty === 1 ? "Queda 1" : `Quedan ${formatCantidad(qty)}`
  return "Agotado"
}

/**
 * Un producto con varios tamaños contados muestra el peor de ellos: si el
 * chico está agotado y el grande no, la tarjeta avisa igual, y el selector de
 * tamaño ya enseña cuál.
 */
export function esquinaProducto(existencias: { qty: number; minQty: number }[]): string | null {
  const orden: Record<EstadoExistencia, number> = { ok: 0, bajo: 1, agotado: 2, negativo: 3 }
  let peor: { qty: number; minQty: number } | null = null
  for (const e of existencias) {
    if (!peor || orden[estadoExistencia(e.qty, e.minQty)] > orden[estadoExistencia(peor.qty, peor.minQty)]) {
      peor = e
    }
  }
  return peor ? esquinaExistencia(peor.qty, peor.minQty) : null
}

export interface MovimientoDiario {
  kind: KindMovimiento
  qty: number
  qtyAfter: number
  reason: string | null
  unitCost: number | null
  folio: number | null
}

/**
 * Un renglón del diario en palabras. Es lo que convierte «-2, 11» en algo que
 * una dueña lee: «Vendidas 2 piezas · ticket #105 → 11».
 */
export function describirMovimiento(m: MovimientoDiario, unidad: Unidad = "pieza"): string {
  const n = Math.abs(m.qty)
  const cantidad = conUnidad(n, unidad)
  const una = n === 1
  switch (m.kind) {
    case "entrada":
      return m.unitCost != null ? `Llegaron ${cantidad} a $${m.unitCost.toFixed(2)} c/u` : `Llegaron ${cantidad}`
    case "venta":
      return m.folio != null
        ? `${una ? "Vendida" : "Vendidas"} ${cantidad} · ticket #${m.folio}`
        : `${una ? "Vendida" : "Vendidas"} ${cantidad}`
    case "cancelacion":
      return m.folio != null
        ? `Cancelado el ticket #${m.folio}: ${una ? "vuelve" : "vuelven"} ${cantidad}`
        : `Cancelación: ${una ? "vuelve" : "vuelven"} ${cantidad}`
    case "merma":
      return `Merma de ${cantidad}${m.reason ? `: ${m.reason}` : ""}`
    case "conteo": {
      // El primer renglón de todo artículo: no «sobraban 10», había 10.
      if (m.reason === "Existencia inicial") return `Existencia inicial: ${cantidad}`
      const signo = m.qty > 0 ? "sobraban" : "faltaban"
      const nota = m.reason && m.reason !== "Conteo" ? ` · ${m.reason}` : ""
      return `Conteo: ${signo} ${cantidad}${nota}`
    }
  }
}

/** Un renglón del historial tal como lo devuelve `historialDe` y lo pinta la pantalla. */
export interface Movimiento extends MovimientoDiario {
  id: string
  actor: string | null
  at: string
}

/** Lo que se comprueba en la pantalla antes de llamar al RPC (que vuelve a comprobarlo). */
export function validarMovimiento(input: {
  kind: KindManual
  qty: number
  reason?: string | null
  unitCost?: number | null
  esAdmin: boolean
  /** Lo del menú se cuenta entero; un insumo puede llevar decimales. */
  entero?: boolean
}): string | null {
  const { kind, qty, esAdmin, entero = true } = input
  if (!Number.isFinite(qty) || qty < 0) return entero ? "Escribe cuánto (un número entero)." : "Escribe cuánto."
  if (entero && !Number.isInteger(qty)) return "Esto se cuenta en piezas enteras."
  if (kind !== "conteo" && qty === 0) return "Escribe cuánto."
  if (qty > 100000) return "Es demasiado para un solo movimiento."
  if (kind === "merma" && !(input.reason ?? "").trim()) return "Indica el motivo de la merma."
  if (kind === "conteo" && !esAdmin) return "Solo un administrador puede contar."
  if (kind === "entrada" && input.unitCost != null) {
    if (!esAdmin) return "Solo un administrador puede poner el costo."
    if (!Number.isFinite(input.unitCost) || input.unitCost < 0) return "El costo no es válido."
  }
  return null
}

/**
 * Aplica lo que un cobro (o una cancelación, o un movimiento) devolvió a la
 * lista de lo que se cuenta. Devuelve la MISMA lista si nada cambió, para no
 * redibujar la rejilla del POS en vano.
 */
export function aplicarCambios(items: ItemExistencia[], cambios: CambioExistencia[] | null | undefined): ItemExistencia[] {
  if (!cambios || cambios.length === 0) return items
  let salida: ItemExistencia[] | null = null
  for (const c of cambios) {
    const i = items.findIndex((x) =>
      c.item_id ? x.itemId === c.item_id : !!c.variant_id && x.variantId === c.variant_id,
    )
    if (i < 0 || items[i].qty === c.qty) continue
    if (!salida) salida = [...items]
    salida[i] = { ...salida[i], qty: c.qty }
  }
  return salida ?? items
}

/** Las existencias por variante, que es como las mira el POS al pintar tarjetas. */
export function porVariante(items: ItemExistencia[]): Record<string, { qty: number; minQty: number }> {
  const mapa: Record<string, { qty: number; minQty: number }> = {}
  for (const i of items) {
    if (i.variantId) mapa[i.variantId] = { qty: i.qty, minQty: i.minQty }
  }
  return mapa
}

/** Lo que devuelve un RPC, leído con cuidado: si no viene, no hay cambios. */
export function cambiosDe(json: unknown): CambioExistencia[] {
  if (!json || typeof json !== "object") return []
  const raw = (json as { stock?: unknown }).stock
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x): CambioExistencia[] => {
    if (!x || typeof x !== "object") return []
    const { variant_id, item_id, qty } = x as { variant_id?: unknown; item_id?: unknown; qty?: unknown }
    if (typeof qty !== "number") return []
    if (typeof variant_id === "string") return [{ variant_id, qty }]
    if (typeof item_id === "string") return [{ item_id, qty }]
    return []
  })
}
