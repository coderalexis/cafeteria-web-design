/**
 * Forma del contexto de sesión que devuelve el RPC `my_context()`.
 * Compartida entre el middleware (edge), los server components y el cliente
 * (vía BusinessProvider), por eso no importa nada de servidor.
 */

export type BusinessRole = "owner" | "admin" | "cajero"
export type BusinessStatus = "active" | "suspended"

export interface BusinessInfo {
  id: string
  name: string
  slug: string
  timezone: string
  currency: string
  locale: string
  status: BusinessStatus
  isTemplate: boolean
  address: string | null
  phone: string | null
  receiptHeader: string | null
  receiptFooter: string | null
  /** `businesses.settings` crudo; parsear con `parseBusinessSettings`. */
  settings: unknown
}

export interface Membership {
  id: string
  name: string
  slug: string
  role: BusinessRole
  status: BusinessStatus
  isTemplate: boolean
}

export interface AppContext {
  userId: string
  fullName: string
  isPlatformAdmin: boolean
  /** Negocio activo (null si el usuario no tiene ninguno o perdió la membresía). */
  business: BusinessInfo | null
  /** Rol dentro del negocio activo. */
  role: BusinessRole | null
  memberships: Membership[]
}

export const ROLE_LABELS: Record<BusinessRole, string> = {
  owner: "Dueño",
  admin: "Administrador",
  cajero: "Cajero",
}

export function isManager(role: BusinessRole | null | undefined): boolean {
  return role === "owner" || role === "admin"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function asRole(v: unknown): BusinessRole | null {
  return v === "owner" || v === "admin" || v === "cajero" ? v : null
}

function asStatus(v: unknown): BusinessStatus {
  return v === "suspended" ? "suspended" : "active"
}

function parseBusiness(v: unknown): BusinessInfo | null {
  if (!v || typeof v !== "object") return null
  const b = v as Record<string, unknown>
  if (typeof b.id !== "string") return null
  return {
    id: b.id,
    name: str(b.name),
    slug: str(b.slug),
    timezone: str(b.timezone) || "America/Mexico_City",
    currency: str(b.currency) || "MXN",
    locale: str(b.locale) || "es-MX",
    status: asStatus(b.status),
    isTemplate: b.is_template === true,
    address: strOrNull(b.address),
    phone: strOrNull(b.phone),
    receiptHeader: strOrNull(b.receipt_header),
    receiptFooter: strOrNull(b.receipt_footer),
    settings: b.settings ?? {},
  }
}

/** Convierte el JSON crudo de `my_context()` en un `AppContext`; null si no hay sesión. */
export function parseContext(json: unknown): AppContext | null {
  if (!json || typeof json !== "object") return null
  const j = json as Record<string, unknown>
  if (typeof j.user_id !== "string") return null

  const memberships: Membership[] = Array.isArray(j.memberships)
    ? j.memberships
        .map((m): Membership | null => {
          if (!m || typeof m !== "object") return null
          const r = m as Record<string, unknown>
          const role = asRole(r.role)
          if (typeof r.id !== "string" || !role) return null
          return {
            id: r.id,
            name: str(r.name),
            slug: str(r.slug),
            role,
            status: asStatus(r.status),
            isTemplate: r.is_template === true,
          }
        })
        .filter((m): m is Membership => m !== null)
    : []

  return {
    userId: j.user_id,
    fullName: str(j.full_name),
    isPlatformAdmin: j.is_platform_admin === true,
    business: parseBusiness(j.business),
    role: asRole(j.role),
    memberships,
  }
}

/** A dónde debe caer un usuario según su contexto (login, "/", selector). */
/**
 * A dónde llega alguien al ENTRAR (login, "/" o volver desde Mi cuenta).
 *
 * El operador de la plataforma vive en /super aunque tenga cafeterías propias:
 * su trabajo es administrar las de los demás, no vender café. Es distinto de
 * homePathFor, que responde "el hogar del negocio ACTIVO" y por eso sigue
 * usándose al cambiar de cafetería o al salir de /super.
 */
export function landingPathFor(ctx: AppContext | null): string {
  if (ctx?.isPlatformAdmin) return "/super"
  return homePathFor(ctx)
}

export function homePathFor(ctx: AppContext | null): string {
  if (!ctx) return "/login"
  if (!ctx.business) {
    return ctx.memberships.length === 0 && ctx.isPlatformAdmin ? "/super" : "/seleccionar-negocio"
  }
  if (ctx.business.status === "suspended") return "/suspendido"
  if (ctx.business.isTemplate) return "/admin"
  return isManager(ctx.role) ? "/admin" : "/pos"
}
