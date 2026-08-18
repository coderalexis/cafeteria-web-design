import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { BusinessRole } from "@/lib/context-shape"

export interface MemberEntry {
  /** id del usuario (profiles.id) */
  id: string
  full_name: string | null
  /** usuario de café; null para cuentas con correo real */
  username: string | null
  role: BusinessRole
  is_active: boolean
  created_at: string
}

/**
 * Directorio del negocio activo: miembros (activos e inactivos, para que las
 * ventas antiguas conserven nombre) con su perfil. Compatible con
 * `buildProfileNameMap` de lib/tickets.
 */
export async function getMemberDirectory(supabase: SupabaseClient<Database>): Promise<MemberEntry[]> {
  const { data } = await supabase
    .from("business_members")
    .select("user_id, username, role, is_active, created_at, profiles(full_name)")
    .order("created_at", { ascending: true })

  return (data ?? []).map((m) => {
    // Con embed uno-a-uno PostgREST devuelve un objeto; se tolera arreglo por si acaso.
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    return {
      id: m.user_id,
      full_name: profile?.full_name ?? null,
      username: m.username,
      role: m.role,
      is_active: m.is_active,
      created_at: m.created_at,
    }
  })
}

/** Etiqueta para mostrar de un miembro. */
export function memberLabel(m: { full_name: string | null; username: string | null }): string {
  return m.full_name || m.username || "Sin nombre"
}
