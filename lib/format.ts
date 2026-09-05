import { Banknote, CreditCard, HandCoins, Smartphone, type LucideIcon } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Moneda y fechas (una sola definición para POS, admin y recibos)    */
/* ------------------------------------------------------------------ */

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

/**
 * Fecha/hora en es-MX. Con `timeZone` (IANA del negocio) el resultado no
 * depende de la zona del navegador ni del servidor; sin él, usa la local.
 */
export function formatDate(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleDateString("es-MX", timeZone ? { timeZone } : undefined)
}

export function formatTime(date: Date | string, timeZone?: string): string {
  return new Date(date).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  })
}

export function formatDateTime(date: Date | string, timeZone?: string): string {
  return `${formatDate(date, timeZone)} ${formatTime(date, timeZone)}`
}

/* ------------------------------------------------------------------ */
/*  Métodos de pago                                                    */
/* ------------------------------------------------------------------ */

export type PaymentMethodKey = "efectivo" | "transferencia" | "tarjeta_clip" | "fiado"

export interface PaymentMethodInfo {
  key: PaymentMethodKey
  label: string
  /** Etiqueta corta para botones angostos. */
  shortLabel: string
  icon: LucideIcon
  /** Clase de color del icono (verde/violeta/azul, como en el POS). */
  iconColor: string
}

export const PAYMENT_METHODS: Record<PaymentMethodKey, PaymentMethodInfo> = {
  efectivo: {
    key: "efectivo",
    label: "Efectivo",
    shortLabel: "Efectivo",
    icon: Banknote,
    iconColor: "text-green-600",
  },
  transferencia: {
    key: "transferencia",
    label: "Transferencia",
    shortLabel: "Transfer",
    icon: Smartphone,
    iconColor: "text-violet-600",
  },
  tarjeta_clip: {
    key: "tarjeta_clip",
    label: "Tarjeta",
    shortLabel: "Tarjeta",
    icon: CreditCard,
    iconColor: "text-blue-600",
  },
  // Venta hecha cuyo dinero entra después, a nombre de alguien (P38). Solo
  // aparece en el POS con el módulo de fiados encendido.
  fiado: {
    key: "fiado",
    label: "Fiado",
    shortLabel: "Fiado",
    icon: HandCoins,
    iconColor: "text-rose-600",
  },
}

export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS) as PaymentMethodKey[]

export function paymentLabel(method: string): string {
  return PAYMENT_METHODS[method as PaymentMethodKey]?.label ?? method
}
