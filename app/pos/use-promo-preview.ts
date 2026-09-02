"use client"

import { useEffect, useMemo, useState } from "react"
import { previewPromotion } from "@/app/actions/promotions"
import { getLineVariantId, type CartLine } from "./cart"

/* ── Promoción viva ────────────────────────────────────────────────
   Quien decide de verdad es el servidor al cobrar; esto es el espejo
   para que la cajera se lo pueda decir al cliente ANTES. Se pregunta
   solo cuando la venta no lleva ya un descuento a mano ni un premio de
   lealtad, porque en ese caso el servidor tampoco la aplicaría. */
export function usePromoPreview(lines: CartLine[], otroDescuento: boolean) {
  const [promo, setPromo] = useState<{ id: string; name: string; discount: number } | null>(null)
  const promoItems = useMemo(
    () =>
      lines
        .map((l) => ({
          variant_id: getLineVariantId(l) ?? "",
          quantity: l.quantity,
          modifiers: l.modifiers.map((m) => m.id),
        }))
        .filter((i) => i.variant_id),
    [lines],
  )
  const sinPromo = otroDescuento || promoItems.length === 0
  const promoClave = sinPromo ? "" : JSON.stringify(promoItems)
  useEffect(() => {
    if (!promoClave) {
      setPromo(null)
      return
    }
    let vigente = true
    // Un respiro antes de preguntar: agregar tres productos seguidos no debe
    // disparar tres viajes al servidor.
    const t = setTimeout(async () => {
      const r = await previewPromotion(JSON.parse(promoClave))
      if (vigente) setPromo(r.success ? r.promo : null)
    }, 400)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [promoClave])
  return { promo, sinPromo }
}
