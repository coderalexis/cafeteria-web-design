import "server-only"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import {
  parseContext,
  type AppContext,
  type BusinessInfo,
  type BusinessRole,
} from "./context-shape"

/**
 * Contexto de la sesión actual (usuario + negocio activo + rol + membresías),
 * resuelto una sola vez por request gracias a `cache`.
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.rpc("my_context")
  return parseContext(data)
})

/** Contexto con negocio activo garantizado. */
export type ActiveContext = AppContext & { business: BusinessInfo; role: BusinessRole }

type ContextResult =
  | { ctx: ActiveContext; error: null }
  | { ctx: null; error: string }

const NO_PERMISSION = "No tienes permiso para realizar esta acción."

/** Exige sesión + negocio activo (no suspendido) + membresía. */
export async function requireContext(): Promise<ContextResult> {
  const ctx = await getContext()
  if (!ctx) return { ctx: null, error: "Sesión inválida." }
  if (!ctx.business || !ctx.role) return { ctx: null, error: "No tienes un negocio activo." }
  if (ctx.business.status !== "active") return { ctx: null, error: "Este negocio está suspendido." }
  return { ctx: ctx as ActiveContext, error: null }
}

/** Exige además uno de los roles indicados dentro del negocio activo. */
export async function requireRole(roles: BusinessRole[]): Promise<ContextResult> {
  const result = await requireContext()
  if (result.error !== null) return result
  if (!roles.includes(result.ctx.role)) return { ctx: null, error: NO_PERMISSION }
  return result
}

/**
 * Guardia contra el cambio de negocio en otra pestaña: la UI manda el negocio
 * con el que cree estar operando y aquí se compara con el activo real.
 * Devuelve el mensaje de error o null si todo coincide (o no se mandó).
 */
export async function checkExpectedBusiness(expectedBusinessId?: string | null): Promise<string | null> {
  if (!expectedBusinessId) return null
  const result = await requireContext()
  if (result.error !== null) return result.error
  if (result.ctx.business.id !== expectedBusinessId) {
    return "Cambiaste de cafetería en otra pestaña. Recarga la página para continuar."
  }
  return null
}

/** Exige ser operador de la plataforma (`profiles.is_platform_admin`). */
export async function requireSuperAdmin(): Promise<
  { ctx: AppContext; error: null } | { ctx: null; error: string }
> {
  const ctx = await getContext()
  if (!ctx) return { ctx: null, error: "Sesión inválida." }
  if (!ctx.isPlatformAdmin) return { ctx: null, error: NO_PERMISSION }
  return { ctx, error: null }
}
