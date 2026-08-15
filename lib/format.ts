import { Banknote, CreditCard, Smartphone, type LucideIcon } from "lucide-react"

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

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-MX")
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

/* ------------------------------------------------------------------ */
/*  Métodos de pago                                                    */
/* ------------------------------------------------------------------ */

export type PaymentMethodKey = "efectivo" | "transferencia" | "tarjeta_clip"

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
}

export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS) as PaymentMethodKey[]

export function paymentLabel(method: string): string {
  return PAYMENT_METHODS[method as PaymentMethodKey]?.label ?? method
}
