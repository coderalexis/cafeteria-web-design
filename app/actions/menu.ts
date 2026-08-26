"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { isCategoryColor } from "@/lib/category-colors"

function revalidateAll() {
  revalidatePath("/admin", "layout")
  revalidatePath("/pos")
}

// El POS filtra por slug en la URL/estado; un slug con espacios o "/" rompe
// ese filtro silenciosamente.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function createCategory(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const name = String(formData.get("name") ?? "")
  const slug = String(formData.get("slug") ?? "")
  const colorRaw = String(formData.get("color") ?? "")
  const color = isCategoryColor(colorRaw) ? colorRaw : null

  if (!name || !slug) {
    return { error: "Nombre y slug son obligatorios." }
  }

  if (!SLUG_PATTERN.test(slug)) {
    return { error: "El slug solo puede llevar minúsculas, números y guiones (ej. crepas-dulces)." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_categories").insert({ name, slug, color })

  if (error) return { error: error.message }

  await logAudit("categoria.creada", name)
  revalidateAll()
  return { success: true }
}

export async function updateCategory(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "")
  const slug = String(formData.get("slug") ?? "")
  const colorRaw = String(formData.get("color") ?? "")
  const color = isCategoryColor(colorRaw) ? colorRaw : null

  if (!id || !name || !slug) {
    return { error: "ID, nombre y slug son obligatorios." }
  }

  if (!SLUG_PATTERN.test(slug)) {
    return { error: "El slug solo puede llevar minúsculas, números y guiones (ej. crepas-dulces)." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_categories").update({ name, slug, color }).eq("id", id)

  if (error) return { error: error.message }

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

  if (error) return { error: error.message }

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

  if (error) return { error: error.message }

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
  const sizeLabel = String(formData.get("size_label") ?? "")

  if (!productId || !name || !Number.isFinite(price) || price < 0) {
    return { error: "Producto, nombre y precio (mayor o igual a 0) son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_variants").insert({
    product_id: productId,
    name,
    price,
    size_label: sizeLabel || null,
  })

  if (error) return { error: error.message }

  const { data: product } = await supabase.from("menu_products").select("name").eq("id", productId).maybeSingle()
  await logAudit("variante.creada", `${product?.name ?? "?"} (${name})`, { precio: price })
  revalidateAll()
  return { success: true }
}

export async function updateVariant(formData: FormData) {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "")
  const price = Number(formData.get("price") ?? 0)
  const sizeLabel = String(formData.get("size_label") ?? "")

  if (!id || !name || !Number.isFinite(price) || price < 0) {
    return { error: "ID, nombre y precio (mayor o igual a 0) son obligatorios." }
  }

  const supabase = await createClient()

  // Estado previo solo para la bitácora (cambios de precio).
  const { data: before } = await supabase
    .from("menu_variants")
    .select("price, menu_products(name)")
    .eq("id", id)
    .maybeSingle()

  const { error } = await supabase
    .from("menu_variants")
    .update({ name, price, size_label: sizeLabel || null })
    .eq("id", id)

  if (error) return { error: error.message }

  const productName = (Array.isArray(before?.menu_products) ? before?.menu_products[0] : before?.menu_products)?.name
  if (before && Number(before.price) !== price) {
    await logAudit("precio.cambiado", `${productName ?? "?"} (${name})`, {
      antes: Number(before.price),
      ahora: price,
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

  if (error) return { error: error.message }

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

  if (error) return { error: error.message }

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

  if (error) return { error: error.message }

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

  if (error) return { error: error.message }

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

  if (error) return { error: error.message }

  await logAudit("categoria.eliminada", before?.name ?? id)
  revalidateAll()
  return { success: true }
}
