import { describe, expect, it } from "vitest"
import type { CartLine } from "@/app/pos/cart"
import { ventaCompletada, ventaParaLaCola } from "@/app/pos/cobro"

// Lo que comparten el cobro del carrito y «Cobrar» de una cuenta desde la
// barra. Antes estaba escrito dos veces: un campo nuevo del recibo había que
// acordarse de ponerlo en los dos lados.

const latte: CartLine = {
  lineId: "a",
  product: { id: "p1", name: "Latte", price: 40, variantId: "v1", category: "c", subcategory: "s" },
  modifiers: [],
  quantity: 2,
  notes: "",
}

const delServidor = {
  ticketId: "t1",
  folio: 154,
  subtotal: 80,
  discountTotal: 0,
  total: 80,
  takeoutFee: 0,
  tip: 5,
  cashReceived: 100,
  changeDue: 15,
  loyalty: { stamps: 3, target: 10, redeemed: false, name: "Ana", phone: "5512345678" },
  credit: { customerId: "c1", name: "Beto", balance: 120 },
}

describe("el recibo de una venta recién cobrada", () => {
  it("lleva lo que cobró el servidor y lo que traía el carrito", () => {
    const fecha = new Date("2026-11-05T15:00:00Z")
    const r = ventaCompletada(delServidor, { lines: [latte], paymentMethod: "efectivo", notes: "para llevar", discountReason: "cumpleaños" }, fecha)
    expect(r).toMatchObject({
      ticketId: "t1",
      folio: 154,
      total: 80,
      tip: 5,
      cashReceived: 100,
      changeDue: 15,
      paymentMethod: "efectivo",
      notes: "para llevar",
      discountReason: "cumpleaños",
      date: fecha,
      lines: [latte],
    })
  })

  it("del cliente y del fiado solo guarda lo que imprime el ticket", () => {
    const r = ventaCompletada(delServidor, { lines: [latte], paymentMethod: "fiado" })
    expect(r.loyalty).toEqual({ stamps: 3, target: 10, redeemed: false })
    expect(r.credit).toEqual({ name: "Beto", balance: 120 })
  })

  it("sin nota ni motivo de descuento, el recibo no inventa nada", () => {
    const r = ventaCompletada({ ...delServidor, loyalty: null, credit: null }, { lines: [latte], paymentMethod: "tarjeta_clip", notes: "" })
    expect(r.notes).toBeUndefined()
    expect(r.discountReason).toBeNull()
    expect(r.loyalty).toBeNull()
    expect(r.credit).toBeNull()
  })
})

describe("una venta que no llegó, lista para la cola", () => {
  it("conserva su clientRef y guarda las líneas planas para reimprimir sin el menú", () => {
    const q = ventaParaLaCola(
      { clientRef: "ref-1", items: [{ variant_id: "v1", quantity: 2 }], paymentMethod: "efectivo", chargedTotal: 80, lines: [latte] },
      1_000,
    )
    expect(q.clientRef).toBe("ref-1")
    expect(q.capturedAt).toBe(1_000)
    expect(q.chargedTotal).toBe(80)
    expect(q.lines).toEqual([{ name: "Latte", size: undefined, quantity: 2, unitPrice: 40, notes: undefined, modifiers: [] }])
  })
})
