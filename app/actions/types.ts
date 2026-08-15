/**
 * Convención de retorno de todas las server actions:
 * éxito → `{ success: true, ...datos }`; fallo → `{ error: mensaje }`.
 * Los `never` opcionales permiten leer `result.error` / `result.success`
 * sin narrowing manual en los componentes.
 */
export type ActionResult<T extends object = object> =
  | ({ success: true; error?: never } & T)
  | { success?: never; error: string }
