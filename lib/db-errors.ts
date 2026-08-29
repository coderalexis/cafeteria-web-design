/* ------------------------------------------------------------------ */
/*  Errores de la base, en el idioma de quien atiende el café          */
/* ------------------------------------------------------------------ */

/**
 * Las actions devuelven `{ error }` y el toast lo muestra tal cual. Cuando el
 * fallo venía de una restricción de la base, lo que leía la dueña era el texto
 * crudo de Postgres, en inglés:
 *
 *     duplicate key value violates unique constraint "menu_categories_business_slug_key"
 *
 * El error SÍ se veía —eso ya está arreglado— pero con esa frase no se puede
 * hacer nada: no dice qué campo repetir ni qué cambiar.
 *
 * La pista buena es el NOMBRE DE LA RESTRICCIÓN, no el texto del mensaje: va
 * entre comillas, lo elegimos nosotros en las migraciones y no cambia con la
 * versión del servidor ni con el idioma en que responda. Por eso los mapas de
 * abajo se indexan por nombre de restricción y no por frases.
 *
 * Regla que se respeta en todo el archivo: cuando el caso no se reconoce, NO
 * se inventa un mensaje. Se antepone «No se pudo guardar:» y se deja pasar el
 * original — técnico, pero cierto, y copiable para pedir ayuda. Un mensaje
 * amable y equivocado es peor que uno feo y verdadero.
 */

/** Lo que traen tanto los errores de PostgREST como los de `auth.admin`. */
type ErrorLike = {
  message?: string | null
  code?: string | null
  details?: string | null
}

/* ── Únicos (23505): «esto ya existe» ─────────────────────────────── */
const UNIQUE: Record<string, string> = {
  menu_categories_business_slug_key:
    "Ya existe una categoría con ese identificador. Usa otro (por ejemplo, agrégale una palabra).",
  // PK compuesta (product_id, group_id): el grupo ya estaba asignado.
  product_modifier_groups_pkey: "Ese grupo de modificadores ya está en este producto.",
  business_members_pkey: "Esa persona ya forma parte del equipo.",
  business_members_business_id_username_key: "Ese usuario ya existe en esta cafetería. Elige otro.",
  profiles_username_key: "Ese usuario ya está ocupado. Elige otro.",
}

/* ── Llaves foráneas (23503) ──────────────────────────────────────── */

/** Borrando: la fila todavía la usan otros datos (ON DELETE RESTRICT). */
const DELETE_BLOCKED: Record<string, string> = {
  menu_products_category_fkey:
    "No se puede eliminar la categoría porque todavía tiene productos. Muévelos a otra categoría o elimínalos primero.",
  tickets_cashier_id_fkey:
    "No se puede eliminar esa cuenta porque tiene ventas registradas. Desactívala para conservar el historial.",
}

/** Guardando: el padre al que apunta la fila ya no está. */
const MISSING_PARENT: Record<string, string> = {
  menu_products_category_fkey: "Esa categoría ya no existe. Recarga la página y elige otra.",
  menu_variants_product_fkey: "Ese producto ya no existe. Recarga la página.",
  modifiers_group_fkey: "Ese grupo de modificadores ya no existe. Recarga la página.",
  pmg_product_fkey: "Ese producto ya no existe. Recarga la página.",
  pmg_group_fkey: "Ese grupo de modificadores ya no existe. Recarga la página.",
}

/* ── Reglas de columna (23514) ────────────────────────────────────── */
const CHECK: Record<string, string> = {
  menu_variants_price_check: "El precio no puede ser negativo.",
  menu_variants_cost_check: "El costo no puede ser negativo.",
  menu_categories_color_check: "Ese color no está en la paleta. Elige uno de la lista.",
  business_members_username_check:
    "El usuario solo puede llevar letras minúsculas, números, punto y guiones.",
}

/** Postgres pone el nombre entre comillas dobles en las tres familias. */
function constraintName(message: string): string | null {
  return message.match(/constraint "([^"]+)"/)?.[1] ?? null
}

/**
 * Mensaje en español para el error de una action. Los códigos son los de
 * Postgres (`SQLSTATE`), que PostgREST reenvía en `code`.
 */
export function dbErrorMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike
  const message = typeof e.message === "string" ? e.message : ""
  const details = typeof e.details === "string" ? e.details : ""
  const name = constraintName(message)

  switch (e.code) {
    case "23505":
      return (name && UNIQUE[name]) || "Ya existe un registro con esos datos. Revisa que no esté repetido."

    case "23503": {
      // Postgres distingue las dos direcciones y la diferencia importa: una se
      // arregla borrando lo que depende, la otra recargando la página.
      const borrando = /still referenced/i.test(details) || /^update or delete/i.test(message)
      if (borrando) {
        return (
          (name && DELETE_BLOCKED[name]) ||
          "No se puede borrar porque hay otros datos que dependen de esto."
        )
      }
      return (
        (name && MISSING_PARENT[name]) ||
        "Algo que elegiste ya no existe. Recarga la página e inténtalo de nuevo."
      )
    }

    case "23514":
      return (
        (name && CHECK[name]) ||
        "Alguno de los datos no cumple una regla del sistema. Revísalos e inténtalo de nuevo."
      )

    // Los dos de abajo no son restricciones con nombre útil, pero llegan igual
    // de crudos al toast y se leen igual de mal.
    case "23502":
      return "Falta un dato obligatorio. Revisa el formulario e inténtalo de nuevo."

    case "42501":
      return "No tienes permiso para hacer este cambio en esta cafetería."

    default:
      return message ? `No se pudo guardar: ${message}` : "No se pudo guardar. Inténtalo de nuevo."
  }
}
