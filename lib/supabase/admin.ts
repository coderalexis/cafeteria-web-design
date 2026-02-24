import { createClient } from "@supabase/supabase-js"

/**
 * Admin Supabase client using the service role key.
 * This bypasses RLS and can manage auth users.
 * ONLY use in server actions / server components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
