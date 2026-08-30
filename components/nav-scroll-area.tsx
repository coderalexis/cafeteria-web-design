"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTextSize } from "@/components/text-size-provider"

/**
 * El menú lateral, con aviso de que hay más abajo.
 *
 * Nace de una queja concreta: «no noté el scroll y pensé que me faltaban
 * opciones». El menú está dimensionado para caber entero en una laptop de 768
 * px, así que normalmente esto no se ve — pero con la letra en «Muy grande» ya
 * no cabe. Un desplazamiento sin aviso es una trampa: quien mira no puede
 * distinguir «esto es todo» de «hay más». La flecha lo dice sin descubrirlo.
 *
 * Se vuelve a medir cuando cambia EL TAMAÑO DE LETRA, y no solo cuando el
 * navegador avisa que algo cambió de tamaño. La razón es concreta: un primer
 * intento se apoyó en `ResizeObserver` y en `requestAnimationFrame`, y el aviso
 * no aparecía nunca — la sonda mostró que la medición corría UNA sola vez, con
 * la letra todavía en 16 px, y ninguno de los dos mecanismos la despertaba
 * después. Depender de ellos era depender de algo que no siempre corre.
 *
 * El `setTimeout` de 0 no es superstición: cuando la letra cambia, este efecto
 * —que es hijo— corre ANTES que el del proveedor que la aplica, así que medir
 * en ese instante daría el tamaño viejo. El plazo cero manda la medición al
 * final de la fila, cuando el navegador ya reacomodó todo.
 */
export function NavScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  const cajaRef = useRef<HTMLElement>(null)
  const contenidoRef = useRef<HTMLDivElement>(null)
  const [hayArriba, setHayArriba] = useState(false)
  const [hayAbajo, setHayAbajo] = useState(false)
  const { size } = useTextSize()

  useEffect(() => {
    const caja = cajaRef.current
    const contenido = contenidoRef.current
    if (!caja || !contenido) return

    const medir = () => {
      // 4 px de tolerancia: el redondeo de subpíxeles puede dejar una
      // diferencia mínima permanente y encender el aviso para siempre.
      setHayArriba(caja.scrollTop > 4)
      setHayAbajo(caja.scrollTop + caja.clientHeight < caja.scrollHeight - 4)
    }

    medir()
    const alFinal = setTimeout(medir, 0)

    caja.addEventListener("scroll", medir, { passive: true })
    window.addEventListener("resize", medir)

    // De regalo, para cambios de contenido que no pasan por el tamaño de letra.
    // Si el entorno no lo dispara, lo de arriba ya cubre los casos reales.
    const observador = new ResizeObserver(medir)
    observador.observe(caja)
    observador.observe(contenido)

    return () => {
      clearTimeout(alFinal)
      caja.removeEventListener("scroll", medir)
      window.removeEventListener("resize", medir)
      observador.disconnect()
    }
  }, [size])

  return (
    <div className="relative min-h-0 flex-1">
      <nav ref={cajaRef} className="h-full overflow-y-auto">
        <div ref={contenidoRef} className={cn(className)}>
          {children}
        </div>
      </nav>

      {hayArriba && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-white to-transparent"
        />
      )}
      {hayAbajo && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent"
        >
          <ChevronDown className="h-4 w-4 text-stone-400" />
        </div>
      )}
    </div>
  )
}
