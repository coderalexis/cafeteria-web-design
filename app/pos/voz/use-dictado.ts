"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { iniciarSesionVoz } from "@/app/actions/voz"
import { reportClientError } from "@/app/actions/errors"
import { mensajeDeFallo } from "@/lib/version"
import type { ModifierOption, Product, SizeOption } from "../cart"
import { conectarVoz, pedirMicrofono, type ConexionVoz } from "./conexion"
import {
  armarCatalogo,
  describirResuelto,
  enMenuDelPos,
  resolver,
  type ArgsAgregar,
  type Catalogo,
  type PendienteDictado,
} from "./pedido"
import { USO_VACIO, SESIONES_GUARDADAS, costoEstimadoUsd, sumarUso, type UsoVoz } from "./uso"

/**
 * Modo ayudante: el cajero dicta en su propio POS y lo dictado entra directo
 * al carrito. El bot no habla ni pregunta (la sesión ni siquiera tiene voz):
 * lo que llega completo se agrega, lo que llega sin tamaño o sin un extra
 * obligatorio queda como pendiente para completarlo con un toque, y lo que no
 * está en el menú se enseña como «no encontré» — nunca se adivina.
 */

export type EstadoDictado = "apagado" | "conectando" | "escuchando" | "error"

/** Sin oír a nadie este rato, se apaga solo: un micrófono abierto cuesta. */
const SILENCIO_MAX_MS = 20_000
/** Y nunca más que esto seguido. */
const DURACION_MAX_MS = 3 * 60_000
const RUTA = "/pos"
const CLAVE_MEDIDAS = "voz-dictados"
const MAX_VISIBLES = 4

interface Sesion {
  conexion: ConexionVoz
  catalogo: Catalogo
  modelo: string
  inicio: number
  ultimaVoz: number
  reloj: number
  uso: UsoVoz
  agregados: number
  pendientes: number
  noEntendidos: number
}

export interface Dictado {
  estado: EstadoDictado
  /** ¿Está hablando alguien ahora mismo? */
  oyendo: boolean
  /** Lo último que se oyó, tal cual. */
  oido: string
  /** Lo último que entró al carrito, para la tarjeta. */
  agregados: Array<{ id: number; texto: string }>
  pendientes: PendienteDictado[]
  noEncontrados: Array<{ id: number; texto: string }>
  error: string | null
  ofrecerRecarga: boolean
  alternar: () => void
  detener: () => void
  /** Elige el tamaño de un pendiente (y abre la hoja si aún falta un extra obligatorio). */
  elegirTamano: (id: string, size: SizeOption) => void
  /** Abre la hoja de extras del POS para un pendiente. */
  abrirHoja: (id: string) => void
  descartarPendiente: (id: string) => void
  descartarNoEncontrado: (id: number) => void
  descartarError: () => void
}

