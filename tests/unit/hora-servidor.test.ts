import { describe, expect, it } from "vitest"
import { horaParaElServidor, medirDesfase, VIAJE_MAXIMO_MS } from "@/app/pos/hora-servidor"

// La cola sin internet manda la hora de la venta en el reloj del SERVIDOR:
// create_ticket rechaza lo que venga más de 2 minutos «del futuro» y lo
// anterior a la apertura de la caja, y con el reloj del teléfono mal puesto
// esas ventas no subían nunca.

const MIN = 60_000

describe("medir cuánto se desvía el reloj del teléfono", () => {
  it("toma el punto medio del viaje", () => {
    // El teléfono pregunta a las 1000 y recibe a las 1200; el servidor dijo 1100 → sin desfase.
    expect(medirDesfase(1100, 1000, 1200)).toBe(0)
  })

  it("teléfono 5 min adelantado → desfase negativo", () => {
    const servidor = 10 * MIN
    expect(medirDesfase(servidor, servidor + 5 * MIN - 100, servidor + 5 * MIN + 100)).toBe(-5 * MIN)
  })

  it("teléfono 3 min atrasado → desfase positivo", () => {
    const servidor = 10 * MIN
    expect(medirDesfase(servidor, servidor - 3 * MIN - 50, servidor - 3 * MIN + 50)).toBe(3 * MIN)
  })

  it("con solo el encabezado Date (segundos truncados) se centra el medio segundo", () => {
    expect(medirDesfase(1000, 1500, 1500, 1000)).toBe(0)
  })

  it("un viaje demasiado largo o imposible no sirve para medir", () => {
    expect(medirDesfase(1000, 0, VIAJE_MAXIMO_MS + 1)).toBeNull()
    expect(medirDesfase(1000, 500, 400)).toBeNull()
    expect(medirDesfase(null, 0, 10)).toBeNull()
    expect(medirDesfase(Number.NaN, 0, 10)).toBeNull()
  })
})

describe("la hora que se manda al subir una venta de la cola", () => {
  const ahoraReal = 100 * MIN

  it("teléfono adelantado 10 min: la venta sube con su hora real, no «en el futuro»", () => {
    const adelanto = 10 * MIN
    const cobradaReal = ahoraReal - 30 * MIN
    const capturada = cobradaReal + adelanto
    const enviada = horaParaElServidor(capturada, -adelanto, -adelanto, ahoraReal + adelanto)
    expect(enviada).toBe(cobradaReal)
    expect(enviada).toBeLessThanOrEqual(ahoraReal + 2 * MIN)
  })

  it("teléfono atrasado 20 min: no cae antes de la apertura de la caja", () => {
    const atraso = 20 * MIN
    const aperturaReal = ahoraReal - 15 * MIN
    const cobradaReal = ahoraReal - 10 * MIN
    const enviada = horaParaElServidor(cobradaReal - atraso, atraso, atraso, ahoraReal - atraso)
    expect(enviada).toBe(cobradaReal)
    expect(enviada).toBeGreaterThan(aperturaReal)
  })

  it("si el teléfono se puso en hora entre cobrar y subir, manda la desviación que había al cobrar", () => {
    const adelanto = 10 * MIN
    const cobradaReal = ahoraReal - 30 * MIN
    // Cobró con el reloj adelantado; al volver la señal el teléfono se sincronizó (desfase 0).
    expect(horaParaElServidor(cobradaReal + adelanto, -adelanto, 0, ahoraReal)).toBe(cobradaReal)
  })

  it("venta vieja sin desviación guardada: usa la de ahora", () => {
    const adelanto = 10 * MIN
    const cobradaReal = ahoraReal - 30 * MIN
    expect(horaParaElServidor(cobradaReal + adelanto, undefined, -adelanto, ahoraReal + adelanto)).toBe(cobradaReal)
  })

  it("aunque la medición se equivoque, nunca pasa del «ahora» del servidor", () => {
    // Desviación al cobrar mal medida (+1 h): sin el tope subiría una hora en el futuro.
    const enviada = horaParaElServidor(ahoraReal - MIN, 60 * MIN, 0, ahoraReal)
    expect(enviada).toBe(ahoraReal - 1000)
  })

  it("sin ninguna medición, la hora del teléfono tal cual (como antes)", () => {
    expect(horaParaElServidor(ahoraReal - 5 * MIN, null, null, ahoraReal)).toBe(ahoraReal - 5 * MIN)
  })
})
