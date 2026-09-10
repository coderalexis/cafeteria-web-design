import { describe, expect, it } from "vitest"
import {
  isSyntheticEmail,
  normalizeSlug,
  slugify,
  syntheticEmail,
  validatePassword,
  elegirCafe,
  type CandidatoCafe,
} from "@/lib/accounts"
import { computeDiscount, parseCash } from "@/app/pos/cart"

// Los cajeros entran con usuario + cafetería, no con correo: por debajo eso
// es un correo sintético `usuario@slug.dominio`. Si el slug o el usuario se
// normalizan distinto en dos lugares, la cajera no puede entrar.
describe("cuentas sintéticas", () => {
  it("arma el correo a partir del usuario y el slug", () => {
    const correo = syntheticEmail("maria", "gym-coffe")
    expect(correo.startsWith("maria@gym-coffe.")).toBe(true)
    expect(isSyntheticEmail(correo)).toBe(true)
  })

  it("distingue un correo real de uno sintético (incluido el dominio legado)", () => {
    expect(isSyntheticEmail("diana@gmail.com")).toBe(false)
    expect(isSyntheticEmail("admin@cafecito.pos")).toBe(true)
    expect(isSyntheticEmail(null)).toBe(false)
  })
})

describe("slugs", () => {
  it("convierte un nombre en una etiqueta DNS válida", () => {
    expect(slugify("Gym Coffe")).toBe("gym-coffe")
    expect(slugify("Café de la Esquina")).toBe("cafe-de-la-esquina")
    expect(slugify("  El   Cafecito!! ")).toBe("el-cafecito")
  })

  it("normalizeSlug tolera mayúsculas y espacios del usuario", () => {
    expect(normalizeSlug(" Gym-Coffe ")).toBe("gym-coffe")
  })
})

describe("contraseñas", () => {
  it("exige un mínimo y devuelve el motivo en español", () => {
    expect(validatePassword("corta")).not.toBeNull()
    expect(validatePassword("Cafecito-2026-Segura")).toBeNull()
  })
})

// Lo que el cliente ve como descuento y como cambio antes de cobrar. El
// servidor recalcula, pero si esto difiere la cajera dice un total y cobra
// otro.
describe("carrito: descuento y efectivo", () => {
  it("porcentaje y monto, redondeados a centavos", () => {
    expect(computeDiscount(100, { type: "percent", value: 15, reason: "x" })).toBe(15)
    expect(computeDiscount(33.33, { type: "percent", value: 10, reason: "x" })).toBe(3.33)
    expect(computeDiscount(100, { type: "amount", value: 25, reason: "x" })).toBe(25)
    expect(computeDiscount(100, null)).toBe(0)
  })

  it("parseCash entiende lo que se teclea en caja", () => {
    expect(parseCash("100")).toBe(100)
    expect(parseCash("100.50")).toBe(100.5)
    expect(parseCash("")).toBeNull()
    expect(parseCash("abc")).toBeNull()
  })
})

// Entrar escribiendo SOLO el usuario. El campo del café se oculta, así que
// esta decisión es la que evita dejar a alguien fuera sin poder corregirlo.
describe("elegirCafe", () => {
  const c = (slug: string): CandidatoCafe => ({ businessId: "b-" + slug, slug, userId: "u-" + slug })
  const sinSlug = { valor: "", escrito: false }

  it("un solo café: entra ahí sin preguntar nada", () => {
    expect(elegirCafe([c("gym-coffe")], sinSlug)).toEqual({ tipo: "uno", candidato: c("gym-coffe") })
  })

  it("ningún café: no se distingue de una contraseña mala", () => {
    expect(elegirCafe([], sinSlug)).toEqual({ tipo: "ninguno" })
  })

  it("varios cafés y nada que los distinga: hay que preguntar", () => {
    expect(elegirCafe([c("uno"), c("dos")], sinSlug)).toEqual({ tipo: "varios" })
  })

  it("varios cafés con el slug escrito: entra al que escribió", () => {
    const r = elegirCafe([c("uno"), c("dos")], { valor: "dos", escrito: true })
    expect(r).toEqual({ tipo: "uno", candidato: c("dos") })
  })

  it("el slug ESCRITO que no coincide es un error, no se entra a otro", () => {
    expect(elegirCafe([c("uno"), c("dos")], { valor: "tres", escrito: true })).toEqual({ tipo: "ninguno" })
    expect(elegirCafe([c("uno")], { valor: "tres", escrito: true })).toEqual({ tipo: "ninguno" })
  })

  it("el slug RECORDADO que no coincide se ignora: nadie queda fuera por un dato viejo", () => {
    // Cambió de café y el teléfono guardaba el anterior. Con el campo oculto
    // no podría corregirlo, así que la pista se descarta.
    expect(elegirCafe([c("nuevo")], { valor: "viejo", escrito: false })).toEqual({
      tipo: "uno",
      candidato: c("nuevo"),
    })
    expect(elegirCafe([c("uno"), c("dos")], { valor: "viejo", escrito: false })).toEqual({ tipo: "varios" })
  })

  it("el slug recordado que sí coincide ahorra la pregunta", () => {
    const r = elegirCafe([c("uno"), c("dos")], { valor: "uno", escrito: false })
    expect(r).toEqual({ tipo: "uno", candidato: c("uno") })
  })

  it("normaliza el slug: mayúsculas y espacios no deben fallar", () => {
    expect(elegirCafe([c("gym-coffe")], { valor: "  GYM-COFFE ", escrito: true })).toEqual({
      tipo: "uno",
      candidato: c("gym-coffe"),
    })
  })
})
