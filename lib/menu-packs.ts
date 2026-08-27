import type { CategoryColor } from "@/lib/category-colors"

/**
 * Paquetes de menú: lo que una cafetería puede instalar de arranque en vez de
 * recibir un menú completo que nadie pidió.
 *
 * Viven aquí y no en la base a propósito. Corregir un precio o agregar un sabor
 * es un deploy, no una migración, y no hay que mantener una tabla de plantillas
 * por negocio. El RPC `install_menu_pack` recibe el paquete ya armado; el
 * cliente solo manda la CLAVE, así que nadie puede inventarse un paquete.
 *
 * Los precios son un punto de partida realista para México, no una
 * recomendación: lo primero que hará cualquiera es ajustarlos a los suyos.
 */

export interface PackVariant {
  name: string
  sizeLabel?: string
  price: number
}

export interface PackProduct {
  name: string
  description?: string
  variants: PackVariant[]
}

export interface PackCategory {
  name: string
  slug: string
  color: CategoryColor
  products: PackProduct[]
}

export interface PackModifierGroup {
  name: string
  minSelect: number
  maxSelect: number | null
  isRequired: boolean
  options: Array<{ name: string; priceDelta: number }>
  /** Slugs de las categorías cuyos productos usan este grupo. */
  attachTo: string[]
}

export interface MenuPack {
  key: string
  label: string
  hint: string
  emoji: string
  categories: PackCategory[]
  modifierGroups?: PackModifierGroup[]
}

/* Tamaños: misma convención que el resto del sistema (una sola variante se
   llama «Único» y no lleva etiqueta de tamaño). */
const cg = (chico: number, grande: number): PackVariant[] => [
  { name: "Chico", sizeLabel: "12 oz", price: chico },
  { name: "Grande", sizeLabel: "16 oz", price: grande },
]
const cgf = (chico: number, grande: number, frio = grande): PackVariant[] => [
  ...cg(chico, grande),
  { name: "Frío", sizeLabel: "16 oz", price: frio },
]
const uno = (price: number): PackVariant[] => [{ name: "Único", price }]

