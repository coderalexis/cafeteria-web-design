"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface AtajoCategoria {
  slug: string
  name: string
  /** Clases del chip sin seleccionar y seleccionado (lib/category-colors.ts). */
  chip: string
  chipActive: string
}

/** Aire entre la barra y el título de la categoría a la que se salta. */
const AIRE = 12

/**
 * Índice de categorías del menú público.
 *
 * Antes era una lista que envolvía en cuatro renglones y vivía SOLO arriba del
 * todo. En un celular eso costaba dos cosas, medidas en los menús reales: 160 px
 * de la primera pantalla antes de ver un precio, y —peor— quedarse sin índice en
 * cuanto empiezas a bajar: del bloque de sándwiches al de barra fría hay 2 410 px
 * (tres pantallas de celular) de subir a ciegas.
 *
 * Ahora se queda pegado arriba y marca en qué categoría vas. Con el dedo es un
 * solo renglón que rueda de lado; con ratón envuelve y se centra, porque nadie
 * arrastra una tira con el ratón. Sigue siendo una lista de enlaces `#ancla`:
 * sin JavaScript funciona igual, solo que sin marcar el sitio.
 *
 * OJO al tocarlo: el `sticky` pega dentro de su PADRE, así que este <nav> tiene
 * que seguir siendo hijo directo del contenedor alto de la página. Envolverlo en
 * un div de paso lo deja pegado a una caja de 60 px, o sea, sin pegar nada.
 */
export function MenuNav({ categorias }: { categorias: AtajoCategoria[] }) {
  const [activa, setActiva] = useState(categorias[0]?.slug ?? "")
  const barra = useRef<HTMLElement>(null)
  const tira = useRef<HTMLDivElement>(null)
  // Dónde empieza cada categoría en la página. Se mide UNA vez (y al cambiar de
  // tamaño o al terminar de cargar el logo, que mueve todo hacia abajo): así al
  // desplazarse solo se comparan números y no se vuelve a medir el documento.
  const topes = useRef<{ slug: string; top: number }[]>([])

  /**
   * El alto de la barra se MIDE en vez de escribirse: con el dedo es un renglón
   * y con ratón son dos, así que un número fijo dejaría el título tapado en la
   * mitad de los aparatos.
   */
  const altoBarra = () => barra.current?.getBoundingClientRect().height ?? 0

  const medir = useCallback(() => {
    topes.current = categorias.flatMap((c) => {
      const el = document.getElementById(c.slug)
      return el ? [{ slug: c.slug, top: el.getBoundingClientRect().top + window.scrollY }] : []
    })
  }, [categorias])

  // Cuál acaba de pasar por debajo de la barra. No sirve «cuál se ve»: las
  // secciones de un menú miden de 300 a 1 700 px y se ven dos a la vez.
  const marcar = useCallback(() => {
    const fondoVista = window.scrollY + window.innerHeight

    // Al final de la página ya no queda nada que desplazar, así que las últimas
    // categorías NUNCA llegarían a pasar bajo la barra: en la carta de Gym Coffe,
    // «Ensaladas» y «Panadería» se quedaban sin marcar para siempre y el chip
    // encendido seguía diciendo «Sándwiches». Abajo del todo manda la última que
    // empieza en pantalla, que es justo la que el cliente está leyendo.
    if (fondoVista >= document.documentElement.scrollHeight - 2) {
      const ultima = topes.current.filter((t) => t.top < fondoVista).pop()
      if (ultima) {
        setActiva(ultima.slug)
        return
      }
    }

    const limite = window.scrollY + altoBarra() + AIRE + 4
    let actual = categorias[0]?.slug ?? ""
    for (const t of topes.current) {
      if (t.top <= limite) actual = t.slug
    }
    setActiva(actual)
  }, [categorias])

  useEffect(() => {
    const recalcular = () => {
      medir()
      marcar()
    }
    recalcular()

    window.addEventListener("scroll", marcar, { passive: true })
    window.addEventListener("resize", recalcular)
    // El logo del café llega después del HTML y empuja todo hacia abajo.
    window.addEventListener("load", recalcular)
    return () => {
      window.removeEventListener("scroll", marcar)
      window.removeEventListener("resize", recalcular)
      window.removeEventListener("load", recalcular)
    }
  }, [medir, marcar])

  // El chip de la categoría en curso se centra en la tira. Se calcula a mano en
  // vez de `scrollIntoView`: ese método también desplaza la PÁGINA, y aquí solo
  // queremos mover la tira de lado.
  useEffect(() => {
    const caja = tira.current
    const chip = caja?.querySelector<HTMLElement>(`[data-cat="${activa}"]`)
    if (!caja || !chip || caja.scrollWidth <= caja.clientWidth) return
    // Con rectángulos y no con `offsetLeft`: ese mide contra el ancestro
    // posicionado —aquí el <nav> pegajoso— y no contra la caja que rueda.
    const cajaR = caja.getBoundingClientRect()
    const chipR = chip.getBoundingClientRect()
    const destino = caja.scrollLeft + (chipR.left - cajaR.left) - (caja.clientWidth - chipR.width) / 2
    caja.scrollTo({ left: Math.max(0, destino), behavior: "smooth" })
  }, [activa])

  /**
   * El salto lo hace el JavaScript y no el ancla del navegador: así el título
   * queda bajo la barra SEA CUAL SEA su alto, sin depender de un `scroll-mt`
   * fijo que se descuadra al envolver. El `href` sigue puesto para quien no
   * tenga JavaScript, que entonces usa el `scroll-mt-20` de reserva.
   */
  function saltar(e: React.MouseEvent<HTMLAnchorElement>, slug: string) {
    const destino = document.getElementById(slug)
    // Abrir en otra pestaña (Ctrl/⌘) o en otra ventana sigue siendo del navegador.
    if (!destino || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const top = destino.getBoundingClientRect().top + window.scrollY - altoBarra() - AIRE
    window.scrollTo({ top: Math.max(0, top), behavior: suave ? "smooth" : "auto" })
    // `replaceState` y no el hash a secas: cambiar el hash provoca su propio
    // salto seco, que se pelearía con el desplazamiento suave de arriba.
    window.history.replaceState(null, "", `#${slug}`)
    setActiva(slug)
  }

  return (
    <nav
      ref={barra}
      aria-label="Categorías del menú"
      className="sticky top-0 z-20 -mx-4 mt-8 border-b border-stone-200/80 bg-stone-50/95 px-4 py-2 backdrop-blur"
    >
      {/* Dos cajas y no una: la de fuera rueda, la de dentro mide lo que miden
          los chips (`w-max`) y se centra sola cuando caben. Con `justify-center`
          en la que rueda, lo que sobra por la IZQUIERDA queda inalcanzable —es
          un defecto viejo y conocido de flex—. Con ratón, `tira-si-dedo` la
          devuelve a envolver: diez chips en una tira que nadie va a arrastrar. */}
      <div ref={tira} className="sin-barra overflow-x-auto">
        <div className="tira-si-dedo mx-auto flex w-max gap-2">
          {categorias.map((c) => {
            const puesta = c.slug === activa
            return (
              <a
                key={c.slug}
                href={`#${c.slug}`}
                data-cat={c.slug}
                onClick={(e) => saltar(e, c.slug)}
                aria-current={puesta ? "true" : undefined}
                className={`blanco-comodo inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  puesta
                    ? c.chipActive || "border-stone-700 bg-stone-700 text-white"
                    : c.chip || "border-stone-300 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {c.name}
              </a>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
