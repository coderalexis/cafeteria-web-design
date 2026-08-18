import { getPlatformOverview } from "@/app/actions/super"
import { getContext } from "@/lib/context"
import SuperClient from "./super-client"

export const dynamic = "force-dynamic"

export default async function SuperPage() {
  const [ctx, overview] = await Promise.all([getContext(), getPlatformOverview()])
  const businesses = overview.success ? overview.businesses : []
  const memberOf = new Set((ctx?.memberships ?? []).map((m) => m.id))

  return (
    <SuperClient
      businesses={businesses}
      loadError={overview.success ? null : overview.error}
      memberOf={[...memberOf]}
    />
  )
}
