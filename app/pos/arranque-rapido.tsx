"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PIDE_PRECARGA, PREGUNTA_ESTADO, decidirMensaje, frenoRefresco, type Accion } from "@/lib/arranque-rapido"

const CLAVE_FRENO = "pos-arranque-refrescos"
/** Si el worker no contesta en este tiempo, se refresca de todos modos. */
const ESPERA_MAXIMA_MS = 15_000

/**
 * Registra el service worker del POS y, cuando la página que se ve es la
 * guardada, la pone al día.
 *
 * Solo en producción: en desarrollo el código cambia a cada rato y una página
 * guardada solo confunde. Mientras se espera a la fresca, una línea ámbar
 * arriba dice que se está poniendo al día; desaparece al llegar los datos.
 * Ver `public/sw-pos.js` para el porqué de todo esto.
 */
export function ArranqueRapido() {
  const router = useRouter()
  const [actualizando, setActualizando] = useState(false)

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    const sw = navigator.serviceWorker
    // La marca la pone el worker solo en la copia servida desde el guardado.
    const desdeCache = !!document.querySelector('meta[name="pos-desde-cache"]')
    let resuelto = false
    let temporizador: number | undefined

    const refrescar = () => {
      // Sin red, refrescar solo provocaría una recarga fallida.
      if (!navigator.onLine) return
      let intentos: number[] = []
      try {
        intentos = JSON.parse(window.sessionStorage.getItem(CLAVE_FRENO) || "[]") as number[]
      } catch {
        intentos = []
      }
      const freno = frenoRefresco(intentos, Date.now())
      if (!freno.puede) return
      try {
        window.sessionStorage.setItem(CLAVE_FRENO, JSON.stringify([...freno.intentos, Date.now()]))
      } catch {
        // Sin sessionStorage no hay freno, pero tampoco es lo normal.
      }
      router.refresh()
    }

    const actuar = (accion: Accion) => {
      if (accion.tipo === "esperar") {
        setActualizando(true)
        return
      }
      if (resuelto) return
      resuelto = true
      window.clearTimeout(temporizador)
      setActualizando(false)
      if (accion.tipo === "refrescar") refrescar()
      else if (accion.tipo === "recargar") window.location.reload()
    }

    const onMensaje = (e: MessageEvent) => {
      // Para diagnosticar desde la consola sin tocar nada más.
      document.dispatchEvent(new CustomEvent("pos-arranque", { detail: e.data }))
      actuar(decidirMensaje(e.data))
    }
    sw.addEventListener("message", onMensaje)
    if (typeof sw.startMessages === "function") sw.startMessages()
    sw.register("/sw-pos.js", { scope: "/pos" })
      .then((registro) => {
        if (desdeCache) return
        // Llegó de la red o por navegación interna —como justo después del
        // login, que llega desde /login sin pasar por el worker—: que quede
        // guardada si no lo está, para que la PRÓXIMA apertura ya sea la
        // rápida. Una página que nació fuera de /pos no tiene `controller`,
        // por eso se le habla al worker activo del registro.
        const worker = sw.controller ?? registro.active
        worker?.postMessage(PIDE_PRECARGA)
      })
      .catch(() => {
        // Sin service worker (navegador que no lo permite): el POS funciona igual, solo arranca como antes.
      })

    if (desdeCache) {
      setActualizando(true)
      sw.controller?.postMessage(PREGUNTA_ESTADO)
      temporizador = window.setTimeout(() => actuar({ tipo: "refrescar" }), ESPERA_MAXIMA_MS)
    }
    return () => {
      sw.removeEventListener("message", onMensaje)
      window.clearTimeout(temporizador)
    }
  }, [router])

  if (!actualizando) return null
  return (
    <div
      role="status"
      aria-label="Poniendo al día el menú y la caja"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 animate-pulse bg-amber-500"
      data-actualizando
    />
  )
}
