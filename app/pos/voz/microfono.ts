/**
 * El micrófono del pedido por voz. Puro y probado.
 *
 * El sitio entero manda `Permissions-Policy: microphone=()` y solo `/pos/voz`
 * lo abre (`next.config.mjs`). Esa cabecera es del DOCUMENTO: la recibe la
 * página que el navegador carga, no cada pantalla. Una navegación interna de
 * Next (un `<Link>`) cambia la pantalla sin cargar documento nuevo, así que
 * quien entraba desde el ⋮ del POS seguía en el documento de `/pos`, con el
 * micrófono prohibido: el navegador lo negaba sin preguntar y la pantalla
 * decía «no hay permiso». Recargar lo «arreglaba» porque entonces sí nacía un
 * documento en `/pos/voz`. Le pasó al usuario en su teléfono el 2026-10-14.
 *
 * Por eso al menú se entra con un `<a>` normal (documento nuevo), y esto es la
 * red por si algún día se llega aquí por otro camino interno.
 */

export const RUTA_VOZ = "/pos/voz"

/** Una recarga automática como mucho cada tanto: si algo raro impide que el documento nazca aquí, que no sea un bucle. */
export const RECARGA_MIN_MS = 30_000

/**
 * ¿Hay que recargar para que el micrófono pueda funcionar? Sí, si el documento
 * nació en otra ruta y la última recarga automática fue hace rato.
 * `nacioEn` es null cuando el navegador no dice dónde nació el documento; ahí no se adivina.
 */
export function hayQueRecargar(nacioEn: string | null, ultimaRecarga: number | null, ahora: number): boolean {
  if (!nacioEn || nacioEn === RUTA_VOZ) return false
  return ultimaRecarga == null || ahora - ultimaRecarga > RECARGA_MIN_MS
}

export interface FalloMicrofono {
  mensaje: string
  /** ¿Recargar puede arreglarlo? Entonces la pantalla ofrece el botón. */
  recargar: boolean
}

/**
 * Qué decirle a la persona según lo que respondió el navegador. Antes todo era
 * «no hay permiso», y era falso justo en el caso que pasó: nadie había dicho
 * que no, el navegador ni siquiera preguntó.
 */
export function falloDeMicrofono(nombre: string, politicaLoPermite: boolean | null): FalloMicrofono {
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    if (politicaLoPermite === false) {
      return { mensaje: "El navegador no dejó usar el micrófono en esta pantalla. Recarga la página para que te lo pregunte.", recargar: true }
    }
    return {
      mensaje:
        "El micrófono está bloqueado. Si el navegador no te preguntó, recarga la página; si dijiste que no, permítelo en los ajustes del navegador para cafecitopos.com.",
      recargar: true,
    }
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return { mensaje: "No se encontró un micrófono en este aparato.", recargar: false }
  }
  if (nombre === "NotReadableError" || nombre === "AbortError") {
    return { mensaje: "El micrófono lo está usando otra app. Ciérrala e intenta de nuevo.", recargar: true }
  }
  return { mensaje: "No se pudo abrir el micrófono. Recarga la página e intenta de nuevo.", recargar: true }
}
