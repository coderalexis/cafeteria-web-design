/**
 * Contar la caja billete por billete.
 *
 * El corte pedía «efectivo contado» como un solo número, y la suma la hacía
 * el cajero en la cabeza o en un papel: ahí nacen los faltantes que nadie
 * sabe explicar. Aquí vive lo puro del conteo: las denominaciones que corren
 * en una caja mexicana, la suma, el detalle que se guarda con el corte, la
 * diferencia dicha en palabras y cuánto se lleva uno después de dejar el
 * fondo. Sin React ni red, para probarlo solo.
 */
import { formatCurrency } from "@/lib/format"

export interface Denominacion {
  /** Clave estable para el estado del conteo («b500», «m10»). */
  key: string
  valor: number
  tipo: "billete" | "moneda"
}

/** Lo que corre en una caja mexicana. El $20 existe como billete y como moneda. */
export const DENOMINACIONES: Denominacion[] = [
  { key: "b1000", valor: 1000, tipo: "billete" },
  { key: "b500", valor: 500, tipo: "billete" },
  { key: "b200", valor: 200, tipo: "billete" },
  { key: "b100", valor: 100, tipo: "billete" },
  { key: "b50", valor: 50, tipo: "billete" },
  { key: "b20", valor: 20, tipo: "billete" },
  { key: "m20", valor: 20, tipo: "moneda" },
  { key: "m10", valor: 10, tipo: "moneda" },
  { key: "m5", valor: 5, tipo: "moneda" },
  { key: "m2", valor: 2, tipo: "moneda" },
  { key: "m1", valor: 1, tipo: "moneda" },
  { key: "m050", valor: 0.5, tipo: "moneda" },
]

/** Cuántos hay de cada denominación, por su clave. Lo que no está, es cero. */
export type Conteo = Record<string, number>

export const conteoVacio = (): Conteo => ({})

const redondear = (n: number) => Math.round(n * 100) / 100

export function totalConteo(c: Conteo): number {
  return redondear(DENOMINACIONES.reduce((suma, d) => suma + (c[d.key] ?? 0) * d.valor, 0))
}

/** ¿Ya contó algo? Un conteo en ceros no es «hay $0»: es que todavía no cuenta. */
export function hayConteo(c: Conteo): boolean {
  return DENOMINACIONES.some((d) => (c[d.key] ?? 0) > 0)
}

/**
 * El detalle que se guarda con el corte: una fila por valor, de mayor a menor,
 * solo lo que hay. El $20 en billete y en moneda se suman: al revisar una
 * diferencia importa cuánto había de $20, no en qué forma.
 */
export function detalleConteo(c: Conteo): Array<{ value: number; qty: number }> {
  const porValor = new Map<number, number>()
  for (const d of DENOMINACIONES) {
    const qty = c[d.key] ?? 0
    if (qty > 0) porValor.set(d.valor, (porValor.get(d.valor) ?? 0) + qty)
  }
  return [...porValor.entries()].sort((a, b) => b[0] - a[0]).map(([value, qty]) => ({ value, qty }))
}

export interface ExplicacionDiferencia {
  tono: "ok" | "sobra" | "falta"
  titulo: string
  texto: string
}

/** La diferencia en palabras, con qué revisar antes de cerrar. */
export function explicarDiferencia(esperado: number, contado: number): ExplicacionDiferencia {
  const d = redondear(contado - esperado)
  if (d === 0) {
    return { tono: "ok", titulo: "Cuadra exacto", texto: "Lo que hay es lo que debía haber. Cierra tranquilo." }
  }
  if (d < 0) {
    return {
      tono: "falta",
      titulo: `Faltan ${formatCurrency(-d)}`,
      texto:
        "Antes de cerrar, revisa: ¿todas las salidas de efectivo (compras, cambio prestado) quedaron registradas arriba? Si registras una ahora, el esperado se ajusta solo. Si no encuentras la razón, anótala y cierra: la diferencia queda guardada.",
    }
  }
  return {
    tono: "sobra",
    titulo: `Sobran ${formatCurrency(d)}`,
    texto:
      "Suele ser una venta en efectivo que se cobró como tarjeta, o una entrada de efectivo sin registrar. Si la encuentras, regístrala arriba; si no, anótala y cierra.",
  }
}

/** El fondo que se deja sale de lo contado: ni negativo ni más de lo que hay. */
export function validarFondo(fondo: number | null, contado: number): string | null {
  if (fondo === null) return null
  if (fondo < 0) return "El fondo no puede ser negativo."
  if (fondo > contado) return `No puedes dejar más de lo que hay (${formatCurrency(contado)}).`
  return null
}

/** Lo que uno se lleva: lo contado menos lo que deja de fondo. */
export function retiro(contado: number, fondo: number | null): number | null {
  return fondo === null ? null : redondear(contado - fondo)
}
