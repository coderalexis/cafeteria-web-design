"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { homePathFor, parseContext } from "@/lib/context-shape"
import type { ActionResult } from "./types"

/**
 * Cambia el negocio activo del usuario (debe tener membresía activa; lo valida
 * el RPC). Devuelve a dónde llevarlo según su rol en el nuevo negocio.
 */
export async function switchBusiness(businessId: string): Promise<ActionResult<{ redirectTo: string }>> {
  if (!z.string().uuid().safeParse(businessId).success) {
    return { error: "Negocio inválido." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("set_active_business", { p_business_id: businessId })
  if (error) {
    return { error: error.message }
  }

  const ctx = parseContext(data)
  revalidatePath("/", "layout")
  return { success: true, redirectTo: homePathFor(ctx) }
}
