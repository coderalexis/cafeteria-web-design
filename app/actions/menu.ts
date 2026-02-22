"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

function revalidateAll() {
  revalidatePath("/admin", "layout")
  revalidatePath("/pos")
}

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "")
  const slug = String(formData.get("slug") ?? "")

  if (!name || !slug) {
    return { error: "Nombre y slug son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_categories").insert({ name, slug })

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function updateCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "")
  const slug = String(formData.get("slug") ?? "")

  if (!id || !name || !slug) {
    return { error: "ID, nombre y slug son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_categories").update({ name, slug }).eq("id", id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function createProduct(formData: FormData) {
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

  revalidateAll()
  return { success: true }
}

export async function updateProduct(formData: FormData) {
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

  revalidateAll()
  return { success: true }
}

export async function createVariant(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "")
  const name = String(formData.get("name") ?? "")
  const price = Number(formData.get("price") ?? 0)
  const sizeLabel = String(formData.get("size_label") ?? "")

  if (!productId || !name || Number.isNaN(price)) {
    return { error: "Producto, nombre y precio son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_variants").insert({
    product_id: productId,
    name,
    price,
    size_label: sizeLabel || null,
  })

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function updateVariant(formData: FormData) {
  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "")
  const price = Number(formData.get("price") ?? 0)
  const sizeLabel = String(formData.get("size_label") ?? "")

  if (!id || !name || Number.isNaN(price)) {
    return { error: "ID, nombre y precio son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("menu_variants")
    .update({ name, price, size_label: sizeLabel || null })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function deleteVariant(formData: FormData) {
  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_variants").delete().eq("id", id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID es obligatorio." }
  }

  const supabase = await createClient()

  // Variants cascade automatically (ON DELETE CASCADE)
  const { error } = await supabase.from("menu_products").delete().eq("id", id)

  if (error) {
    // Check for FK constraint (ticket_items referencing this product)
    if (error.message.includes("violates foreign key")) {
      return { error: "No se puede eliminar: este producto tiene ventas asociadas." }
    }
    return { error: error.message }
  }

  revalidateAll()
  return { success: true }
}

export async function deleteCategory(formData: FormData) {
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

  const { error } = await supabase.from("menu_categories").delete().eq("id", id)

  if (error) return { error: error.message }

  revalidateAll()
  return { success: true }
}
