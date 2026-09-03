/**
 * El recorrido de la primera venta: cinco pasos sobre el POS real, en modo
 * práctica.
 *
 * Nadie lee la guía parado en el mostrador, y «escribir es más rápido que el
 * celular» casi siempre es no haberlo tocado nunca. Esto no explica: pide
 * hacer, y avanza cuando la persona lo hizo de verdad (agregó, abrió el
 * carrito, escribió con cuánto pagan, cobró). Es puro: el POS le pasa lo que
 * está pasando (las señales) y esto dice en qué paso va y qué tarjeta
 * enseñar. Así se prueba solo, sin React.
 */
export type PasoRecorrido = 1 | 2 | 3 | 4 | 5

/** Qué elemento de la pantalla se ilumina: el valor de su `data-recorrido`. */
export type ObjetivoRecorrido = "producto" | "carrito-barra" | "linea" | "pago" | "cobrar"

export interface SenalesRecorrido {
  /** Líneas y artículos (suma de cantidades) en el carrito. */
  lineas: number
  articulos: number
  /** El producto tocado abrió su elector de tamaño / su hoja de preguntas. */
  eligiendoTamano: boolean
  preguntaAbierta: boolean
  /** En celular el carrito es una hoja que se abre desde la barra de abajo. */
  esMovil: boolean
  carritoAbierto: boolean
  /** Ya escribió con cuánto paga (efectivo). */
  efectivoEscrito: boolean
  /** Ventas de práctica cobradas desde que se abrió el POS. */
  ventasPractica: number
}

export interface EstadoRecorrido {
  paso: PasoRecorrido
  /** Cuándo empezó (ms), para decir «vendiste en 14 s» al final. */
  inicio: number
  /** Artículos al entrar al paso 2: tocar «+» es lo que lo avanza. */
  articulosAlEntrar: number
  /** Ventas de práctica al empezar: la siguiente es la que cierra el recorrido. */
  ventasAlEmpezar: number
  fin: number | null
}

export function iniciarRecorrido(ahora: number, ventasPractica: number): EstadoRecorrido {
  return { paso: 1, inicio: ahora, articulosAlEntrar: 0, ventasAlEmpezar: ventasPractica, fin: null }
}

/**
 * Avanza (o regresa) según lo que la persona hizo. Devuelve el mismo objeto
 * si nada cambió, para que el POS no vuelva a pintar de más.
 */
export function avanzarRecorrido(e: EstadoRecorrido, s: SenalesRecorrido, ahora: number): EstadoRecorrido {
  if (e.paso === 5) return e
  // Cobró: se acabó, venga del paso que venga. En celular la barra de abajo
  // cobra directo, sin pasar por «¿cómo paga?», y eso también es vender bien.
  if (s.ventasPractica > e.ventasAlEmpezar) return { ...e, paso: 5, fin: ahora }
  if (e.paso === 1) return s.lineas > 0 ? { ...e, paso: 2, articulosAlEntrar: s.articulos } : e
  // Vació el carrito a medio camino: se vuelve a «toca un producto».
  if (s.lineas === 0) return { ...e, paso: 1 }
  if (e.paso === 2 && s.articulos > e.articulosAlEntrar) return { ...e, paso: 3 }
  if (e.paso === 3 && s.efectivoEscrito) return { ...e, paso: 4 }
  return e
}

/** «Siguiente» a mano: solo en los pasos que se pueden saltar sin hacer nada. */
export function siguienteRecorrido(e: EstadoRecorrido): EstadoRecorrido {
  if (e.paso === 2 || e.paso === 3) return { ...e, paso: (e.paso + 1) as PasoRecorrido }
  return e
}

export interface TarjetaRecorrido {
  paso: PasoRecorrido
  titulo: string
  texto: string
  objetivo: ObjetivoRecorrido | null
  /** Enseña el botón «Siguiente». */
  siguiente: boolean
  /** Dónde se pinta: flotando sobre los productos, o dentro del carrito. */
  donde: "flotante" | "carrito"
}

/** Lo que se le dice a la persona en este momento, con lo que está pasando. */
export function tarjetaRecorrido(e: EstadoRecorrido, s: SenalesRecorrido): TarjetaRecorrido {
  const carritoALaVista = !s.esMovil || s.carritoAbierto
  const abreElCarrito = (paso: PasoRecorrido, titulo: string): TarjetaRecorrido => ({
    paso,
    titulo,
    texto: "Abre el carrito tocando la barra de abajo.",
    objetivo: "carrito-barra",
    siguiente: false,
    donde: "flotante",
  })
  switch (e.paso) {
    case 1:
      if (s.preguntaAbierta)
        return {
          paso: 1,
          titulo: "Elige lo que te pregunta",
          texto: "Y toca «Agregar». Lo que elijas se puede cambiar después desde el carrito.",
          objetivo: null,
          siguiente: false,
          donde: "flotante",
        }
      if (s.eligiendoTamano)
        return {
          paso: 1,
          titulo: "Elige el tamaño",
          texto: "Cada tamaño tiene su precio; tócalo y ya está en el carrito.",
          objetivo: null,
          siguiente: false,
          donde: "flotante",
        }
      return {
        paso: 1,
        titulo: "Toca un producto",
        texto: "Cualquiera. Lo de «Más vendidos» entra de un toque.",
        objetivo: "producto",
        siguiente: false,
        donde: "flotante",
      }
    case 2:
      if (!carritoALaVista) return abreElCarrito(2, "Ahí está tu venta")
      return {
        paso: 2,
        titulo: "Esta es tu línea",
        texto: "Toca «+» para agregar otro igual. Si te equivocaste, deslízala a la izquierda para quitarla.",
        objetivo: "linea",
        siguiente: true,
        donde: "carrito",
      }
    case 3:
      if (!carritoALaVista) return abreElCarrito(3, "¿Cómo paga?")
      return {
        paso: 3,
        titulo: "¿Cómo paga?",
        texto: "Elige efectivo, tarjeta o transferencia. En efectivo, escribe con cuánto paga y el cambio sale solo.",
        objetivo: "pago",
        siguiente: true,
        donde: "carrito",
      }
    case 4:
      return {
        paso: 4,
        titulo: "Cobra",
        texto: "Toca «Cobrar». Es práctica: no se registra nada.",
        objetivo: "cobrar",
        siguiente: false,
        donde: carritoALaVista ? "carrito" : "flotante",
      }
    case 5:
      return {
        paso: 5,
        titulo: "¡Listo, así se vende!",
        texto: `Vendiste en ${duracionLegible((e.fin ?? e.inicio) - e.inicio)}. De verdad es igual, y cada vez sale más rápido.`,
        objetivo: null,
        siguiente: false,
        donde: "flotante",
      }
  }
}

/** «14 s», «1 min 5 s», «2 min». Nunca «0 s»: se redondea hacia arriba a 1. */
export function duracionLegible(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m} min ${r} s` : `${m} min`
}
