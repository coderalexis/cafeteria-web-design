"use client"

import { useState } from "react"
import { PackagePlus } from "lucide-react"
import { MenuPackPicker } from "@/components/menu-pack-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** «Agregar paquete» desde Productos: la carta crece cuando el negocio crece. */
export function MenuPackDialog() {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" className="gap-2" onClick={() => setAbierto(true)}>
        <PackagePlus className="h-4 w-4" />
        Agregar paquete
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar productos por paquete</DialogTitle>
            <DialogDescription>
              Se agrega lo que te falte y se respeta lo que ya tienes: un producto con el mismo nombre no se duplica.
            </DialogDescription>
          </DialogHeader>
          <MenuPackPicker menuEmpty={false} onDone={() => setAbierto(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
