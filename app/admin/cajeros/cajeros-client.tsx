"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createCajero, updateCajero, deleteCajero } from "@/app/actions/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import {
  Users,
  Plus,
  Trash2,
  Shield,
  ShoppingBag,
  UserCircle,
  Key,
  AlertTriangle,
  Calendar,
} from "lucide-react"

/* ────────────────────────────────────────────────────── Types */

interface Cajero {
  id: string
  fullName: string
  username: string
  role: string
  createdAt: string
  ticketCount: number
}

interface CajerosClientProps {
  cajeros: Cajero[]
}

/* ────────────────────────────────────────────────────── Component */

export default function CajerosClient({ cajeros }: CajerosClientProps) {
  const router = useRouter()
  const [selectedCajero, setSelectedCajero] = useState<Cajero | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const adminCount = cajeros.filter((c) => c.role === "admin").length
  const cajeroCount = cajeros.filter((c) => c.role === "cajero").length

  function openCajero(cajero: Cajero) {
    setSelectedCajero(cajero)
    setIsCreating(false)
    setSheetOpen(true)
  }

  function openCreate() {
    setSelectedCajero(null)
    setIsCreating(true)
    setSheetOpen(true)
  }

  async function handleCreate(formData: FormData) {
    setCreateLoading(true)
    const result = await createCajero(formData)
    setCreateLoading(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success("Usuario creado exitosamente")
    setSheetOpen(false)
    router.refresh()
  }

  async function handleUpdate(formData: FormData) {
    const result = await updateCajero(formData)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success("Usuario actualizado")
    setSheetOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!selectedCajero) return

    const confirmed = window.confirm(
      `¿Eliminar al usuario "${selectedCajero.fullName}"? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return

    setIsDeleting(true)
    const fd = new FormData()
    fd.set("id", selectedCajero.id)
    const result = await deleteCajero(fd)
    setIsDeleting(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success("Usuario eliminado")
    setSheetOpen(false)
    setSelectedCajero(null)
    router.refresh()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600" />
            Cajeros
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            {cajeros.length} usuarios · {adminCount} admin ·{" "}
            {cajeroCount} cajeros
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* Users list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todos los usuarios</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cajeros.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm text-stone-400">No hay usuarios registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {cajeros.map((cajero) => (
                <button
                  key={cajero.id}
                  onClick={() => openCajero(cajero)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-amber-50/50 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                      cajero.role === "admin"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    <UserCircle className="h-5 w-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">
                      {cajero.fullName || "Sin nombre"}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      @{cajero.username || "sin-usuario"}
                    </p>
                  </div>

                  {/* Role badge */}
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-xs ${
                      cajero.role === "admin"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    {cajero.role === "admin" ? "Admin" : "Cajero"}
                  </Badge>

                  {/* Tickets count */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-stone-600">
                      {cajero.ticketCount}
                    </p>
                    <p className="text-xs text-stone-400">ventas</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Create / Edit */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-lg p-0 flex flex-col">
          {isCreating ? (
            <CreateCajeroSheet
              onSubmit={handleCreate}
              loading={createLoading}
            />
          ) : selectedCajero ? (
            <EditCajeroSheet
              cajero={selectedCajero}
              onSubmit={handleUpdate}
              onDelete={handleDelete}
              isDeleting={isDeleting}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ================================================================== */
/*  Create Cajero Sheet                                                */
/* ================================================================== */
function CreateCajeroSheet({
  onSubmit,
  loading,
}: {
  onSubmit: (fd: FormData) => void
  loading: boolean
}) {
  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-stone-200 shrink-0">
        <SheetTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-indigo-600" />
          Nuevo usuario
        </SheetTitle>
        <SheetDescription className="text-sm">
          Crea un usuario para que pueda acceder al sistema POS
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <form action={onSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">
              Nombre completo *
            </label>
            <Input
              name="full_name"
              placeholder="Ej: Juan Pérez"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">
              Nombre de usuario *
            </label>
            <Input
              name="username"
              placeholder="Ej: juan"
              required
              pattern="[a-zA-Z0-9_.-]{3,}"
              title="Mínimo 3 caracteres, solo letras, números, punto, guión y guión bajo"
              className="font-mono"
            />
            <p className="text-xs text-stone-400">
              Este será el usuario para iniciar sesión (mínimo 3 caracteres)
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">
              Contraseña *
            </label>
            <Input
              name="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Rol</label>
            <select
              name="role"
              defaultValue="cajero"
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="cajero">Cajero</option>
              <option value="admin">Administrador</option>
            </select>
            <p className="text-xs text-stone-400">
              Los administradores pueden gestionar menú, ventas y usuarios
            </p>
          </div>

          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            disabled={loading}
          >
            {loading ? "Creando..." : "Crear usuario"}
          </Button>
        </form>
      </ScrollArea>
    </>
  )
}

/* ================================================================== */
/*  Edit Cajero Sheet                                                  */
/* ================================================================== */
function EditCajeroSheet({
  cajero,
  onSubmit,
  onDelete,
  isDeleting,
}: {
  cajero: Cajero
  onSubmit: (fd: FormData) => void
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-stone-200 shrink-0">
        <SheetTitle className="text-lg">{cajero.fullName || cajero.username}</SheetTitle>
        <SheetDescription className="text-sm flex items-center gap-2">
          <span>@{cajero.username || "sin-usuario"}</span>
          <span>·</span>
          <span>{cajero.ticketCount} ventas realizadas</span>
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-6">
          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
              <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                <ShoppingBag className="h-3.5 w-3.5" />
                Ventas
              </div>
              <p className="text-lg font-bold text-stone-800">
                {cajero.ticketCount}
              </p>
            </div>
            <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
              <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                <Calendar className="h-3.5 w-3.5" />
                Desde
              </div>
              <p className="text-sm font-semibold text-stone-800">
                {new Date(cajero.createdAt).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <Separator />

          {/* Edit form */}
          <form action={onSubmit} className="space-y-4">
            <input type="hidden" name="id" value={cajero.id} />

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">
                Nombre completo
              </label>
              <Input
                name="full_name"
                defaultValue={cajero.fullName}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Rol</label>
              <select
                name="role"
                defaultValue={cajero.role}
                className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
              >
                <option value="cajero">Cajero</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 flex items-center gap-2">
                <Key className="h-3.5 w-3.5" />
                Nueva contraseña
              </label>
              <Input
                name="new_password"
                type="password"
                placeholder="Dejar vacío para no cambiar"
                minLength={6}
              />
              <p className="text-xs text-stone-400">
                Solo completa si deseas cambiar la contraseña
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              Guardar cambios
            </Button>
          </form>

          <Separator />

          {/* Danger zone */}
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Zona de peligro
            </div>
            <p className="text-xs text-red-600/80">
              {cajero.ticketCount > 0
                ? "Este usuario tiene ventas asociadas y no puede ser eliminado."
                : "Eliminar este usuario permanentemente del sistema."}
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={onDelete}
              disabled={isDeleting || cajero.ticketCount > 0}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {isDeleting ? "Eliminando..." : "Eliminar usuario"}
            </Button>
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
