import { describe, expect, it } from "vitest"
import {
  conteoVacio,
  detalleConteo,
  explicarDiferencia,
  hayConteo,
  retiro,
  totalConteo,
  validarFondo,
} from "@/lib/conteo-caja"

// El corte contando billetes promete que el total sale solo y que la
// diferencia se dice en palabras. Esto fija la suma (con centavos), el
// detalle que se guarda, y los tres tonos de la comparación.

describe("totalConteo y detalleConteo", () => {
  it("suma billetes y monedas, con el $20 en las dos formas y los 50 centavos", () => {
    const c = { b500: 3, b20: 2, m20: 1, m050: 1 }
    expect(totalConteo(c)).toBe(1560.5)
    expect(hayConteo(c)).toBe(true)
    expect(hayConteo(conteoVacio())).toBe(false)
    expect(totalConteo(conteoVacio())).toBe(0)
  })

  it("el detalle junta el $20 de billete y moneda, va de mayor a menor y omite los ceros", () => {
    expect(detalleConteo({ b500: 3, b20: 2, m20: 1, m050: 1, b100: 0 })).toEqual([
      { value: 500, qty: 3 },
      { value: 20, qty: 3 },
      { value: 0.5, qty: 1 },
    ])
  })
})

describe("explicarDiferencia", () => {
  it("cuadra, falta o sobra, con qué revisar", () => {
    expect(explicarDiferencia(580, 580)).toMatchObject({ tono: "ok", titulo: "Cuadra exacto" })
    const falta = explicarDiferencia(580, 545)
    expect(falta.tono).toBe("falta")
    expect(falta.titulo).toBe("Faltan $35.00")
    expect(falta.texto).toMatch(/salidas de efectivo/)
    const sobra = explicarDiferencia(580, 600.5)
    expect(sobra.tono).toBe("sobra")
    expect(sobra.titulo).toBe("Sobran $20.50")
  })
})

describe("validarFondo y retiro", () => {
  it("el fondo sale de lo contado y lo demás se retira", () => {
    expect(validarFondo(null, 580)).toBeNull()
    expect(validarFondo(300, 580)).toBeNull()
    expect(validarFondo(-1, 580)).toMatch(/negativo/)
    expect(validarFondo(600, 580)).toBe("No puedes dejar más de lo que hay ($580.00).")
    expect(retiro(580, 300)).toBe(280)
    expect(retiro(580, null)).toBeNull()
    expect(retiro(100.1, 0.2)).toBe(99.9)
  })
})
