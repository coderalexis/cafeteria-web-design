/**
 * Cuántos días de errores reportados se enseñan en /super y se guardan en la
 * base (la limpieza de `report_error`, migración 52, usa el mismo plazo).
 * Vive aquí y no en la server action porque un archivo «use server» solo
 * puede exportar funciones asíncronas.
 */
export const ERRORES_DIAS = 2
