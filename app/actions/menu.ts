"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "")
  const slug = String(formData.get("slug") ?? "")

  if (!name || !slug) {
    return { error: "Nombre y slug son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_categories").insert({ name, slug })

  if (error) return { error: error.message }

  revalidatePath("/admin")
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

  revalidatePath("/admin")
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

  revalidatePath("/admin")
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

  revalidatePath("/admin")
  return { success: true }
}

export async function createVariant(formData: FormData) {
  const productId = String(formData.get("product_id") ?? "")
  const name = String(formData.get("name") ?? "")
  const price = Number(formData.get("price") ?? 0)

  if (!productId || !name || Number.isNaN(price)) {
    return { error: "Producto, nombre y precio son obligatorios." }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("menu_variants").insert({
    product_id: productId,
    name,
    price,
  })

  if (error) return { error: error.message }

  revalidatePath("/admin")
  return { success: true }
}
