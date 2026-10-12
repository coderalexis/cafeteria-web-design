import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { VOZ_MODELO, vozHabilitada } from "@/lib/voz"
import { VozClient } from "./voz-client"

/**
 * Pedido por voz en el mostrador (prototipo, opción A).
 *
 * Un celular o tablet junto a la caja: el cliente toca, habla con el cajero
 * virtual y su pedido llega a la bandeja de cuentas abiertas como «Nombre
 * (voz)», donde la cajera lo revisa, lo prepara y lo cobra como cualquier
 * otro. La voz nunca cobra ni pone precios: solo arma el carrito.
 *
 * El menú NO se carga aquí sino al iniciar cada conversación
 * (`iniciarSesionVoz`): así el bot siempre habla con el menú del momento y la
 * pantalla traduce sus códigos con ese mismo menú.
 */
export default async function VozPage() {
  const ctx = await getContext()
  if (!ctx?.business || ctx.business.status !== "active" || ctx.business.isTemplate) {
    redirect(homePathFor(ctx))
  }
  return (
    <VozClient
      cafe={ctx.business.name}
      habilitada={vozHabilitada(ctx.business.slug)}
      modelo={VOZ_MODELO}
    />
  )
}
