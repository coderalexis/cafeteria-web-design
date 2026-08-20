"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Users,
  Plus,
  Shield,
  UserCircle,
  Key,
  AlertTriangle,
  Calendar,
  Mail,
  AtSign,
  Copy,
  Loader2,
  Power,
  Trash2,
  Crown,
  LockKeyhole,
} from "lucide-react"
import {
  addMemberByEmail,
  createCashierAccount,
  removeMember,
  resetMemberPassword,
  setMemberActive,
  updateMember,
} from "@/app/actions/team"
import { adminSetMemberPin } from "@/app/actions/security"
import { useAppContext } from "@/components/business-provider"
import { ROLE_LABELS, type BusinessRole } from "@/lib/context-shape"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/* ────────────────────────────────────────────────────── Types */

export interface TeamMember {
  id: string
  fullName: string
  /** usuario de café; null si entra con correo real */
  username: string | null
  role: BusinessRole
  isActive: boolean
  createdAt: string
  ticketCount: number
}

interface Props {
  members: TeamMember[]
}

const ROLE_STYLES: Record<BusinessRole, string> = {
  owner: "bg-purple-50 text-purple-700 border-purple-200",
  admin: "bg-indigo-50 text-indigo-700 border-indigo-200",
  cajero: "bg-amber-50 text-amber-700 border-amber-200",
}

const AVATAR_STYLES: Record<BusinessRole, string> = {
  owner: "bg-purple-100 text-purple-700",
  admin: "bg-indigo-100 text-indigo-700",
  cajero: "bg-amber-100 text-amber-700",
}

function RoleSelect({
  name,
  defaultValue,
  callerRole,
  disabled,
  id,
}: {
  name: string
  defaultValue: BusinessRole
  callerRole: BusinessRole
  disabled?: boolean
  id: string
}) {
  const options: BusinessRole[] = callerRole === "owner" ? ["cajero", "admin", "owner"] : ["cajero", "admin"]
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm disabled:opacity-60"
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  )
}

/* ────────────────────────────────────────────────────── Component */

