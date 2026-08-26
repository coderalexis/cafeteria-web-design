"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Trash2, TriangleAlert } from "lucide-react"
import { deleteBusiness } from "@/app/actions/super"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * Borrado real de una cafetería. Dos puertas a propósito: primero hay que
 * escribir el identificador exacto (evita borrar la cafetería equivocada por
 * tener varias abiertas), y después confirmar en un segundo aviso. No hay
 * "deshacer": lo único que queda es el respaldo de la noche anterior.
 */
export function DeleteBusinessDialog({
  business,
  onDeleted,
}: {
  business: { id: string; name: string; slug: string; active_members: number; tickets_30d: number }
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [isPending, startTransition] = useTransition()

  const matches = typed.trim().toLowerCase() === business.slug

  const doDelete = () => {
    startTransition(async () => {
      const result = await deleteBusiness({ businessId: business.id, slug: business.slug })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const s = result.summary
      const cuentas = result.deletedUsers
      toast.success(
        `«${business.name}» eliminada: ${s.tickets} ticket${s.tickets === 1 ? "" : "s"}, ${s.productos} productos y ${s.miembros} miembro${s.miembros === 1 ? "" : "s"}.` +
          (cuentas.length > 0
            ? ` Se borraron ${cuentas.length} cuenta${cuentas.length === 1 ? "" : "s"}: ${cuentas.slice(0, 3).join(", ")}${cuentas.length > 3 ? ` y ${cuentas.length - 3} más` : ""}.`
            : "") +
          (result.keptUsers > 0 ? ` ${result.keptUsers} cuenta(s) no se pudieron borrar.` : ""),
        { duration: 9000 },
      )
      setConfirmOpen(false)
      setOpen(false)
      setTyped("")
      onDeleted()
    })
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        Eliminar
      </Button>

      {/* Primera puerta: qué se pierde + escribir el identificador */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setTyped("")
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <TriangleAlert className="h-5 w-5" />
              Eliminar «{business.name}»
            </DialogTitle>
            <DialogDescription>
              Se borra de la base de datos, con todo lo suyo. Esto <strong>no se puede deshacer</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 space-y-1">
              <li>· Todas sus ventas, tickets y cortes de caja</li>
              <li>· Su menú completo: categorías, productos, variantes y modificadores</li>
              <li>· Su bitácora de actividad y los PIN de caja</li>
              <li>
                · Sus {business.active_members} miembro{business.active_members === 1 ? "" : "s"}, <strong>incluidas
                sus cuentas</strong> — dueño y cajeros — si esta era su única cafetería. Quien administre otra
                cafetería la conserva, y tu cuenta de operador nunca se toca.
              </li>
            </ul>

            {business.tickets_30d > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Cuidado: esta cafetería registró <strong>{business.tickets_30d} ventas en los últimos 30 días</strong>.
                Parece estar en uso.
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="confirm-slug" className="text-sm text-stone-700">
                Escribe <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">{business.slug}</code> para
                confirmar:
              </label>
              <Input
                id="confirm-slug"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={business.slug}
                autoComplete="off"
                className="font-mono"
              />
            </div>

            <p className="text-xs text-stone-400">
              Lo único que quedaría es el respaldo automático de la noche anterior.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!matches || isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Eliminar cafetería
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Segunda puerta */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que quieres eliminar «{business.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Es la última oportunidad de arrepentirte. Al confirmar, la cafetería y todos sus datos desaparecen de la
              base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Mejor no</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault()
                doDelete()
              }}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sí, eliminar para siempre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