export const MENU_PACKS: MenuPack[] = [
  {
    key: "espresso",
    label: "Café espresso",
    hint: "Lo indispensable de la barra: americano, capuchino, latte, mocha.",
    emoji: "☕",
    categories: [
      {
        name: "Café",
        slug: "cafe",
        color: "amber",
        products: [
          { name: "Espresso", description: "Shot sencillo o doble", variants: [
            { name: "Sencillo", sizeLabel: "1 oz", price: 25 },
            { name: "Doble", sizeLabel: "2 oz", price: 40 },
          ] },
          { name: "Cortado", description: "Espresso con un toque de leche", variants: [{ name: "Único", sizeLabel: "4 oz", price: 32 }] },
          { name: "Americano", variants: cgf(35, 45) },
          { name: "Capuchino", variants: cg(42, 52) },
          { name: "Latte", variants: cgf(45, 58) },
          { name: "Flat White", variants: [{ name: "Único", sizeLabel: "12 oz", price: 52 }] },
          { name: "Mocha", variants: cgf(55, 68) },
          { name: "Café de olla", description: "Con piloncillo y canela", variants: cg(30, 38) },
        ],
      },
    ],
  },
  {
    key: "leche",
    label: "Bebidas con leche",
    hint: "Sin café: chocolate, chai, matcha, taro, mazapán.",
    emoji: "🥛",
    categories: [
      {
        name: "A base de leche",
        slug: "a-base-de-leche",
        color: "orange",
        products: [
          { name: "Chocolate", variants: cgf(48, 58) },
          { name: "Chai Latte", variants: cgf(52, 62) },
          { name: "Matcha Latte", variants: cgf(58, 70) },
          { name: "Taro", variants: cgf(58, 70) },
          { name: "Mazapán", variants: cgf(55, 65) },
          { name: "Cajeta", variants: cgf(55, 65) },
          { name: "Cookies and Cream", variants: cgf(58, 70) },
          { name: "Fresas con crema", variants: cgf(58, 70) },
        ],
      },
    ],
  },
  {
    key: "frappes",
    label: "Frappés",
    hint: "Los que se van solos en calor: moka, taro, matcha, de fruta.",
    emoji: "🧊",
    categories: [
      {
        name: "Frappés",
        slug: "frappes",
        color: "sky",
        products: [
          { name: "Frappé de café", variants: cg(52, 65) },
          { name: "Moka", variants: cg(58, 70) },
          { name: "Cookies and Cream", variants: cg(60, 72) },
          { name: "Taro", variants: cg(60, 72) },
          { name: "Matcha", variants: cg(62, 75) },
          { name: "Chai", variants: cg(58, 70) },
          { name: "Mazapán", variants: cg(58, 70) },
          { name: "Fresa", variants: cg(55, 68) },
          { name: "Mango", variants: cg(55, 68) },
          { name: "Maracuyá", variants: cg(55, 68) },
        ],
      },
    ],
  },
  {
    key: "te",
    label: "Tés e infusiones",
    hint: "Para quien no toma café. Ligero de preparar y de buen margen.",
    emoji: "🍵",
    categories: [
      {
        name: "Tés e infusiones",
        slug: "te-e-infusiones",
        color: "emerald",
        products: [
          { name: "Té negro", variants: uno(32) },
          { name: "Té verde", variants: uno(32) },
          { name: "Manzanilla", variants: uno(30) },
          { name: "Manzana con canela", variants: uno(32) },
          { name: "Frutos rojos", variants: uno(35) },
          { name: "Jengibre con limón", variants: uno(35) },
          { name: "Jamaica", variants: uno(32) },
        ],
      },
    ],
  },
  {
    key: "frias",
    label: "Bebidas frías",
    hint: "Sodas italianas, limonadas y té helado. Salvan el verano.",
    emoji: "🥤",
    categories: [
      {
        name: "Bebidas frías",
        slug: "bebidas-frias",
        color: "teal",
        products: [
          { name: "Soda italiana de fresa", variants: cg(42, 52) },
          { name: "Soda italiana de mango", variants: cg(42, 52) },
          { name: "Soda italiana de maracuyá", variants: cg(42, 52) },
          { name: "Soda italiana de moras", variants: cg(42, 52) },
          { name: "Limonada natural", variants: cg(35, 45) },
          { name: "Limonada mineral", variants: cg(40, 50) },
          { name: "Naranjada", variants: cg(40, 50) },
          { name: "Té helado de limón", variants: cg(38, 48) },
          { name: "Agua embotellada", variants: uno(20) },
        ],
      },
    ],
  },
  {
    key: "panaderia",
    label: "Panadería y postres",
    hint: "Lo que se vende junto al café sin preparar nada.",
    emoji: "🥐",
    categories: [
      {
        name: "Panadería y postres",
        slug: "panaderia",
        color: "rose",
        products: [
          { name: "Croissant", variants: uno(35) },
          { name: "Croissant de chocolate", variants: uno(45) },
          { name: "Concha", variants: uno(25) },
          { name: "Galleta de avena", variants: uno(28) },
          { name: "Brownie", variants: uno(45) },
          { name: "Panqué de limón", variants: uno(38) },
          { name: "Panqué de plátano", variants: uno(38) },
          { name: "Rebanada de pastel", variants: uno(65) },
          { name: "Cheesecake", variants: uno(70) },
        ],
      },
    ],
  },
  {
    key: "salado",
    label: "Para comer",
    hint: "Sándwiches, molletes y desayunos: sube mucho el ticket promedio.",
    emoji: "🥪",
    categories: [
      {
        name: "Para comer",
        slug: "para-comer",
        color: "lime",
        products: [
          { name: "Sándwich de jamón y queso", variants: uno(68) },
          { name: "Baguette de pollo", variants: uno(88) },
          { name: "Croissant de jamón y queso", variants: uno(72) },
          { name: "Bagel con queso crema", variants: uno(62) },
          { name: "Molletes", description: "Dos piezas con pico de gallo", variants: uno(68) },
          { name: "Chilaquiles", description: "Verdes o rojos, con pollo", variants: uno(98) },
          { name: "Quesadilla", variants: uno(55) },
          { name: "Ensalada César", variants: uno(92) },
        ],
      },
    ],
  },
  {
    key: "crepas",
    label: "Crepas y waffles",
    hint: "Dulces y saladas. Se preparan al momento.",
    emoji: "🥞",
    categories: [
      {
        name: "Crepas y waffles",
        slug: "crepas",
        color: "violet",
        products: [
          { name: "Crepa de Nutella", variants: uno(68) },
          { name: "Crepa de cajeta y nuez", variants: uno(72) },
          { name: "Crepa de fresas con crema", variants: uno(78) },
          { name: "Crepa de frutos rojos", variants: uno(82) },
          { name: "Crepa de jamón y queso", variants: uno(78) },
          { name: "Crepa de champiñones", variants: uno(82) },
          { name: "Waffle con miel", variants: uno(65) },
          { name: "Waffle con helado", variants: uno(85) },
        ],
      },
    ],
  },
  {
    key: "extras",
    label: "Personalizaciones",
    hint: "Leche de avena, shot extra, jarabes. Se cobran encima de la bebida.",
    emoji: "⚙️",
    categories: [],
    modifierGroups: [
      {
        name: "Tipo de leche",
        minSelect: 0,
        maxSelect: 1,
        isRequired: false,
        attachTo: ["cafe", "a-base-de-leche", "frappes"],
        options: [
          { name: "Deslactosada", priceDelta: 8 },
          { name: "De avena", priceDelta: 15 },
          { name: "De almendra", priceDelta: 15 },
          { name: "Light", priceDelta: 0 },
        ],
      },
      {
        name: "Extras",
        minSelect: 0,
        maxSelect: 3,
        isRequired: false,
        attachTo: ["cafe", "a-base-de-leche", "frappes"],
        options: [
          { name: "Shot de espresso", priceDelta: 12 },
          { name: "Jarabe de vainilla", priceDelta: 8 },
          { name: "Jarabe de caramelo", priceDelta: 8 },
          { name: "Crema batida", priceDelta: 10 },
          { name: "Chispas de chocolate", priceDelta: 8 },
        ],
      },
    ],
  },
]

