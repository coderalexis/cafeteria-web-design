"use server"

import { z } from "@/lib/zod"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActionResult } from "./types"
import type { CambioExistencia, KindMovimiento, Movimiento } from "@/lib/existencias"

/* ------------------------------------------------------------------ */
/*  Inventario (P45).                                                   */
/*                                                                      */
/*  Toda la regla vive en los RPC (migraciones 57 y 58): quién puede    */
/*  decidir qué se cuenta, quién puede poner el costo, que la merma     */
/*  lleve motivo, que contar sea de admin, que lo del menú se cuente    */
/*  entero. Aquí solo se validan formas y se traduce lo que el servidor */
/*  devuelve a lo que la pantalla y el POS necesitan.                   */
/* ------------------------------------------------------------------ */

function revalidar() {
  revalidatePath("/admin/existencias")
  revalidatePath("/pos")
}

/** Hasta dónde se lee el historial de un artículo: meses de una cafetería normal. */
const HISTORIAL_MAX = 300

/**
 * El diario de UN artículo, lo más reciente primero. Se pide al abrir el
 * historial y no al cargar la pantalla: traer el diario de todo el café
 * «por si acaso» era pagar cientos de renglones en cada visita y, peor,
 * cortarlo en silencio para el artículo que más se mueve.
 */
export async function historialDe(
  itemId: string,
): Promise<ActionResult<{ movimientos: Movimiento[]; completo: boolean }>> {
  if (!z.string().uuid().safeParse(itemId).success) return { error: "Artículo inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, kind, qty, qty_after, unit_cost, reason, created_at, tickets(folio), profiles(full_name)")
    .eq("item_id", itemId)
    .order("seq", { ascending: false })
    .limit(HISTORIAL_MAX + 1)
  if (error) return { error: dbErrorMessage(error) }
  const filas = data ?? []
  return {
    success: true,
    completo: filas.length <= HISTORIAL_MAX,
    movimientos: filas.slice(0, HISTORIAL_MAX).map((m) => ({
      id: m.id,
      kind: m.kind as KindMovimiento,
      qty: Number(m.qty),
      qtyAfter: Number(m.qty_after),
      unitCost: m.unit_cost == null ? null : Number(m.unit_cost),
      reason: m.reason,
      folio: m.tickets?.folio ?? null,
      actor: m.profiles?.full_name ?? null,
      at: m.created_at,
    })),
  }
}

const cantidad = z.number().min(0, "No puede ser negativo.").max(100000, "Es demasiado.")
const enteras = z.number().int("Se cuenta en piezas enteras.").min(0, "No puede ser negativo.").max(100000, "Es demasiado.")

const menuSchema = z.object({
  variantId: z.string().uuid(),
  /** null = no tocar la existencia (solo empezar a contar, o ajustar el mínimo). */
  qty: enteras.nullable(),
  minQty: enteras.nullable(),
})

/** Empieza a contar algo del MENÚ (o ajusta su mínimo / su existencia). Admin o dueño. */
export async function contarDelMenu(
  input: z.infer<typeof menuSchema>,
): Promise<ActionResult<{ itemId: string; qty: number; minQty: number }>> {
  const parsed = menuSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("stock_track", {
    p_variant: parsed.data.variantId,
    p_on: true,
    p_qty: parsed.data.qty ?? undefined,
    p_min: parsed.data.minQty ?? undefined,
  })
  if (error) return { error: dbErrorMessage(error) }
  const r = (data ?? {}) as { item_id?: string; qty?: number; min_qty?: number }
  revalidar()
  return { success: true, itemId: String(r.item_id ?? ""), qty: Number(r.qty ?? 0), minQty: Number(r.min_qty ?? 0) }
}

const insumoSchema = z.object({
  /** Sin id = nace; con id = se renombra, cambia de unidad o de mínimo. */
  supplyId: z.string().uuid().nullable().optional(),
  nombre: z.string().trim().min(1, "Escribe el nombre del insumo.").max(80, "El nombre es demasiado largo."),
  unidad: z.enum(["pieza", "paquete", "caja", "bolsa", "kilo", "litro"]),
  qty: cantidad.nullable().optional(),
  minQty: cantidad.nullable().optional(),
})

/** Crea o corrige un insumo: lo que se compra para preparar y no está en el menú. */
export async function guardarInsumo(
  input: z.infer<typeof insumoSchema>,
): Promise<ActionResult<{ itemId: string; supplyId: string; qty: number }>> {
  const parsed = insumoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("supply_save", {
    p_name: v.nombre,
    p_unit: v.unidad,
    p_supply: v.supplyId ?? undefined,
    p_qty: v.qty ?? undefined,
    p_min: v.minQty ?? undefined,
  })
  if (error) return { error: dbErrorMessage(error) }
  const r = (data ?? {}) as { item_id?: string; supply_id?: string; qty?: number }
  revalidar()
  return {
    success: true,
    itemId: String(r.item_id ?? ""),
    supplyId: String(r.supply_id ?? ""),
    qty: Number(r.qty ?? 0),
  }
}

/** Deja de contar, sea del menú o un insumo. El diario se queda. */
export async function dejarDeContar(input: {
  variantId?: string | null
  supplyId?: string | null
  nombre?: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  if (input.variantId) {
    if (!z.string().uuid().safeParse(input.variantId).success) return { error: "Artículo inválido." }
    const { error } = await supabase.rpc("stock_track", { p_variant: input.variantId, p_on: false })
    if (error) return { error: dbErrorMessage(error) }
  } else if (input.supplyId) {
    if (!z.string().uuid().safeParse(input.supplyId).success) return { error: "Artículo inválido." }
    const { error } = await supabase.rpc("supply_save", {
      p_name: input.nombre ?? "",
      p_supply: input.supplyId,
      p_on: false,
    })
    if (error) return { error: dbErrorMessage(error) }
  } else {
    return { error: "Artículo inválido." }
  }
  revalidar()
  return { success: true }
}

const moverSchema = z.object({
  itemId: z.string().uuid(),
  kind: z.enum(["entrada", "merma", "conteo"]),
  qty: cantidad,
  reason: z.string().trim().max(200, "El motivo es demasiado largo.").optional(),
  unitCost: z.number().min(0, "El costo no es válido.").max(99999, "El costo no es válido.").optional(),
})

/**
 * Registra lo que pasó con las existencias. Cualquiera del equipo (el RPC
 * decide qué puede cada rol). Devuelve la existencia nueva en la misma forma
 * que `create_ticket`, para que el POS la aplique con la misma función.
 */
export async function registrarMovimiento(
  input: z.infer<typeof moverSchema>,
): Promise<ActionResult<{ cambios: CambioExistencia[]; qtyAfter: number; delta: number; moved: boolean }>> {
  const parsed = moverSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("stock_move", {
    p_item: v.itemId,
    p_kind: v.kind,
    p_qty: v.qty,
    p_reason: v.reason || undefined,
    p_unit_cost: v.unitCost,
  })
  if (error) return { error: dbErrorMessage(error) }
  const r = (data ?? {}) as { qty?: number; qty_after?: number; moved?: boolean }
  const qtyAfter = Number(r.qty_after ?? 0)
  revalidar()
  return {
    success: true,
    cambios: [{ item_id: v.itemId, qty: qtyAfter }],
    qtyAfter,
    // Lo que cambió según el SERVIDOR: en un conteo, la diferencia real, no la
    // que la pantalla calcularía con un número que pudo quedar viejo.
    delta: Number(r.qty ?? 0),
    moved: r.moved !== false,
  }
}
