import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import NegocioClient from "./negocio-client"

export const dynamic = "force-dynamic"

export default async function NegocioPage() {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  return <NegocioClient business={ctx.business} />
}
