/**
 * Reglas compartidas de cuentas: usuarios de café (correo sintético por
 * negocio), contraseñas y validaciones. Sin dependencias de servidor.
 */

/** Dominio de los correos sintéticos de las cuentas de café: `usuario@slug.<dominio>`. */
export const SYNTHETIC_EMAIL_DOMAIN =
  process.env.SYNTHETIC_EMAIL_DOMAIN?.trim().toLowerCase() || "cafecitojaral.com"

/** Dominios de cuentas sintéticas creadas antes del modelo multi-cafetería. */
const LEGACY_SYNTHETIC_DOMAINS = ["cafecito.pos", "cafecitojaral.com"]

// Solo minúsculas/números/punto/guiones: el username forma la parte local
// del email sintético, y así también evita enumeración por variantes.
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

// Etiqueta DNS válida (misma regla que el CHECK de businesses.slug).
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// Debe coincidir con la política de Supabase Auth (Sign In / Providers → Email):
// mínimo 8 caracteres, al menos una letra y un dígito. Se valida aquí para
// que el error salga en español desde el formulario y no desde Supabase.
export const PASSWORD_MIN_LENGTH = 8

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe incluir al menos una letra y un número."
  }
  return null
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[\s_]+/g, "-")
}

/** Correo sintético de una cuenta de café (login por usuario + café). */
export function syntheticEmail(username: string, businessSlug: string): string {
  return `${normalizeUsername(username)}@${normalizeSlug(businessSlug)}.${SYNTHETIC_EMAIL_DOMAIN}`
}

/**
 * ¿Es una cuenta creada por el sistema (sin correo real)? Solo a estas se les
 * puede restablecer la contraseña desde Equipo; las cuentas con correo real
 * la cambian ellas mismas en /cuenta.
 */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = email.toLowerCase().split("@")[1] ?? ""
  return (
    LEGACY_SYNTHETIC_DOMAINS.includes(domain) ||
    domain === SYNTHETIC_EMAIL_DOMAIN ||
    domain.endsWith(`.${SYNTHETIC_EMAIL_DOMAIN}`)
  )
}

/** Contraseña temporal legible (cumple la política: letras + dígitos, 12 chars). */
export function generateTempPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
  const digits = "23456789"
  const pick = (chars: string, n: number) => {
    const out: string[] = []
    const buf = new Uint32Array(n)
    crypto.getRandomValues(buf)
    for (let i = 0; i < n; i++) out.push(chars[buf[i] % chars.length])
    return out
  }
  const chars = [...pick(letters, 8), ...pick(digits, 4)]
  // mezcla (Fisher–Yates con crypto)
  const rnd = new Uint32Array(chars.length)
  crypto.getRandomValues(rnd)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}
