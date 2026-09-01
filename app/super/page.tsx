import { getPlatformOverview } from "@/app/actions/super"
import { getContext } from "@/lib/context"
import SuperClient from "./super-client"
import { ErroresPanel } from "./errores-panel"

export const dynamic = "force-dynamic"

export default async function SuperPage() {
  const [ctx, overview] = await Promise.all([getContext(), getPlatformOverview()])
  const businesses = overview.success ? overview.businesses : []
  const memberOf = new Set((ctx?.memberships ?? []).map((m) => m.id))

  return (
    <>
      {/* Los errores van ARRIBA de las cafeterías: si algo tronó, es lo
          primero que el operador tiene que ver, no lo que hay que buscar. */}
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <ErroresPanel />
      </div>
      <SuperClient
        businesses={businesses}
        loadError={overview.success ? null : overview.error}
        memberOf={[...memberOf]}
      />
    </>
  )
}
