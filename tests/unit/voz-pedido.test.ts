import { describe, expect, it } from "vitest"
import type { Product } from "@/app/pos/cart"
import { rehydrateCart } from "@/app/pos/cart"
import {
  agregar,
  armarCatalogo,
  carritoParaGuardar,
  catalogoEnTexto,
  instruccionesVoz,
  nombreDeCuenta,
  pesos,
  quitar,
  resolver,
  describirResuelto,
  enMenuDelPos,
  instruccionesAyudante,
  validarConfirmacion,
  verificarProducto,
  cambiarCantidad,
  buscarEnCarrito,
} from "@/app/pos/voz/pedido"

const leche = {
  id: "g-leche",
  name: "Leche",
  minSelect: 0,
  maxSelect: 1,
  defaultOptionId: "m-entera",
  options: [
    { id: "m-entera", name: "Entera", priceDelta: 0 },
    { id: "m-almendra", name: "Almendra", priceDelta: 10 },
  ],
}

const MENU: Product[] = [
  {
    id: "latte",
    name: "Latte",
    category: "caliente",
    subcategory: "Barra caliente",
    sizes: [
      { variantId: "v-chico", label: "Chico", oz: "12", price: 45 },
      { variantId: "v-grande", label: "Grande", oz: "16", price: 55 },
    ],
    modifierGroups: [leche],
  },
  {
    id: "americano",
    name: "Americano",
    category: "caliente",
    subcategory: "Barra caliente",
    price: 35,
    variantId: "v-americano",
    modifierGroups: [leche],
  },
  {
    id: "omelette",
    name: "Omelette",
    category: "comida",
    subcategory: "Desayunos",
    price: 95,
    variantId: "v-omelette",
    modifierGroups: [
      {
        id: "g-ing",
        name: "Ingredientes",
        minSelect: 2,
        maxSelect: 2,
        options: [
          { id: "m-jamon", name: "Jamón", priceDelta: 0 },
          { id: "m-queso", name: "Queso", priceDelta: 0 },
          { id: "m-espinaca", name: "Espinaca", priceDelta: 0 },
        ],
      },
    ],
  },
  { id: "panque", name: "Panqué de plátano", category: "pan", subcategory: "Panadería", price: 30, variantId: "v-panque" },
]

const cat = armarCatalogo(MENU)
let n = 0
const nuevoId = () => `l${++n}`
/** El código de un extra a partir de su id, como lo vería el bot en el menú. */
const e = (id: string) => cat.codigoDeExtra.get(id)!

