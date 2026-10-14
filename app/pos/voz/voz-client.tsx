"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Loader2, Mic, PhoneOff, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { iniciarSesionVoz } from "@/app/actions/voz"
import { parkOrder } from "@/app/actions/parked"
import { reportClientError } from "@/app/actions/errors"
import { mensajeDeFallo } from "@/lib/version"
import { formatCurrency } from "@/lib/format"
import type { CartLine } from "../cart"
import {
  agregar,
  armarCatalogo,
  carritoParaGuardar,
  nombreDeCuenta,
  quitar,
  resumir,
  validarConfirmacion,
  type ArgsAgregar,
  type ArgsQuitar,
  type Catalogo,
} from "./pedido"
import {
  SESIONES_GUARDADAS,
  USO_VACIO,
  costoEstimadoUsd,
  sumarUso,
  type SesionMedida,
  type UsoVoz,
} from "./uso"

type Fase = "lista" | "conectando" | "en-curso" | "guardado" | "error"
type Resultado = SesionMedida["resultado"]

interface Mensaje {
  id: string
  quien: "cliente" | "bot"
  texto: string
  final: boolean
}

/** Una conversación de mostrador no dura más que esto; si sigue, algo se atoró. */
const DURACION_MAX_MS = 4 * 60_000
/** Nadie habla en este tiempo: el cliente se fue o el micrófono no oye. */
const SILENCIO_MAX_MS = 45_000
/** Tras confirmar, el tiempo para que el bot termine de despedirse. */
const DESPEDIDA_MAX_MS = 8_000
/** La pantalla de «¡Listo!» vuelve sola al inicio para el siguiente cliente. */
const LISTO_MS = 12_000
const CLAVE_SESIONES = "voz-sesiones"

interface Sesion {
  pc: RTCPeerConnection
  dc: RTCDataChannel
  mic: MediaStream
  catalogo: Catalogo
  modelo: string
  inicio: number
  ultimaVoz: number
  uso: UsoVoz
  herramientas: number
  rechazos: number
  guardado: boolean
  despidiendo: boolean
  /** Sube con cada cambio al pedido; `versionLeida` es la que el bot leyó en voz alta con ver_pedido. */
  version: number
  versionLeida: number
  /** Turnos de voz del cliente, y cuántos llevaba cuando el bot leyó el pedido. */
  vocesCliente: number
  vocesAlLeer: number
  reloj: number
  despedida: number | null
}

function leerSesiones(): SesionMedida[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_SESIONES) ?? "[]")
    return Array.isArray(raw) ? (raw as SesionMedida[]) : []
  } catch {
    return []
  }
}

function guardarSesion(s: SesionMedida): SesionMedida[] {
  const todas = [s, ...leerSesiones()].slice(0, SESIONES_GUARDADAS)
  try {
    localStorage.setItem(CLAVE_SESIONES, JSON.stringify(todas))
  } catch {
    // Sin almacenamiento (modo privado): la medición se pierde, el pedido no.
  }
  return todas
}

