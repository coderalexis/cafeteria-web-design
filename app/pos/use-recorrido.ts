"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  avanzarRecorrido,
  iniciarRecorrido,
  siguienteRecorrido,
  tarjetaRecorrido,
  type EstadoRecorrido,
  type SenalesRecorrido,
} from "@/lib/recorrido-pos"

const KEY = "pos-recorrido-hecho"

/**
 * Pega el recorrido de la primera venta al POS: observa las señales, avanza
 * la máquina de pasos, ilumina el elemento del paso (`data-recorrido`) y
 * recuerda por aparato que ya se hizo una vez.
 *
 * La lógica de «en qué paso vas» vive en lib/recorrido-pos.ts y se prueba
 * sola; aquí solo hay React y DOM.
 */
export function useRecorrido(senales: SenalesRecorrido) {
  const [estado, setEstado] = useState<EstadoRecorrido | null>(null)
  // Hasta leer localStorage se asume hecho: así no parpadea la invitación.
  const [hecho, setHecho] = useState(true)
  useEffect(() => {
    try {
      setHecho(window.localStorage.getItem(KEY) === "1")
    } catch {
      setHecho(false)
    }
  }, [])

  // Cada señal que puede mover el paso pasa por la máquina. Si no cambia
  // nada devuelve el mismo objeto y React no repinta.
  const { lineas, articulos, efectivoEscrito, ventasPractica } = senales
  useEffect(() => {
    setEstado((e) => (e ? avanzarRecorrido(e, senales, Date.now()) : e))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo estas cuatro mueven el paso
  }, [lineas, articulos, efectivoEscrito, ventasPractica])

  const tarjeta = useMemo(() => (estado ? tarjetaRecorrido(estado, senales) : null), [estado, senales])

  // Ilumina el elemento del paso y lo trae a la vista. Con un respiro: la
  // hoja del carrito (celular) tarda un instante en montar sus líneas.
  const objetivo = tarjeta?.objetivo ?? null
  useEffect(() => {
    document.querySelectorAll(".recorrido-foco").forEach((el) => el.classList.remove("recorrido-foco"))
    if (!objetivo) return
    const t = window.setTimeout(() => {
      const els = document.querySelectorAll<HTMLElement>(`[data-recorrido="${objetivo}"]`)
      els.forEach((el) => el.classList.add("recorrido-foco"))
      els[0]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }, 150)
    return () => window.clearTimeout(t)
  }, [objetivo, senales.carritoAbierto, lineas])

  const iniciar = useCallback(() => setEstado(iniciarRecorrido(Date.now(), ventasPractica)), [ventasPractica])
  const siguiente = useCallback(() => setEstado((e) => (e ? siguienteRecorrido(e) : e)), [])
  const cerrar = useCallback(() => {
    setEstado(null)
    try {
      window.localStorage.setItem(KEY, "1")
    } catch {
      /* sin almacenamiento: se volverá a ofrecer */
    }
    setHecho(true)
  }, [])

  return { activo: estado !== null, tarjeta, hecho, iniciar, siguiente, cerrar }
}
