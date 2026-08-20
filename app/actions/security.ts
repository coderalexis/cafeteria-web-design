"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth"
import { requireContext } from "@/lib/context"
import { logAudit } from "@/lib/audit"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  PIN de caja: candado por inactividad del POS. Los hashes viven en   */
/*  member_pins (sin lectura para clientes); todo pasa por RPCs.        */
/* ------------------------------------------------------------------ */

const PIN_PATTERN = /^[0-9]{4,6}$/

/** Fija (o cambia) mi PIN en el negocio activo. */
export async function setMyPin(formData: FormData): Promise<ActionResult> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const pin = String(formData.get("pin") ?? "").trim()
  const confirm = String(formData.get("confirm_pin") ?? "").trim()
  if (!PIN_PATTERN.test(pin)) {
    return { error: "El PIN debe tener de 4 a 6 dígitos." }
  }
  if (confirm && confirm !== pin) {
    return { error: "La confirmación no coincide." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_my_pin", { p_pin: pin })
  if (error) return { error: error.message }

  return { success: true }
}

/** Verifica mi PIN (desbloqueo del POS). */
export async function verifyMyPin(pin: string): Promise<ActionResult<{ valid: boolean }>> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  if (typeof pin !== "string" || !PIN_PATTERN.test(pin.trim())) {
    return { success: true, valid: false }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("verify_my_pin", { p_pin: pin.trim() })
  if (error) return { error: error.message }

  return { success: true, valid: data === true }
}

/** ¿Tengo PIN configurado en el negocio activo? */
export async function getMyPinStatus(): Promise<ActionResult<{ hasPin: boolean }>> {
  const { error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("my_pin_set")
  if (error) return { error: error.message }
  return { success: true, hasPin: data === true }
}

/* ── Equipo: fijar o quitar el PIN de un miembro (owner|admin) ─────── */
export async function adminSetMemberPin(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx) return { error: authError ?? "Sesión inválida." }

  const userId = String(formData.get("user_id") ?? "")
  const rawPin = String(formData.get("pin") ?? "").trim()
  const clear = String(formData.get("clear") ?? "") === "true"
  const memberName = String(formData.get("member_name") ?? "").trim()

  if (!z.string().uuid().safeParse(userId).success) return { error: "Miembro inválido." }
  if (!clear && !PIN_PATTERN.test(rawPin)) {
    return { error: "El PIN debe tener de 4 a 6 dígitos." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_set_member_pin", {
    p_user_id: userId,
    p_pin: clear ? undefined : rawPin,
  })
  if (error) return { error: error.message }

  await logAudit("miembro.pin", memberName || userId, { accion: clear ? "quitado" : "asignado" })
  return { success: true }
}
