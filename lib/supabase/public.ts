import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

/**
 * Cliente para páginas PÚBLICAS, sin sesión ni cookies (hoy: el menú del QR).
 *
 * La diferencia con `createClient()` de `server.ts` no es de estilo: aquel lee
 * cookies para saber quién eres, y en Next leer cookies obliga a renderizar la
 * página en CADA visita. Eso anulaba en silencio el `revalidate` del menú
 * público —declaraba regenerarse cada minuto, pero el build lo marcaba
 * dinámico y cada escaneo del QR consultaba la base—. Sin cookies no hay nada
 * que personalizar, así que la página se puede servir ya hecha.
 *
 * Solo sirve para lo que `anon` tenga permitido (el RPC `public_menu` lo está
 * a propósito); cualquier otra cosa la seguirá bloqueando RLS.
 */
export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
