"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronRight, Loader2, Store } from "lucide-react"
import { switchBusiness } from "@/app/actions/business"
import { ROLE_LABELS, type Membership } from "@/lib/context-shape"

/** Lista de cafeterías del usuario para elegir con cuál trabajar. */
export function BusinessPicker({ memberships, activeId }: { memberships: Membership[]; activeId: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)

  function choose(id: string) {
    setPendingId(id)
    startTransition(async () => {
      const result = await switchBusiness(id)
      setPendingId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      router.push(result.redirectTo)
      router.refresh()
    })
  }

  return (
    <ul className="space-y-2">
      {memberships.map((m) => {
        const suspended = m.status === "suspended"
        return (
          <li key={m.id}>
            <button
              type="button"
              disabled={isPending || suspended}
              onClick={() => choose(m.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:opacity-60 disabled:hover:bg-white"
            >
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Store className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-800 truncate">
                  {m.name}
                  {m.isTemplate && <span className="ml-1 text-xs font-normal text-stone-400">(plantilla)</span>}
                </p>
                <p className="text-xs text-stone-500">
                  {ROLE_LABELS[m.role]}
                  {m.id === activeId && " · activa"}
                  {suspended && " · suspendida"}
                </p>
              </div>
              {pendingId === m.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-stone-400" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
