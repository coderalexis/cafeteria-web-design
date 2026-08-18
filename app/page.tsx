import { redirect } from "next/navigation"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"

export default async function HomePage() {
  const ctx = await getContext()
  redirect(homePathFor(ctx))
}
