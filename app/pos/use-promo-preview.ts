"use client"

import { useEffect, useMemo, useState } from "react"
import type { previewPromotion } from "@/app/actions/promotions"
import { type CartLine, linesToItems } from "./cart"

/* ── Promoción viva ────────────────────────────────────────────────
   Quien decide de verdad es el servidor al cobrar; esto es el espejo
   para que la cajera se lo pueda decir al cliente ANTES. Se pregunta
   solo cuando la venta no lleva ya un descuento a mano ni un premio de
   lealtad, porque en ese caso el servidor tampoco la aplicaría. */
export function usePromoPreview(lines: CartLine[], otroDescuento: boolean, hayPromociones = true) {
  const [promo, setPromo] = useState<{ id: string; name: string; discount: number } | null>(null)
  const promoItems = useMemo(
    () =>
      // La misma conversión que al cobrar: lo fuera de menú también cuenta
      // para una promoción por ticket (el servidor lo suma igual).
      linesToItems(lines).filter((i) => ("custom" in i ? true : !!i.variant_id)),
    [lines],
  )
  // Sin promociones encendidas no hay nada que preguntar: eran tres viajes
  // al servidor por cada cambio del carrito, para nada.
  const sinPromo = !hayPromociones || otroDescuento || promoItems.length === 0
  const promoClave = sinPromo ? "" : JSON.stringify(promoItems)
  useEffect(() => {
    if (!promoClave) {
      setPromo(null)
      return
    }
    let vigente = true
    const corte = new AbortController()
    // Un respiro antes de preguntar: agregar tres productos seguidos no debe
    // disparar tres viajes al servidor. Va por `fetch` y no como server
    // action: como acción hacía fila delante del cobro (app/pos/datos/promocion).
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/pos/datos/promocion", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: promoClave,
          cache: "no-store",
          signal: corte.signal,
        })
        const r = (res.ok ? await res.json() : null) as Awaited<ReturnType<typeof previewPromotion>> | null
        if (vigente) setPromo(r?.success ? r.promo : null)
      } catch {
        // Sin señal o cancelada porque el carrito cambió: sin vista previa. Cobrar decide igual.
        if (vigente) setPromo(null)
      }
    }, 400)
    return () => {
      vigente = false
      clearTimeout(t)
      corte.abort()
    }
  }, [promoClave])
  return { promo, sinPromo }
}
