import type { BusinessSettings } from "./settings"

/**
 * Cómo opera una cafetería. En vez de interrogar al dueño con una lista de
 * interruptores que todavía no entiende, se elige un modo al crearla y después
 * se afina en Negocio.
 *
 * NINGÚN modo apaga capacidades. El de mostrador apagaba las cuentas abiertas
 * «para no cargar con controles que no usa», y salió caro: quien elige el modo
 * es el operador al DAR DE ALTA el café —antes de que abra y sepa cómo va a
 * trabajar—, así que apagarlo ahí no era la decisión de la cafetería sino una
 * tomada por ella, y el dueño nunca se enteraba de que la función existía.
 * Todo nace encendido y el café apaga lo que no quiera, en Datos y ajustes.
 * Los modos solo deciden cosas sin capacidad de por medio (qué se imprime).
 */

export type PresetKey = "mostrador" | "mesas" | "barra"

export interface PresetDef {
  key: PresetKey
  label: string
  hint: string
  /** Solo lo que este modo decide; el resto queda en su valor por omisión. */
  settings: Partial<BusinessSettings>
}

export const PRESETS: PresetDef[] = [
  {
    key: "mostrador",
    label: "Mostrador rápido",
    hint: "Se pide y se paga en la barra. El ticket sale solo al cobrar.",
    settings: { autoPrint: "ticket", discountMaxCashier: 10 },
  },
  {
    key: "mesas",
    label: "Con mesas",
    hint: "El cliente se sienta y pide: se le suma cada ronda a su cuenta y se cobra al final.",
    settings: { autoPrint: "ticket", discountMaxCashier: 10 },
  },
  {
    key: "barra",
    label: "Barra y caja separadas",
    hint: "Quien cobra no prepara. Se imprime ticket y comanda en cada venta.",
    settings: { autoPrint: "both", discountMaxCashier: 10 },
  },
]

export function presetByKey(key: string | null | undefined): PresetDef | null {
  return PRESETS.find((p) => p.key === key) ?? null
}
