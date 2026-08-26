/**
 * Forma del jsonb que devuelve el RPC public_menu (migración 17).
 * Lo consume la página pública /menu/<slug> (sin sesión).
 */

export interface PublicMenuVariant {
  name: string
  size_label: string | null
  price: number
}

export interface PublicMenuProduct {
  name: string
  description: string | null
  variants: PublicMenuVariant[]
  extras: Array<{ name: string; price: number }>
}

export interface PublicMenuCategory {
  name: string
  slug: string
  color: string | null
  products: PublicMenuProduct[]
}

export interface PublicMenu {
  business: {
    name: string
    slug: string
    address: string | null
    phone: string | null
    tagline: string | null
  }
  categories: PublicMenuCategory[]
}

/** Rango de precios de un producto: "$45" o "$45 – $60". */
export function priceRange(product: PublicMenuProduct): string {
  const prices = product.variants.map((v) => v.price)
  if (prices.length === 0) return ""
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const fmt = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`
}
