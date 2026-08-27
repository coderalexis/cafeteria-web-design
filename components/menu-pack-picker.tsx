"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Check, ChevronDown, Loader2, Sparkles } from "lucide-react"
import { installFullTemplate, installMenuPacks } from "@/app/actions/menu-packs"
import { MENU_PACKS, packSummary } from "@/lib/menu-packs"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"

/**
 * Selector de paquetes de menú.
 *
 * Con `menuEmpty` es la pantalla de arranque (nadie llega al POS con la carta
 * vacía); si ya hay productos, es «agregar más» y desaparece la opción de
 * copiar el menú de ejemplo, que solo funciona sobre una carta vacía.
 */
export function MenuPackPicker({ menuEmpty, onDone }: { menuEmpty: boolean; onDone?: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [elegidos, setElegidos] = useState<string[]>(menuEmpty ? ["espresso"] : [])
  const [abierto, setAbierto] = useState<string | null>(null)

  const total = elegidos.reduce((n, k) => {
    const pack = MENU_PACKS.find((p) => p.key === k)
    return n + (pack ? packSummary(pack).products : 0)
  }, 0)

  function alternar(key: string) {
    setElegidos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function instalar() {
    startTransition(async () => {
      const result = await installMenuPacks(elegidos)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const { productos, grupos } = result.installed
      toast.success(
        productos > 0
          ? `Listo: ${productos} ${productos === 1 ? "producto agregado" : "productos agregados"}.`
          : grupos > 0
            ? "Personalizaciones agregadas."
            : "Ya tenías todo eso en tu carta.",
      )
      setElegidos([])
      onDone?.()
      router.refresh()
    })
  }

  function copiarEjemplo() {
    startTransition(async () => {
      const result = await installFullTemplate()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Se copió el menú de ejemplo: ${result.productos} productos.`)
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {MENU_PACKS.map((pack) => {
          const { products, min, max } = packSummary(pack)
          const activo = elegidos.includes(pack.key)
          const esExtras = pack.categories.length === 0
          return (
            <div
              key={pack.key}
              className={`rounded-xl border p-4 transition-colors ${
                activo ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-200" : "border-stone-200 bg-white hover:border-amber-200"
              }`}
            >
              <button type="button" onClick={() => alternar(pack.key)} className="flex w-full items-start gap-3 text-left">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    activo ? "border-amber-600 bg-amber-600" : "border-stone-300 bg-white"
                  }`}
                >
                  {activo && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-stone-800">
                    <span aria-hidden>{pack.emoji}</span>
                    {pack.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-stone-500">{pack.hint}</span>
                  <span className="mt-1.5 block text-xs text-stone-400">
                    {esExtras
                      ? `${pack.modifierGroups?.length ?? 0} grupos de opciones`
                      : `${products} productos · ${formatCurrency(min)} a ${formatCurrency(max)}`}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAbierto(abierto === pack.key ? null : pack.key)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto === pack.key ? "rotate-180" : ""}`} />
                {abierto === pack.key ? "Ocultar" : "Ver qué trae"}
              </button>
              {abierto === pack.key && (
                <p className="mt-2 text-xs leading-relaxed text-stone-500">
                  {esExtras
                    ? pack.modifierGroups?.map((g) => `${g.name}: ${g.options.map((o) => o.name).join(", ")}`).join(" · ")
                    : pack.categories.flatMap((c) => c.products.map((p) => p.name)).join(" · ")}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-stone-50/95 py-3 backdrop-blur">
        <Button
          type="button"
          onClick={instalar}
          disabled={isPending || elegidos.length === 0}
          className="gap-2 bg-amber-700 text-white hover:bg-amber-800"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {elegidos.length === 0
            ? "Elige lo que vendes"
            : `Agregar ${elegidos.length} ${elegidos.length === 1 ? "paquete" : "paquetes"}${total > 0 ? ` (${total} productos)` : ""}`}
        </Button>
        <p className="text-xs text-stone-500">Todo es editable después: precios, nombres y qué se queda.</p>
      </div>

      {menuEmpty && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <p className="font-medium text-stone-700">¿Prefieres empezar de otra forma?</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-stone-600">
            <button
              type="button"
              onClick={copiarEjemplo}
              disabled={isPending}
              className="text-amber-700 underline underline-offset-2 hover:text-amber-800 disabled:opacity-50"
            >
              Copiar el menú de ejemplo completo
            </button>
            <span className="text-stone-300">·</span>
            <Link href="/admin/categorias" className="text-amber-700 underline underline-offset-2 hover:text-amber-800">
              Crear mi carta desde cero
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
