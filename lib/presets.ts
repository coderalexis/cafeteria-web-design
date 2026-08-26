import type { BusinessSettings } from "./settings"

/**
 * Cómo opera una cafetería. En vez de interrogar al dueño con una lista de
 * interruptores que todavía no entiende, se elige un modo al crearla y después
 * se afina en Negocio.
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
    hint: "Se pide y se paga en la barra. Sin pedidos en espera; el ticket sale solo al cobrar.",
    settings: { parkedOrders: false, autoPrint: "ticket", discountMaxCashier: 10 },
  },
  {
    key: "mesas",
    label: "Con mesas",
    hint: "El cliente se sienta y pide. Pedidos en espera encendido para guardar cuentas a medias.",
    settings: { parkedOrders: true, autoPrint: "ticket", discountMaxCashier: 10 },
  },
  {
    key: "barra",
    label: "Barra y caja separadas",
    hint: "Quien cobra no prepara. Se imprime ticket y comanda en cada venta.",
    settings: { parkedOrders: true, autoPrint: "both", discountMaxCashier: 10 },
  },
]

export function presetByKey(key: string | null | undefined): PresetDef | null {
  return PRESETS.find((p) => p.key === key) ?? null
}
