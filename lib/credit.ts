/**
 * Fiados por persona (P38): la forma que usan la pantalla del POS y el panel.
 * Vive aquí, fuera de las server actions, porque un módulo «use server» solo
 * puede exportar funciones asíncronas y la página del POS necesita el mapeo.
 */

/** Una persona a la que se le fía, con su saldo. */
export interface CreditAccount {
  id: string
  name: string
  phone: string | null
  notes: string | null
  isActive: boolean
  /** Lo fiado (tickets vivos), lo abonado y la resta. */
  charged: number
  paid: number
  balance: number
  tickets: number
  lastChargeAt: string | null
  lastPaymentAt: string | null
}

/** Lo que devuelve el RPC `credit_balances`, tal cual. */
export interface CreditBalanceRow {
  id: string
  name: string
  phone: string | null
  notes: string | null
  is_active: boolean
  charged: number
  paid: number
  balance: number
  tickets: number
  last_charge_at: string | null
  last_payment_at: string | null
}

export function toCreditAccount(r: CreditBalanceRow): CreditAccount {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    notes: r.notes,
    isActive: r.is_active,
    charged: Number(r.charged),
    paid: Number(r.paid),
    balance: Number(r.balance),
    tickets: Number(r.tickets),
    lastChargeAt: r.last_charge_at,
    lastPaymentAt: r.last_payment_at,
  }
}

/** Filas del RPC (o nada) → cuentas. */
export function creditAccountsFrom(raw: unknown): CreditAccount[] {
  return Array.isArray(raw) ? (raw as CreditBalanceRow[]).map(toCreditAccount) : []
}
