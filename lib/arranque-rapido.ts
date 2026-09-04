/**
 * Arranque rápido del POS: la parte de la página.
 *
 * `public/sw-pos.js` sirve la última página guardada de /pos al instante
 * (marcada con <meta name="pos-desde-cache">) y, por detrás, pide la fresca.
 * La página pregunta al worker qué pasó con la red y aquí se decide qué hacer
 * con cada respuesta. Está aparte del componente para poder probarlo sin
 * navegador.
 */

/** Nombre del guardado de la página del POS; el mismo que usa el service worker. */
export const CACHE_SHELL = "pos-shell-v1"

/** Mensaje con el que la página pregunta al worker por el resultado de la red. */
export const PREGUNTA_ESTADO = { tipo: "¿estado?" } as const

/** Mensaje con el que la página pide al worker que guarde /pos si aún no lo tiene. */
export const PIDE_PRECARGA = { tipo: "precargar" } as const

export type MensajeDelSW =
  /** La fresca sigue en camino. */
  | { tipo: "pendiente" }
  /** Llegó la fresca y quedó guardada. */
  | { tipo: "fresco"; cambioDeBuild: boolean; cambioDeIdentidad: boolean }
  /** No hubo red (o el servidor falló): se sigue con lo guardado. */
  | { tipo: "sin-red" }
  /** El servidor ya no da el POS (sesión vencida, negocio suspendido…). */
  | { tipo: "redirigido" }
  /** El worker no sabe de esta página (se reinició en medio). */
  | { tipo: "desconocido" }

export type Accion =
  /** Seguir mostrando que se está actualizando. */
  | { tipo: "esperar" }
  /** Pedir los datos frescos sin recargar (router.refresh). */
  | { tipo: "refrescar" }
  /** Recargar la página completa. */
  | { tipo: "recargar" }
  | { tipo: "nada" }

function esMensaje(m: unknown): m is MensajeDelSW {
  return typeof m === "object" && m !== null && typeof (m as { tipo?: unknown }).tipo === "string"
}

/**
 * Qué hace la página con cada respuesta del service worker.
 *
 * - Pendiente → esperar (una línea discreta arriba).
 * - Fresca del mismo build y la misma persona → refrescar: el menú, la caja
 *   y las ventas del día se ponen al día sin perder el carrito.
 * - Cambió el código (deploy) o cambió quién está dentro → recargar: el
 *   guardado ya tiene la página nueva, así que la recarga también es al
 *   instante. Refrescar con otro build haría que Next recargara de todos
 *   modos, pero a ciegas.
 * - Redirigido → recargar: el guardado se borró y la recarga sigue la
 *   redirección real (al login, al aviso de suspendido…).
 * - Desconocido → refrescar: la página sabe que lo que ve es lo guardado;
 *   ante la duda, se pone al día.
 * - Sin red → nada: la cola de ventas ya avisa por su cuenta.
 */
export function decidirMensaje(m: unknown): Accion {
  if (!esMensaje(m)) return { tipo: "nada" }
  switch (m.tipo) {
    case "pendiente":
      return { tipo: "esperar" }
    case "fresco":
      return m.cambioDeBuild || m.cambioDeIdentidad ? { tipo: "recargar" } : { tipo: "refrescar" }
    case "redirigido":
      return { tipo: "recargar" }
    case "desconocido":
      return { tipo: "refrescar" }
    case "sin-red":
      return { tipo: "nada" }
    default:
      return { tipo: "nada" }
  }
}

/** Ventana y tope del freno a los refrescos: más de 3 en 30 s es un bucle. */
export const FRENO_VENTANA_MS = 30_000
export const FRENO_MAXIMO = 3

/**
 * Freno contra el bucle de recargas.
 *
 * Si `router.refresh()` no logra traer los datos (red a medias: el worker sí
 * alcanzó a pedir la página pero la petición de datos falla), Next recarga la
 * página entera; esa recarga vuelve a salir del guardado, vuelve a refrescar,
 * vuelve a fallar… Con tres intentos en medio minuto se deja de refrescar y
 * la página se queda con lo guardado, que es lo que tocaba sin red.
 *
 * Devuelve los intentos que siguen contando (para guardarlos) y si se puede.
 */
export function frenoRefresco(intentos: number[], ahora: number): { intentos: number[]; puede: boolean } {
  const vivos = intentos.filter((t) => ahora - t < FRENO_VENTANA_MS && t <= ahora)
  return { intentos: vivos, puede: vivos.length < FRENO_MAXIMO }
}

/**
 * Borra la página guardada del POS. Se llama al pasar por /login: quien entra
 * después puede ser otra persona u otro café, y la primera pantalla que vea
 * debe ser la suya, no la de quien salió.
 */
export async function borrarCacheDelPos(): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    await caches.delete(CACHE_SHELL)
  } catch {
    // Sin Cache Storage (navegador viejo, modo privado): no había nada que borrar.
  }
}
