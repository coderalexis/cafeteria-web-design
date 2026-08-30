"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { dbErrorMessage } from "@/lib/db-errors"
import { isCategoryColor } from "@/lib/category-colors"
import { slugify } from "@/lib/accounts"
import { CATEGORY_NOTE_MAX } from "@/lib/settings"
import { computeBulkPrice, type BulkPricesInput } from "@/lib/pricing"

function revalidateAll() {
  revalidatePath("/admin", "layout")
  revalidatePath("/pos")
}

/**
 * Identificador interno de una categoría, derivado del nombre.
 *
 * Se guarda porque el POS y la carta pública filtran por él, pero ya NO se le
 * pide al usuario: quien arma el menú de su cafetería no tiene por qué saber
 * qué es un «slug», y el sistema le respondía con un error de programador
 * («solo minúsculas, números y guiones») cuando escribía cualquier otra cosa.
 *
 * Si el nombre se repite se numera («postres», «postres-2»), porque la base
 * exige que sea único dentro de cada cafetería.
 */
function slugDisponible(nombre: string, tomados: Set<string>): string | null {
  const raiz = slugify(nombre) || "categoria"
  for (let i = 1; i <= 50; i++) {
    const intento = i === 1 ? raiz : `${raiz}-${i}`
    if (!tomados.has(intento)) return intento
  }
  return null
}

