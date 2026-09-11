"use server"

import { z } from "@/lib/zod"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { dbErrorMessage } from "@/lib/db-errors"
import type { ActionResult } from "./types"
import type { CambioExistencia } from "@/lib/existencias"

/* ------------------------------------------------------------------ */
/*  Inventario por pieza (P45).                                         */
/*                                                                      */
/*  Toda la regla vive en los RPC (migración 57): quién puede marcar,   */
/*  quién puede poner el costo, que la merma lleve motivo, que contar   */
/*  sea de admin. Aquí solo se validan formas y se traduce lo que el    */
/*  servidor devuelve a lo que la pantalla y el POS necesitan.          */
/* ------------------------------------------------------------------ */

function revalidar() {
  revalidatePath("/admin/existencias")
  revalidatePath("/admin/productos")
  revalidatePath("/pos")
}

const piezas = z.number().int().min(0, "No puede ser negativo.").max(100000, "Son demasiadas piezas.")

const marcarSchema = z.object({
  variantId: z.string().uuid(),
  /** null = no tocar la existencia (solo empezar a contar, o ajustar el mínimo). */
  qty: piezas.nullable(),
  minQty: piezas.nullable(),
})

/** Empieza a contar una variante (o ajusta su mínimo / su existencia). Admin o dueño. */
export async function marcarPorPieza(
  input: z.infer<typeof marcarSchema>,
): Promise<ActionResult<{ qty: number; minQty: number }>> {
  const parsed = marcarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("stock_track", {
    p_variant: parsed.data.variantId,
    p_on: true,
    p_qty: parsed.data.qty ?? undefined,
    p_min: parsed.data.minQty ?? undefined,
  })
  if (error) return { error: dbErrorMessage(error) }
  const r = (data ?? {}) as { qty?: number; min_qty?: number }
  revalidar()
  return { success: true, qty: Number(r.qty ?? 0), minQty: Number(r.min_qty ?? 0) }
}

/** Deja de contar una variante. El diario se queda. */
export async function dejarDeContar(variantId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(variantId).success) return { error: "Artículo inválido." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("stock_track", { p_variant: variantId, p_on: false })
  if (error) return { error: dbErrorMessage(error) }
  revalidar()
  return { success: true }
}

const moverSchema = z.object({
  variantId: z.string().uuid(),
  kind: z.enum(["entrada", "merma", "conteo"]),
  qty: piezas,
  reason: z.string().trim().max(200, "El motivo es demasiado largo.").optional(),
  unitCost: z.number().min(0, "El costo no es válido.").max(99999, "El costo no es válido.").optional(),
})

/**
 * Registra lo que pasó con las piezas. Cualquiera del equipo (el RPC decide
 * qué puede cada rol). Devuelve la existencia nueva en la misma forma que
 * `create_ticket`, para que el POS la aplique con la misma función.
 */
export async function registrarMovimiento(
  input: z.infer<typeof moverSchema>,
): Promise<ActionResult<{ cambios: CambioExistencia[]; qtyAfter: number; moved: boolean }>> {
  const parsed = moverSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const v = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("stock_move", {
    p_variant: v.variantId,
    p_kind: v.kind,
    p_qty: v.qty,
    p_reason: v.reason || undefined,
    p_unit_cost: v.unitCost,
  })
  if (error) return { error: dbErrorMessage(error) }
  const r = (data ?? {}) as { qty_after?: number; moved?: boolean }
  const qtyAfter = Number(r.qty_after ?? 0)
  revalidar()
  return {
    success: true,
    cambios: [{ variant_id: v.variantId, qty: qtyAfter }],
    qtyAfter,
    moved: r.moved !== false,
  }
}
