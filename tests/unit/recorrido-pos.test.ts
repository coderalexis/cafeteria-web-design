import { describe, expect, it } from "vitest"
import {
  avanzarRecorrido,
  duracionLegible,
  iniciarRecorrido,
  siguienteRecorrido,
  tarjetaRecorrido,
  type SenalesRecorrido,
} from "@/lib/recorrido-pos"

// El recorrido promete avanzar «cuando lo haces», no cuando lees. Esto fija
// que cada paso se gana con la acción real y que la tarjeta dice lo correcto
// según el aparato y lo que está abierto.

const quieto: SenalesRecorrido = {
  lineas: 0,
  articulos: 0,
  eligiendoTamano: false,
  preguntaAbierta: false,
  esMovil: false,
  carritoAbierto: false,
  efectivoEscrito: false,
  ventasPractica: 0,
}

describe("avanzarRecorrido", () => {
  it("avanza solo cuando la persona hace cada cosa", () => {
    let e = iniciarRecorrido(1000, 0)
    expect(avanzarRecorrido(e, quieto, 1001)).toBe(e) // sin tocar nada, la misma referencia
    e = avanzarRecorrido(e, { ...quieto, lineas: 1, articulos: 1 }, 1500)
    expect(e.paso).toBe(2)
    e = avanzarRecorrido(e, { ...quieto, lineas: 1, articulos: 2 }, 1600) // tocó «+»
    expect(e.paso).toBe(3)
    e = avanzarRecorrido(e, { ...quieto, lineas: 1, articulos: 2, efectivoEscrito: true }, 1700)
    expect(e.paso).toBe(4)
    e = avanzarRecorrido(e, { ...quieto, ventasPractica: 1 }, 15000)
    expect(e.paso).toBe(5)
    expect(e.fin).toBe(15000)
    expect(avanzarRecorrido(e, quieto, 99999)).toBe(e) // terminado se queda terminado
  })

  it("cobrar desde la barra del celular termina el recorrido desde cualquier paso", () => {
    let e = iniciarRecorrido(0, 3)
    e = avanzarRecorrido(e, { ...quieto, lineas: 1, articulos: 1 }, 10)
    expect(e.paso).toBe(2)
    e = avanzarRecorrido(e, { ...quieto, ventasPractica: 4 }, 8000)
    expect(e.paso).toBe(5)
  })

  it("vaciar el carrito a medio camino regresa a «toca un producto»", () => {
    let e = iniciarRecorrido(0, 0)
    e = avanzarRecorrido(e, { ...quieto, lineas: 1, articulos: 1 }, 10)
    e = siguienteRecorrido(e)
    expect(e.paso).toBe(3)
    e = avanzarRecorrido(e, quieto, 20)
    expect(e.paso).toBe(1)
  })

  it("«Siguiente» solo salta los pasos 2 y 3", () => {
    const e1 = iniciarRecorrido(0, 0)
    expect(siguienteRecorrido(e1).paso).toBe(1)
    expect(siguienteRecorrido({ ...e1, paso: 2 }).paso).toBe(3)
    expect(siguienteRecorrido({ ...e1, paso: 3 }).paso).toBe(4)
    expect(siguienteRecorrido({ ...e1, paso: 4 }).paso).toBe(4)
  })
})

describe("tarjetaRecorrido", () => {
  it("dice qué hacer según lo que está pasando", () => {
    const e = iniciarRecorrido(0, 0)
    expect(tarjetaRecorrido(e, quieto)).toMatchObject({ paso: 1, objetivo: "producto", donde: "flotante" })
    expect(tarjetaRecorrido(e, { ...quieto, preguntaAbierta: true }).titulo).toBe("Elige lo que te pregunta")
    expect(tarjetaRecorrido(e, { ...quieto, eligiendoTamano: true }).titulo).toBe("Elige el tamaño")
  })

  it("en celular pide abrir el carrito antes de hablar de la línea o del pago", () => {
    const e2 = { ...iniciarRecorrido(0, 0), paso: 2 as const }
    expect(tarjetaRecorrido(e2, { ...quieto, esMovil: true, lineas: 1 })).toMatchObject({
      objetivo: "carrito-barra",
      donde: "flotante",
      siguiente: false,
    })
    expect(tarjetaRecorrido(e2, { ...quieto, esMovil: true, lineas: 1, carritoAbierto: true })).toMatchObject({
      objetivo: "linea",
      donde: "carrito",
      siguiente: true,
    })
    // En escritorio el carrito siempre está a la vista.
    expect(tarjetaRecorrido(e2, { ...quieto, lineas: 1 })).toMatchObject({ objetivo: "linea", donde: "carrito" })
    const e4 = { ...e2, paso: 4 as const }
    expect(tarjetaRecorrido(e4, { ...quieto, esMovil: true, lineas: 1 })).toMatchObject({
      objetivo: "cobrar",
      donde: "flotante",
    })
  })

  it("al final dice en cuánto tiempo vendió", () => {
    const e5 = { ...iniciarRecorrido(1000, 0), paso: 5 as const, fin: 15000 }
    expect(tarjetaRecorrido(e5, quieto).texto).toMatch(/^Vendiste en 14 s\./)
  })
})

describe("duracionLegible", () => {
  it("segundos, minutos con segundos, minutos exactos; nunca 0 s", () => {
    expect(duracionLegible(14000)).toBe("14 s")
    expect(duracionLegible(65000)).toBe("1 min 5 s")
    expect(duracionLegible(120000)).toBe("2 min")
    expect(duracionLegible(200)).toBe("1 s")
  })
})
