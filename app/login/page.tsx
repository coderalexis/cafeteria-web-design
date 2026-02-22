import Link from "next/link"
import { login } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Cafetería POS · Login</h1>
      <form action={login} className="space-y-3 rounded-lg border p-4">
        <Input name="email" type="email" placeholder="correo@cafeteria.com" required />
        <Input name="password" type="password" placeholder="Contraseña" required />
        <Button className="w-full" type="submit">
          Iniciar sesión
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Si no tienes usuario, créalo desde Supabase Auth y asigna rol en <code>profiles</code>.
      </p>
      <Link className="text-sm underline" href="/">
        Volver
      </Link>
    </main>
  )
}
