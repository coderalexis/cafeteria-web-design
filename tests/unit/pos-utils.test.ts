import { describe, expect, it } from "vitest"
import { DURACION_LLEGADA_MS, factorDeLlegada, montoParcial } from "@/app/pos/pos-utils"

describe("factorDeLlegada — el total subiendo mientras aterriza una cuenta", () => {
  it("empieza en cero y termina en uno exacto", () => {
    expect(factorDeLlegada(0)).toBe(0)
    expect(factorDeLlegada(DURACION_LLEGADA_MS)).toBe(1)
  })

  it("nunca se sale del rango, ni con tiempos raros", () => {
    expect(factorDeLlegada(-100)).toBe(0)
    expect(factorDeLlegada(DURACION_LLEGADA_MS * 10)).toBe(1)
    expect(factorDeLlegada(10, 0)).toBe(1)
  })

  it("arranca rápido y frena al final: a la mitad del tiempo ya pasó de la mitad", () => {
    const mitad = factorDeLlegada(DURACION_LLEGADA_MS / 2)
    expect(mitad).toBeGreaterThan(0.5)
    expect(mitad).toBeLessThan(1)
  })

  it("siempre sube, nunca retrocede", () => {
    let previo = -1
    for (let t = 0; t <= DURACION_LLEGADA_MS; t += 50) {
      const f = factorDeLlegada(t)
      expect(f).toBeGreaterThanOrEqual(previo)
      previo = f
    }
  })
})

describe("montoParcial — lo que se enseña a media llegada", () => {
  it("con el factor completo devuelve el importe tal cual", () => {
    expect(montoParcial(195.5, 1)).toBe(195.5)
    expect(montoParcial(195.5, 1.2)).toBe(195.5)
  })

  it("redondea a centavos, sin colas de decimales", () => {
    expect(montoParcial(195.5, 0.333)).toBe(65.1)
    expect(montoParcial(10, 0.1)).toBe(1)
  })

  it("en cero no muestra nada de dinero", () => {
    expect(montoParcial(195.5, 0)).toBe(0)
  })

  it("todos los importes del carrito suben con el mismo factor y cuadran al final", () => {
    const subtotal = 195
    const total = 175.5
    const cobrar = 190.5
    for (const t of [0, 100, 325, 650]) {
      const f = factorDeLlegada(t)
      // A media subida ninguno se adelanta: la proporción entre ellos se mantiene.
      expect(montoParcial(subtotal, f)).toBeGreaterThanOrEqual(montoParcial(total, f))
      expect(montoParcial(cobrar, f)).toBeGreaterThanOrEqual(montoParcial(total, f))
    }
    expect(montoParcial(total, factorDeLlegada(DURACION_LLEGADA_MS))).toBe(total)
    expect(montoParcial(cobrar, factorDeLlegada(DURACION_LLEGADA_MS))).toBe(cobrar)
  })
})
