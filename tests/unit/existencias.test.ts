import { describe, expect, it } from "vitest"
import {
  aplicarCambios,
  cambiosDe,
  describirMovimiento,
  esquinaExistencia,
  esquinaProducto,
  estadoExistencia,
  validarMovimiento,
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
  it("un producto con tamaños enseña el peor de sus tamaños contados", () => {
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
  it("pide piezas, y cero solo vale al contar", () => {
    expect(validarMovimiento({ kind: "entrada", qty: 0, esAdmin: true })).toMatch(/cuántas piezas/)
    expect(validarMovimiento({ kind: "entrada", qty: 2.5, esAdmin: true })).toMatch(/entero/)
    expect(validarMovimiento({ kind: "conteo", qty: 0, esAdmin: true })).toBeNull()
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
  const mapa = { a: { qty: 10, minQty: 2 }, b: { qty: 4, minQty: 0 } }

  it("devuelve el mismo mapa si nada cambió, para no redibujar la rejilla", () => {
    expect(aplicarCambios(mapa, [])).toBe(mapa)
    expect(aplicarCambios(mapa, [{ variant_id: "a", qty: 10 }])).toBe(mapa)
    expect(aplicarCambios(mapa, [{ variant_id: "zzz", qty: 1 }])).toBe(mapa)
  })

  it("aplica la existencia nueva sin perder el mínimo", () => {
    const nuevo = aplicarCambios(mapa, [{ variant_id: "a", qty: 8 }])
    expect(nuevo).not.toBe(mapa)
    expect(nuevo.a).toEqual({ qty: 8, minQty: 2 })
    expect(nuevo.b).toBe(mapa.b)
  })
})

describe("cambiosDe", () => {
  it("lee lo que devuelve el RPC y descarta lo que no tenga forma", () => {
    expect(cambiosDe({ stock: [{ variant_id: "a", qty: 8 }, { variant_id: 3 }, null] })).toEqual([
      { variant_id: "a", qty: 8 },
    ])
    expect(cambiosDe({ folio: 1 })).toEqual([])
    expect(cambiosDe(null)).toEqual([])
  })
})
