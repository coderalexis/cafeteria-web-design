"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Building2,
  Plus,
  Loader2,
  Copy,
  Store,
  Users,
  Receipt,
  Pause,
  Play,
  LogIn,
  LayoutTemplate,
  AlertTriangle,
} from "lucide-react"
import {
  cloneTemplateInto,
  createBusiness,
  enterBusiness,
  setBusinessStatus,
  type PlatformBusiness,
} from "@/app/actions/super"
import { MEXICO_TIMEZONES } from "@/lib/dates"
import { PRESETS } from "@/lib/presets"
import { WeeklySummaryCard } from "./weekly-card"
import { DeleteBusinessDialog } from "./delete-dialog"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Props {
  businesses: PlatformBusiness[]
  loadError: string | null
  /** ids de negocios de los que el operador ya es miembro */
  memberOf: string[]
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export default function SuperClient({ businesses, loadError, memberOf }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; password: string; business: string } | null>(null)
  const memberSet = useMemo(() => new Set(memberOf), [memberOf])

  const hasTemplate = businesses.some((b) => b.is_template)
  const real = businesses.filter((b) => !b.is_template)
  const templates = businesses.filter((b) => b.is_template)

  function run(fn: () => Promise<{ error?: string; success?: boolean }>, ok: string) {
    startTransition(async () => {
      const result = await fn()
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  function handleCreate(formData: FormData) {
    const email = String(formData.get("owner_email") ?? "")
    const bizName = String(formData.get("name") ?? "")
    startTransition(async () => {
      const result = await createBusiness(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setCreateOpen(false)
      setName("")
      setSlug("")
      setSlugTouched(false)
      router.refresh()
      if (result.cloneError) {
        toast.warning(`Cafetería creada, pero no se clonó el menú: ${result.cloneError}`)
      } else {
        toast.success("Cafetería creada")
      }
      if (result.ownerCreated && result.tempPassword) {
        setCredentials({ email, password: result.tempPassword, business: bizName })
      }
    })
  }

  function fd(pairs: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(pairs)) f.set(k, v)
    return f
  }

  function BusinessCard({ b }: { b: PlatformBusiness }) {
    const suspended = b.status === "suspended"
    return (
      <Card className={suspended ? "border-red-200 bg-red-50/30" : ""}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2 truncate">
                {b.is_template ? <LayoutTemplate className="h-4 w-4 text-stone-400" /> : <Store className="h-4 w-4 text-amber-700" />}
                <span className="truncate">{b.name}</span>
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">{b.slug}</code>
                <span className="text-xs">{b.timezone}</span>
                {b.is_template && <Badge variant="secondary">plantilla</Badge>}
                {suspended && <Badge variant="destructive">suspendida</Badge>}
                {!b.has_menu && !b.is_template && (
                  <Badge variant="outline" className="border-amber-300 text-amber-800">
                    sin menú
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-stone-50 p-2">
              <p className="text-xs text-stone-500 flex items-center gap-1">
                <Users className="h-3 w-3" /> Miembros
              </p>
              <p className="font-semibold text-stone-800">{b.active_members}</p>
            </div>
            <div className="rounded-lg bg-stone-50 p-2">
              <p className="text-xs text-stone-500 flex items-center gap-1">
                <Receipt className="h-3 w-3" /> Ventas 30d
              </p>
              <p className="font-semibold text-stone-800">{b.tickets_30d}</p>
            </div>
            <div className="rounded-lg bg-stone-50 p-2">
              <p className="text-xs text-stone-500">Ingresos 30d</p>
              <p className="font-semibold text-stone-800 truncate">{formatCurrency(b.revenue_30d)}</p>
            </div>
          </div>
          <p className="text-xs text-stone-500">
            {b.owners.length > 0 ? `Dueño(s): ${b.owners.join(", ")}` : "Sin dueño activo"}
            {b.last_sale_at ? ` · última venta ${formatDateTime(b.last_sale_at, b.timezone)}` : " · sin ventas"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              className="gap-1.5"
              onClick={() =>
                startTransition(async () => {
                  const result = await enterBusiness(fd({ business_id: b.id }))
                  if (!result.success) {
                    toast.error(result.error)
                    return
                  }
                  router.push(result.redirectTo)
                  router.refresh()
                })
              }
            >
              <LogIn className="h-4 w-4" />
              {memberSet.has(b.id) ? "Entrar" : "Entrar como dueño"}
            </Button>
            {!b.is_template && !b.has_menu && hasTemplate && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                className="gap-1.5"
                onClick={() => run(() => cloneTemplateInto(fd({ business_id: b.id })), "Menú clonado de la plantilla")}
              >
                <LayoutTemplate className="h-4 w-4" />
                Clonar plantilla
              </Button>
            )}
            {!b.is_template && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                className={`gap-1.5 ${suspended ? "text-green-700 border-green-200" : "text-red-600 border-red-200"}`}
                onClick={() => {
                  if (!suspended && !window.confirm(`¿Suspender «${b.name}»? Nadie podrá operar hasta reactivarla.`)) return
                  run(
                    () => setBusinessStatus(fd({ business_id: b.id, status: suspended ? "active" : "suspended" })),
                    suspended ? "Cafetería reactivada" : "Cafetería suspendida",
                  )
                }}
              >
                {suspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {suspended ? "Reactivar" : "Suspender"}
              </Button>
            )}
            <DeleteBusinessDialog
              business={{
                id: b.id,
                name: b.name,
                slug: b.slug,
                active_members: b.active_members,
                tickets_30d: b.tickets_30d,
              }}
              onDeleted={() => router.refresh()}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-amber-700" />
            Cafeterías
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {real.length} {real.length === 1 ? "cafetería" : "cafeterías"} · {real.filter((b) => b.status === "active").length}{" "}
            activas
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-amber-700 hover:bg-amber-800 text-white gap-2">
          <Plus className="h-4 w-4" />
          Nueva cafetería
        </Button>
      </div>

      {loadError && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {loadError}
        </p>
      )}

      {real.length === 0 && !loadError && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-stone-500">
            Aún no hay cafeterías. Crea la primera con «Nueva cafetería».
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {real.map((b) => (
          <BusinessCard key={b.id} b={b} />
        ))}
      </div>

      <WeeklySummaryCard />

      {templates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Plantillas de menú</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((b) => (
              <BusinessCard key={b.id} b={b} />
            ))}
          </div>
          <p className="text-xs text-stone-400">
            Las cafeterías nuevas copian el menú de la plantilla. Para editarla, entra a ella y usa el panel de menú.
          </p>
        </div>
      )}

      {/* Crear cafetería */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nueva cafetería</SheetTitle>
            <SheetDescription>
              Se crea el negocio, su dueño (por correo) y, si quieres, se copia el menú de la plantilla.
            </SheetDescription>
          </SheetHeader>
          <form action={handleCreate} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="biz-name" className="text-sm font-medium text-stone-700">
                Nombre
              </label>
              <Input
                id="biz-name"
                name="name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }}
                placeholder="Café La Esquina"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="biz-slug" className="text-sm font-medium text-stone-700">
                Identificador (para el login de cajeros)
              </label>
              <Input
                id="biz-slug"
                name="slug"
                required
                minLength={3}
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(slugify(e.target.value.replace(/\s+/g, "-")))
                }}
                spellCheck={false}
                autoCapitalize="none"
                placeholder="cafe-la-esquina"
              />
              <p className="text-xs text-stone-400">Minúsculas, números y guiones. No se puede cambiar después.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="biz-tz" className="text-sm font-medium text-stone-700">
                Zona horaria
              </label>
              <select
                id="biz-tz"
                name="timezone"
                defaultValue="America/Mexico_City"
                className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                {MEXICO_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" name="clone_template" defaultChecked={hasTemplate} disabled={!hasTemplate} className="h-4 w-4" />
              Copiar el menú de la plantilla {hasTemplate ? "" : "(no hay plantilla)"}
            </label>

            {/* Modo de operación: preconfigura los módulos del POS */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-stone-700">¿Cómo opera?</p>
              {PRESETS.map((preset, i) => (
                <label
                  key={preset.key}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-stone-200 p-2.5 hover:border-amber-300"
                >
                  <input
                    type="radio"
                    name="preset"
                    value={preset.key}
                    defaultChecked={i === 0}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-stone-800">{preset.label}</span>
                    <span className="block text-xs text-stone-500">{preset.hint}</span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-stone-400">Todo esto se puede cambiar después en Negocio.</p>
            </div>

            <div className="rounded-lg border border-stone-200 p-3 space-y-3">
              <p className="text-sm font-medium text-stone-700">Dueño</p>
              <div className="space-y-1.5">
                <label htmlFor="owner-email" className="text-xs text-stone-500">
                  Correo
                </label>
                <Input id="owner-email" name="owner_email" type="email" required placeholder="duena@correo.com" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="owner-name" className="text-xs text-stone-500">
                  Nombre (si la cuenta es nueva)
                </label>
                <Input id="owner-name" name="owner_name" maxLength={80} placeholder="Nombre completo" />
              </div>
              <p className="text-xs text-stone-400">
                Si el correo ya tiene cuenta, solo se le da acceso como dueño. Si no, se crea con una contraseña temporal
                que verás una sola vez.
              </p>
            </div>

            <Button type="submit" disabled={isPending} className="w-full bg-amber-700 hover:bg-amber-800 text-white">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear cafetería
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Credenciales del dueño (una sola vez) */}
      <Dialog open={!!credentials} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cuenta del dueño creada</DialogTitle>
            <DialogDescription>
              Comparte estos datos. La contraseña temporal <strong>no se volverá a mostrar</strong>; podrá cambiarla en «Mi
              cuenta».
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="space-y-3">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                <p className="text-stone-500">Cafetería</p>
                <p className="font-medium text-stone-800">{credentials.business}</p>
                <p className="text-stone-500 mt-2">Correo</p>
                <p className="font-medium text-stone-800 break-all">{credentials.email}</p>
                <p className="text-stone-500 mt-2">Contraseña temporal</p>
                <p className="font-mono text-lg font-semibold tracking-wide text-stone-800">{credentials.password}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `Acceso a Cafecito POS — ${credentials.business}\nCorreo: ${credentials.email}\nContraseña temporal: ${credentials.password}`,
                    )
                    toast.success("Copiado al portapapeles")
                  } catch {
                    toast.error("No se pudo copiar; anótala manualmente.")
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar datos
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
