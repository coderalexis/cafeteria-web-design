import type { Category, Product } from "./cart"

/**
 * El menú del POS tal como lo pinta la rejilla, armado desde las filas de la
 * base. Vive aparte de `page.tsx` porque ya lo leen dos pantallas —el POS y
 * el pedido por voz— y dos copias de esta transformación terminarían
 * diciendo cosas distintas del mismo menú (un producto sin precio en una y
 * no en la otra).
 */

/** Lo que hay que pedirle a `menu_products` para armar el menú. */
export const MENU_PRODUCTS_SELECT = `id, name, description, sort_order, category_id, prompt_modifiers, pinned_order,
         menu_categories(id, name, slug),
         menu_variants(id, name, size_label, price, sort_order, is_active),
         product_modifier_groups(
           modifier_groups(id, name, min_select, max_select, is_required, sort_order, is_active,
             modifiers(id, name, price_delta, sort_order, is_active, is_default))
         )`

export interface FilaCategoria {
  slug: string
  name: string
  color: string | null
}

export interface FilaProducto {
  id: string
  name: string
  description: string | null
  prompt_modifiers: boolean | null
  menu_categories: { slug: string; name: string } | null
  menu_variants: Array<{
    id: string
    name: string
    size_label: string | null
    price: number
    sort_order: number | null
    is_active: boolean
  }> | null
  product_modifier_groups: Array<{
    modifier_groups: {
      id: string
      name: string
      min_select: number
      max_select: number | null
      is_required: boolean
      sort_order: number
      is_active: boolean
      modifiers: Array<{
        id: string
        name: string
        price_delta: number
        sort_order: number | null
        is_active: boolean
        is_default: boolean
      }> | null
    } | null
  }> | null
}

/**
 * Un producto sin NINGUNA variante activa no tiene precio, así que no se
 * puede vender: el panel deja desactivar (o borrar) la última variante, y
 * entonces el producto seguía apareciendo en la rejilla sin precio, entraba
 * al carrito por $0.00 y al cobrar reventaba con «Invalid uuid» —la venta
 * nunca se registra, pero el cajero no entiende por qué—. Mejor no ofrecer
 * lo que no se puede cobrar. En /admin/productos se avisa que quedó fuera.
 */
export function productosVendibles<T extends FilaProducto>(filas: T[]): T[] {
  return filas.filter((p) => (p.menu_variants ?? []).some((v) => v.is_active))
}

export function armarCategorias(filas: FilaCategoria[]): Category[] {
  return [
    { id: "todos", label: "Todos", color: null as string | null },
    ...filas.map((c) => ({ id: c.slug, label: c.name, color: c.color })),
  ]
}

/**
 * La descripción hace dos trabajos distintos en la misma columna.
 *
 * Cuando VARIOS productos la comparten funciona como subtítulo de sección
 * («Frappé a base de leche» vs «a base de agua»), y agrupar por ella ayuda a
 * encontrar las cosas. Cuando es de UN solo producto es su descripción —los
 * ingredientes de un sándwich— y convertirla en encabezado partía la rejilla
 * en secciones de un elemento con un titular en mayúsculas de veinte
 * palabras. En Gym Coffee eso daba 22 encabezados para 10 categorías.
 *
 * La regla: un encabezado tiene que agrupar al menos dos productos. Si no,
 * es descripción y va como subtítulo de la tarjeta.
 *
 * Recibe solo productos vendibles (`productosVendibles`).
 */
export function armarProductos(vendibles: FilaProducto[]): Product[] {
  const productosPorDescripcion = new Map<string, number>()
  for (const p of vendibles) {
    const desc = p.description?.trim()
    if (!desc) continue
    const clave = `${p.menu_categories?.slug ?? ""}|${desc}`
    productosPorDescripcion.set(clave, (productosPorDescripcion.get(clave) ?? 0) + 1)
  }

  return vendibles.map((p) => {
    const cat = p.menu_categories
    const variants = [...(p.menu_variants ?? [])]
      .filter((v) => v.is_active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    const isFlat = variants.length === 1 && variants[0].name === "Único"
    const categorySlug = cat?.slug || ""
    const categoryName = cat?.name || ""

    // Encabezado de sección: la descripción solo si la comparten 2 o más.
    const desc = p.description?.trim()
    const esEtiquetaCompartida =
      !!desc && (productosPorDescripcion.get(`${categorySlug}|${desc}`) ?? 0) >= 2
    const subcategory = esEtiquetaCompartida ? desc! : categoryName

    // Show description on card only if it differs from category name
    const cardDescription =
      p.description && p.description !== categoryName ? p.description : undefined

    // Grupos de modificadores activos con al menos una opción activa
    const modifierGroups = (p.product_modifier_groups ?? [])
      .map((link) => link.modifier_groups)
      .filter((g): g is NonNullable<typeof g> => !!g && g.is_active)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: Math.max(g.min_select, g.is_required ? 1 : 0),
        maxSelect: g.max_select,
        sortOrder: g.sort_order,
        options: [...(g.modifiers ?? [])]
          .filter((m) => m.is_active)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((m) => ({ id: m.id, name: m.name, priceDelta: m.price_delta, isDefault: m.is_default })),
      }))
      .filter((g) => g.options.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map(({ id, name, priceDelta }) => ({ id, name, priceDelta })),
        // La opción marcada «por omisión» en Menú → Modificadores. Solo entre
        // las vivas: una desactivada no se propone.
        defaultOptionId: g.options.find((o) => o.isDefault)?.id ?? null,
      }))

    const base = {
      id: p.id,
      name: p.name,
      category: categorySlug,
      subcategory,
      description: cardDescription,
      modifierGroups: modifierGroups.length > 0 ? modifierGroups : undefined,
      promptModifiers: p.prompt_modifiers ?? true,
    }

    if (isFlat) {
      return { ...base, price: variants[0].price, variantId: variants[0].id }
    }

    return {
      ...base,
      sizes: variants.map((v) => ({
        variantId: v.id,
        label: v.name,
        oz: v.size_label || "",
        price: v.price,
      })),
    }
  })
}
