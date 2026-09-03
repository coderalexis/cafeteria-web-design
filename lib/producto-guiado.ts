import { choiceHint, choiceToRule, type ChoiceKey } from "./modifiers"

/**
 * El asistente «Nuevo producto», sin React: el estado de los cuatro pasos,
 * qué falta en cada uno, los ejemplos con los que se arranca una pregunta
 * («Proteína a elegir», «Guarniciones»), y cómo se convierte todo en el JSON
 * que recibe `create_product_guided`. Vive aquí para poder probarlo aislado
 * y para que la pantalla no tenga reglas escondidas.
 */

export interface TamanoGuiado {
  /** Lo que ve el cajero en el botón: «Chico», «2 porciones». */
  nombre: string
  /** Detalle chico y opcional: «12 oz», «350 g». */
  medida: string
  precio: string
  costo: string
}

export interface OpcionGuiada {
  nombre: string
  /** Costo extra en pesos; vacío o 0 = sin costo. */
  extra: string
  /** Sale ya marcada al vender (como mucho una por pregunta). */
  omision: boolean
}

export interface PreguntaNueva {
  key: string
  nombre: string
  regla: ChoiceKey
  cantidad: number
  opciones: OpcionGuiada[]
}

export interface EstadoGuiado {
  nombre: string
  descripcion: string
  /** Id de una categoría existente, o NUEVA_CATEGORIA. */
  categoriaId: string
  categoriaNueva: string
  modoPrecio: "uno" | "tamanos"
  precio: string
  costo: string
  tamanos: TamanoGuiado[]
  /** Ids de preguntas que ya existen y se enganchan tal cual. */
  existentes: string[]
  nuevas: PreguntaNueva[]
}

export const NUEVA_CATEGORIA = "__nueva__"

export const estadoInicial = (): EstadoGuiado => ({
  nombre: "",
  descripcion: "",
  categoriaId: "",
  categoriaNueva: "",
  modoPrecio: "uno",
  precio: "",
  costo: "",
  tamanos: [
    { nombre: "Chico", medida: "", precio: "", costo: "" },
    { nombre: "Grande", medida: "", precio: "", costo: "" },
  ],
  existentes: [],
  nuevas: [],
})

let seq = 0
export const nuevaKey = () => `p${++seq}-${Date.now().toString(36)}`

/**
 * Con qué se arranca una pregunta nueva. Son plantillas, no reglas: todo se
 * puede renombrar o borrar. Existen porque la hoja en blanco es el pretexto
 * («no sé cómo poner que elijan la proteína»): se toca «Proteína a elegir» y
 * ya hay algo que corregir en vez de algo que inventar.
 */
export const PRESETS_PREGUNTA: { key: string; etiqueta: string; pregunta: Omit<PreguntaNueva, "key"> }[] = [
  {
    key: "proteina",
    etiqueta: "Proteína a elegir",
    pregunta: {
      nombre: "Proteína",
      regla: "una-obligatoria",
      cantidad: 1,
      opciones: [
        { nombre: "Pollo", extra: "", omision: false },
        { nombre: "Pescado", extra: "", omision: false },
        { nombre: "Res", extra: "", omision: false },
      ],
    },
  },
  {
    key: "porciones",
    etiqueta: "1 o 2 porciones (con costo)",
    pregunta: {
      nombre: "Porciones",
      regla: "una-obligatoria",
      cantidad: 1,
      opciones: [
        { nombre: "1 porción", extra: "", omision: true },
        { nombre: "2 porciones", extra: "45", omision: false },
      ],
    },
  },
  {
    key: "guarniciones",
    etiqueta: "Guarniciones incluidas (elige 2)",
    pregunta: {
      nombre: "Guarniciones",
      regla: "exacto",
      cantidad: 2,
      opciones: [
        { nombre: "Arroz", extra: "", omision: false },
        { nombre: "Camote", extra: "", omision: false },
        { nombre: "Ensalada", extra: "", omision: false },
        { nombre: "Verduras", extra: "", omision: false },
      ],
    },
  },
  {
    key: "guarnicion-extra",
    etiqueta: "Guarnición extra (con costo)",
    pregunta: {
      nombre: "Guarnición extra",
      regla: "varias",
      cantidad: 2,
      opciones: [
        { nombre: "Arroz extra", extra: "20", omision: false },
        { nombre: "Camote extra", extra: "20", omision: false },
      ],
    },
  },
  {
    key: "leche",
    etiqueta: "Tipo de leche",
    pregunta: {
      nombre: "Tipo de leche",
      regla: "una-opcional",
      cantidad: 1,
      opciones: [
        { nombre: "Deslactosada", extra: "", omision: false },
        { nombre: "Vegetal", extra: "10", omision: false },
      ],
    },
  },
  {
    key: "extras",
    etiqueta: "Extras con costo",
    pregunta: {
      nombre: "Extras",
      regla: "varias",
      cantidad: 2,
      opciones: [
        { nombre: "Shot extra", extra: "12", omision: false },
        { nombre: "Jarabe", extra: "8", omision: false },
      ],
    },
  },
  {
    key: "blanco",
    etiqueta: "Otra pregunta…",
    pregunta: { nombre: "", regla: "una-obligatoria", cantidad: 1, opciones: [{ nombre: "", extra: "", omision: false }] },
  },
]

/** «45», «45.50», «45,50» o vacío (= 0). NaN si no es un número. */
export function pesos(texto: string): number {
  const t = texto.trim().replace(",", ".")
  if (t === "") return 0
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : Number.NaN
}

/** Lo que el POS escribirá bajo la pregunta. */
export function pistaPregunta(p: PreguntaNueva): string {
  return choiceHint(choiceToRule(p.regla, p.cantidad))
}

