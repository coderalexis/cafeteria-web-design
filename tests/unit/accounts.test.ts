import { describe, expect, it } from "vitest"
import {
  isSyntheticEmail,
  normalizeSlug,
  slugify,
  syntheticEmail,
  validatePassword,
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
