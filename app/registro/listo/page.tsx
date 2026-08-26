import Link from "next/link"
import { redirect } from "next/navigation"
import { Coffee, TriangleAlert } from "lucide-react"
import { finishRegistration } from "@/app/actions/signup"

/** Con el correo ya confirmado y sesión abierta, aquí se arma la cafetería. */
export const dynamic = "force-dynamic"

export default async function RegistroListoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const estado = Array.isArray(raw.estado) ? raw.estado[0] : raw.estado

  if (estado === "invalido") {
    return (
      <Aviso
        titulo="El enlace ya no sirve"
        texto="Los enlaces de confirmación caducan, y solo funcionan en el navegador donde te registraste. Inténtalo de nuevo desde este dispositivo."
      />
    )
  }

  const result = await finishRegistration()
  if (result.success) redirect(result.redirectTo)

  return <Aviso titulo="No pudimos terminar tu registro" texto={result.error} />
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
          <TriangleAlert className="h-7 w-7 text-amber-700" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-stone-800">{titulo}</h1>
        <p className="mt-2 text-stone-600">{texto}</p>
        <Link
          href="/registro"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 font-semibold text-white hover:bg-amber-800"
        >
          <Coffee className="h-4 w-4" />
          Volver a registrarme
        </Link>
      </div>
    </div>
  )
}
