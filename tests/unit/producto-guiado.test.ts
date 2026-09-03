import { describe, expect, it } from "vitest"
import {
  NUEVA_CATEGORIA,
  PRESETS_PREGUNTA,
  armarPayload,
  ejemploTotal,
  estadoInicial,
  pesos,
  pistaPregunta,
  validarPaso,
  type EstadoGuiado,
} from "@/lib/producto-guiado"

// El asistente promete «ridículamente fácil»: eso se cumple si cada paso
// dice exactamente qué falta y si lo que se manda al servidor es lo que la
// persona armó. Esto fija las dos cosas con el ejemplo real del usuario:
// una comida con proteína a elegir, 1 o 2 porciones y guarniciones.

const comida = (): EstadoGuiado => ({
  ...estadoInicial(),
  nombre: "Comida fit",
  categoriaId: NUEVA_CATEGORIA,
  categoriaNueva: "Comidas",
  modoPrecio: "uno",
  precio: "120",
  costo: "40",
  existentes: ["g-leche"],
  nuevas: [
    { key: "a", ...PRESETS_PREGUNTA.find((p) => p.key === "proteina")!.pregunta },
    { key: "b", ...PRESETS_PREGUNTA.find((p) => p.key === "porciones")!.pregunta },
    { key: "c", ...PRESETS_PREGUNTA.find((p) => p.key === "guarniciones")!.pregunta },
    { key: "d", ...PRESETS_PREGUNTA.find((p) => p.key === "guarnicion-extra")!.pregunta },
  ],
})

describe("pesos", () => {
  it("acepta vacío, punto y coma; rechaza letras y negativos", () => {
    expect(pesos("")).toBe(0)
    expect(pesos("45")).toBe(45)
    expect(pesos("45,50")).toBe(45.5)
    expect(pesos("abc")).toBeNaN()
    expect(pesos("-5")).toBeNaN()
  })
})

describe("validarPaso", () => {
  it("paso 1: nombre y categoría", () => {
    const e = estadoInicial()
    expect(validarPaso(e, 1)).toMatch(/nombre/)
    e.nombre = "Latte"
    expect(validarPaso(e, 1)).toMatch(/categoría/)
    e.categoriaId = NUEVA_CATEGORIA
    expect(validarPaso(e, 1)).toMatch(/categoría nueva/)
    e.categoriaNueva = "Bebidas"
    expect(validarPaso(e, 1)).toBeNull()
  })

  it("paso 2: un precio, o tamaños con nombre y precio sin repetir", () => {
    const e = { ...estadoInicial(), modoPrecio: "uno" as const }
    expect(validarPaso(e, 2)).toMatch(/precio/)
    e.precio = "35"
    expect(validarPaso(e, 2)).toBeNull()
    const t: EstadoGuiado = { ...estadoInicial(), modoPrecio: "tamanos" }
    expect(validarPaso(t, 2)).toMatch(/precio de «Chico»/)
    t.tamanos[0].precio = "40"
    t.tamanos[1].precio = "55"
    expect(validarPaso(t, 2)).toBeNull()
    t.tamanos[1].nombre = "chico"
    expect(validarPaso(t, 2)).toMatch(/mismo nombre/)
  })

  it("paso 3: una pregunta nueva necesita nombre, opciones y una regla posible", () => {
    const e = comida()
    expect(validarPaso(e, 3)).toBeNull()
    e.nuevas[2].opciones = e.nuevas[2].opciones.slice(0, 1) // «elige 2» con una sola opción
    expect(validarPaso(e, 3)).toMatch(/pide elegir 2, pero solo tiene 1 opción/)
    e.nuevas[2].opciones = [
      { nombre: "Arroz", extra: "", omision: true },
      { nombre: "Camote", extra: "", omision: true },
    ]
    expect(validarPaso(e, 3)).toMatch(/Solo una opción/)
  })
})

describe("armarPayload", () => {
  it("un solo precio → una variante sin nombre (el servidor la llama «Único»)", () => {
    const p = armarPayload(comida())
    expect(p.variants).toEqual([{ price: 120, cost: 40 }])
    expect(p.category).toEqual({ name: "Comidas" })
  })

  it("los tamaños llevan su nombre, su medida y su precio", () => {
    const e: EstadoGuiado = {
      ...estadoInicial(),
      nombre: "Latte",
      categoriaId: "cat-1",
      modoPrecio: "tamanos",
      tamanos: [
        { nombre: "Chico", medida: "12 oz", precio: "40", costo: "" },
        { nombre: "Grande", medida: "", precio: "55", costo: "18" },
        { nombre: "", medida: "", precio: "", costo: "" }, // fila vacía: se ignora
      ],
    }
    expect(armarPayload(e).variants).toEqual([
      { name: "Chico", size_label: "12 oz", price: 40, cost: undefined },
      { name: "Grande", size_label: undefined, price: 55, cost: 18 },
    ])
  })

  it("las preguntas existentes van por id y las nuevas con su regla y opciones", () => {
    const g = armarPayload(comida()).groups
    expect(g[0]).toEqual({ id: "g-leche" })
    const porciones = g[2] as { name: string; min_select: number; max_select: number | null; options: { name: string; price_delta: number; is_default?: boolean }[] }
    expect(porciones.name).toBe("Porciones")
    expect(porciones.min_select).toBe(1)
    expect(porciones.max_select).toBe(1)
    expect(porciones.options[1]).toEqual({ name: "2 porciones", price_delta: 45, is_default: undefined })
    expect(porciones.options[0].is_default).toBe(true)
    const guarn = g[3] as { min_select: number; max_select: number | null }
    expect(guarn.min_select).toBe(2)
    expect(guarn.max_select).toBe(2)
    const extra = g[4] as { min_select: number; max_select: number | null }
    expect(extra.max_select).toBeNull()
  })
})

describe("pistaPregunta y ejemploTotal", () => {
  it("la pista es la misma que verá el cajero", () => {
    const e = comida()
    expect(pistaPregunta(e.nuevas[0])).toBe("Elige una")
    expect(pistaPregunta(e.nuevas[2])).toBe("Elige 2")
    expect(pistaPregunta(e.nuevas[3])).toBe("Opcional")
  })

  it("el ejemplo suma lo obligatorio más caro: 120 + 45 (2 porciones) = 165", () => {
    const r = ejemploTotal(comida(), [{ id: "g-leche", minSelect: 0, options: [{ priceDelta: 10 }] }])
    expect(r.base).toBe(120)
    expect(r.conObligatorios).toBe(165)
  })
})
