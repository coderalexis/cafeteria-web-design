import { describe, expect, it } from "vitest"
import { dbErrorMessage } from "@/lib/db-errors"

// Lo que lee la dueña en el aviso cuando la base rechaza algo. La regla del
// archivo: si se reconoce, en español y diciendo qué hacer; si no, el texto
// original detrás de «No se pudo guardar:», nunca un mensaje inventado.

describe("errores de la base en el idioma del café", () => {
  it("un repetido conocido dice qué cambiar", () => {
    const e = { code: "23505", message: 'duplicate key value violates unique constraint "business_members_business_id_username_key"' }
    expect(dbErrorMessage(e)).toBe("Ese usuario ya existe en esta cafetería. Elige otro.")
  })

  it("un repetido desconocido da el mensaje general, no uno equivocado", () => {
    const e = { code: "23505", message: 'duplicate key value violates unique constraint "otra_cosa_key"' }
    expect(dbErrorMessage(e)).toMatch(/^Ya existe un registro con esos datos/)
  })

  it("una llave foránea distingue borrar algo que se usa de guardar algo que ya no existe", () => {
    const borrando = {
      code: "23503",
      message: 'update or delete on table "menu_categories" violates foreign key constraint "menu_products_category_fkey" on table "menu_products"',
      details: 'Key (id)=(…) is still referenced from table "menu_products".',
    }
    expect(dbErrorMessage(borrando)).toMatch(/No se puede eliminar la categoría porque todavía tiene productos/)

    const guardando = {
      code: "23503",
      message: 'insert or update on table "menu_products" violates foreign key constraint "menu_products_category_fkey"',
      details: 'Key (category_id)=(…) is not present in table "menu_categories".',
    }
    expect(dbErrorMessage(guardando)).toBe("Esa categoría ya no existe. Recarga la página y elige otra.")
  })

  it("una regla de columna conocida se explica", () => {
    const e = { code: "23514", message: 'new row for relation "menu_variants" violates check constraint "menu_variants_price_check"' }
    expect(dbErrorMessage(e)).toBe("El precio no puede ser negativo.")
  })

  it("lo que no se reconoce pasa tal cual, para poder pedir ayuda", () => {
    expect(dbErrorMessage({ code: "P0001", message: "La caja está cerrada." })).toBe("No se pudo guardar: La caja está cerrada.")
    expect(dbErrorMessage(null)).toBe("No se pudo guardar. Inténtalo de nuevo.")
    expect(dbErrorMessage({ code: "42501", message: "permission denied" })).toMatch(/No tienes permiso/)
  })
})
