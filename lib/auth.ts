import { requireRole, type ActiveContext } from "@/lib/context"

type RequireAdminResult =
  | { ctx: ActiveContext; error: null }
  | { ctx: null; error: string }

/**
 * Verifica dentro de la server action que quien llama sea owner o admin del
 * negocio activo. El middleware solo protege navegaciones de página; las
 * actions deben re-autorizar por su cuenta (además del RLS).
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const result = await requireRole(["owner", "admin"])
  if (result.error) {
    const error =
      result.error === "No tienes permiso para realizar esta acción."
        ? "Solo un administrador puede realizar esta acción."
        : result.error
    return { ctx: null, error }
  }
  return result
}

export { requireSuperAdmin, requireContext, requireRole } from "@/lib/context"
