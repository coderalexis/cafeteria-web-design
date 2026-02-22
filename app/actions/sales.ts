"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function createTicket(formData: FormData) {
  const paymentMethod = String(formData.get("payment_method") ?? "")
  const notes = String(formData.get("notes") ?? "")
  const itemsRaw = String(formData.get("items") ?? "[]")

  let items: Array<{ variant_id: string; quantity: number; unit_price: number; notes?: string }> = []

  try {
    items = JSON.parse(itemsRaw)
  } catch {
    return { error: "Formato de items inválido." }
  }

  if (!["efectivo", "transferencia", "tarjeta_clip"].includes(paymentMethod)) {
    return { error: "Método de pago inválido." }
  }

  if (items.length === 0) {
    return { error: "El ticket debe incluir al menos un item." }
  }

  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Sesión inválida." }
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .insert({
      cashier_id: user.id,
      payment_method: paymentMethod,
      subtotal,
      total: subtotal,
      notes: notes || null,
    })
    .select("id")
    .single()

  if (ticketError || !ticket) {
    return { error: ticketError?.message ?? "No se pudo crear el ticket." }
  }

  const { error: itemError } = await supabase.from("ticket_items").insert(
    items.map((item) => ({
      ticket_id: ticket.id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.quantity * item.unit_price,
      notes: item.notes ?? null,
    })),
  )

  if (itemError) {
    return { error: itemError.message }
  }

  return { success: true, ticketId: ticket.id }
}

export async function deleteTicket(formData: FormData) {
  const id = String(formData.get("id") ?? "")

  if (!id) {
    return { error: "ID de ticket requerido." }
  }

  const supabase = await createClient()

  const { error } = await supabase.from("tickets").delete().eq("id", id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/admin", "layout")
  revalidatePath("/pos")

  return { success: true }
}
