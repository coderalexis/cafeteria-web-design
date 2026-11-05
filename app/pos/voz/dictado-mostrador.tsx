"use client"

import { useEffect, useRef } from "react"
import { DictadoPanel } from "./dictado-panel"
import { useDictado } from "./use-dictado"

/** Lo que necesita el botón del micrófono en el encabezado del POS. */
export interface BotonDictado {
  activo: boolean
  alternar: () => void
}

/**
 * El modo ayudante (voz) del POS en un trozo aparte.
 *
 * El hook, la conexión con OpenAI y la validación del pedido contra el menú
 * (`pedido.ts`, el archivo más grande de la voz) viajaban en el arranque del
 * POS de TODOS los cafés, y solo los que nombra `VOZ_CAFES` la usan. Ahora
 * pos-client.tsx carga esto con `next/dynamic` solo cuando la voz está
 * encendida, y el botón del encabezado se entera de su estado por
 * `alCambiar`.
 */
export function DictadoMostrador({
  opciones,
  isMobile,
  alCambiar,
}: {
  opciones: Parameters<typeof useDictado>[0]
  isMobile: boolean
  alCambiar: (boton: BotonDictado | null) => void
}) {
  const dictado = useDictado(opciones)
  const activo = dictado.estado === "conectando" || dictado.estado === "escuchando"
  // `alternar` cambia en cada render; el botón llama siempre al de ahora.
  const alternarRef = useRef(dictado.alternar)
  alternarRef.current = dictado.alternar

  useEffect(() => {
    alCambiar({ activo, alternar: () => alternarRef.current() })
  }, [activo, alCambiar])
  useEffect(() => () => alCambiar(null), [alCambiar])

  return <DictadoPanel dictado={dictado} isMobile={isMobile} />
}
