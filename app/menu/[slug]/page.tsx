import { notFound } from "next/navigation"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import type { Metadata } from "next"
import { createPublicClient } from "@/lib/supabase/public"
import { colorClasses } from "@/lib/category-colors"
import { priceRange, type PublicMenu } from "@/lib/public-menu"
import { Coffee, MapPin, Phone } from "lucide-react"
import { MenuNav } from "./menu-nav"

/**
 * Menú público para el QR de las mesas. Sin sesión: todo sale del RPC
 * `public_menu`, que solo responde si el dueño activó el menú público.
 *
 * Quien escanea el QR es un cliente en la mesa, no un usuario: no hay nada que
 * personalizar, así que la carta se guarda un minuto y se sirve a todos.
 *
 * Costó dos intentos que el cacheo de verdad ocurriera, y vale documentarlo:
 *   1. El cliente de Supabase con sesión LEE COOKIES, y en Next eso obliga a
 *      renderizar en cada visita. Por eso este `revalidate` llevaba tiempo
 *      escrito sin surtir efecto. De ahí `createPublicClient` (sin cookies).
 *   2. Aun así seguía consultando la base cada vez: en Next 15 las llamadas
 *      `fetch` NO se cachean por omisión, y el caché de `fetch` nunca guarda
 *      peticiones POST —que es lo que manda un RPC—. La solución es cachear
 *      el DATO (`unstable_cache`), no la petición.
 *
 * El precio: un cambio de precio tarda hasta un minuto en verse en la carta
 * pública. Aceptable para un menú de pared; no lo sería para el POS, que por
 * eso sigue leyendo la base en vivo.
 */
export const revalidate = 60

const menuCacheado = unstable_cache(
  async (slug: string): Promise<PublicMenu | null> => {
    const supabase = createPublicClient()
    const { data } = await supabase.rpc("public_menu", { p_slug: slug })
    return (data as unknown as PublicMenu | null) ?? null
  },
  ["menu-publico"],
  { revalidate: 60 },
)

/** `cache` de React: el menú se pide dos veces por render (el título y la página). */
const getMenu = cache((slug: string) => menuCacheado(slug))

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const menu = await getMenu((await params).slug)
  if (!menu) return { title: "Menú no disponible" }
  return {
    title: `Menú · ${menu.business.name}`,
    description: `Menú y precios de ${menu.business.name}.`,
    robots: { index: true, follow: true },
  }
}

export default async function MenuPublicoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const menu = await getMenu((await params).slug)
  if (!menu) notFound()

  const { business, categories } = menu

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Encabezado */}
        <header className="text-center">
          {/* Con logo propio se ve el logo y nada mas: el cuadro ambar es el
              relleno de quien todavia no sube uno, no un marco de la marca. */}
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              className="mx-auto h-20 w-auto max-w-[70%] object-contain"
            />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
              <Coffee className="h-7 w-7 text-amber-700" />
            </div>
          )}
          <h1 className="mt-4 text-3xl font-bold text-stone-800">{business.name}</h1>
          {business.tagline && <p className="mt-1 text-sm text-stone-500">{business.tagline}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-500">
            {business.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {business.address}
              </span>
            )}
            {business.phone && (
              <a href={`tel:${business.phone}`} className="inline-flex items-center gap-1 hover:text-amber-700">
                <Phone className="h-3.5 w-3.5" />
                {business.phone}
              </a>
            )}
          </div>
        </header>

        {/* Índice de categorías. Se queda PEGADO arriba al bajar: en los menús
            reales hay hasta 2 410 px (tres pantallas de celular) entre una
            categoría y otra, y antes el índice solo existía al principio.
            Va aquí suelto y no dentro de un <div>: `sticky` pega dentro de su
            padre, y un envoltorio de paso lo dejaría pegado a su propio alto. */}
        {categories.length > 1 && (
          <MenuNav
            categorias={categories.map((cat) => {
              const color = colorClasses(cat.color)
              return {
                slug: cat.slug,
                name: cat.name,
                chip: color?.chip ?? "",
                chipActive: color?.chipActive ?? "",
              }
            })}
          />
        )}

        {/* Menú */}
        <main className="mt-8 space-y-8">
          {categories.length === 0 && (
            <p className="py-12 text-center text-sm text-stone-400">
              Este menú aún no tiene productos publicados.
            </p>
          )}

          {categories.map((cat) => {
            const color = colorClasses(cat.color)
            return (
              <section key={cat.slug} id={cat.slug} className="scroll-mt-20">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-stone-500">
                  {color && <span className={`h-3 w-3 rounded-full ${color.dot}`} aria-hidden />}
                  {cat.name}
                </h2>
                {cat.note && <p className="mt-1 text-sm italic text-stone-500">{cat.note}</p>}
                <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white">
                  {cat.products.map((product, i) => (
                    <div
                      key={product.name}
                      className={`px-4 py-3 ${i > 0 ? "border-t border-stone-100" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-semibold text-stone-800">{product.name}</h3>
                        <span className="shrink-0 font-bold text-amber-700">{priceRange(product)}</span>
                      </div>
                      {product.description && product.description !== cat.name && (
                        <p className="mt-0.5 text-sm text-stone-500">{product.description}</p>
                      )}
                      {product.variants.length > 1 && (
                        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500">
                          {product.variants.map((v) => (
                            <li key={v.name}>
                              {v.name}
                              {v.size_label ? ` (${v.size_label})` : ""} ·{" "}
                              <span className="font-medium text-stone-700">${v.price}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {product.extras.length > 0 && (
                        <p className="mt-1 text-xs text-stone-400">
                          Extras: {product.extras.map((e) => `${e.name} +$${e.price}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </main>

        <footer className="mt-12 text-center text-xs text-stone-400">
          {business.menu_note && (
            <p className="mx-auto mb-3 max-w-sm text-sm italic text-stone-500">{business.menu_note}</p>
          )}
          <p>Los precios pueden cambiar sin previo aviso.</p>
          <p className="mt-1">Menú de {business.name} · Cafecito POS</p>
        </footer>
      </div>
    </div>
  )
}
