import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { dateStringInTz, daysBetween, parseDateString, presetRange } from "@/lib/dates"
import AnalisisClient from "./analisis-client"
import type { SalesInsights } from "./types"

export const dynamic = "force-dynamic"

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  const tz = ctx.business.timezone
  const today = dateStringInTz(tz)

  const raw = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const def = presetRange("30dias", today)
  let from = parseDateString(first(raw.from)) ?? def.from
  let to = parseDateString(first(raw.to)) ?? (parseDateString(first(raw.from)) ? from : def.to)
  if (to < from) [from, to] = [to, from]
  if (daysBetween(from, to) > 366) from = to

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("sales_insights", { p_from: from, p_to: to })

  return (
    <AnalisisClient
      insights={(data as unknown as SalesInsights | null) ?? null}
      error={error?.message ?? null}
      from={from}
      to={to}
      today={today}
      timezone={tz}
    />
  )
}
