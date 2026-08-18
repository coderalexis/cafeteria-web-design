import type React from "react"
import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { BusinessProvider } from "@/components/business-provider"

export default async function POSLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  // El middleware ya filtra; esto cubre renders sin middleware (p. ej. prefetch raro).
  if (!ctx || !ctx.business || ctx.business.status !== "active" || ctx.business.isTemplate) {
    redirect(homePathFor(ctx))
  }
  return <BusinessProvider value={ctx}>{children}</BusinessProvider>
}