export function VozClient({ cafe, habilitada, modelo }: { cafe: string; habilitada: boolean; modelo: string }) {
  const [fase, setFase] = useState<Fase>("lista")
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [lines, setLines] = useState<CartLine[]>([])
  const [oyendo, setOyendo] = useState(false)
  const [hablando, setHablando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<{ nombre: string; total: number } | null>(null)
  const [historial, setHistorial] = useState<SesionMedida[]>([])

  const sesion = useRef<Sesion | null>(null)
  const linesRef = useRef<CartLine[]>([])
  const audioRef = useRef<HTMLAudioElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const idLinea = useRef(0)

  useEffect(() => setHistorial(leerSesiones()), [])

  // La conversación siempre a la vista: lo último que se dijo, abajo.
  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight })
  }, [mensajes])

  const ponerLineas = useCallback((l: CartLine[]) => {
    linesRef.current = l
    setLines(l)
  }, [])

  const enviar = useCallback((ev: object) => {
    const dc = sesion.current?.dc
    if (dc?.readyState === "open") dc.send(JSON.stringify(ev))
  }, [])

  const escribir = useCallback((id: string, quien: Mensaje["quien"], texto: string, modo: "agregar" | "final") => {
    setMensajes((prev) => {
      const i = prev.findIndex((m) => m.id === id)
      if (i < 0) return [...prev, { id, quien, texto, final: modo === "final" }]
      const m = prev[i]
      const nuevo = { ...m, texto: modo === "final" ? texto || m.texto : m.texto + texto, final: modo === "final" }
      return [...prev.slice(0, i), nuevo, ...prev.slice(i + 1)]
    })
  }, [])

  const terminar = useCallback(
    (resultado: Resultado, mensajeError?: string) => {
      const s = sesion.current
      if (!s) return
      sesion.current = null
      window.clearInterval(s.reloj)
      if (s.despedida) window.clearTimeout(s.despedida)
      try {
        s.dc.close()
        s.pc.close()
      } catch {
        // ya estaba cerrada
      }
      s.mic.getTracks().forEach((t) => t.stop())
      setOyendo(false)
      setHablando(false)

      const final: Resultado = s.guardado ? "confirmado" : resultado
      const pedido = resumir(linesRef.current)
      setHistorial(
        guardarSesion({
          inicio: s.inicio,
          segundos: Math.round((Date.now() - s.inicio) / 1000),
          modelo: s.modelo,
          resultado: final,
          articulos: pedido.articulos,
          total: pedido.total,
          herramientas: s.herramientas,
          rechazos: s.rechazos,
          uso: s.uso,
          costoUsd: costoEstimadoUsd(s.uso, s.modelo),
        }),
      )

      if (s.guardado) {
        setFase("guardado")
        return
      }
      if (final === "error") {
        setError(mensajeError ?? "Se cortó la conversación.")
        setFase("error")
        return
      }
      setFase("lista")
      if (pedido.articulos > 0) {
        setAviso(
          final === "tiempo"
            ? "Se acabó el tiempo y el pedido no se guardó. Pídelo en caja."
            : "La conversación terminó sin confirmar: el pedido no se guardó.",
        )
      }
    },
    [],
  )

  /** Lo que hace cada herramienta del bot. Siempre contesta algo: un error también es respuesta. */
  const ejecutar = useCallback(
    async (s: Sesion, nombre: string, argsJson: string, preguntoAqui: boolean): Promise<{ ok: boolean } & Record<string, unknown>> => {
      let args: Record<string, unknown> = {}
      try {
        args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
      } catch {
        return { ok: false, mensaje: "No se pudieron leer los datos de la llamada; vuelve a intentarlo." }
      }
      switch (nombre) {
        case "agregar_producto": {
          const r = agregar(linesRef.current, args as unknown as ArgsAgregar, s.catalogo, () => `voz-${++idLinea.current}`)
          if (r.respuesta.ok) s.version++
          ponerLineas(r.lines)
          return { ...r.respuesta }
        }
        case "quitar_producto": {
          const r = quitar(linesRef.current, args as unknown as ArgsQuitar, s.catalogo)
          if (r.respuesta.ok) s.version++
          ponerLineas(r.lines)
          return { ...r.respuesta }
        }
        case "ver_pedido":
          // Releer un pedido que no cambió no exige que el cliente vuelva a contestar.
          if (s.versionLeida !== s.version) {
            s.versionLeida = s.version
            s.vocesAlLeer = s.vocesCliente
          }
          return { ok: true, mensaje: "Pedido actual.", pedido: resumir(linesRef.current) }
        case "cancelar_pedido":
          s.version++
          ponerLineas([])
          return { ok: true, mensaje: "Pedido borrado.", pedido: resumir([]) }
        case "confirmar_pedido": {
          if (s.guardado) return { ok: false, mensaje: "Este pedido ya se guardó. Solo despídete." }
          const v = validarConfirmacion({
            nombre: String(args.nombre ?? ""),
            articulos: linesRef.current.length,
            cambioDesdeLaLectura: s.versionLeida !== s.version,
            clienteHabloDespues: s.vocesCliente > s.vocesAlLeer,
            preguntoEnLaMismaRespuesta: preguntoAqui,
          })
          if (!v.ok) return v
          const nombreCliente = v.nombre
          try {
            const r = await parkOrder({
              name: nombreDeCuenta(nombreCliente),
              cart: carritoParaGuardar(linesRef.current, crypto.randomUUID(), Date.now()),
            })
            if (!r.success) {
              return { ok: false, mensaje: `No se pudo guardar (${r.error}). Pide al cliente que haga su pedido en caja.` }
            }
          } catch (e) {
            return { ok: false, mensaje: `${mensajeDeFallo(e)} Pide al cliente que haga su pedido en caja.` }
          }
          s.guardado = true
          s.despidiendo = true
          const total = resumir(linesRef.current).total
          setGuardado({ nombre: nombreCliente, total })
          return { ok: true, mensaje: `Guardado a nombre de ${nombreCliente}. Dile que pase a pagar a la caja y despídete en una frase.` }
        }
        default:
          return { ok: false, mensaje: `No existe la herramienta «${nombre}».` }
      }
    },
    [ponerLineas],
  )

  const manejar = useCallback(
    async (ev: Record<string, unknown> & { type?: string }) => {
      const s = sesion.current
      if (!s) return
      const itemId = typeof ev.item_id === "string" ? ev.item_id : ""
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          s.ultimaVoz = Date.now()
          setOyendo(true)
          break
        case "input_audio_buffer.speech_stopped":
          s.ultimaVoz = Date.now()
          s.vocesCliente++
          setOyendo(false)
          break
        // El turno del cliente aparece en su lugar aunque la transcripción llegue después de la respuesta.
        case "input_audio_buffer.committed":
          if (itemId) escribir(itemId, "cliente", "", "agregar")
          break
        case "conversation.item.input_audio_transcription.delta":
          if (itemId) escribir(itemId, "cliente", String(ev.delta ?? ""), "agregar")
          break
        case "conversation.item.input_audio_transcription.completed":
          if (itemId) escribir(itemId, "cliente", String(ev.transcript ?? "").trim(), "final")
          break
        case "response.output_audio_transcript.delta":
          if (itemId) escribir(itemId, "bot", String(ev.delta ?? ""), "agregar")
          break
        case "response.output_audio_transcript.done":
          if (itemId) escribir(itemId, "bot", String(ev.transcript ?? ""), "final")
          break
        case "output_audio_buffer.started":
          setHablando(true)
          break
        case "output_audio_buffer.stopped":
          setHablando(false)
          s.ultimaVoz = Date.now()
          if (s.despidiendo && s.despedida) terminar("confirmado")
          break
        case "response.done": {
          const response = (ev.response ?? {}) as {
            status?: string
            status_details?: unknown
            usage?: unknown
            output?: Array<{ type?: string; name?: string; call_id?: string; arguments?: string; content?: Array<{ transcript?: string; text?: string }> }>
          }
          s.uso = sumarUso(s.uso, response.usage)
          if (response.status === "failed") {
            void reportClientError({
              route: "/pos/voz",
              digest: "voz-respuesta-fallo",
              message: "Una respuesta del bot de voz falló",
              stack: JSON.stringify(response.status_details ?? null).slice(0, 4000),
            })
          }
          const llamadas = (response.output ?? []).filter((o) => o.type === "function_call" && o.call_id && o.name)
          // ¿Preguntó algo en esta misma respuesta? Entonces todavía no puede tener la contestación.
          const preguntoAqui = (response.output ?? []).some(
            (o) => o.type === "message" && (o.content ?? []).some((c) => /[?¿]/.test(c.transcript ?? c.text ?? "")),
          )
          if (llamadas.length > 0) {
            for (const c of llamadas) {
              s.herramientas++
              const salida = await ejecutar(s, c.name!, c.arguments ?? "", preguntoAqui)
              if (!salida.ok) s.rechazos++
              enviar({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(salida) } })
            }
            enviar({ type: "response.create" })
          } else if (s.despidiendo && !s.despedida) {
            // Ya se despidió: se cuelga en cuanto termine de sonar, o a los pocos segundos.
            s.despedida = window.setTimeout(() => terminar("confirmado"), DESPEDIDA_MAX_MS)
          }
          break
        }
        case "error": {
          const e = (ev.error ?? {}) as { message?: string; code?: string }
          void reportClientError({
            route: "/pos/voz",
            digest: "voz-error",
            message: `Error del servicio de voz: ${e.code ?? ""} ${e.message ?? ""}`.slice(0, 500),
          })
          break
        }
      }
    },
    [ejecutar, enviar, escribir, terminar],
  )

  const iniciar = useCallback(async () => {
    if (sesion.current) return
    // iPhone solo deja sonar audio que arrancó con un toque: se «desbloquea» aquí, antes de cualquier espera.
    void audioRef.current?.play().catch(() => {})
    setError(null)
    setAviso(null)
    setGuardado(null)
    setMensajes([])
    ponerLineas([])
    setSegundos(0)
    setFase("conectando")

    let mic: MediaStream
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      setError("No hay permiso para usar el micrófono. Actívalo en los ajustes del navegador para esta página.")
      setFase("error")
      return
    }

    let r: Awaited<ReturnType<typeof iniciarSesionVoz>>
    try {
      r = await iniciarSesionVoz()
    } catch (e) {
      mic.getTracks().forEach((t) => t.stop())
      setError(mensajeDeFallo(e))
      setFase("error")
      return
    }
    if (!r.success) {
      mic.getTracks().forEach((t) => t.stop())
      setError(r.error)
      setFase("error")
      return
    }

    const pc = new RTCPeerConnection()
    const dc = pc.createDataChannel("oai-events")
    const ahora = Date.now()
    const s: Sesion = {
      pc,
      dc,
      mic,
      catalogo: armarCatalogo(r.products),
      modelo: r.modelo,
      inicio: ahora,
      ultimaVoz: ahora,
      uso: USO_VACIO,
      herramientas: 0,
      rechazos: 0,
      guardado: false,
      despidiendo: false,
      version: 0,
      versionLeida: -1,
      vocesCliente: 0,
      vocesAlLeer: 0,
      despedida: null,
      reloj: window.setInterval(() => {
        const t = Date.now()
        setSegundos(Math.round((t - ahora) / 1000))
        if (t - ahora > DURACION_MAX_MS) terminar("tiempo")
        else if (t - s.ultimaVoz > SILENCIO_MAX_MS) terminar("sin-pedido")
      }, 1000),
    }
    sesion.current = s

    pc.ontrack = (e) => {
      const audio = audioRef.current
      if (!audio) return
      audio.srcObject = e.streams[0]
      void audio.play().catch(() => {})
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") terminar("error", "Se perdió la conexión con el servicio de voz.")
    }
    pc.addTrack(mic.getAudioTracks()[0], mic)
    dc.addEventListener("message", (e) => {
      try {
        void manejar(JSON.parse(String(e.data)))
      } catch {
        // un evento ilegible no detiene la conversación
      }
    })
    dc.addEventListener("open", () => {
      setFase("en-curso")
      // Que el bot salude primero: el cliente no sabe que le toca hablar.
      enviar({ type: "response.create" })
    })

    try {
      const oferta = await pc.createOffer()
      await pc.setLocalDescription(oferta)
      const resp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: oferta.sdp,
        headers: { Authorization: `Bearer ${r.clave}`, "Content-Type": "application/sdp" },
      })
      if (!resp.ok) throw new Error(`calls ${resp.status}: ${(await resp.text()).slice(0, 300)}`)
      await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() })
    } catch (e) {
      void reportClientError({
        route: "/pos/voz",
        digest: "voz-conexion",
        message: `No se pudo conectar la voz: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      })
      terminar("error", "No se pudo conectar con el servicio de voz. Revisa la señal e intenta de nuevo.")
    }
  }, [enviar, manejar, ponerLineas, terminar])

  // Salir de la página cuelga: un micrófono abierto en segundo plano cuesta dinero y es raro.
  useEffect(() => () => terminar("sin-pedido"), [terminar])

  // «¡Listo!» vuelve solo al inicio para el siguiente cliente.
  useEffect(() => {
    if (fase !== "guardado") return
    const t = window.setTimeout(() => {
      setFase("lista")
      setGuardado(null)
      setMensajes([])
      ponerLineas([])
    }, LISTO_MS)
    return () => window.clearTimeout(t)
  }, [fase, ponerLineas])

  const pedido = resumir(lines)

  return (
    <div className="flex h-[100dvh] flex-col bg-stone-100">
      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/pos">
            <ArrowLeft className="h-4 w-4" />
            POS
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-stone-800">Pedido por voz</h1>
          <p className="truncate text-xs text-stone-500">{cafe} · prueba</p>
        </div>
        {fase === "en-curso" && (
          <span className="shrink-0 tabular-nums text-sm text-stone-500" aria-label="Tiempo de la conversación">
            {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}
          </span>
        )}
      </header>

      {!habilitada ? (
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-sm text-center text-stone-600">
            El pedido por voz es un prototipo y no está encendido para esta cafetería.
          </p>
        </main>
      ) : fase === "guardado" && guardado ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" data-voz-listo>
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-12 w-12 text-emerald-700" />
          </div>
          <p className="text-2xl font-bold text-stone-800 text-balance">¡Listo, {guardado.nombre}!</p>
          <p className="text-lg text-stone-600">
            Pasa a pagar a la caja: <span className="font-semibold tabular-nums">{formatCurrency(guardado.total)}</span>
          </p>
          <Button size="lg" variant="outline" onClick={() => setFase("lista")}>
            Siguiente cliente
          </Button>
        </main>
      ) : fase === "lista" || fase === "error" ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6 text-center">
          <button
            type="button"
            onClick={() => void iniciar()}
            className="flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full bg-amber-600 text-white shadow-lg transition active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
            data-voz-iniciar
          >
            <Mic className="h-14 w-14" />
            <span className="text-lg font-semibold">Hacer mi pedido</span>
          </button>
          <p className="max-w-sm text-stone-600 text-balance">
            Toca y dile al cajero virtual lo que quieres. Tu pedido llega a la caja y ahí lo pagas.
          </p>
          {error && (
            <p role="alert" className="max-w-sm rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {aviso && <p className="max-w-sm rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{aviso}</p>}
          <Medicion historial={historial} modelo={modelo} />
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-4">
          <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3" aria-live="polite">
              {fase === "conectando" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
                  <span className="font-medium text-stone-600">Conectando…</span>
                </>
              ) : hablando ? (
                <>
                  <Volume2 className="h-5 w-5 text-amber-700" />
                  <span className="font-medium text-amber-800">Hablando…</span>
                </>
              ) : (
                <>
                  <Mic className={`h-5 w-5 ${oyendo ? "text-emerald-600" : "text-stone-400"}`} />
                  <span className={`font-medium ${oyendo ? "text-emerald-700" : "text-stone-600"}`}>
                    {oyendo ? "Te escucho…" : "Puedes hablar"}
                  </span>
                </>
              )}
            </div>
            <div ref={listaRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4" data-voz-conversacion>
              {mensajes
                .filter((m) => m.texto.trim())
                .map((m) => (
                  <p
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug ${
                      m.quien === "cliente"
                        ? "self-end bg-amber-100 text-stone-800"
                        : "self-start bg-stone-100 text-stone-800"
                    } ${m.final ? "" : "opacity-70"}`}
                  >
                    {m.texto}
                  </p>
                ))}
            </div>
          </section>

          <aside className="flex shrink-0 flex-col rounded-xl bg-white shadow-sm md:w-80" data-voz-pedido>
            <h2 className="border-b border-stone-100 px-4 py-3 font-semibold text-stone-800">Tu pedido</h2>
            <ul className="max-h-48 divide-y divide-stone-100 overflow-y-auto md:max-h-none md:flex-1">
              {pedido.renglones.length === 0 ? (
                <li className="px-4 py-3 text-sm text-stone-500">Aún no hay nada.</li>
              ) : (
                pedido.renglones.map((r) => (
                  <li key={r.renglon} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                    <span className="text-stone-700">{r.descripcion}</span>
                    <span className="shrink-0 tabular-nums font-medium text-stone-800">{formatCurrency(r.importe)}</span>
                  </li>
                ))
              )}
            </ul>
            <div className="flex items-baseline justify-between border-t border-stone-200 px-4 py-3">
              <span className="font-semibold text-stone-800">Total</span>
              <span className="text-xl font-bold tabular-nums text-stone-900">{formatCurrency(pedido.total)}</span>
            </div>
            <div className="px-4 pb-4">
              <Button variant="outline" className="w-full gap-2" onClick={() => terminar("cancelado")} data-voz-colgar>
                <PhoneOff className="h-4 w-4" />
                Terminar
              </Button>
            </div>
          </aside>
        </main>
      )}
    </div>
  )
}

