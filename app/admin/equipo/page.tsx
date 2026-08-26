import { createClient } from "@/lib/supabase/server"
import { getMemberDirectory } from "@/lib/team"
import { getMemberEmails } from "@/app/actions/team"
import EquipoClient, { type TeamMember } from "./equipo-client"

export const dynamic = "force-dynamic"

export default async function EquipoPage() {
  // Cliente de sesión: el RLS limita al negocio activo (miembros + perfiles).
  const supabase = await createClient()

  const [members, { data: ticketRows }] = await Promise.all([
    getMemberDirectory(supabase),
    supabase.from("tickets").select("cashier_id"),
  ])

  const countMap: Record<string, number> = {}
  for (const t of ticketRows ?? []) {
    countMap[t.cashier_id] = (countMap[t.cashier_id] || 0) + 1
  }

  // El correo vive en auth.users: hace falta la service role (la action valida el rol).
  const emailResult = await getMemberEmails(members.map((m) => m.id))
  const emails = emailResult.success ? emailResult.emails : {}

  const serialized: TeamMember[] = members.map((m) => ({
    id: m.id,
    fullName: m.full_name || "",
    username: m.username,
    email: emails[m.id] ?? null,
    role: m.role,
    isActive: m.is_active,
    createdAt: m.created_at,
    ticketCount: countMap[m.id] || 0,
  }))

  return <EquipoClient members={serialized} />
}
