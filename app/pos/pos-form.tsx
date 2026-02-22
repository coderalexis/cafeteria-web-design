"use client"

import { useState } from "react"
import { createTicket } from "@/app/actions/sales"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Variant = { id: string; label: string; price: number }

export function PosForm({ variants }: { variants: Variant[] }) {
  const [rows, setRows] = useState([{ variant_id: variants[0]?.id ?? "", quantity: 1 }])

  return (
    <form
      action={async (formData) => {
        const parsed = rows
          .filter((row) => row.variant_id)
          .map((row) => {
            const variant = variants.find((option) => option.id === row.variant_id)
            return {
              variant_id: row.variant_id,
              quantity: row.quantity,
              unit_price: variant?.price ?? 0,
            }
          })
        formData.set("items", JSON.stringify(parsed))
        await createTicket(formData)
      }}
      className="space-y-4"
    >
      {rows.map((row, index) => (
        <div className="grid grid-cols-12 gap-2" key={index}>
          <select
            className="col-span-8 rounded-md border bg-background px-2"
            value={row.variant_id}
            onChange={(event) => {
              const next = [...rows]
              next[index].variant_id = event.target.value
              setRows(next)
            }}
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label} (${variant.price})
              </option>
            ))}
          </select>
          <Input
            className="col-span-2"
            type="number"
            value={row.quantity}
            min={1}
            onChange={(event) => {
              const next = [...rows]
              next[index].quantity = Number(event.target.value)
              setRows(next)
            }}
          />
          <Button
            className="col-span-2"
            type="button"
            variant="outline"
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
          >
            Quitar
          </Button>
        </div>
      ))}

      <Button type="button" variant="secondary" onClick={() => setRows([...rows, { variant_id: variants[0]?.id ?? "", quantity: 1 }])}>
        Agregar línea
      </Button>

      <select className="w-full rounded-md border bg-background p-2" name="payment_method" defaultValue="efectivo">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="tarjeta_clip">Tarjeta Clip</option>
      </select>
      <Input name="notes" placeholder="Notas del ticket" />
      <Button type="submit">Guardar venta</Button>
    </form>
  )
}
