import { reportClientError } from "@/app/actions/errors"
import { falloDeMicrofono, type FalloMicrofono } from "./microfono"

/**
 * Lo que comparten los dos modos de voz en el navegador: pedir el micrófono
 * y abrir la conversación con OpenAI por WebRTC. Una sola copia, para que el
 * mostrador y el ayudante del POS no se separen con el tiempo (el bug del
 * permiso se arregló en una pantalla; con dos copias habría quedado en la otra).
 */

/** Dónde nació el documento (no cambia con las navegaciones internas de Next). */
export function rutaDondeNacio(): string | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    return nav ? new URL(nav.name).pathname : null
  } catch {
    return null
  }
}

/** ¿La cabecera de ESTE documento deja usar el micrófono? null si el navegador no lo dice (Safari). */
export function politicaPermiteMicrofono(): boolean | null {
  const fp = (document as Document & { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy
  try {
    return fp ? fp.allowsFeature("microphone") : null
  } catch {
    return null
  }
}

/** Pide el micrófono. Si falla, dice por qué (y deja aviso: así se supo que nadie había negado nada). */
export async function pedirMicrofono(ruta: string): Promise<{ mic: MediaStream } | { fallo: FalloMicrofono }> {
  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    return { mic }
  } catch (e) {
    const nombre = e instanceof Error ? e.name : String(e)
    const politica = politicaPermiteMicrofono()
    void reportClientError({
      route: ruta,
      digest: "voz-microfono",
      message: `Micrófono: ${nombre} · cabecera ${politica === null ? "¿?" : politica ? "lo permite" : "lo prohíbe"} · documento nació en ${rutaDondeNacio() ?? "¿?"}`,
    })
    return { fallo: falloDeMicrofono(nombre, politica) }
  }
}

export interface ConexionVoz {
  pc: RTCPeerConnection
  dc: RTCDataChannel
  /** Manda un evento al modelo; si el canal ya no está abierto, no hace nada. */
  enviar: (ev: object) => void
  /** Cuelga y suelta el micrófono. Se puede llamar más de una vez. */
  cerrar: () => void
}

/**
 * Abre la conversación: micrófono hacia OpenAI, su audio (si el modo lo
 * tiene) hacia `audio`, y los eventos por el canal «oai-events». Devuelve la
 * conexión de inmediato; `alAbrir` avisa cuando ya se puede hablar y
 * `alFallar` si no se pudo conectar (no se llama si se colgó a propósito).
 */
export function conectarVoz(opciones: {
  clave: string
  mic: MediaStream
  ruta: string
  audio?: HTMLAudioElement | null
  alEvento: (ev: Record<string, unknown> & { type?: string }) => void
  alAbrir: () => void
  alFallar: (mensaje: string) => void
}): ConexionVoz {
  const { clave, mic, ruta, audio, alEvento, alAbrir, alFallar } = opciones
  const pc = new RTCPeerConnection()
  const dc = pc.createDataChannel("oai-events")
  let cerrada = false

  const cerrar = () => {
    if (cerrada) return
    cerrada = true
    try {
      dc.close()
      pc.close()
    } catch {
      // ya estaba cerrada
    }
    mic.getTracks().forEach((t) => t.stop())
  }

  pc.ontrack = (e) => {
    if (!audio) return
    audio.srcObject = e.streams[0]
    void audio.play().catch(() => {})
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" && !cerrada) alFallar("Se perdió la conexión con el servicio de voz.")
  }
  pc.addTrack(mic.getAudioTracks()[0], mic)
  dc.addEventListener("message", (e) => {
    try {
      alEvento(JSON.parse(String(e.data)))
    } catch {
      // un evento ilegible no detiene la conversación
    }
  })
  dc.addEventListener("open", () => alAbrir())

  void (async () => {
    try {
      const oferta = await pc.createOffer()
      await pc.setLocalDescription(oferta)
      const resp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: oferta.sdp,
        headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/sdp" },
      })
      if (!resp.ok) throw new Error(`calls ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
      await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() })
    } catch (e) {
      // Colgaron mientras conectaba: se cerró a propósito, no es un fallo.
      if (cerrada) return
      void reportClientError({
        route: ruta,
        digest: "voz-conexion",
        message: `No se pudo conectar la voz: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      })
      alFallar("No se pudo conectar con el servicio de voz. Revisa la señal e intenta de nuevo.")
    }
  })()

  return {
    pc,
    dc,
    enviar: (ev) => {
      if (dc.readyState === "open") dc.send(JSON.stringify(ev))
    },
    cerrar,
  }
}