/** Costo del formulario: vacío = 0. Devuelve null si el valor es inválido. */
function parseCost(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim()
  if (!text) return 0
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export async function createCategory(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const name = String(formData.get("name") ?? "").trim()
  const colorRaw = String(formData.get("color") ?? "")
  const color = isCategoryColor(colorRaw) ? colorRaw : null
  const note = String(formData.get("note") ?? "").trim().slice(0, CATEGORY_NOTE_MAX) || null

  if (!name) {
    return { error: "El nombre es obligatorio." }
  }

  const supabase = await createClient()

  // El identificador se deriva del nombre; RLS limita la lectura a la
  // cafetería activa, así que los «tomados» son solo los suyos.
  const { data: existentes } = await supabase.from("menu_categories").select("slug, sort_order")
  const slug = slugDisponible(name, new Set((existentes ?? []).map((c) => c.slug)))
  if (!slug) {
    return { error: "Ya tienes demasiadas categorías con ese nombre. Ponle uno que las distinga." }
  }

  // Al final de la lista, no al principio. Sin esto la categoría nueva nacía
  // con orden 0 y se colaba ANTES que todas en las pestañas del POS: uno
  // agregaba «Postres» y de pronto era lo primero que veía el cajero.
  const sortOrder = Math.max(0, ...(existentes ?? []).map((c) => c.sort_order ?? 0)) + 1

  const { error } = await supabase
    .from("menu_categories")
    .insert({ name, slug, color, note, sort_order: sortOrder })

  if (error) return { error: dbErrorMessage(error) }

  await logAudit("categoria.creada", name)
  revalidateAll()
  return { success: true }
}

export async function updateCategory(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const colorRaw = String(formData.get("color") ?? "")
  const color = isCategoryColor(colorRaw) ? colorRaw : null
  const note = String(formData.get("note") ?? "").trim().slice(0, CATEGORY_NOTE_MAX) || null

  if (!id || !name) {
    return { error: "El nombre es obligatorio." }
  }

  const supabase = await createClient()
  // El identificador NO se regenera al renombrar, a propósito: es la llave con
  // la que el POS agrupa y con la que la carta pública arma sus anclas. Cambiarlo
  // porque alguien corrigió una falta de ortografía no le daría nada al usuario
  // —nunca lo ve— y sí movería referencias por debajo.
  const { error } = await supabase.from("menu_categories").update({ name, color, note }).eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  await logAudit("categoria.editada", name)
  revalidateAll()
  return { success: true }
}

export async function createProduct(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const name = String(formData.get("name") ?? "")
  const categoryId = String(formData.get("category_id") ?? "")
  const description = String(formData.get("description") ?? "")

  if (!name || !categoryId) {
    return { error: "Nombre y categoría son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_products").insert({
    name,
    category_id: categoryId,
    description: description || null,
  })

  if (error) return { error: dbErrorMessage(error) }

  await logAudit("producto.creado", name)
  revalidateAll()
  return { success: true }
}

export async function updateProduct(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "")
  const categoryId = String(formData.get("category_id") ?? "")
  const description = String(formData.get("description") ?? "")

  if (!id || !name || !categoryId) {
    return { error: "ID, nombre y categoría son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("menu_products")
    .update({ name, category_id: categoryId, description: description || null })
    .eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  await logAudit("producto.editado", name)
  revalidateAll()
  return { success: true }
}

export async function createVariant(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const productId = String(formData.get("product_id") ?? "")
  const name = String(formData.get("name") ?? "")
  const price = Number(formData.get("price") ?? 0)
  const cost = parseCost(formData.get("cost"))
  const sizeLabel = String(formData.get("size_label") ?? "")

  if (!productId || !name || !Number.isFinite(price) || price < 0) {
    return { error: "Producto, nombre y precio (mayor o igual a 0) son obligatorios." }
  }
  if (cost === null) {
    return { error: "El costo debe ser un monto mayor o igual a 0." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_variants").insert({
    product_id: productId,
    name,
    price,
    cost,
    size_label: sizeLabel || null,
  })

  if (error) return { error: dbErrorMessage(error) }

  const { data: product } = await supabase.from("menu_products").select("name").eq("id", productId).maybeSingle()
  await logAudit("variante.creada", `${product?.name ?? "?"} (${name})`, { precio: price, costo: cost })
  revalidateAll()
  return { success: true }
}

export async function updateVariant(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "")
  const price = Number(formData.get("price") ?? 0)
  const cost = parseCost(formData.get("cost"))
  const sizeLabel = String(formData.get("size_label") ?? "")

  if (!id || !name || !Number.isFinite(price) || price < 0) {
    return { error: "ID, nombre y precio (mayor o igual a 0) son obligatorios." }
  }
  if (cost === null) {
    return { error: "El costo debe ser un monto mayor o igual a 0." }
  }

  const supabase = await createClient()

  // Estado previo solo para la bitácora (cambios de precio).
  const { data: before } = await supabase
    .from("menu_variants")
    .select("price, cost, menu_products(name)")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase
    .from("menu_variants")
    .update({ name, price, cost, size_label: sizeLabel || null })
    .eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  const productName = (Array.isArray(before?.menu_products) ? before?.menu_products[0] : before?.menu_products)?.name
  if (before && Number(before.price) !== price) {
    await logAudit("precio.cambiado", `${productName ?? "?"} (${name})`, {
      antes: Number(before.price),
      ahora: price,
      costo: cost,
    })
  } else if (before && Number(before.cost) !== cost) {
    await logAudit("costo.cambiado", `${productName ?? "?"} (${name})`, {
      antes: Number(before.cost),
      ahora: cost,
    })
  } else {
    await logAudit("variante.editada", `${productName ?? "?"} (${name})`)
  }
  revalidateAll()
  return { success: true }
}

export async function deleteVariant(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()

  // Borrar una variante con ventas dejaría su historial sin referencia
  // (variant_id pasa a NULL). Con ventas, se desactiva en lugar de borrar.
  const { count } = await supabase
    .from("ticket_items")
    .select("*", { count: "exact", head: true })
    .eq("variant_id", id)

  if (count && count > 0) {
    return {
      error: `Esta variante tiene ${count} venta(s) registradas. Desactívala en lugar de eliminarla.`,
    }
  }

  const { data: before } = await supabase
    .from("menu_variants")
    .select("name, menu_products(name)")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase.from("menu_variants").delete().eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  const productName = (Array.isArray(before?.menu_products) ? before?.menu_products[0] : before?.menu_products)?.name
  await logAudit("variante.eliminada", `${productName ?? "?"} (${before?.name ?? id})`)
  revalidateAll()
  return { success: true }
}

export async function toggleVariantActive(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const isActive = formData.get("is_active") === "true"

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("menu_variants")
    .update({ is_active: isActive })
    .eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  const { data: v } = await supabase
    .from("menu_variants")
    .select("name, menu_products(name)")
    .eq("id", id)
    .maybeSingle()
  const productName = (Array.isArray(v?.menu_products) ? v?.menu_products[0] : v?.menu_products)?.name
  await logAudit(isActive ? "variante.activada" : "variante.desactivada", `${productName ?? "?"} (${v?.name ?? id})`)
  revalidateAll()
  return { success: true }
}

export async function toggleProductActive(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const isActive = formData.get("is_active") === "true"

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("menu_products")
    .update({ is_active: isActive })
    .eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  const { data: p } = await supabase.from("menu_products").select("name").eq("id", id).maybeSingle()
  await logAudit(isActive ? "producto.activado" : "producto.desactivado", p?.name ?? id)
  revalidateAll()
  return { success: true }
}

export async function deleteProduct(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()

  // Borrar un producto con ventas dejaría su historial sin referencia
  // (product_id pasa a NULL y las variantes se borran en cascada).
  const { count } = await supabase
    .from("ticket_items")
    .select("*", { count: "exact", head: true })
    .eq("product_id", id)

  if (count && count > 0) {
    return {
      error: `Este producto tiene ${count} venta(s) registradas. Desactívalo en lugar de eliminarlo.`,
    }
  }

  const { data: before } = await supabase.from("menu_products").select("name").eq("id", id).maybeSingle()

  // Variants cascade automatically (ON DELETE CASCADE)
  const { error } = await supabase.from("menu_products").delete().eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  await logAudit("producto.eliminado", before?.name ?? id)
  revalidateAll()
  return { success: true }
}

export async function deleteCategory(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()

  // Check if category has products (ON DELETE RESTRICT)
  const { count } = await supabase
    .from("menu_products")
    .select("*", { count: "exact", head: true })
    .eq("category_id", id)

  if (count && count > 0) {
    return {
      error: `No se puede eliminar: esta categoría tiene ${count} producto(s). Mueve o elimina los productos primero.`,
    }
  }

  const { data: before } = await supabase.from("menu_categories").select("name").eq("id", id).maybeSingle()

  const { error } = await supabase.from("menu_categories").delete().eq("id", id)

  if (error) return { error: dbErrorMessage(error) }

  await logAudit("categoria.eliminada", before?.name ?? id)
  revalidateAll()
  return { success: true }
}

/* ------------------------------------------------------------------ */
/*  P3: precios en lote y reordenamiento                               */
/* ------------------------------------------------------------------ */

const bulkPricesSchema = z.object({
  /** null = todo el menú. */
  categoryId: z.string().uuid().nullable(),
  direction: z.enum(["subir", "bajar"]),
  kind: z.enum(["percent", "amount"]),
  value: z.number().finite().positive().max(500),
  rounding: z.enum(["peso", "cincuenta", "exacto"]),
})

/**
 * Cambia todos los precios de una categoría (o del menú completo) de un jalón.
 * Incluye variantes de productos ocultos, para que al reactivarlos el precio
 * ya esté al día. El servidor recalcula: no confía en la vista previa.
 */
export async function bulkUpdatePrices(
  input: BulkPricesInput,
): Promise<{ error: string } | { success: true; updated: number }> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const parsed = bulkPricesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  }
  const v = parsed.data

  const supabase = await createClient()
  let query = supabase.from("menu_variants").select("id, price, menu_products!inner(category_id)")
  if (v.categoryId) query = query.eq("menu_products.category_id", v.categoryId)
  const { data: variants, error } = await query
  if (error) return { error: dbErrorMessage(error) }

  const changes = (variants ?? [])
    .map((row) => ({ id: row.id, price: computeBulkPrice(row.price, v) }))
    .filter((c, i) => c.price !== (variants ?? [])[i].price)

  // Lotes chicos en paralelo: cada update pasa por RLS.
  const CHUNK = 15
  for (let i = 0; i < changes.length; i += CHUNK) {
    const results = await Promise.all(
      changes.slice(i, i + CHUNK).map((c) => supabase.from("menu_variants").update({ price: c.price }).eq("id", c.id)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) return { error: `Se actualizaron ${i} precios y ahí se detuvo. ${dbErrorMessage(failed.error)}` }
  }

  let scopeName = "todo el menú"
  if (v.categoryId) {
    const { data: cat } = await supabase.from("menu_categories").select("name").eq("id", v.categoryId).maybeSingle()
    scopeName = cat?.name ?? "categoría"
  }
  await logAudit("precios.lote", scopeName, {
    direccion: v.direction,
    tipo: v.kind === "percent" ? "porcentaje" : "monto",
    valor: v.value,
    redondeo: v.rounding,
    variantes: changes.length,
  })
  revalidateAll()
  return { success: true, updated: changes.length }
}

const reorderSchema = z.object({
  categoryId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
})

/** Guarda el orden de los productos de una categoría (1..n). */
export async function reorderProducts(
  input: z.infer<typeof reorderSchema>,
): Promise<{ error: string } | { success: true }> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return { error: "Datos inválidos." }
  const { categoryId, orderedIds } = parsed.data

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from("menu_products")
    .select("id, sort_order")
    .eq("category_id", categoryId)
  if (error) return { error: dbErrorMessage(error) }

  const current = new Map((rows ?? []).map((r) => [r.id, r.sort_order]))
  if (current.size !== orderedIds.length || orderedIds.some((id) => !current.has(id))) {
    return { error: "La lista cambió en otra pestaña. Recarga e intenta de nuevo." }
  }

  const changes = orderedIds
    .map((id, index) => ({ id, sort_order: index + 1 }))
    .filter((c) => current.get(c.id) !== c.sort_order)

  const CHUNK = 15
  for (let i = 0; i < changes.length; i += CHUNK) {
    const results = await Promise.all(
      changes
        .slice(i, i + CHUNK)
        .map((c) => supabase.from("menu_products").update({ sort_order: c.sort_order }).eq("id", c.id)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) return { error: dbErrorMessage(failed.error) }
  }

  revalidateAll()
  return { success: true }
}

/** Sube o baja una categoría un lugar (renumera para deshacer empates). */
export async function moveCategory(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const direction = String(formData.get("direction") ?? "")
  if (!id || (direction !== "up" && direction !== "down")) {
    return { error: "Datos inválidos." }
  }

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from("menu_categories")
    .select("id, sort_order")
    .order("sort_order")
    .order("name")
  if (error) return { error: dbErrorMessage(error) }

  const list = rows ?? []
  const index = list.findIndex((r) => r.id === id)
  if (index === -1) return { error: "Categoría no encontrada." }
  const target = direction === "up" ? index - 1 : index + 1
  if (target < 0 || target >= list.length) return { success: true }

  const nextOrder = [...list]
  ;[nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]]

  const changes = nextOrder
    .map((r, i) => ({ id: r.id, sort_order: i + 1 }))
    .filter((c) => list.find((r) => r.id === c.id)?.sort_order !== c.sort_order)

  for (const c of changes) {
    const { error: upErr } = await supabase.from("menu_categories").update({ sort_order: c.sort_order }).eq("id", c.id)
    if (upErr) return { error: dbErrorMessage(upErr) }
  }

  revalidateAll()
  return { success: true }
}