export function packByKey(key: string): MenuPack | undefined {
  return MENU_PACKS.find((p) => p.key === key)
}

/** Cuántos productos trae y en qué rango de precios, para enseñarlo antes de instalar. */
export function packSummary(pack: MenuPack): { products: number; min: number; max: number } {
  const precios = pack.categories.flatMap((c) => c.products.flatMap((p) => p.variants.map((v) => v.price)))
  return {
    products: pack.categories.reduce((n, c) => n + c.products.length, 0),
    min: precios.length ? Math.min(...precios) : 0,
    max: precios.length ? Math.max(...precios) : 0,
  }
}

/**
 * Traduce el paquete al jsonb que espera `install_menu_pack` (snake_case, como
 * las columnas). Se hace en el servidor: al RPC nunca llega algo que el cliente
 * haya podido tocar.
 */
export function packPayload(pack: MenuPack): Record<string, unknown> {
  return {
    categories: pack.categories.map((c) => ({
      name: c.name,
      slug: c.slug,
      color: c.color,
      products: c.products.map((p) => ({
        name: p.name,
        description: p.description ?? "",
        variants: p.variants.map((v) => ({
          name: v.name,
          size_label: v.sizeLabel ?? "",
          price: v.price,
        })),
      })),
    })),
    modifier_groups: (pack.modifierGroups ?? []).map((g) => ({
      name: g.name,
      min_select: g.minSelect,
      max_select: g.maxSelect,
      is_required: g.isRequired,
      attach_to: g.attachTo,
      options: g.options.map((o) => ({ name: o.name, price_delta: o.priceDelta })),
    })),
  }
}