/**
 * Lo medido en ESTE aparato: para decidir con números si el prototipo sirve.
 * Cuántas conversaciones terminaron en pedido, cuánto duran y cuánto cuestan.
 */
function Medicion({ historial, modelo }: { historial: SesionMedida[]; modelo: string }) {
  if (historial.length === 0) return null
  const confirmadas = historial.filter((s) => s.resultado === "confirmado")
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const costos = historial.map((s) => s.costoUsd).filter((c): c is number => c != null)
  return (
    <details className="w-full max-w-md rounded-lg bg-white px-4 py-3 text-left text-sm text-stone-600 shadow-sm">
      <summary className="cursor-pointer font-medium text-stone-700">
        Pruebas en este aparato: {confirmadas.length} de {historial.length} terminaron en pedido
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
        <dt>Duración promedio (con pedido)</dt>
        <dd className="text-right">{Math.round(promedio(confirmadas.map((s) => s.segundos)))} s</dd>
        <dt>Costo promedio (tope estimado)</dt>
        <dd className="text-right">{costos.length ? `$${promedio(costos).toFixed(3)} USD` : "—"}</dd>
        <dt>Preguntas o correcciones por pedido</dt>
        <dd className="text-right">{promedio(confirmadas.map((s) => s.rechazos)).toFixed(1)}</dd>
        <dt>Modelo</dt>
        <dd className="text-right">{modelo}</dd>
      </dl>
      <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2 text-xs">
        {historial.slice(0, 10).map((s) => (
          <li key={s.inicio} className="flex justify-between gap-2 tabular-nums">
            <span>
              {new Date(s.inicio).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · {s.resultado} · {s.segundos} s
            </span>
            <span>
              {s.articulos} art. · {formatCurrency(s.total)}
              {s.costoUsd != null ? ` · $${s.costoUsd.toFixed(3)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
