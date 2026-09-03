import { describe, expect, it } from "vitest"
import {
  CART_MAX_AGE_MS,
  addUnit,
  cartItemCount,
  cartSubtotal,
  getLinePrice,
  mergeKey,
  needsModifierPrompt,
  rehydrateCart,
  serializeCart,
  type CartLine,
  type CartState,
  type ModifierOption,
  type Product,
} from "@/app/pos/cart"

// El carrito es el ESPEJO de lo que el servidor va a cobrar. Quien manda es
// create_ticket, pero si el espejo miente la cajera dice un total y cobra
// otro. Esto fija cómo suma y cómo sobrevive a una recarga.

const avena: ModifierOption = { id: "m-avena", name: "Leche de avena", priceDelta: 12 }
const shot: ModifierOption = { id: "m-shot", name: "Shot extra", priceDelta: 10 }

const latte: Product = {
  id: "p-latte",
  name: "Latte",
  category: "cafe",
  subcategory: "",
  sizes: [
    { variantId: "v-chico", label: "Chico", oz: "12 oz", price: 40 },
    { variantId: "v-grande", label: "Grande", oz: "16 oz", price: 55 },
  ],
  modifierGroups: [{ id: "g-leche", name: "Leche", minSelect: 0, maxSelect: 1, options: [avena, shot] }],
}
const croissant: Product = { id: "p-croissant", name: "Croissant", price: 38, variantId: "v-croissant", category: "pan", subcategory: "" }

let n = 0
const nuevoId = () => `l${++n}`

describe("precio de línea y subtotal", () => {
  it("talla + extras, por cantidad, redondeado a centavos", () => {
    const linea: CartLine = { lineId: "a", product: latte, size: latte.sizes![1], modifiers: [avena, shot], quantity: 3, notes: "" }
    expect(getLinePrice(linea)).toBe(77) // 55 + 12 + 10
    expect(cartSubtotal([linea])).toBe(231)
    expect(cartItemCount([linea])).toBe(3)
  })

  it("un producto sin tallas usa su precio directo", () => {
    const linea: CartLine = { lineId: "b", product: croissant, size: undefined, modifiers: [], quantity: 2, notes: "" }
    expect(cartSubtotal([linea])).toBe(76)
  })
})

describe("addUnit", () => {
  it("el mismo producto con la misma talla y los mismos extras se junta en una línea", () => {
    let lines = addUnit([], latte, latte.sizes![0], [avena], nuevoId)
    lines = addUnit(lines, latte, latte.sizes![0], [avena], nuevoId)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(2)
  })

  it("los extras en otro orden siguen siendo la misma línea", () => {
    let lines = addUnit([], latte, latte.sizes![0], [avena, shot], nuevoId)
    lines = addUnit(lines, latte, latte.sizes![0], [shot, avena], nuevoId)
    expect(lines).toHaveLength(1)
    expect(mergeKey(latte, latte.sizes![0], [avena, shot])).toBe(mergeKey(latte, latte.sizes![0], [shot, avena]))
  })

  it("otra talla u otro extra es otra línea, y una línea con nota no se junta", () => {
    let lines = addUnit([], latte, latte.sizes![0], [], nuevoId)
    lines = addUnit(lines, latte, latte.sizes![1], [], nuevoId)
    expect(lines).toHaveLength(2)
    const conNota: CartLine[] = [{ ...lines[0], notes: "sin espuma" }]
    expect(addUnit(conNota, latte, latte.sizes![0], [], nuevoId)).toHaveLength(2)
  })

  it("marca como nueva solo la línea que acaba de moverse", () => {
    let lines = addUnit([], latte, latte.sizes![0], [], nuevoId)
    lines = addUnit(lines, croissant, undefined, [], nuevoId)
    expect(lines.map((l) => l.isNew)).toEqual([false, true])
  })
})

describe("guardar y recuperar el carrito", () => {
  const estado: CartState = {
    saleRef: "ref-1",
    paymentMethod: "transferencia",
    ticketNotes: "Para llevar",
    cashReceivedInput: "",
    discount: { type: "percent", value: 10, reason: "Vecino" },
    lines: [
      { lineId: "l1", product: latte, size: latte.sizes![1], modifiers: [avena], quantity: 2, notes: "caliente" },
      { lineId: "l2", product: croissant, size: undefined, modifiers: [], quantity: 1, notes: "" },
    ],
  }
  const ahora = 5_000_000

  it("lo que se guarda se recupera igual, con precios vivos del menú", () => {
    const guardado = serializeCart(estado, ahora)
    const vuelto = rehydrateCart(guardado, [latte, croissant], ahora + 60_000)
    expect(vuelto).not.toBeNull()
    expect(vuelto!.paymentMethod).toBe("transferencia")
    expect(vuelto!.discount).toEqual({ type: "percent", value: 10, reason: "Vecino" })
    expect(vuelto!.lines).toHaveLength(2)
    expect(vuelto!.lines[0].notes).toBe("caliente")
    expect(cartSubtotal(vuelto!.lines)).toBe(cartSubtotal(estado.lines))
  })

  it("después de medio día se descarta: un carrito de ayer no es de hoy", () => {
    const guardado = serializeCart(estado, ahora)
    expect(rehydrateCart(guardado, [latte, croissant], ahora + CART_MAX_AGE_MS + 1)).toBeNull()
  })

  it("una línea cuyo producto, talla o extra ya no existe se suelta sin tirar el resto", () => {
    const guardado = serializeCart(estado, ahora)
    // el croissant salió del menú
    const sinCroissant = rehydrateCart(guardado, [latte], ahora)
    expect(sinCroissant!.lines.map((l) => l.product.id)).toEqual(["p-latte"])
    // la leche de avena ya no se ofrece
    const latteSinAvena: Product = { ...latte, modifierGroups: [{ ...latte.modifierGroups![0], options: [shot] }] }
    const sinAvena = rehydrateCart(guardado, [latteSinAvena, croissant], ahora)
    expect(sinAvena!.lines.map((l) => l.product.id)).toEqual(["p-croissant"])
  })

  it("basura o una versión vieja del formato devuelven null, no un carrito raro", () => {
    expect(rehydrateCart(null, [latte], ahora)).toBeNull()
    expect(rehydrateCart({ v: 0, lines: [] }, [latte], ahora)).toBeNull()
    expect(rehydrateCart({ v: 1, lines: [], savedAt: "ayer" }, [latte], ahora)).toBeNull()
  })
})

describe("needsModifierPrompt", () => {
  // Un grupo que OBLIGA a elegir (mínimo 1): la hoja debe salir siempre.
  const conObligatorio: Product = {
    ...latte,
    modifierGroups: [{ id: "g-tipo", name: "Tipo de leche", minSelect: 1, maxSelect: 1, options: [avena, shot] }],
  }

  it("sin extras nunca pregunta", () => {
    expect(needsModifierPrompt(croissant, "required")).toBe(false)
    expect(needsModifierPrompt(croissant, "always")).toBe(false)
  })

  it("extras opcionales: de un toque con «required», hoja con «always»", () => {
    expect(needsModifierPrompt(latte, "required")).toBe(false)
    expect(needsModifierPrompt(latte, "always")).toBe(true)
  })

  it("un grupo obligatorio pregunta en los dos modos", () => {
    expect(needsModifierPrompt(conObligatorio, "required")).toBe(true)
    expect(needsModifierPrompt(conObligatorio, "always")).toBe(true)
  })
})
