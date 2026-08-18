"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, ChevronsUpDown, Loader2, Store } from "lucide-react"
import { switchBusiness } from "@/app/actions/business"
import { ROLE_LABELS, type Membership } from "@/lib/context-shape"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface BusinessSwitcherProps {
  memberships: Membership[]
  activeId: string | null
  /** `full` muestra el nombre del negocio activo; `compact` solo el icono. */
  variant?: "full" | "compact"
  className?: string
}

/**
 * Selector de cafetería para quien pertenece a más de una. Con una sola
 * membresía no renderiza nada.
 */
export function BusinessSwitcher({ memberships, activeId, variant = "full", className }: BusinessSwitcherProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  if (memberships.length <= 1) return null

  const active = memberships.find((m) => m.id === activeId) ?? null

  function select(id: string) {
    if (id === activeId) return
    setSwitchingTo(id)
    startTransition(async () => {
      const result = await switchBusiness(id)
      setSwitchingTo(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      router.push(result.redirectTo)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={variant === "compact" ? "icon" : "sm"}
          className={cn("gap-1.5", variant === "compact" ? "h-9 w-9" : "h-9 max-w-[220px]", className)}
          aria-label="Cambiar de cafetería"
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4 shrink-0" />}
          {variant === "full" && (
            <>
              <span className="truncate">{active?.name ?? "Elegir cafetería"}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Mis cafeterías</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => select(m.id)}
            disabled={m.status === "suspended" || isPending}
            className="flex items-center gap-2"
          >
            <span className="flex-1 min-w-0">
              <span className="block truncate font-medium">
                {m.name}
                {m.isTemplate && <span className="ml-1 text-xs text-stone-400">(plantilla)</span>}
              </span>
              <span className="block text-xs text-stone-500">
                {ROLE_LABELS[m.role]}
                {m.status === "suspended" && " · suspendida"}
              </span>
            </span>
            {switchingTo === m.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : m.id === activeId ? (
              <Check className="h-4 w-4 text-amber-700" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
