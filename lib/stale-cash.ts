import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { autoCloseReason, sessionState } from "@/lib/cash-session"
import { parseBusinessSettings } from "@/lib/settings"

/**
 * Barrido de cajas olvidadas.
 *
 * Corre en dos momentos, a propósito:
 *   · Al abrir el POS (`app/pos/page.tsx`), que es cuando de verdad importa:
 *     el turno nuevo encuentra la caja limpia y puede registrar su fondo.
 *   · En el cron diario, como red para las cafeterías donde nadie abrió el POS.
 *
 * El límite lo decide `lib/cash-session.ts` con la zona horaria y el horario
 * del negocio; aquí solo se junta la información y se llama al RPC, que
 * revalida antes de escribir.
 */

export interface StaleCloseResult {
  slug: string
  sessionId: string
  hoursOpen: number
  expectedCash: number | null
}

/** Cierra la caja de UN negocio si ya venció. Devuelve null si no había nada. */
export async function closeStaleSessionFor(businessId: string): Promise<StaleCloseResult | null> {
  const admin = createAdminClient()

  const { data: biz } = await admin
    .from("businesses")
    .select("id, slug, timezone, settings")
    .eq("id", businessId)
    .maybeSingle()
  if (!biz) return null

  const { data: session } = await admin
    .from("cash_sessions")
    .select("id, opened_at")
    .eq("business_id", businessId)
    .eq("status", "abierta")
    .maybeSingle()
  if (!session) return null

  const settings = parseBusinessSettings(biz.settings)
  const estado = sessionState(new Date(session.opened_at), biz.timezone, settings.closingTime)
  if (!estado.stale) return null

  const { data, error } = await admin.rpc("force_close_cash_session", {
    p_session_id: session.id,
    p_deadline: estado.deadline.toISOString(),
    p_reason: autoCloseReason(estado.hoursOpen, settings.closingTime),
  })
  // Si otro camino la cerró primero, el RPC protesta y no pasa nada malo.
  if (error) return null

  const r = data as { expected_cash: number | null }
  return {
    slug: biz.slug,
    sessionId: session.id,
    hoursOpen: estado.hoursOpen,
    expectedCash: r?.expected_cash ?? null,
  }
}

/** Barrido de todas las cafeterías activas (cron diario). */
export async function closeStaleSessions(): Promise<StaleCloseResult[]> {
  const admin = createAdminClient()
  const { data: sessions } = await admin
    .from("cash_sessions")
    .select("business_id")
    .eq("status", "abierta")

  const cerradas: StaleCloseResult[] = []
  for (const s of sessions ?? []) {
    const result = await closeStaleSessionFor(s.business_id)
    if (result) cerradas.push(result)
  }
  return cerradas
}
