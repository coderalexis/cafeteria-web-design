/**
 * Desde qué página llegó una petición. El middleware la escribe en este
 * encabezado (sobrescribiendo lo que mandara el cliente) y las acciones la
 * leen: así saben si las llamó el POS o el panel. Puro, sin Next.
 */
export const ENCABEZADO_RUTA = "x-cafecito-ruta"

export function esDelPos(ruta: string | null | undefined): boolean {
  return ruta === "/pos" || (typeof ruta === "string" && ruta.startsWith("/pos/"))
}
