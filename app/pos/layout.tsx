import type React from "react"
import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { BusinessProvider } from "@/components/business-provider"
import { ArranqueRapido } from "./arranque-rapido"

export default async function POSLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  // El middleware ya filtra; esto cubre renders sin middleware (p. ej. prefetch raro).
  if (!ctx || !ctx.business || ctx.business.status !== "active" || ctx.business.isTemplate) {
    redirect(homePathFor(ctx))
  }
  return (
    <BusinessProvider value={ctx}>
      {/* Para el service worker del POS: de quién es esta página. Si la
          guardada era de otra persona u otro café, se recarga sola. */}
      <meta name="pos-identidad" content={`${ctx.business.id}:${ctx.userId}`} />
      <ArranqueRapido />
      {children}
    </BusinessProvider>
  )
}
