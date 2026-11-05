/**
 * La hora del servidor para la cola sin internet.
 *
 * Una venta capturada sin señal guarda la hora DEL TELÉFONO, y al subir
 * `create_ticket` la pone como hora de la venta con tres candados: nada más
 * de 2 minutos en el futuro, nada de hace más de 24 horas y nada anterior a
 * la apertura de la caja. Con el reloj del teléfono mal puesto eso fallaba
 * sin remedio:
 *   · adelantado → «La hora de captura está en el futuro», la venta se iba a
 *     «revisar» y «Reintentar» mandaba la MISMA hora: no subía nunca;
 *   · atrasado → «se capturó en un turno anterior», o la venta caía en otra
 *     hora del reporte.
 *
 * Arreglo: el POS mide cuánto se desvía su reloj del del servidor
 * (`/pos/datos/hora`) y cada venta encolada guarda la desviación conocida al
 * cobrarse. Al subir, la hora se traduce al reloj del servidor y nunca pasa
 * del «ahora» del servidor. Si el teléfono cambia de hora entre cobrar y
 * subir (al volver la red se sincroniza solo), manda la desviación que había
 * AL COBRAR, que es la que corresponde a esa lectura del reloj.
 */

/** Una medición vale si el viaje fue corto: con 10 s de ida y vuelta, el error ya es de ±5 s. */
export const VIAJE_MAXIMO_MS = 10_000

/** Desde aquí ya se avisa en el correo de la mañana (es el candado del servidor). */
export const DESFASE_PARA_AVISAR_MS = 2 * 60_000

export const CLAVE_DESFASE = "pos-desfase-reloj"

/**
 * Desviación = hora del servidor − hora del teléfono, tomando el punto medio
 * del viaje (el servidor contestó en algún momento entre que salió la
 * petición y llegó la respuesta). `precisionMs` es lo que el servidor redondea:
 * 0 si mandó milisegundos, 1000 si solo hay el encabezado `Date` (segundos
 * truncados; se le suma medio segundo para centrarlo).
 */
export function medirDesfase(
  servidorMs: number | null,
  enviadaEn: number,
  recibidaEn: number,
  precisionMs = 0,
): number | null {
  if (servidorMs === null || !Number.isFinite(servidorMs)) return null
  const viaje = recibidaEn - enviadaEn
  if (viaje < 0 || viaje > VIAJE_MAXIMO_MS) return null
  return Math.round(servidorMs + precisionMs / 2 - (enviadaEn + viaje / 2))
}

/**
 * La hora que se manda al servidor para una venta de la cola.
 *
 * Se usa la desviación medida AL COBRAR; si no la había (el POS nunca alcanzó
 * a medir), la de ahora. Y nunca después del «ahora» del servidor: aunque la
 * medición fallara, una venta no puede venir del futuro.
 */
export function horaParaElServidor(
  capturadaEn: number,
  desfaseAlCobrar: number | null | undefined,
  desfaseAhora: number | null | undefined,
  ahoraTelefono: number,
): number {
  const alCobrar = desfaseAlCobrar ?? desfaseAhora ?? 0
  const ahora = desfaseAhora ?? desfaseAlCobrar ?? 0
  const corregida = capturadaEn + alCobrar
  const ahoraServidor = ahoraTelefono + ahora
  return Math.min(corregida, ahoraServidor - 1000)
}

/* ── En el navegador ─────────────────────────────────────────────────── */

/** La última desviación medida en este aparato, o null. */
export function desfaseGuardado(): number | null {
  try {
    const raw = window.localStorage.getItem(CLAVE_DESFASE)
    const v = raw ? Number(JSON.parse(raw)?.desfase) : NaN
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Pregunta la hora al servidor y guarda la desviación. null si no se pudo
 * (sin señal, viaje demasiado largo): quien llama sigue con la guardada.
 */
export async function medirHoraDelServidor(): Promise<number | null> {
  try {
    const enviadaEn = Date.now()
    const r = await fetch("/pos/datos/hora", { cache: "no-store" })
    const recibidaEn = Date.now()
    let servidor: number | null = null
    let precision = 0
    if (r.ok) {
      const cuerpo = (await r.json().catch(() => null)) as { ahora?: unknown } | null
      if (typeof cuerpo?.ahora === "number") servidor = cuerpo.ahora
    }
    if (servidor === null) {
      // Sin cuerpo (sesión vencida, una redirección): el encabezado Date también es del servidor.
      const fecha = Date.parse(r.headers.get("date") ?? "")
      if (Number.isFinite(fecha)) {
        servidor = fecha
        precision = 1000
      }
    }
    const desfase = medirDesfase(servidor, enviadaEn, recibidaEn, precision)
    if (desfase !== null) {
      try {
        window.localStorage.setItem(CLAVE_DESFASE, JSON.stringify({ desfase, medidoEn: recibidaEn }))
      } catch {
        /* sin espacio: se usa solo en memoria esta vez */
      }
    }
    return desfase
  } catch {
    return null
  }
}
