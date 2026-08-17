"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  addUnit,
  rehydrateCart,
  serializeCart,
  type CartLine,
  type ModifierOption,
  type PaymentMethod,
  type Product,
  type SizeOption,
  type TicketDiscount,
} from "./cart"

const NEW_LINE_FLASH_MS = 350

/**
 * Estado del carrito del POS con persistencia en localStorage (por cajero),
 * para que una recarga o un cierre accidental de la pestaña no pierda la
 * venta en curso. Todo cambio de líneas renueva `saleRef` (idempotencia).
 */
export function usePosCart(storageKey: string, products: Product[]) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo")
  const [ticketNotes, setTicketNotes] = useState("")
  const [cashReceivedInput, setCashReceivedInput] = useState("")
  const [discount, setDiscount] = useState<TicketDiscount | null>(null)
  const [saleRef, setSaleRef] = useState<string>("")
  const [hydrated, setHydrated] = useState(false)
  const [restoredCount, setRestoredCount] = useState(0)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Rehidratar al montar ─────────────────────────────────────── */
  useEffect(() => {
    let restored = 0
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const state = rehydrateCart(JSON.parse(raw), products, Date.now())
        if (state) {
          setLines(state.lines)
          setPaymentMethod(state.paymentMethod)
          setTicketNotes(state.ticketNotes)
          setCashReceivedInput(state.cashReceivedInput)
          setDiscount(state.discount)
          setSaleRef(state.saleRef || crypto.randomUUID())
          restored = state.lines.length
        }
      }
    } catch {
      // Dato corrupto: se ignora y se empieza limpio.
    }
    setSaleRef((prev) => prev || crypto.randomUUID())
    setRestoredCount(restored)
    setHydrated(true)
    // Solo al montar; el menú (products) llega ya resuelto desde el servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  /* ── Guardar en cada cambio ───────────────────────────────────── */
  useEffect(() => {
    if (!hydrated) return
    try {
      if (lines.length === 0 && !ticketNotes && !cashReceivedInput && !discount) {
        window.localStorage.removeItem(storageKey)
      } else {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(
            serializeCart({ saleRef, paymentMethod, ticketNotes, cashReceivedInput, discount, lines }, Date.now()),
          ),
        )
      }
    } catch {
      // localStorage lleno o bloqueado: la venta sigue funcionando sin persistir.
    }
  }, [hydrated, storageKey, lines, paymentMethod, ticketNotes, cashReceivedInput, discount, saleRef])

  /* ── Mutaciones (renuevan saleRef) ────────────────────────────── */
  const touch = useCallback(() => setSaleRef(crypto.randomUUID()), [])

  const addLine = useCallback(
    (product: Product, size?: SizeOption, modifiers: ModifierOption[] = []) => {
      touch()
      setLines((prev) => addUnit(prev, product, size, modifiers, () => crypto.randomUUID()))
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => {
        setLines((prev) => (prev.some((l) => l.isNew) ? prev.map((l) => ({ ...l, isNew: false })) : prev))
      }, NEW_LINE_FLASH_MS)
    },
    [touch],
  )

  const removeLine = useCallback(
    (lineId: string) => {
      touch()
      setLines((prev) => prev.filter((l) => l.lineId !== lineId))
    },
    [touch],
  )

  const updateQuantity = useCallback(
    (lineId: string, delta: number) => {
      touch()
      setLines((prev) =>
        prev
          .map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(99, l.quantity + delta) } : l))
          .filter((l) => l.quantity > 0),
      )
    },
    [touch],
  )

  const setLineNotes = useCallback(
    (lineId: string, notes: string) => {
      touch()
      setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, notes: notes.slice(0, 200) } : l)))
    },
    [touch],
  )

  const clearCart = useCallback(() => {
    touch()
    setLines([])
    setTicketNotes("")
    setCashReceivedInput("")
    setDiscount(null)
  }, [touch])

  /** Tras una venta exitosa: limpia todo y prepara la siguiente referencia. */
  const resetAfterSale = useCallback(() => {
    setLines([])
    setTicketNotes("")
    setCashReceivedInput("")
    setDiscount(null)
    setSaleRef(crypto.randomUUID())
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* ignorar */
    }
  }, [storageKey])

  return {
    hydrated,
    restoredCount,
    lines,
    paymentMethod,
    setPaymentMethod,
    ticketNotes,
    setTicketNotes,
    cashReceivedInput,
    setCashReceivedInput,
    discount,
    setDiscount,
    saleRef,
    addLine,
    removeLine,
    updateQuantity,
    setLineNotes,
    clearCart,
    resetAfterSale,
  }
}
