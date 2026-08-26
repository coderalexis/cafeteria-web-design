import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { landingPathFor } from "@/lib/context-shape"
import { Landing } from "./landing"

/**
 * La raíz sirve a dos públicos: quien ya trabaja aquí entra a lo suyo, y quien
 * llega por primera vez ve qué es esto antes de toparse con un formulario.
 */
export const metadata: Metadata = {
  title: "Cafecito POS · Punto de venta para cafeterías",
  description:
    "Cobra rápido, cuadra tu caja al cerrar y conoce el margen real de cada producto. Punto de venta para cafeterías, desde la tablet que ya tienes.",
  openGraph: {
    title: "Cafecito POS · Punto de venta para cafeterías",
    description:
      "Cobra rápido, cuadra tu caja al cerrar y conoce el margen real de cada producto.",
    type: "website",
    locale: "es_MX",
  },
}

export default async function HomePage() {
  const ctx = await getContext()
  if (ctx) redirect(landingPathFor(ctx))
  return <Landing />
}
