"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireContext, requireRole } from "@/lib/context"
import { logAudit } from "@/lib/audit"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Lealtad con sellos. El saldo SOLO lo mueven los RPCs (el sello con  */
/*  la venta, el canje con su validación, el ajuste con rol); aquí no   */
/*  hay matemáticas de sellos, solo el pegamento con la interfaz.       */
/* ------------------------------------------------------------------ */

export interface LoyaltyCustomer {
  id: string
  phone: string
  name: string
  stamps: number
  visits: number
  rewardsRedeemed: number
  lastVisitAt: string | null
}

/** Mismo criterio que el servidor: dígitos, y si sobra (+52…) los últimos 10. */
export async function normalizeLoyaltyPhone(raw: string): Promise<string> {
  const digits = raw.replace(/\D/g, "")
  return digits.length > 10 ? digits.slice(-10) : digits
}

const phoneSchema = z.string().transform((v) => v.replace(/\D/g, "")).refine(
  (v) => v.length === 10 || (v.length > 10 && v.slice(-10).length === 10),
  "Escribe un teléfono de 10 dígitos.",
)

/** Búsqueda en caja: lectura vía RLS (solo el negocio activo). */
export async function lookupLoyaltyCustomer(
  rawPhone: string,
): Promise<ActionResult<{ customer: LoyaltyCustomer | null }>> {
  const { error: authError } = await requireContext()
  if (authError) return { error: authError }

  const parsed = phoneSchema.safeParse(rawPhone)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Teléfono inválido." }
  const phone = parsed.data.slice(-10)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("loyalty_customers")
    .select("id, phone, name, stamps, visits, rewards_redeemed, last_visit_at")
    .eq("phone", phone)
    .maybeSingle()
  if (error) return { error: error.message }

  return {
    success: true,
    customer: data
      ? {
          id: data.id,
          phone: data.phone,
          name: data.name,
          stamps: data.stamps,
          visits: data.visits,
          rewardsRedeemed: data.rewards_redeemed,
          lastVisitAt: data.last_visit_at,
        }
      : null,
  }
}

/** Alta (o re-encuentro) del cliente; el RPC valida módulo y teléfono. */
export async function registerLoyaltyCustomer(
  rawPhone: string,
  name: string,
): Promise<ActionResult<{ customer: LoyaltyCustomer }>> {
  const { error: authError } = await requireContext()
  if (authError) return { error: authError }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("loyalty_find_or_create", {
    p_phone: String(rawPhone ?? "").slice(0, 30),
    p_name: String(name ?? "").slice(0, 60),
  })
  if (error) return { error: error.message }

  const c = data as {
    id: string
    phone: string
    name: string
    stamps: number
    visits: number
    rewards_redeemed: number
    last_visit_at: string | null
  }
  return {
    success: true,
    customer: {
      id: c.id,
      phone: c.phone,
      name: c.name,
      stamps: c.stamps,
      visits: c.visits,
      rewardsRedeemed: c.rewards_redeemed,
      lastVisitAt: c.last_visit_at,
    },
  }
}

const adjustSchema = z.object({
  customerId: z.string().uuid(),
  delta: z.number().int().min(-99).max(99).refine((v) => v !== 0, "El ajuste no puede ser 0."),
  reason: z.string().trim().min(3, "Indica el motivo del ajuste.").max(200),
  /** Solo para la bitácora: a quién se le ajustó. */
  label: z.string().trim().max(80).optional(),
})

/** Ajuste manual (el RPC exige dueño/administrador); queda en Actividad. */
export async function adjustLoyalty(
  input: z.infer<typeof adjustSchema>,
): Promise<ActionResult<{ stamps: number }>> {
  const { error: authError } = await requireRole(["owner", "admin"])
  if (authError) return { error: authError }

  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." }
  const { customerId, delta, reason, label } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("loyalty_adjust", {
    p_customer: customerId,
    p_delta: delta,
    p_reason: reason,
  })
  if (error) return { error: error.message }

  await logAudit("lealtad.ajuste", label || customerId, { delta, reason })
  const r = data as { stamps: number }
  return { success: true, stamps: r.stamps }
}
