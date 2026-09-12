import { describe, expect, it } from "vitest"
import {
  aplicarCambios,
  cambiosDe,
  conUnidad,
  describirMovimiento,
  esquinaExistencia,
  esquinaProducto,
  estadoExistencia,
  formatCantidad,
  porVariante,
  validarMovimiento,
  type ItemExistencia,
} from "@/lib/existencias"

describe("estadoExistencia", () => {
  it("sin mínimo, solo avisa al llegar a cero", () => {
    expect(estadoExistencia(5, 0)).toBe("ok")
    expect(estadoExistencia(1, 0)).toBe("ok")
    expect(estadoExistencia(0, 0)).toBe("agotado")
  })

  it("con mínimo, avisa en el mínimo y por debajo", () => {
    expect(estadoExistencia(4, 3)).toBe("ok")
    expect(estadoExistencia(3, 3)).toBe("bajo")
    expect(estadoExistencia(1, 3)).toBe("bajo")
  })

  it("el negativo es su propio estado: el sistema se equivocó, no el estante", () => {
    expect(estadoExistencia(-2, 3)).toBe("negativo")
  })
})

describe("cantidades con unidad", () => {
  it("escribe los números sin ceros de adorno", () => {
    expect(formatCantidad(8)).toBe("8")
    expect(formatCantidad(2.5)).toBe("2.5")
    expect(formatCantidad(2.25)).toBe("2.25")
  })

  it("la unidad va en singular solo con el 1 exacto", () => {
    expect(conUnidad(1, "kilo")).toBe("1 kilo")
    expect(conUnidad(2.5, "kilo")).toBe("2.5 kilos")
    expect(conUnidad(0, "pieza")).toBe("0 piezas")
    expect(conUnidad(3)).toBe("3 piezas")
  })
})

describe("esquinaExistencia", () => {
  it("no dice nada cuando no hay nada que decir", () => {
    expect(esquinaExistencia(10, 3)).toBeNull()
  })

  it("cuenta las que quedan, en singular cuando toca", () => {
    expect(esquinaExistencia(3, 3)).toBe("Quedan 3")
    expect(esquinaExistencia(1, 3)).toBe("Queda 1")
  })

  it("agotado en cero y también en negativo: para quien cobra es lo mismo", () => {
    expect(esquinaExistencia(0, 0)).toBe("Agotado")
    expect(esquinaExistencia(-1, 5)).toBe("Agotado")
  })
})

describe("esquinaProducto", () => {
  it("un producto con tamaños contados enseña el peor de ellos", () => {
    expect(esquinaProducto([{ qty: 10, minQty: 2 }, { qty: 0, minQty: 2 }])).toBe("Agotado")
    expect(esquinaProducto([{ qty: 10, minQty: 2 }, { qty: 2, minQty: 2 }])).toBe("Quedan 2")
  })

  it("sin tamaños contados no hay esquina", () => {
    expect(esquinaProducto([])).toBeNull()
  })
})

describe("describirMovimiento", () => {
  const base = { reason: null, unitCost: null, folio: null }

  it("lee el diario en palabras, con la pieza en singular y plural", () => {
    expect(describirMovimiento({ ...base, kind: "entrada", qty: 12, qtyAfter: 12 })).toBe("Llegaron 12 piezas")
    expect(describirMovimiento({ ...base, kind: "entrada", qty: 12, qtyAfter: 12, unitCost: 18 })).toBe(
      "Llegaron 12 piezas a $18.00 c/u",
    )
    expect(describirMovimiento({ ...base, kind: "venta", qty: -1, qtyAfter: 11, folio: 105 })).toBe(
      "Vendida 1 pieza · ticket #105",
    )
    expect(describirMovimiento({ ...base, kind: "cancelacion", qty: 2, qtyAfter: 13, folio: 105 })).toBe(
      "Cancelado el ticket #105: vuelven 2 piezas",
    )
    expect(describirMovimiento({ ...base, kind: "merma", qty: -3, qtyAfter: 10, reason: "Caducó" })).toBe(
      "Merma de 3 piezas: Caducó",
    )
  })

  it("un insumo se lee en su propia unidad", () => {
    expect(describirMovimiento({ ...base, kind: "entrada", qty: 2.5, qtyAfter: 7.5, unitCost: 180 }, "kilo")).toBe(
      "Llegaron 2.5 kilos a $180.00 c/u",
    )
    expect(describirMovimiento({ ...base, kind: "merma", qty: -1, qtyAfter: 4, reason: "Se cayó" }, "litro")).toBe(
      "Merma de 1 litro: Se cayó",
    )
  })

  it("la existencia inicial no «sobraba»: había", () => {
    expect(describirMovimiento({ ...base, kind: "conteo", qty: 10, qtyAfter: 10, reason: "Existencia inicial" })).toBe(
      "Existencia inicial: 10 piezas",
    )
  })

  it("un conteo dice si faltaban o sobraban, que es lo que interesa", () => {
    expect(describirMovimiento({ ...base, kind: "conteo", qty: -3, qtyAfter: 9, reason: "Conteo" })).toBe(
      "Conteo: faltaban 3 piezas",
    )
    expect(describirMovimiento({ ...base, kind: "conteo", qty: 1, qtyAfter: 10, reason: "en la vitrina" })).toBe(
      "Conteo: sobraban 1 pieza · en la vitrina",
    )
  })
})

