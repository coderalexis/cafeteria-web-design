/**
 * Reglas del logo de la cafetería.
 *
 * Son dos y no uno a propósito: el menú público es una pantalla a color y el
 * ticket sale de una térmica de 58 mm, que imprime UN BIT por punto. Un logo
 * de color pasado a monocromo sale como una mancha gris, y el de la térmica
 * —trazo negro sobre blanco— se ve pobre en el menú.
 */

export type RanuraLogo = "menu" | "ticket"

export const RANURAS_LOGO: readonly RanuraLogo[] = ["menu", "ticket"] as const

/** Lo que acepta el bucket; el mismo límite vive en la migración 54. */
export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_TIPOS: readonly string[] = ["image/png", "image/jpeg", "image/webp"] as const

/**
 * Ancho útil de una térmica de 58 mm: 384 puntos. Un logo más ancho lo encoge
 * el navegador al imprimir —y las líneas finas se pierden—, así que este es el
 * tamaño con el que conviene prepararlo.
 */
export const TICKET_ANCHO_PUNTOS = 384

export function extensionDe(tipo: string): string | null {
  if (tipo === "image/png") return "png"
  if (tipo === "image/jpeg") return "jpg"
  if (tipo === "image/webp") return "webp"
  return null
}

/**
 * Dónde se guarda.
 *
 * Lleva la hora en el nombre a propósito: el bucket es público y sirve por
 * CDN, así que reescribir la MISMA ruta seguiría entregando el logo viejo un
 * buen rato. Con un nombre nuevo cada vez, el cambio se ve al instante; del
 * anterior se encarga quien sube, borrándolo después.
 */
export function rutaLogo(businessId: string, ranura: RanuraLogo, extension: string, ahora: number): string {
  return `${businessId}/${ranura}-${ahora}.${extension}`
}

/**
 * La ruta dentro del bucket a partir de la URL pública guardada.
 *
 * Sirve para borrar el archivo anterior. Devuelve null si la URL no es de
 * nuestro bucket —alguien pudo dejar una a mano en la base—: en ese caso no
 * hay nada nuestro que borrar y forzarlo sería peor.
 */
export function rutaDesdeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marca = "/storage/v1/object/public/logos/"
  const i = url.indexOf(marca)
  if (i < 0) return null
  const ruta = url.slice(i + marca.length).split("?")[0]
  return ruta || null
}

export interface ProblemaLogo {
  motivo: "tipo" | "tamano" | "vacio"
  mensaje: string
}

/** Lo que se revisa antes de subir nada. */
export function revisarLogo(archivo: { type: string; size: number }): ProblemaLogo | null {
  if (!archivo.size) return { motivo: "vacio", mensaje: "No se recibió ninguna imagen." }
  if (!LOGO_TIPOS.includes(archivo.type)) {
    return { motivo: "tipo", mensaje: "El logo tiene que ser PNG, JPG o WebP." }
  }
  if (archivo.size > LOGO_MAX_BYTES) {
    return {
      motivo: "tamano",
      mensaje: `El logo pesa ${Math.round(archivo.size / 1024)} kB y el máximo es ${LOGO_MAX_BYTES / 1024} kB.`,
    }
  }
  return null
}
