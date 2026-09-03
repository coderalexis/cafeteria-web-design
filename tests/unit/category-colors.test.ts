import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CATEGORY_COLORS, COLOR_CLASSES, colorClasses } from "@/lib/category-colors"

// El color de categoría se rompió una vez de la peor forma: las clases están
// bien escritas, el color está bien guardado, y aun así solo se pintaba la
// categoría ámbar. La causa era que `lib/` no estaba en las rutas que Tailwind
// lee, así que borraba del CSS todas las clases que solo viven aquí; la ámbar
// sobrevivía porque el POS usa ámbar por todos lados. Esta prueba cuida las
// dos mitades: que la tabla esté completa y que Tailwind siga mirando `lib/`.

describe("COLOR_CLASSES", () => {
  it("cada color tiene sus cinco clases, y ninguna se repite entre colores", () => {
    const acentos = new Set<string>()
    for (const color of CATEGORY_COLORS) {
      const c = COLOR_CLASSES[color]
      expect(c, color).toBeTruthy()
      for (const clave of ["label", "chipActive", "chip", "accent", "dot"] as const) {
        expect(c[clave].length, `${color}.${clave}`).toBeGreaterThan(0)
      }
      // El acento es lo que se ve en la rejilla: dos categorías no pueden compartirlo.
      expect(acentos.has(c.accent), `acento repetido en ${color}`).toBe(false)
      acentos.add(c.accent)
    }
  })

  it("un color desconocido o vacío no pinta nada", () => {
    expect(colorClasses(null)).toBeNull()
    expect(colorClasses(undefined)).toBeNull()
    expect(colorClasses("")).toBeNull()
    expect(colorClasses("fucsia")).toBeNull()
    expect(colorClasses("amber")?.accent).toBe("bg-amber-400")
  })
})

describe("tailwind.config.ts", () => {
  it("mira dentro de lib/, donde viven las clases de color", () => {
    const config = readFileSync("tailwind.config.ts", "utf8")
    const contenido = config.slice(config.indexOf("content:"), config.indexOf("prefix:"))
    expect(contenido).toMatch(/["']\.\/lib\/\*\*\/\*\.\{ts,tsx\}["']/)
  })
})
