/**
 * Versión del código que corre en este aparato, y qué hacer cuando el
 * servidor ya tiene otra.
 *
 * Cada deploy cambia el código, pero la pestaña del POS que quedó abierta
 * —el teléfono de la cafetería, la tablet en la barra— sigue con el anterior.
 * Next recarga solo cuando `router.refresh()` o una navegación traen otro
 * build, pero NO cuando lo trae una server action que revalida: ahí el
 * servidor manda el árbol de la página armado con los módulos del build nuevo
 * y la pestaña vieja truena con «Cannot read properties of undefined (reading
 * 'call')». Pasó tres veces en una semana (Gym Coffe y El Cafecito), siempre
 * la mañana siguiente a un deploy, con el POS abierto desde el día anterior.
 *
 * Dos defensas, en este orden:
 * 1. El sondeo de cuentas abiertas trae el sello del servidor; si difiere del
 *    de la pestaña, el POS se recarga solo en cuanto hay calma: carrito vacío
 *    y ningún diálogo abierto (`hayVersionNueva`).
 * 2. Si de todos modos truena, el límite de error reconoce el síntoma y
 *    recarga una vez, en lugar de mostrar «Algo salió mal» y esperar a que
 *    alguien toque «Recargar página» (`clasificarError`).
 *
 * El sello lo pone `next.config.mjs` (`NEXT_PUBLIC_BUILD_ID`): el commit en
 * Vercel, la hora del build en local. Queda incrustado en el código del
 * cliente y del servidor del MISMO build, así que solo difiere tras un deploy.
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"

export type TipoDeError = "version" | "red" | "otro"

const SINTOMAS_VERSION = [
  // Módulo del build nuevo que el runtime viejo no tiene.
  /reading 'call'/,
  // Un trozo de código que ya no existe con ese nombre en el servidor.
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i,
  // Server action con id de otro build (Next: «Failed to find Server Action…
  // This request might be from an older or newer deployment»).
  /was not found on the server|older or newer deployment|Failed to find Server Action/,
]

const SINTOMAS_RED = [/Failed to fetch/i, /Load failed/i, /NetworkError/i, /network request failed/i, /fetch failed/i]

/**
 * Qué clase de error es, por su mensaje. «version» se cura recargando;
 * «red» no es un error de la app (el aparato se quedó sin señal); «otro» sí
 * hay que reportarlo y mirarlo.
 */
export function clasificarError(mensaje: string | null | undefined): TipoDeError {
  const m = mensaje ?? ""
  if (SINTOMAS_VERSION.some((re) => re.test(m))) return "version"
  if (SINTOMAS_RED.some((re) => re.test(m))) return "red"
  return "otro"
}

/** Para lo que se atrapa con `catch`: ¿esta excepción es de versión vieja? */
export function esErrorDeVersion(e: unknown): boolean {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : ""
  return clasificarError(m) === "version"
}

/** El servidor contestó con otro sello: hay un deploy más nuevo que esta pestaña. */
export function hayVersionNueva(mia: string, servidor: string | null | undefined): boolean {
  if (!servidor) return false
  return servidor !== mia
}

/**
 * Ventana mínima entre recargas por versión. Una recarga trae el build nuevo
 * y se acabó; si por algo raro el desfase persistiera, esto impide el bucle.
 */
export const RECARGA_VENTANA_MS = 60_000

export function puedeRecargar(ultima: number | null, ahora: number, ventana = RECARGA_VENTANA_MS): boolean {
  if (ultima === null || !Number.isFinite(ultima)) return true
  // Reloj movido hacia atrás: mejor recargar que quedarse trabado.
  if (ultima > ahora) return true
  return ahora - ultima >= ventana
}

const CLAVE_RECARGA = "recarga-por-version"

/**
 * Anota que se va a recargar por versión, si no se hizo hace poco. Devuelve
 * si procede; recargar es cosa de quien llama (así puede avisar antes).
 */
export function marcarRecargaPorVersion(ventana = RECARGA_VENTANA_MS): boolean {
  if (typeof window === "undefined") return false
  let ultima: number | null = null
  try {
    const v = window.sessionStorage.getItem(CLAVE_RECARGA)
    ultima = v ? Number(v) : null
  } catch {
    ultima = null
  }
  if (!puedeRecargar(ultima, Date.now(), ventana)) return false
  try {
    window.sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()))
  } catch {
    // Sin sessionStorage no hay freno; una recarga sigue siendo lo correcto.
  }
  return true
}