export function useDictado(opciones: {
  productos: Product[]
  alAgregar: (product: Product, size: SizeOption | undefined, modifiers: ModifierOption[], cantidad: number, nota: string) => void
  alAbrirHoja: (product: Product, size: SizeOption | undefined) => void
}): Dictado {
  const [estado, setEstado] = useState<EstadoDictado>("apagado")
  const [oyendo, setOyendo] = useState(false)
  const [oido, setOido] = useState("")
  const [agregados, setAgregados] = useState<Array<{ id: number; texto: string }>>([])
  const [pendientes, setPendientes] = useState<PendienteDictado[]>([])
  const [noEncontrados, setNoEncontrados] = useState<Array<{ id: number; texto: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [ofrecerRecarga, setOfrecerRecarga] = useState(false)

  const sesion = useRef<Sesion | null>(null)
  const ultimoCatalogo = useRef<Catalogo | null>(null)
  const contador = useRef(0)
  // Lo que cambia en cada render se lee por ref: los manejadores de la
  // conexión viven más que un render.
  const opcionesRef = useRef(opciones)
  opcionesRef.current = opciones
  const pendientesRef = useRef<PendienteDictado[]>([])
  pendientesRef.current = pendientes

  const avisarAgregado = useCallback((texto: string) => {
    const id = ++contador.current
    setAgregados((prev) => [{ id, texto }, ...prev].slice(0, MAX_VISIBLES))
  }, [])

  const avisarNoEncontrado = useCallback((texto: string) => {
    const id = ++contador.current
    setNoEncontrados((prev) => [{ id, texto }, ...prev].slice(0, MAX_VISIBLES))
  }, [])

  /** Mete al carrito una resolución completa, con los objetos de la rejilla. */
  const entregar = useCallback(
    (r: Extract<ReturnType<typeof resolver>, { ok: true }>): boolean => {
      const enPos = enMenuDelPos(r, opcionesRef.current.productos)
      if (!enPos) {
        avisarNoEncontrado(`${r.product.name}: el menú de esta pantalla cambió. Recarga el POS.`)
        return false
      }
      opcionesRef.current.alAgregar(enPos.product, enPos.size, enPos.modifiers, r.cantidad, r.nota)
      avisarAgregado(describirResuelto(r))
      return true
    },
    [avisarAgregado, avisarNoEncontrado],
  )

  const detener = useCallback(() => {
    const s = sesion.current
    if (!s) return
    sesion.current = null
    window.clearInterval(s.reloj)
    s.conexion.cerrar()
    setOyendo(false)
    setEstado((e) => (e === "error" ? e : "apagado"))
    // Medición en el aparato, como en el mostrador: para decidir con números.
    try {
      const previas = JSON.parse(localStorage.getItem(CLAVE_MEDIDAS) ?? "[]")
      const lista = Array.isArray(previas) ? previas : []
      lista.unshift({
        inicio: s.inicio,
        segundos: Math.round((Date.now() - s.inicio) / 1000),
        modelo: s.modelo,
        agregados: s.agregados,
        pendientes: s.pendientes,
        noEntendidos: s.noEntendidos,
        uso: s.uso,
        costoUsd: costoEstimadoUsd(s.uso, s.modelo),
      })
      localStorage.setItem(CLAVE_MEDIDAS, JSON.stringify(lista.slice(0, SESIONES_GUARDADAS)))
    } catch {
      // sin almacenamiento: se pierde la medición, no el pedido
    }
  }, [])

  const ejecutar = useCallback(
    (s: Sesion, nombre: string, argsJson: string): Record<string, unknown> => {
      let args: Record<string, unknown> = {}
      try {
        args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {}
      } catch {
        return { ok: false, mensaje: "Datos ilegibles." }
      }
      if (nombre === "no_entendi") {
        s.noEntendidos++
        avisarNoEncontrado(String(args.texto ?? "").slice(0, 80) || "algo que no entendí")
        return { ok: true }
      }
      if (nombre !== "agregar_producto") return { ok: false, mensaje: `No existe la herramienta «${nombre}».` }

      const r = resolver(args as unknown as ArgsAgregar, s.catalogo)
      if (r.ok) {
        if (entregar(r)) s.agregados++
        return { ok: true }
      }
      if (r.falta && r.product) {
        s.pendientes++
        const p: PendienteDictado = {
          id: `p${++contador.current}`,
          args: args as unknown as ArgsAgregar,
          product: r.product,
          cantidad: r.cantidad ?? 1,
          falta: r.falta,
          size: r.size,
        }
        setPendientes((prev) => [...prev, p])
        return { ok: true, pendiente: true }
      }
      s.noEntendidos++
      avisarNoEncontrado(r.mensaje)
      return { ok: false, mensaje: r.mensaje }
    },
    [avisarNoEncontrado, entregar],
  )

  const manejar = useCallback(
    (ev: Record<string, unknown> & { type?: string }) => {
      const s = sesion.current
      if (!s) return
      switch (ev.type) {
        case "input_audio_buffer.speech_started":
          s.ultimaVoz = Date.now()
          setOyendo(true)
          break
        case "input_audio_buffer.speech_stopped":
          s.ultimaVoz = Date.now()
          setOyendo(false)
          break
        case "conversation.item.input_audio_transcription.completed": {
          const t = String(ev.transcript ?? "").trim()
          if (t) setOido(t)
          break
        }
        case "response.done": {
          const response = (ev.response ?? {}) as {
            usage?: unknown
            output?: Array<{ type?: string; name?: string; call_id?: string; arguments?: string }>
          }
          s.uso = sumarUso(s.uso, response.usage)
          for (const c of response.output ?? []) {
            if (c.type !== "function_call" || !c.call_id || !c.name) continue
            const salida = ejecutar(s, c.name, c.arguments ?? "")
            // Se contesta cada llamada para que la conversación quede en orden,
            // pero SIN pedir otra respuesta: el ayudante no tiene nada que decir.
            s.conexion.enviar({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(salida) } })
          }
          break
        }
        case "error": {
          const e = (ev.error ?? {}) as { message?: string; code?: string }
          void reportClientError({ route: RUTA, digest: "voz-error", message: `Dictado: ${e.code ?? ""} ${e.message ?? ""}`.slice(0, 500) })
          break
        }
      }
    },
    [ejecutar],
  )

  const iniciar = useCallback(async () => {
    if (sesion.current) return
    setError(null)
    setOfrecerRecarga(false)
    setOido("")
    setEstado("conectando")

    const pedido = await pedirMicrofono(RUTA)
    if ("fallo" in pedido) {
      setError(pedido.fallo.mensaje)
      setOfrecerRecarga(pedido.fallo.recargar)
      setEstado("error")
      return
    }
    let r: Awaited<ReturnType<typeof iniciarSesionVoz>>
    try {
      r = await iniciarSesionVoz("ayudante")
    } catch (e) {
      pedido.mic.getTracks().forEach((t) => t.stop())
      setError(mensajeDeFallo(e))
      setEstado("error")
      return
    }
    if (!r.success) {
      pedido.mic.getTracks().forEach((t) => t.stop())
      setError(r.error)
      setEstado("error")
      return
    }

    const catalogo = armarCatalogo(r.products)
    ultimoCatalogo.current = catalogo
    const ahora = Date.now()
    const conexion = conectarVoz({
      clave: r.clave,
      mic: pedido.mic,
      ruta: RUTA,
      alEvento: manejar,
      alAbrir: () => setEstado("escuchando"),
      alFallar: (mensaje) => {
        setError(mensaje)
        setEstado("error")
        detener()
      },
    })
    const s: Sesion = {
      conexion,
      catalogo,
      modelo: r.modelo,
      inicio: ahora,
      ultimaVoz: ahora,
      uso: USO_VACIO,
      agregados: 0,
      pendientes: 0,
      noEntendidos: 0,
      reloj: window.setInterval(() => {
        const t = Date.now()
        if (t - ahora > DURACION_MAX_MS || t - s.ultimaVoz > SILENCIO_MAX_MS) detener()
      }, 1000),
    }
    sesion.current = s
  }, [detener, manejar])

  const alternar = useCallback(() => {
    if (sesion.current) detener()
    else void iniciar()
  }, [detener, iniciar])

  // Salir del POS cuelga.
  useEffect(() => () => detener(), [detener])

  const quitarPendiente = useCallback((id: string) => {
    setPendientes((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const elegirTamano = useCallback(
    (id: string, size: SizeOption) => {
      const p = pendientesRef.current.find((x) => x.id === id)
      const cat = ultimoCatalogo.current
      if (!p || !cat) return
      const r = resolver({ ...p.args, tamano: size.label }, cat)
      if (r.ok) {
        entregar(r)
        quitarPendiente(id)
        return
      }
      // Con el tamaño todavía falta un extra obligatorio: la hoja del POS se encarga.
      const enPos = opcionesRef.current.productos.find((x) => x.id === p.product.id)
      const sizePos = enPos?.sizes?.find((x) => x.variantId === size.variantId)
      if (enPos) opcionesRef.current.alAbrirHoja(enPos, sizePos)
      quitarPendiente(id)
    },
    [entregar, quitarPendiente],
  )

  const abrirHoja = useCallback(
    (id: string) => {
      const p = pendientesRef.current.find((x) => x.id === id)
      if (!p) return
      const enPos = opcionesRef.current.productos.find((x) => x.id === p.product.id)
      if (!enPos) return
      const sizePos = p.size ? enPos.sizes?.find((x) => x.variantId === p.size!.variantId) : undefined
      opcionesRef.current.alAbrirHoja(enPos, sizePos)
      quitarPendiente(id)
    },
    [quitarPendiente],
  )

  const descartarNoEncontrado = useCallback((id: number) => {
    setNoEncontrados((prev) => prev.filter((x) => x.id !== id))
  }, [])

  return {
    estado,
    oyendo,
    oido,
    agregados,
    pendientes,
    noEncontrados,
    error,
    ofrecerRecarga,
    alternar,
    detener,
    elegirTamano,
    abrirHoja,
    descartarPendiente: quitarPendiente,
    descartarNoEncontrado,
    descartarError: () => {
      setError(null)
      setEstado((e) => (e === "error" ? "apagado" : e))
    },
  }
}
