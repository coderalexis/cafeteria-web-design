"use client"

import { useCallback, useEffect, useState } from "react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/**
 * «Ponlo en tu pantalla de inicio».
 *
 * Abrir el POS desde el navegador cada vez —barra de direcciones, pestañas,
 * historial— es parte de por qué el celular se siente lento. Instalado, abre
 * a pantalla completa con su ícono, como cualquier app.
 *
 * Android/Chrome avisa con `beforeinstallprompt` cuando el sitio se puede
 * instalar; se guarda el evento y se dispara cuando la persona toca el botón
 * (el navegador exige un gesto). iPhone no avisa nunca: ahí solo se pueden
 * dar las instrucciones. Si ya se abrió como app no hay nada que ofrecer.
 */
export function useInstallPrompt() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  // Hasta saber cómo se abrió, se asume instalada: mejor no ofrecer que
  // ofrecer de más un instante.
  const [instalada, setInstalada] = useState(true)
  const [esIOS, setEsIOS] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalada(standalone)
    setEsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent))
    const onPrompt = (e: Event) => {
      // Sin esto Chrome muestra su propia barrita, que compite con la nuestra.
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setEvento(null)
      setInstalada(true)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const instalar = useCallback(async () => {
    if (!evento) return
    await evento.prompt()
    const { outcome } = await evento.userChoice
    if (outcome === "accepted") setEvento(null)
  }, [evento])

  return {
    /** Android/Chrome: hay evento guardado y no está instalada. */
    puede: evento !== null && !instalada,
    instalar,
    /** iPhone/iPad sin instalar: solo instrucciones. */
    esIOS: esIOS && !instalada,
    instalada,
  }
}