export default function EquipoClient({ members }: Props) {
  const router = useRouter()
  const ctx = useAppContext()
  const callerRole: BusinessRole = ctx.role ?? "cajero"
  const callerIsOwner = callerRole === "owner"

  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createMode, setCreateMode] = useState<"usuario" | "correo">("usuario")
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const active = members.filter((m) => m.isActive)
  const owners = active.filter((m) => m.role === "owner").length
  const admins = active.filter((m) => m.role === "admin").length
  const cajeros = active.filter((m) => m.role === "cajero").length

  function openMember(m: TeamMember) {
    setSelected(m)
    setIsCreating(false)
    setSheetOpen(true)
  }

  function openCreate() {
    setSelected(null)
    setIsCreating(true)
    setSheetOpen(true)
  }

  function run(fn: () => Promise<{ error?: string; success?: boolean }>, okMessage: string, close = true) {
    startTransition(async () => {
      const result = await fn()
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(okMessage)
      if (close) setSheetOpen(false)
      router.refresh()
    })
  }

  function handleCreateCafe(formData: FormData) {
    run(() => createCashierAccount(formData), "Cuenta creada")
  }

  function handleAddByEmail(formData: FormData) {
    const email = String(formData.get("email") ?? "")
    startTransition(async () => {
      const result = await addMemberByEmail(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSheetOpen(false)
      router.refresh()
      if (result.created && result.tempPassword) {
        setTempPassword({ email, password: result.tempPassword })
      } else {
        toast.success("Persona agregada al equipo")
      }
    })
  }

  function handleUpdate(formData: FormData) {
    run(() => updateMember(formData), "Miembro actualizado")
  }

  function handleResetPassword(formData: FormData) {
    run(() => resetMemberPassword(formData), "Contraseña restablecida", false)
  }

  function handleSetPin(formData: FormData) {
    run(() => adminSetMemberPin(formData), "PIN asignado", false)
  }

  function handleClearPin() {
    if (!selected) return
    const f = new FormData()
    f.set("user_id", selected.id)
    f.set("clear", "true")
    f.set("member_name", selected.fullName || selected.username || "")
    run(() => adminSetMemberPin(f), "PIN quitado", false)
  }

  function handleToggleActive() {
    if (!selected) return
    const fd = new FormData()
    fd.set("user_id", selected.id)
    fd.set("active", String(!selected.isActive))
    run(() => setMemberActive(fd), selected.isActive ? "Cuenta desactivada" : "Cuenta reactivada")
  }

  function handleRemove() {
    if (!selected) return
    const confirmed = window.confirm(
      `¿Quitar a "${selected.fullName || selected.username}" del equipo? ${
        selected.username ? "Su cuenta de café se eliminará si no pertenece a otra cafetería." : ""
      }`,
    )
    if (!confirmed) return
    run(() => removeMember(fd(selected.id)), "Miembro quitado del equipo")
  }

  function fd(userId: string) {
    const f = new FormData()
    f.set("user_id", userId)
    return f
  }

  const selectedIsSelf = selected?.id === ctx.userId
  const selectedIsOwnerLocked = selected?.role === "owner" && !callerIsOwner

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600" />
            Equipo
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {active.length} activos · {owners} {owners === 1 ? "dueño" : "dueños"} · {admins} admin ·{" "}
            {cajeros} cajeros
          </p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personas con acceso a «{ctx.business?.name}»</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm text-stone-400">Aún no hay miembros</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMember(m)}
                  className={`w-full flex items-center gap-4 px-4 md:px-6 py-4 hover:bg-amber-50/50 transition-colors text-left ${
                    m.isActive ? "" : "opacity-60"
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${AVATAR_STYLES[m.role]}`}
                  >
                    {m.role === "owner" ? <Crown className="h-5 w-5" /> : <UserCircle className="h-5 w-5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">
                      {m.fullName || "Sin nombre"}
                      {m.id === ctx.userId && <span className="ml-1.5 text-xs font-normal text-stone-400">(tú)</span>}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-1 truncate">
                      {m.username ? (
                        <>
                          <AtSign className="h-3 w-3" />
                          {m.username} · cuenta de café
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3" />
                          entra con correo
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!m.isActive && (
                      <Badge variant="outline" className="text-xs bg-stone-50 text-stone-500 border-stone-200">
                        Inactivo
                      </Badge>
                    )}
                    <Badge variant="outline" className={`text-xs ${ROLE_STYLES[m.role]}`}>
                      <Shield className="h-3 w-3 mr-1" />
                      {ROLE_LABELS[m.role]}
                    </Badge>
                  </div>

                  <div className="text-right shrink-0 w-14 hidden sm:block">
                    <p className="text-sm font-medium text-stone-600">{m.ticketCount}</p>
                    <p className="text-xs text-stone-400">ventas</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet: crear / detalle */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {isCreating ? (
            <>
              <SheetHeader>
                <SheetTitle>Agregar al equipo</SheetTitle>
                <SheetDescription>
                  Los cajeros entran con usuario + café; los administradores pueden entrar con su correo.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-stone-100 p-1">
                <button
                  type="button"
                  onClick={() => setCreateMode("usuario")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    createMode === "usuario" ? "bg-white shadow-sm text-stone-800" : "text-stone-500"
                  }`}
                >
                  Usuario de café
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("correo")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    createMode === "correo" ? "bg-white shadow-sm text-stone-800" : "text-stone-500"
                  }`}
                >
                  Por correo
                </button>
              </div>

              {createMode === "usuario" ? (
                <form action={handleCreateCafe} className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="new-username" className="text-sm font-medium text-stone-700">
                      Usuario
                    </label>
                    <Input
                      id="new-username"
                      name="username"
                      placeholder="p. ej. maria"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      minLength={3}
                    />
                    <p className="text-xs text-stone-400">
                      Entrará con este usuario y el café «{ctx.business?.slug}». Minúsculas, números, punto y guiones.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-fullname" className="text-sm font-medium text-stone-700">
                      Nombre completo
                    </label>
                    <Input id="new-fullname" name="full_name" placeholder="María López" required maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-password" className="text-sm font-medium text-stone-700">
                      Contraseña
                    </label>
                    <Input
                      id="new-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                    <p className="text-xs text-stone-400">Mínimo 8 caracteres, con letras y números.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="new-role" className="text-sm font-medium text-stone-700">
                      Rol
                    </label>
                    <RoleSelect id="new-role" name="role" defaultValue="cajero" callerRole={callerRole} />
                  </div>
                  <Button type="submit" disabled={isPending} className="w-full bg-indigo-600 hover:bg-indigo-700">
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Crear cuenta
                  </Button>
                </form>
              ) : (
                <form action={handleAddByEmail} className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="add-email" className="text-sm font-medium text-stone-700">
                      Correo
                    </label>
                    <Input id="add-email" name="email" type="email" placeholder="persona@correo.com" required />
                    <p className="text-xs text-stone-400">
                      Si ya tiene cuenta en el sistema, solo se le da acceso. Si no, se crea con una contraseña
                      temporal que verás una sola vez.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="add-fullname" className="text-sm font-medium text-stone-700">
                      Nombre (si es cuenta nueva)
                    </label>
                    <Input id="add-fullname" name="full_name" placeholder="Nombre completo" maxLength={80} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="add-role" className="text-sm font-medium text-stone-700">
                      Rol
                    </label>
                    <RoleSelect id="add-role" name="role" defaultValue="admin" callerRole={callerRole} />
                  </div>
                  <Button type="submit" disabled={isPending} className="w-full bg-indigo-600 hover:bg-indigo-700">
                    {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Dar acceso
                  </Button>
                </form>
              )}
            </>
          ) : selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center ${AVATAR_STYLES[selected.role]}`}
                  >
                    {selected.role === "owner" ? <Crown className="h-4 w-4" /> : <UserCircle className="h-4 w-4" />}
                  </div>
                  <span className="truncate">{selected.fullName || selected.username || "Miembro"}</span>
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    {selected.username ? <AtSign className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                    {selected.username ? `${selected.username} · cuenta de café` : "entra con correo"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    desde {new Date(selected.createdAt).toLocaleDateString("es-MX")}
                  </span>
                  <span>{selected.ticketCount} ventas</span>
                </SheetDescription>
              </SheetHeader>

              {/* Editar */}
              <form action={handleUpdate} className="mt-5 space-y-4">
                <input type="hidden" name="user_id" value={selected.id} />
                <div className="space-y-1.5">
                  <label htmlFor="edit-fullname" className="text-sm font-medium text-stone-700">
                    Nombre completo
                  </label>
                  <Input
                    id="edit-fullname"
                    name="full_name"
                    defaultValue={selected.fullName}
                    required
                    maxLength={80}
                    key={selected.id + "-name"}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="edit-role" className="text-sm font-medium text-stone-700">
                    Rol
                  </label>
                  <RoleSelect
                    id="edit-role"
                    name="role"
                    defaultValue={selected.role}
                    callerRole={callerRole}
                    disabled={selectedIsOwnerLocked || selectedIsSelf}
                    key={selected.id + "-role"}
                  />
                  {selectedIsOwnerLocked && (
                    <p className="text-xs text-stone-400">Solo el dueño puede cambiar el rol de otro dueño.</p>
                  )}
                  {selectedIsSelf && <p className="text-xs text-stone-400">No puedes cambiar tu propio rol.</p>}
                </div>
                <Button type="submit" disabled={isPending} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar cambios
                </Button>
              </form>

              {/* Contraseña (solo cuentas de café) */}
              {selected.username && !selectedIsOwnerLocked && (
                <>
                  <Separator className="my-6" />
                  <form action={handleResetPassword} className="space-y-3">
                    <input type="hidden" name="user_id" value={selected.id} />
                    <p className="text-sm font-medium text-stone-700 flex items-center gap-2">
                      <Key className="h-4 w-4 text-stone-400" />
                      Restablecer contraseña
                    </p>
                    <Input
                      name="new_password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Nueva contraseña"
                      required
                      minLength={8}
                      key={selected.id + "-pw"}
                    />
                    <Button type="submit" variant="outline" disabled={isPending} className="w-full">
                      Cambiar contraseña
                    </Button>
                  </form>
                </>
              )}
              {!selected.username && (
                <p className="mt-4 text-xs text-stone-400">
                  Esta persona entra con su correo y cambia su contraseña desde «Mi cuenta».
                </p>
              )}

              {/* PIN de caja (desbloqueo del POS) */}
              {!selectedIsOwnerLocked && (
                <>
                  <Separator className="my-6" />
                  <form action={handleSetPin} className="space-y-3">
                    <input type="hidden" name="user_id" value={selected.id} />
                    <input type="hidden" name="member_name" value={selected.fullName || selected.username || ""} />
                    <p className="text-sm font-medium text-stone-700 flex items-center gap-2">
                      <LockKeyhole className="h-4 w-4 text-stone-400" />
                      PIN de caja
                    </p>
                    <div className="flex gap-2">
                      <Input
                        name="pin"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{4,6}"
                        minLength={4}
                        maxLength={6}
                        placeholder="Nuevo PIN (4 a 6 dígitos)"
                        className="flex-1"
                        key={selected.id + "-pin"}
                      />
                      <Button type="submit" variant="outline" disabled={isPending}>
                        Asignar
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearPin}
                      disabled={isPending}
                      className="text-xs text-stone-400 hover:text-stone-600 hover:underline"
                    >
                      Quitar PIN (definirá uno nuevo al desbloquear)
                    </button>
                  </form>
                </>
              )}

              {/* Estado / quitar */}
              {!selectedIsSelf && !selectedIsOwnerLocked && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleToggleActive}
                      disabled={isPending}
                      className="w-full gap-2"
                    >
                      <Power className="h-4 w-4" />
                      {selected.isActive ? "Desactivar acceso" : "Reactivar acceso"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemove}
                      disabled={isPending}
                      className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      Quitar del equipo
                    </Button>
                    <p className="text-xs text-stone-400 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Con ventas registradas solo se puede desactivar (conserva el historial).
                    </p>
                  </div>
                </>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Contraseña temporal (una sola vez) */}
      <Dialog open={!!tempPassword} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cuenta creada</DialogTitle>
            <DialogDescription>
              Comparte estos datos con la persona. La contraseña temporal <strong>no se volverá a mostrar</strong>;
              podrá cambiarla en «Mi cuenta».
            </DialogDescription>
          </DialogHeader>
          {tempPassword && (
            <div className="space-y-3">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
                <p className="text-stone-500">Correo</p>
                <p className="font-medium text-stone-800 break-all">{tempPassword.email}</p>
                <p className="text-stone-500 mt-2">Contraseña temporal</p>
                <p className="font-mono text-lg font-semibold tracking-wide text-stone-800">{tempPassword.password}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `Acceso a ${ctx.business?.name}\nCorreo: ${tempPassword.email}\nContraseña temporal: ${tempPassword.password}`,
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
