import { createClient } from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"

type RequireAdminResult =
  | { user: User; error: null }
  | { user: null; error: string }

/**
 * Verifica dentro de la server action que quien llama sea admin.
 * El middleware solo protege navegaciones de página; las actions
 * deben re-autorizar por su cuenta.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, error: "Sesión inválida." }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "admin") {
    return { user: null, error: "Solo un administrador puede realizar esta acción." }
  }

  return { user, error: null }
}