/**
 * Qué falta para avanzar del paso dado. `null` = se puede seguir. Un solo
 * mensaje a la vez, en el idioma de quien lo lee.
 */
export function validarPaso(e: EstadoGuiado, paso: 1 | 2 | 3): string | null {
  if (paso === 1) {
    const n = e.nombre.trim()
    if (n.length < 2) return "Escribe el nombre del producto (mínimo 2 letras)."
    if (n.length > 80) return "El nombre es demasiado largo (máximo 80)."
    if (!e.categoriaId) return "Elige en qué categoría va, o crea una nueva."
    if (e.categoriaId === NUEVA_CATEGORIA && e.categoriaNueva.trim().length < 2) {
      return "Escribe el nombre de la categoría nueva."
    }
    if (e.descripcion.length > 300) return "La descripción es demasiado larga (máximo 300)."
    return null
  }
  if (paso === 2) {
    if (e.modoPrecio === "uno") {
      if (e.precio.trim() === "" || Number.isNaN(pesos(e.precio))) return "Escribe el precio (un número, sin signo)."
      if (Number.isNaN(pesos(e.costo))) return "El costo debe ser un número (o déjalo vacío)."
      return null
    }
    const filas = e.tamanos.filter((t) => t.nombre.trim() !== "" || t.precio.trim() !== "")
    if (filas.length === 0) return "Agrega al menos un tamaño con su precio."
    for (const t of filas) {
      if (t.nombre.trim() === "") return "Cada tamaño necesita un nombre (Chico, 1 porción…)."
      if (t.precio.trim() === "" || Number.isNaN(pesos(t.precio))) return `Falta el precio de «${t.nombre.trim()}».`
      if (Number.isNaN(pesos(t.costo))) return `El costo de «${t.nombre.trim()}» debe ser un número.`
    }
    const nombres = filas.map((t) => t.nombre.trim().toLowerCase())
    if (new Set(nombres).size !== nombres.length) return "Dos tamaños tienen el mismo nombre."
    return null
  }
  for (const p of e.nuevas) {
    const n = p.nombre.trim()
    if (n.length < 2) return "Cada pregunta nueva necesita un nombre («Proteína», «Guarniciones»)."
    const ops = p.opciones.filter((o) => o.nombre.trim() !== "")
    if (ops.length === 0) return `La pregunta «${n}» necesita al menos una opción.`
    for (const o of ops) {
      if (Number.isNaN(pesos(o.extra))) return `El costo extra de «${o.nombre.trim()}» debe ser un número.`
    }
    const regla = choiceToRule(p.regla, p.cantidad)
    if (regla.min > ops.length) {
      return `«${n}» pide elegir ${regla.min}, pero solo tiene ${ops.length} opción${ops.length === 1 ? "" : "es"}.`
    }
    if (ops.filter((o) => o.omision).length > 1) return `Solo una opción de «${n}» puede ir por omisión.`
  }
  return null
}

/** Lo que va al servidor. */
export interface PayloadGuiado {
  name: string
  description?: string
  category: { id: string } | { name: string }
  variants: { name?: string; size_label?: string; price: number; cost?: number }[]
  groups: (
    | { id: string }
    | { name: string; min_select: number; max_select: number | null; options: { name: string; price_delta: number; is_default?: boolean }[] }
  )[]
}

export function armarPayload(e: EstadoGuiado): PayloadGuiado {
  const variants: PayloadGuiado["variants"] =
    e.modoPrecio === "uno"
      ? [{ price: pesos(e.precio), cost: pesos(e.costo) || undefined }]
      : e.tamanos
          .filter((t) => t.nombre.trim() !== "" || t.precio.trim() !== "")
          .map((t) => ({
            name: t.nombre.trim(),
            size_label: t.medida.trim() || undefined,
            price: pesos(t.precio),
            cost: pesos(t.costo) || undefined,
          }))
  const groups: PayloadGuiado["groups"] = [
    ...e.existentes.map((id) => ({ id })),
    ...e.nuevas.map((p) => {
      const regla = choiceToRule(p.regla, p.cantidad)
      return {
        name: p.nombre.trim(),
        min_select: regla.min,
        max_select: regla.max,
        options: p.opciones
          .filter((o) => o.nombre.trim() !== "")
          .map((o) => ({ name: o.nombre.trim(), price_delta: pesos(o.extra), is_default: o.omision || undefined })),
      }
    }),
  ]
  return {
    name: e.nombre.trim(),
    description: e.descripcion.trim() || undefined,
    category: e.categoriaId === NUEVA_CATEGORIA ? { name: e.categoriaNueva.trim() } : { id: e.categoriaId },
    variants,
    groups,
  }
}

/**
 * Para el resumen: el precio más bajo del producto y cuánto sale «con todo
 * lo obligatorio y la opción más cara», que es la cifra que sorprende si
 * quedó mal una regla o un costo extra.
 */
export function ejemploTotal(
  e: EstadoGuiado,
  existentes: { id: string; minSelect: number; options: { priceDelta: number }[] }[],
): { base: number; conObligatorios: number } {
  const p = armarPayload(e)
  const base = Math.min(...p.variants.map((v) => v.price))
  let extra = 0
  for (const g of p.groups) {
    if ("id" in g) {
      const ex = existentes.find((x) => x.id === g.id)
      if (ex && ex.minSelect > 0 && ex.options.length > 0) extra += Math.max(...ex.options.map((o) => o.priceDelta)) * ex.minSelect
    } else if (g.min_select > 0 && g.options.length > 0) {
      extra += Math.max(...g.options.map((o) => o.price_delta)) * g.min_select
    }
  }
  return { base, conObligatorios: Math.round((base + extra) * 100) / 100 }
}
