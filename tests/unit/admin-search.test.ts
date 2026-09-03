import { describe, expect, it } from "vitest"
import { INDICE_ADMIN, buscarAdmin, normalizarBusqueda } from "@/lib/admin-search"

// El buscador del panel responde «¿dónde se cambia esto?». Lo que se fija
// aquí es que las preguntas reales de los dueños lleguen a la tarjeta
// correcta, sin importar acentos ni orden de palabras.

describe("buscarAdmin", () => {
  it("vacío o muy corto no propone nada", () => {
    expect(buscarAdmin("")).toEqual([])
    expect(buscarAdmin("a")).toEqual([])
  })

  it("«leche deslactosada» lleva a la opción por omisión, en Opciones y extras", () => {
    const r = buscarAdmin("leche deslactosada")
    expect(r[0].href).toBe("/admin/modificadores")
    expect(r[0].titulo).toMatch(/omisión/)
  })

  it("«impresora» lleva a la tarjeta de impresión, no solo a la pantalla", () => {
    expect(buscarAdmin("impresora")[0].href).toBe("/admin/negocio#impresion")
  })

  it("no importan los acentos ni las mayúsculas", () => {
    expect(buscarAdmin("Categoría")[0].href).toBe("/admin/categorias")
    expect(buscarAdmin("zona horaria")[0].href).toBe("/admin/negocio#zona-horaria")
    expect(normalizarBusqueda("Contraseña Ñ")).toBe("contrasena n")
  })

  it("«pin» encuentra Seguridad de caja, Equipo y Mi cuenta", () => {
    const hrefs = buscarAdmin("pin").map((d) => d.href)
    expect(hrefs).toContain("/admin/negocio#seguridad")
    expect(hrefs).toContain("/admin/equipo")
    expect(hrefs).toContain("/cuenta#pin")
  })

  it("todas las palabras cuentan: «cuentas abiertas mesas» es Módulos del POS", () => {
    const r = buscarAdmin("cuentas abiertas mesas")
    expect(r).toHaveLength(1)
    expect(r[0].href).toBe("/admin/negocio#modulos")
  })

  it("lo que trae la palabra en el título va primero", () => {
    const r = buscarAdmin("gastos")
    expect(r[0].titulo).toMatch(/Gastos/)
  })

  it("nunca más de ocho resultados", () => {
    expect(buscarAdmin("de").length).toBeLessThanOrEqual(8)
  })

  it("cada entrada del índice apunta a una ruta del panel, del POS o de la cuenta", () => {
    for (const d of INDICE_ADMIN) {
      expect(d.href).toMatch(/^\/(admin|pos|cuenta)/)
      expect(d.titulo.length).toBeGreaterThan(3)
      expect(d.palabras.length).toBeGreaterThan(3)
    }
  })
})
