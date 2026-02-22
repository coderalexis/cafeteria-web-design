import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Bienvenido al POS</h1>
      <p>Rol actual: {profile?.role ?? "sin rol"}</p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/pos">Ir a POS</Link>
        </Button>
        {profile?.role === "admin" && (
          <Button asChild variant="secondary">
            <Link href="/admin">Ir a Admin</Link>
          </Button>
        )}
      </div>
      <form action={logout}>
        <Button type="submit" variant="outline">
          Cerrar sesión
        </Button>
      </form>
    </main>
  )
}
