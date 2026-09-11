/**
 * Inventario por pieza (P45): lo puro. Las reglas de dinero y permisos viven
 * en los RPC (`stock_track`, `stock_move`, migración 57); aquí solo lo que la
 * pantalla necesita decidir sin ir al servidor: qué avisar, cómo leer el
 * diario y cómo aplicar lo que un cobro devuelve.
 *
 * Diseño completo en docs/inventario.md.
 */

export type KindMovimiento = "entrada" | "venta" | "cancelacion" | "merma" | "conteo"

/** Lo que registran las personas; venta y cancelación las escribe el sistema. */
export type KindManual = "entrada" | "merma" | "conteo"

export interface Existencia {
  qty: number
  minQty: number
}

/** Lo que devuelven create_ticket, cancel_ticket y stock_move: la existencia nueva. */
export interface CambioExistencia {
  variant_id: string
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
  if (estado === "bajo") return qty === 1 ? "Queda 1" : `Quedan ${qty}`
  return "Agotado"
}

/**
 * Un producto con varios tamaños contados muestra el peor de ellos: si el
 * chico está agotado y el grande no, la tarjeta avisa igual, y el selector de
 * tamaño ya enseña cuál.
 */
export function esquinaProducto(existencias: Existencia[]): string | null {
  const orden: Record<EstadoExistencia, number> = { ok: 0, bajo: 1, agotado: 2, negativo: 3 }
  let peor: Existencia | null = null
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

/** Un renglón del historial tal como lo devuelve `historialDe` y lo pinta la pantalla. */
export interface Movimiento extends MovimientoDiario {
  id: string
  variantId: string
  actor: string | null
  at: string
}

/**
 * Un renglón del diario en palabras. Es lo que convierte «-2, 11» en algo que
 * una dueña lee: «Vendidas 2 · ticket #105 → 11».
 */
export function describirMovimiento(m: MovimientoDiario): string {
  const n = Math.abs(m.qty)
  const piezas = n === 1 ? "1 pieza" : `${n} piezas`
  switch (m.kind) {
    case "entrada":
      return m.unitCost != null ? `Llegaron ${piezas} a $${m.unitCost.toFixed(2)} c/u` : `Llegaron ${piezas}`
    case "venta":
      return m.folio != null ? `${n === 1 ? "Vendida" : "Vendidas"} ${piezas} · ticket #${m.folio}` : `${n === 1 ? "Vendida" : "Vendidas"} ${piezas}`
    case "cancelacion":
      return m.folio != null ? `Cancelado el ticket #${m.folio}: ${n === 1 ? "vuelve" : "vuelven"} ${piezas}` : `Cancelación: ${n === 1 ? "vuelve" : "vuelven"} ${piezas}`
    case "merma":
      return `Merma de ${piezas}${m.reason ? `: ${m.reason}` : ""}`
    case "conteo": {
      // El primer renglón de todo artículo: no «sobraban 10», había 10.
      if (m.reason === "Existencia inicial") return `Existencia inicial: ${piezas}`
      const signo = m.qty > 0 ? "sobraban" : "faltaban"
      const nota = m.reason && m.reason !== "Conteo" ? ` · ${m.reason}` : ""
      return `Conteo: ${signo} ${piezas}${nota}`
    }
  }
}

/** Lo que se comprueba en la pantalla antes de llamar al RPC (que vuelve a comprobarlo). */
export function validarMovimiento(input: {
  kind: KindManual
  qty: number
  reason?: string | null
  unitCost?: number | null
  esAdmin: boolean
}): string | null {
  const { kind, qty, esAdmin } = input
  if (!Number.isInteger(qty) || qty < 0) return "Escribe cuántas piezas (un número entero)."
  if (kind !== "conteo" && qty === 0) return "Escribe cuántas piezas."
  if (qty > 100000) return "Son demasiadas piezas para un solo movimiento."
  if (kind === "merma" && !(input.reason ?? "").trim()) return "Indica el motivo de la merma."
  if (kind === "conteo" && !esAdmin) return "Solo un administrador puede contar."
  if (kind === "entrada" && input.unitCost != null) {
    if (!esAdmin) return "Solo un administrador puede poner el costo."
    if (!Number.isFinite(input.unitCost) || input.unitCost < 0) return "El costo no es válido."
  }
  return null
}

/**
 * Aplica lo que un cobro (o una cancelación, o un movimiento) devolvió al mapa
 * de existencias del POS. Devuelve un mapa NUEVO solo si algo cambió, para no
 * redibujar la rejilla en vano.
 */
export function aplicarCambios(
  mapa: Record<string, Existencia>,
  cambios: CambioExistencia[] | null | undefined,
): Record<string, Existencia> {
  if (!cambios || cambios.length === 0) return mapa
  let salida: Record<string, Existencia> | null = null
  for (const c of cambios) {
    const actual = mapa[c.variant_id]
    if (!actual || actual.qty === c.qty) continue
    if (!salida) salida = { ...mapa }
    salida[c.variant_id] = { ...actual, qty: c.qty }
  }
  return salida ?? mapa
}

/** Lo que devuelve un RPC, leído con cuidado: si no viene, no hay cambios. */
export function cambiosDe(json: unknown): CambioExistencia[] {
  if (!json || typeof json !== "object") return []
  const raw = (json as { stock?: unknown }).stock
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object") return []
    const { variant_id, qty } = x as { variant_id?: unknown; qty?: unknown }
    return typeof variant_id === "string" && typeof qty === "number" ? [{ variant_id, qty }] : []
  })
}