describe("catálogo para el bot", () => {
  it("da códigos cortos en el orden del menú y define cada grupo una sola vez", () => {
    expect(cat.productos.map((p) => p.codigo)).toEqual(["p1", "p2", "p3", "p4"])
    expect(cat.grupos.map((g) => g.grupo.id)).toEqual(["g-leche", "g-ing"])
    const texto = catalogoEnTexto(cat)
    expect(texto).toContain("p1 Latte | Chico $45 · Grande $55 | extras: g1")
    expect(texto).toContain("p4 Panqué de plátano | $30")
    expect(texto).toContain(`g1 Leche [opcional, máximo 1]: ${e("m-entera")} Entera (por omisión), ${e("m-almendra")} Almendra +$10`)
    expect(texto).toContain("g2 Ingredientes [obligatorio, elige 2]")
    // El menú no lleva ids de la base: el bot nunca los ve.
    expect(texto).not.toContain("v-grande")
    expect(texto.match(/## Barra caliente/g)).toHaveLength(1)
  })

  it("deja fuera los renglones «fuera de menú»", () => {
    const conCustom = armarCatalogo([...MENU, { id: "custom:x", name: "Fruta", category: "fuera-de-menu", subcategory: "Fuera de menú", price: 20, custom: true }])
    expect(conCustom.productos).toHaveLength(4)
  })

  it("las instrucciones llevan el nombre del café y el menú", () => {
    const t = instruccionesVoz("Café de prueba", catalogoEnTexto(cat))
    expect(t).toContain("mostrador de Café de prueba")
    expect(t).toContain("p3 Omelette")
  })

  it("dice los pesos como se dicen en voz alta", () => {
    expect(pesos(45)).toBe("$45")
    expect(pesos(45.5)).toBe("$45.50")
  })
})

describe("agregar", () => {
  it("agrega con tamaño y la leche por omisión, y devuelve el total", () => {
    const r = agregar([], { producto: "p1", tamano: "grande", cantidad: 2 }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(true)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].size?.variantId).toBe("v-grande")
    expect(r.lines[0].modifiers.map((m) => m.id)).toEqual(["m-entera"])
    expect(r.lines[0].quantity).toBe(2)
    expect(r.respuesta.pedido.total).toBe(110)
    expect(r.respuesta.mensaje).toContain("Total del pedido: $110")
  })

  it("respeta el extra que pidió el cliente en vez del de omisión y cobra su precio", () => {
    const r = agregar([], { producto: "p1", tamano: "Chico", cantidad: 1, extras: [e("m-almendra")] }, cat, nuevoId)
    expect(r.lines[0].modifiers.map((m) => m.id)).toEqual(["m-almendra"])
    expect(r.respuesta.pedido.total).toBe(55)
  })

  it("acepta el tamaño sin acentos ni mayúsculas", () => {
    const r = agregar([], { producto: "P1", tamano: "CHICO", cantidad: 1 }, cat, nuevoId)
    expect(r.lines[0].size?.label).toBe("Chico")
  })

  it("pregunta el tamaño cuando hay más de uno y no se dijo", () => {
    const r = agregar([], { producto: "p1", cantidad: 1 }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.lines).toHaveLength(0)
    expect(r.respuesta.preguntar).toBe("¿De qué tamaño? Chico ($45), Grande ($55)")
  })

  it("rechaza un tamaño que no existe y dice cuáles hay", () => {
    const r = agregar([], { producto: "p1", tamano: "mediano", cantidad: 1 }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.respuesta.preguntar).toContain("Chico ($45)")
  })

  it("detiene el alta si falta un grupo obligatorio, sin adivinar", () => {
    const r = agregar([], { producto: "p3", cantidad: 1, extras: [e("m-jamon")] }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.lines).toHaveLength(0)
    expect(r.respuesta.preguntar).toBe("Ingredientes: Elige 2 de: Jamón, Queso, Espinaca")
  })

  it("rechaza pasarse del máximo de un grupo", () => {
    const r = agregar([], { producto: "p3", cantidad: 1, extras: [e("m-jamon"), e("m-queso"), e("m-espinaca")] }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.respuesta.mensaje).toContain("máximo 2")
  })

  it("acepta el obligatorio completo", () => {
    const r = agregar([], { producto: "p3", cantidad: 1, extras: [e("m-jamon"), e("m-queso")] }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(true)
    expect(r.respuesta.pedido.total).toBe(95)
  })

  it("rechaza códigos inventados y extras que no aplican al producto", () => {
    expect(agregar([], { producto: "p99", cantidad: 1 }, cat, nuevoId).respuesta.ok).toBe(false)
    expect(agregar([], { producto: "p4", cantidad: 1, extras: ["e99"] }, cat, nuevoId).respuesta.ok).toBe(false)
    const r = agregar([], { producto: "p4", cantidad: 1, extras: [e("m-almendra")] }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.respuesta.mensaje).toContain("no aplica")
  })

  it("rechaza cantidades fuera de rango", () => {
    expect(agregar([], { producto: "p4", cantidad: 0 }, cat, nuevoId).respuesta.ok).toBe(false)
    expect(agregar([], { producto: "p4", cantidad: 21 }, cat, nuevoId).respuesta.ok).toBe(false)
    expect(agregar([], { producto: "p4", cantidad: 1.5 }, cat, nuevoId).respuesta.ok).toBe(false)
  })

  it("no deja regalar un extra con costo escribiéndolo como nota (lo que pasó con la deslactosada en el mocha)", () => {
    const r = agregar([], { producto: "p4", cantidad: 1, nota: "con leche de almendra" }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.lines).toHaveLength(0)
    expect(r.respuesta.mensaje).toContain("no está disponible para Panqué de plátano")
  })

  it("si el extra sí aplica, pide mandarlo como extra para que se cobre", () => {
    const r = agregar([], { producto: "p2", cantidad: 1, nota: "Almendra" }, cat, nuevoId)
    expect(r.respuesta.ok).toBe(false)
    expect(r.respuesta.mensaje).toContain(`código (${e("m-almendra")})`)
  })

  it("deja pasar notas que no son extras, y extras sin costo que no aplican", () => {
    expect(agregar([], { producto: "p4", cantidad: 1, nota: "tibio, por favor" }, cat, nuevoId).respuesta.ok).toBe(true)
    expect(agregar([], { producto: "p4", cantidad: 1, nota: "entera" }, cat, nuevoId).respuesta.ok).toBe(true)
  })

  it("junta lo igual y separa lo que lleva nota, como el POS", () => {
    let lines = agregar([], { producto: "p4", cantidad: 1 }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p4", cantidad: 2 }, cat, nuevoId).lines
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
    lines = agregar(lines, { producto: "p2", cantidad: 1, nota: "  sin   azúcar " }, cat, nuevoId).lines
    expect(lines).toHaveLength(2)
    expect(lines[1].notes).toBe("sin azúcar")
  })
})

describe("quitar", () => {
  const base = () => {
    let lines = agregar([], { producto: "p4", cantidad: 3 }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p2", cantidad: 1 }, cat, nuevoId).lines
    return lines
  }

  it("quita unas piezas o el renglón entero", () => {
    const parcial = quitar(base(), { renglon: 1, cantidad: 2 })
    expect(parcial.lines[0].quantity).toBe(1)
    expect(parcial.respuesta.pedido.total).toBe(65)
    const entero = quitar(base(), { renglon: 2 })
    expect(entero.lines).toHaveLength(1)
    expect(entero.respuesta.pedido.total).toBe(90)
  })

  it("quita por código de producto sin buscar antes el renglón", () => {
    const r = quitar(base(), { producto: "p4", cantidad: 1 }, cat)
    expect(r.respuesta.ok).toBe(true)
    expect(r.lines[0].quantity).toBe(2)
    expect(quitar(base(), { producto: "p1" }, cat).respuesta.mensaje).toContain("No hay Latte")
    expect(quitar(base(), {}, cat).respuesta.ok).toBe(false)
  })

  it("pide el renglón si hay dos del mismo producto", () => {
    let lines = agregar([], { producto: "p2", cantidad: 1 }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p2", cantidad: 1, nota: "sin azúcar" }, cat, nuevoId).lines
    const r = quitar(lines, { producto: "p2" }, cat)
    expect(r.respuesta.ok).toBe(false)
    expect(r.respuesta.mensaje).toContain("2 renglones")
  })

  it("rechaza un renglón que no existe", () => {
    const r = quitar(base(), { renglon: 9 })
    expect(r.respuesta.ok).toBe(false)
    expect(r.lines).toHaveLength(2)
  })
})

describe("reglas para confirmar", () => {
  const bien = { nombre: "Juan", articulos: 2, cambioDesdeLaLectura: false, clienteHabloDespues: true, preguntoEnLaMismaRespuesta: false }

  it("guarda lo que el cliente oyó y aceptó, a su nombre", () => {
    expect(validarConfirmacion({ ...bien, nombre: "  Juan   Pérez " })).toEqual({ ok: true, nombre: "Juan Pérez" })
  })

  it("no confirma en la misma respuesta en que pregunta", () => {
    expect(validarConfirmacion({ ...bien, preguntoEnLaMismaRespuesta: true }).ok).toBe(false)
  })

  it("no guarda un pedido que cambió después de leerlo (un «ya lo quité» falso sale aquí)", () => {
    const r = validarConfirmacion({ ...bien, cambioDesdeLaLectura: true })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.mensaje).toContain("ver_pedido")
  })

  it("espera a que el cliente conteste la lectura", () => {
    expect(validarConfirmacion({ ...bien, clienteHabloDespues: false }).ok).toBe(false)
  })

  it("no acepta nombres inventados ni vacíos", () => {
    for (const nombre of ["", "cliente", "Cliente", "sin nombre", "Anónimo", "señora"]) {
      const r = validarConfirmacion({ ...bien, nombre })
      expect(r.ok, nombre).toBe(false)
      expect(r.ok === false && r.preguntar).toBe("¿A nombre de quién lo pongo?")
    }
  })

  it("no guarda un pedido vacío", () => {
    expect(validarConfirmacion({ ...bien, articulos: 0 }).ok).toBe(false)
  })
})

describe("guardar como cuenta abierta", () => {
  it("el POS puede abrir lo que guarda la voz, con los mismos renglones", () => {
    let lines = agregar([], { producto: "p1", tamano: "Grande", cantidad: 2, extras: [e("m-almendra")] }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p3", cantidad: 1, extras: [e("m-queso"), e("m-espinaca")] }, cat, nuevoId).lines
    const now = 1_700_000_000_000
    const guardado = carritoParaGuardar(lines, "ref-1", now)
    expect(guardado.ticketNotes).toBe("Pedido tomado por voz")
    const vuelta = rehydrateCart(guardado, MENU, now)
    expect(vuelta?.lines.map((l) => [l.product.id, l.size?.label ?? null, l.quantity, l.modifiers.map((m) => m.id)])).toEqual([
      ["latte", "Grande", 2, ["m-almendra"]],
      ["omelette", null, 1, ["m-queso", "m-espinaca"]],
    ])
  })

  it("marca el nombre para que la cajera sepa que vino de la voz", () => {
    expect(nombreDeCuenta("  Juan   Pérez ")).toBe("Juan Pérez (voz)")
    expect(nombreDeCuenta("x".repeat(60)).length).toBeLessThanOrEqual(40)
  })
})

describe("modo ayudante", () => {
  it("lo completo se resuelve y se describe para la tarjeta", () => {
    const r = resolver({ producto: "p1", tamano: "Grande", cantidad: 2, extras: [e("m-almendra")] }, cat)
    expect(r.ok).toBe(true)
    if (r.ok) expect(describirResuelto(r)).toBe("2 × Latte (Grande) con Almendra")
  })

  it("sin tamaño queda pendiente con lo que sí se dijo, para completarlo con un toque", () => {
    const r = resolver({ producto: "p1", cantidad: 2, extras: [e("m-almendra")] }, cat)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.falta).toEqual({ tipo: "tamano" })
      expect(r.product?.id).toBe("latte")
      expect(r.cantidad).toBe(2)
    }
    // Al tocar «Grande», se resuelve con los mismos datos y el tamaño elegido.
    const completo = resolver({ producto: "p1", cantidad: 2, extras: [e("m-almendra")], tamano: "Grande" }, cat)
    expect(completo.ok && completo.modifiers.map((m) => m.id)).toEqual(["m-almendra"])
  })

  it("sin un extra obligatorio queda pendiente de la hoja de extras", () => {
    const r = resolver({ producto: "p3", cantidad: 1 }, cat)
    expect(!r.ok && r.falta).toEqual({ tipo: "extras", grupo: expect.objectContaining({ id: "g-ing" }) })
  })

  it("lo que no existe no queda pendiente: es un error a la vista", () => {
    const r = resolver({ producto: "p99", cantidad: 1 }, cat)
    expect(!r.ok && r.falta).toBeUndefined()
  })

  it("entrega al carrito los objetos del POS, para que lo dictado y lo tocado se junten", () => {
    const delPos = MENU.map((p) => ({ ...p })) // otra copia, como la de la rejilla
    const r = resolver({ producto: "p1", tamano: "Chico", cantidad: 1, extras: [e("m-almendra")] }, cat)
    if (!r.ok) throw new Error("debía resolverse")
    const m = enMenuDelPos(r, delPos)
    expect(m?.product).toBe(delPos[0])
    expect(m?.size?.variantId).toBe("v-chico")
    expect(m?.modifiers.map((x) => x.id)).toEqual(["m-almendra"])
    expect(enMenuDelPos(r, delPos.slice(1))).toBeNull()
  })

  it("las instrucciones prohíben conversar y piden no_entendi en vez de adivinar", () => {
    const t = instruccionesAyudante("Café de prueba", "p1 Latte")
    expect(t).toContain("No converses")
    expect(t).toContain("no_entendi")
  })
})

describe("el nombre verifica el código (el modelo copió p75, el panqué de al lado)", () => {
  const VECINOS: Product[] = [
    { id: "limon", name: "Panque de Limon", category: "pan", subcategory: "Rebanada de Panque", description: "Rebanada de Panque", price: 20, variantId: "v-limon" },
    { id: "manzana", name: "Panque de Manzana", category: "pan", subcategory: "Rebanada de Panque", description: "Rebanada de Panque", price: 20, variantId: "v-manzana" },
    { id: "taro-cal", name: "Taro", category: "leche", subcategory: "A Base de Leche", price: 55, variantId: "v-taro-cal" },
    { id: "taro-fra", name: "Taro", category: "frappes", subcategory: "Frappe a base de leche", description: "Frappe a base de leche", price: 45, variantId: "v-taro-fra" },
    { id: "capu", name: "Cappuccino", category: "cafe", subcategory: "Con Cafe", price: 35, variantId: "v-capu" },
  ]
  const c = armarCatalogo(VECINOS)

  it("si el nombre corresponde al código, el código vale", () => {
    expect(verificarProducto(c.porCodigo.get("p1"), "Rebanada de panqué de limón", c)).toEqual({ product: VECINOS[0] })
  })

  it("si el código es el del vecino, gana el producto que corresponde al nombre", () => {
    expect(verificarProducto(c.porCodigo.get("p2"), "panqué de limón", c)).toEqual({ product: VECINOS[0] })
    const r = resolver({ producto: "p2", nombre: "Panqué de limón", cantidad: 1 }, c)
    expect(r.ok && r.product.id).toBe("limon")
  })

  it("con la descripción distingue el taro en frappé del caliente", () => {
    expect(verificarProducto(c.porCodigo.get("p5"), "frappé de taro", c)).toEqual({ product: VECINOS[3] })
  })

  it("si el nombre empata («taro» a secas), gana el más sencillo: el caliente, no el frappé", () => {
    expect(verificarProducto(c.porCodigo.get("p5"), "taro", c)).toEqual({ product: VECINOS[2] })
    const r = resolver({ producto: "p5", nombre: "Cappuccino", cantidad: 1 }, c)
    expect(r.ok && r.product.id).toBe("capu")
  })

  it("si empatan también en sencillez, rechaza en vez de adivinar", () => {
    const gemelos: Product[] = [
      { id: "choco-1", name: "Chocolate", category: "a", subcategory: "Bebidas", price: 40, variantId: "v1" },
      { id: "choco-2", name: "Chocolate", category: "b", subcategory: "Postres", price: 30, variantId: "v2" },
      { id: "otro", name: "Americano", category: "a", subcategory: "Bebidas", price: 30, variantId: "v3" },
    ]
    const g = armarCatalogo(gemelos)
    const v = verificarProducto(g.porCodigo.get("p3"), "chocolate", g)
    expect("ambiguo" in v && v.ambiguo.map((p) => p.id)).toEqual(["choco-1", "choco-2"])
    const r = resolver({ producto: "p3", nombre: "chocolate", cantidad: 1 }, g)
    expect(!r.ok && r.mensaje).toContain("Revisa cuál pidió")
  })

  it("si el nombre está escrito distinto y no corresponde a nada, se queda el código", () => {
    expect(verificarProducto(c.porCodigo.get("p5"), "capuchino", c)).toEqual({ product: VECINOS[4] })
  })

  it("sin nombre, como antes", () => {
    expect(verificarProducto(c.porCodigo.get("p2"), undefined, c)).toEqual({ product: VECINOS[1] })
  })
})

describe("cambiar la cantidad («mejor nada más uno»)", () => {
  const dos = () => {
    let lines = agregar([], { producto: "p2", cantidad: 2 }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p4", cantidad: 1 }, cat, nuevoId).lines
    return lines
  }
  it("deja la cantidad final sin que el bot haga cuentas", () => {
    const r = cambiarCantidad(dos(), { producto: "p2", cantidad: 1 }, cat)
    expect(r.respuesta.ok).toBe(true)
    expect(r.lines[0].quantity).toBe(1)
    expect(r.respuesta.pedido.total).toBe(65)
    expect(r.respuesta.mensaje).toContain("Ahora: 1 × Americano")
  })
  it("con 0 lo quita", () => {
    const r = cambiarCantidad(dos(), { producto: "p4", cantidad: 0 }, cat)
    expect(r.lines).toHaveLength(1)
  })
  it("rechaza cantidades raras y productos que no están", () => {
    expect(cambiarCantidad(dos(), { producto: "p2", cantidad: -1 }, cat).respuesta.ok).toBe(false)
    expect(cambiarCantidad(dos(), { producto: "p1", cantidad: 1 }, cat).respuesta.ok).toBe(false)
  })
})

describe("el ayudante encuentra el renglón que el cajero describe", () => {
  // Como en la captura del usuario: dos con un extra, uno sin él, y otra cosa.
  const carrito = () => {
    let lines = agregar([], { producto: "p1", tamano: "Grande", cantidad: 2, extras: [e("m-almendra")] }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p1", tamano: "Grande", cantidad: 1 }, cat, nuevoId).lines
    lines = agregar(lines, { producto: "p2", cantidad: 1 }, cat, nuevoId).lines
    return lines
  }

  it("«el latte grande que NO es de almendra»", () => {
    const lines = carrito()
    const r = buscarEnCarrito(lines, { producto: "p1", nombre: "Latte", tamano: "Grande", sin_extras: [e("m-almendra")] }, cat)
    expect(r.ok && lines[r.indice].modifiers.map((m) => m.id)).toEqual(["m-entera"])
    expect(r.ok && r.varios).toBe(false)
  })

  it("«el de almendra»", () => {
    const lines = carrito()
    const r = buscarEnCarrito(lines, { producto: "p1", nombre: "Latte", extras: [e("m-almendra")] }, cat)
    expect(r.ok && lines[r.indice].quantity).toBe(2)
  })

  it("«quita uno de los lattes»: el último agregado, y avisa que había varios", () => {
    const lines = carrito()
    const r = buscarEnCarrito(lines, { producto: "p1", nombre: "Latte" }, cat)
    expect(r.ok && r.indice).toBe(1)
    expect(r.ok && r.varios).toBe(true)
    // y entrega todos los que coinciden, para «ya no van los lattes»
    expect(r.ok && r.indices).toEqual([0, 1])
  })

  it("si el código es el del vecino, el nombre manda", () => {
    const lines = carrito()
    const r = buscarEnCarrito(lines, { producto: "p3", nombre: "Americano" }, cat)
    expect(r.ok && lines[r.indice].product.id).toBe("americano")
  })

  it("dice qué no hay, en vez de quitar otra cosa", () => {
    const lines = carrito()
    expect(buscarEnCarrito(lines, { producto: "p4", nombre: "Panqué de plátano" }, cat)).toEqual({ ok: false, mensaje: "No hay Panqué de plátano en el carrito." })
    expect(buscarEnCarrito(lines, { producto: "p1", nombre: "Latte", tamano: "Chico" }, cat)).toEqual({ ok: false, mensaje: "No hay Latte así en el carrito." })
  })
})
