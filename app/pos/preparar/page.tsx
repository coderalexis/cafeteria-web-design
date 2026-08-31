import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { getPendingOrders } from "@/app/actions/kitchen"
import { parseBusinessSettings } from "@/lib/settings"
import PrepararClient from "./preparar-client"

/**
 * «Por preparar»: la comanda en pantalla, para quien no tiene impresora.
 *
 * La primera carga viene del servidor para que la pantalla llegue con los
 * pedidos puestos; de ahí en adelante el cliente pregunta cada pocos segundos.
 */
export default async function PrepararPage() {
  const ctx = await getContext()
  if (!ctx?.business || ctx.business.status !== "active" || ctx.business.isTemplate) {
    redirect(homePathFor(ctx))
  }

  const r = await getPendingOrders()
  const settings = parseBusinessSettings(ctx.business.settings)
  return (
    <PrepararClient
      inicial={r.success ? r.orders : []}
      pollSeconds={settings.kitchenPollSeconds}
      pollHiddenSeconds={settings.kitchenPollHiddenSeconds}
    />
  )
}