describe("validarMovimiento", () => {
  it("pide cantidad, y cero solo vale al contar", () => {
    expect(validarMovimiento({ kind: "entrada", qty: 0, esAdmin: true })).toMatch(/cuánto/i)
    expect(validarMovimiento({ kind: "conteo", qty: 0, esAdmin: true })).toBeNull()
  })

  it("lo del menú se cuenta entero; un insumo admite decimales", () => {
    expect(validarMovimiento({ kind: "entrada", qty: 2.5, esAdmin: true })).toMatch(/enteras/)
    expect(validarMovimiento({ kind: "entrada", qty: 2.5, esAdmin: true, entero: false })).toBeNull()
  })

  it("la merma exige motivo", () => {
    expect(validarMovimiento({ kind: "merma", qty: 1, reason: "  ", esAdmin: false })).toMatch(/motivo/)
    expect(validarMovimiento({ kind: "merma", qty: 1, reason: "Caducó", esAdmin: false })).toBeNull()
  })

  it("la cajera mete entradas pero no pone el costo, ni cuenta", () => {
    expect(validarMovimiento({ kind: "entrada", qty: 5, esAdmin: false })).toBeNull()
    expect(validarMovimiento({ kind: "entrada", qty: 5, unitCost: 9, esAdmin: false })).toMatch(/administrador/)
    expect(validarMovimiento({ kind: "conteo", qty: 5, esAdmin: false })).toMatch(/administrador/)
    expect(validarMovimiento({ kind: "entrada", qty: 5, unitCost: -1, esAdmin: true })).toMatch(/costo/)
  })
})

describe("aplicarCambios", () => {
  const lista: ItemExistencia[] = [
    { itemId: "i1", variantId: "v1", supplyId: null, nombre: "Panqué", unidad: "pieza", qty: 10, minQty: 2 },
    { itemId: "i2", variantId: null, supplyId: "s1", nombre: "Café en grano", unidad: "kilo", qty: 4, minQty: 1 },
  ]

  it("devuelve la misma lista si nada cambió, para no redibujar la rejilla", () => {
    expect(aplicarCambios(lista, [])).toBe(lista)
    expect(aplicarCambios(lista, [{ variant_id: "v1", qty: 10 }])).toBe(lista)
    expect(aplicarCambios(lista, [{ variant_id: "zzz", qty: 1 }])).toBe(lista)
  })

  it("una venta llega por variante y un movimiento a mano por artículo", () => {
    const porVenta = aplicarCambios(lista, [{ variant_id: "v1", qty: 8 }])
    expect(porVenta).not.toBe(lista)
    expect(porVenta[0].qty).toBe(8)
    expect(porVenta[1]).toBe(lista[1])

    const porMovimiento = aplicarCambios(lista, [{ item_id: "i2", qty: 2.5 }])
    expect(porMovimiento[1].qty).toBe(2.5)
    expect(porMovimiento[1].unidad).toBe("kilo")
  })
})

describe("porVariante", () => {
  it("solo lo del menú llega a las tarjetas del POS", () => {
    const mapa = porVariante([
      { itemId: "i1", variantId: "v1", supplyId: null, nombre: "Panqué", unidad: "pieza", qty: 3, minQty: 5 },
      { itemId: "i2", variantId: null, supplyId: "s1", nombre: "Vasos", unidad: "pieza", qty: 100, minQty: 20 },
    ])
    expect(mapa).toEqual({ v1: { qty: 3, minQty: 5 } })
  })
})

describe("cambiosDe", () => {
  it("lee lo que devuelve el RPC y descarta lo que no tenga forma", () => {
    expect(cambiosDe({ stock: [{ variant_id: "a", qty: 8 }, { variant_id: 3 }, null] })).toEqual([
      { variant_id: "a", qty: 8 },
    ])
    expect(cambiosDe({ stock: [{ item_id: "i1", qty: 2.5 }] })).toEqual([{ item_id: "i1", qty: 2.5 }])
    expect(cambiosDe({ folio: 1 })).toEqual([])
    expect(cambiosDe(null)).toEqual([])
  })
})
