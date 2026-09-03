"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BookOpen, Search, X } from "lucide-react"
import { buscarAdmin, type DestinoAdmin } from "@/lib/admin-search"

/**
 * Ilumina la tarjeta destino cuando aparezca.
 *
 * El router de Next navega con pushState, y con pushState el navegador NO
 * actualiza `:target` (solo lo hace en una navegación real de fragmento), así
 * que el resaltado por CSS se quedaba sin disparar. Se espera a que la
 * tarjeta exista en el DOM —la pantalla nueva tarda unos cuadros en pintarse—
 * y se le pone la clase de la animación a mano.
 */
function destacar(id: string) {
  let intentos = 0
  const tick = () => {
    const el = document.getElementById(id)
    if (!el) {
      if (++intentos < 40) setTimeout(tick, 100)
      return
    }
    el.scrollIntoView({ block: "start", behavior: "smooth" })
    el.classList.remove("admin-ancla-destacar")
    void el.offsetWidth // reinicia la animación si se llega dos veces a la misma
    el.classList.add("admin-ancla-destacar")
    setTimeout(() => el.classList.remove("admin-ancla-destacar"), 2600)
  }
  setTimeout(tick, 50)
}

/**
 * El buscador del panel: escribe «impresora», «leche», «pin» y te lleva a la
 * tarjeta exacta. Vive en el menú lateral (y en el menú deslizable del
 * teléfono) porque la pregunta «¿dónde está…?» nace justo ahí, mirando la
 * lista de pantallas sin saber en cuál entrar.
 *
 * Al final de los resultados siempre está «Buscar en la guía»: si el índice
 * no lo tiene, la guía probablemente sí, y la abre ya con la búsqueda puesta.
 *
 * Ctrl+K (o ⌘K) enfoca el campo desde cualquier pantalla del panel.
 */
export function AdminSearch({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter()
  const [consulta, setConsulta] = useState("")
  const [activo, setActivo] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaId = useId()
  const resultados = buscarAdmin(consulta)
  const hayTexto = consulta.trim().length >= 2

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const ir = (destino: DestinoAdmin) => {
    setConsulta("")
    setAbierto(false)
    onNavigate?.()
    router.push(destino.href)
    const ancla = destino.href.split("#")[1]
    if (ancla) destacar(ancla)
  }

  const guiaHref = `/ayuda?q=${encodeURIComponent(consulta.trim())}`

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={abierto && hayTexto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-label="Buscar en el panel"
          placeholder="¿Dónde está…? impresora, leche, pin"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value)
            setActivo(0)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          // Un respiro antes de cerrar: el clic en un resultado llega después del blur.
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActivo((a) => Math.min(a + 1, resultados.length)) // el último índice es «Buscar en la guía»
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActivo((a) => Math.max(a - 1, 0))
            } else if (e.key === "Enter" && hayTexto) {
              e.preventDefault()
              if (activo < resultados.length) ir(resultados[activo])
              else {
                onNavigate?.()
                window.open(guiaHref, "_blank", "noopener")
              }
            } else if (e.key === "Escape") {
              setConsulta("")
              setAbierto(false)
              inputRef.current?.blur()
            }
          }}
          className="h-8 w-full rounded-md border border-stone-200 bg-stone-50 pl-8 pr-7 text-sm text-stone-700 placeholder:text-stone-400 focus:border-amber-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        {consulta && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setConsulta("")
              inputRef.current?.focus()
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-stone-400 hover:text-stone-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {abierto && hayTexto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {resultados.length === 0 && (
            <li className="px-3 py-2 text-xs text-stone-400">Nada con ese nombre en el panel. Prueba en la guía:</li>
          )}
          {resultados.map((d, i) => (
            <li key={d.href + d.titulo} role="option" aria-selected={i === activo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActivo(i)}
                onClick={() => ir(d)}
                className={`block w-full px-3 py-2 text-left ${i === activo ? "bg-amber-50" : "hover:bg-stone-50"}`}
              >
                <p className="text-sm font-medium leading-tight text-stone-800">{d.titulo}</p>
                <p className="mt-0.5 text-[11px] text-stone-400">{d.donde}</p>
              </button>
            </li>
          ))}
          <li role="option" aria-selected={activo === resultados.length} className="border-t border-stone-100">
            <Link
              href={guiaHref}
              target="_blank"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActivo(resultados.length)}
              onClick={() => {
                setAbierto(false)
                onNavigate?.()
              }}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 ${
                activo === resultados.length ? "bg-amber-50" : "hover:bg-stone-50"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              Buscar «{consulta.trim()}» en la guía
            </Link>
          </li>
        </ul>
      )}
    </div>
  )
}
