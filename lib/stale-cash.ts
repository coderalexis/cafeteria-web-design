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

/** La caja que queda abierta después del barrido. */
export interface OpenSession {
  id: string
  opened_at: string
  opening_float: number
}

/** Lo que el barrido necesita del negocio; el POS ya lo trae en el contexto. */
export interface BusinessForSweep {
  id: string
  slug: string
  timezone: string
  settings: unknown
}

export interface SweepResult {
  /** La caja que se cerró sola, o null si no había nada que cerrar. */
  closed: StaleCloseResult | null
  /** La caja que sigue abierta, o null si no hay ninguna. */
  session: OpenSession | null
}

/**
 * Barre la caja vencida de un negocio y devuelve la que queda abierta.
 *
 * Devuelve la caja porque de todos modos tiene que leerla para decidir si
 * venció: pedirla otra vez desde la página era un viaje de ida y vuelta
 * regalado, y esta función corre en la ruta más caliente del sistema.
 *
 * Recibe el negocio ya leído en vez del id: quien llama —el POS— lo tiene
 * completo en el contexto de sesión, así que volver a consultarlo era otro
 * viaje de más. Leerlo con el cliente administrador es seguro porque el id
 * viene del contexto autenticado en el servidor, nunca del navegador.
 */
export async function sweepStaleSession(biz: BusinessForSweep): Promise<SweepResult> {
  const admin = createAdminClient()

  const leerAbierta = async () => {
    const { data } = await admin
      .from("cash_sessions")
      .select("id, opened_at, opening_float")
      .eq("business_id", biz.id)
      .eq("status", "abierta")
      .maybeSingle()
    return data
  }

  const session = await leerAbierta()
  if (!session) return { closed: null, session: null }

  const settings = parseBusinessSettings(biz.settings)
  const estado = sessionState(new Date(session.opened_at), biz.timezone, settings.closingTime)
  if (!estado.stale) return { closed: null, session }

  const { data, error } = await admin.rpc("force_close_cash_session", {
    p_session_id: session.id,
    p_deadline: estado.deadline.toISOString(),
    p_reason: autoCloseReason(estado.hoursOpen, settings.closingTime),
  })

  if (error) {
    // Otro camino pudo cerrarla primero (el cron, otra pestaña) y el RPC
    // protesta. No se supone el resultado: se vuelve a leer. Equivocarse aquí
    // significa enseñar una caja que ya no existe, o esconder una que sí.
    return { closed: null, session: await leerAbierta() }
  }

  const r = data as { expected_cash: number | null }
  return {
    closed: {
      slug: biz.slug,
      sessionId: session.id,
      hoursOpen: estado.hoursOpen,
      expectedCash: r?.expected_cash ?? null,
    },
    session: null,
  }
}

/** Barrido de todas las cafeterías con caja abierta (cron diario). */
export async function closeStaleSessions(): Promise<StaleCloseResult[]> {
  const admin = createAdminClient()
  // Las cajas abiertas CON su negocio en una sola consulta. Antes era una
  // consulta para la lista y dos más por cada cafetería encontrada.
  const { data: sessions } = await admin
    .from("cash_sessions")
    .select("id, businesses(id, slug, timezone, settings)")
    .eq("status", "abierta")

  const cerradas: StaleCloseResult[] = []
  for (const s of sessions ?? []) {
    const biz = s.businesses
    if (!biz) continue
    const { closed } = await sweepStaleSession(biz)
    if (closed) cerradas.push(closed)
  }
  return cerradas
}
