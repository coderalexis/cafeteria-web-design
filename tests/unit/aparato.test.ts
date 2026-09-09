import { describe, it, expect } from "vitest"
import { APARATOS, detectarAparato, esTactil, NOMBRE_APARATO, verbos } from "@/lib/aparato"

describe("detectarAparato", () => {
  it("el puntero manda sobre el ancho: una tablet acostada no es computadora", () => {
    // 10.4" acostada: 1000 px de ancho, pero se toca con el dedo.
    expect(detectarAparato({ ancho: 1000, punteroGrueso: true })).toBe("tablet")
    // El mismo ancho con ratón sí es computadora.
    expect(detectarAparato({ ancho: 1000, punteroGrueso: false })).toBe("computadora")
  })

  it("con el dedo, el ancho separa celular de tablet", () => {
    expect(detectarAparato({ ancho: 375, punteroGrueso: true })).toBe("celular")
    expect(detectarAparato({ ancho: 600, punteroGrueso: true })).toBe("celular")
    expect(detectarAparato({ ancho: 768, punteroGrueso: true })).toBe("tablet")
    expect(detectarAparato({ ancho: 810, punteroGrueso: true })).toBe("tablet")
  })

  it("una pantalla angosta con ratón sigue siendo computadora", () => {
    // Una ventana a medias no convierte un escritorio en celular.
    expect(detectarAparato({ ancho: 500, punteroGrueso: false })).toBe("computadora")
  })
})

describe("esTactil", () => {
  it("celular y tablet se tocan; la computadora no", () => {
    expect(esTactil("celular")).toBe(true)
    expect(esTactil("tablet")).toBe(true)
    expect(esTactil("computadora")).toBe(false)
  })
})

describe("verbos", () => {
  it("en computadora nadie «toca»", () => {
    const v = verbos("computadora")
    expect(v.toca).toBe("haz clic en")
    expect(v.Toca).toBe("Haz clic en")
    expect(v.toque).toBe("clic")
    expect(v.toques).toBe("clics")
  })

  it("celular y tablet comparten el verbo del dedo", () => {
    expect(verbos("celular")).toEqual(verbos("tablet"))
    expect(verbos("celular").toca).toBe("toca")
  })

  it("ninguna forma queda vacía en ningún aparato", () => {
    for (const aparato of APARATOS) {
      for (const [forma, texto] of Object.entries(verbos(aparato))) {
        expect(texto, `${aparato}.${forma}`).toBeTruthy()
      }
    }
  })

  it("las dos tablas tienen exactamente las mismas formas", () => {
    expect(Object.keys(verbos("celular")).sort()).toEqual(Object.keys(verbos("computadora")).sort())
  })

  it("cada aparato tiene nombre para el interruptor", () => {
    for (const aparato of APARATOS) expect(NOMBRE_APARATO[aparato]).toBeTruthy()
  })
})
