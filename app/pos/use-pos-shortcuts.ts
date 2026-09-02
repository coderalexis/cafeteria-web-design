"use client"

import { useEffect, type RefObject } from "react"
import { toast } from "sonner"
import { isTypingTarget } from "./pos-utils"
import type { CartLine, PaymentMethod, Product, SizeOption } from "./cart"
import type { OpenSession } from "./cash-session-dialog"

export interface PosShortcutsOptions {
  /** Con un diálogo abierto los atajos se apagan: el teclado es del diálogo. */
  anyDialogOpen: boolean
  canCharge: boolean
  finalizeSale: () => void | Promise<void>
  openSession: OpenSession | null
  focusCash: () => void
  sizePickerFor: string | null
  setSizePickerFor: (id: string | null) => void
  products: Product[]
  /** Lo que se ve en la rejilla (Enter en el buscador elige el primero). */
  filtered: Product[]
  chooseProduct: (product: Product, size?: SizeOption) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  setSearchQuery: (q: string) => void
  lines: CartLine[]
  loyaltyRedeem: boolean
  setPaymentMethod: (m: PaymentMethod) => void
  setShowTickets: (open: boolean) => void
  setShowCashDialog: (open: boolean) => void
  setShowDiscount: (open: boolean) => void
  setShowShortcuts: (open: boolean) => void
  setConfirmClear: (open: boolean) => void
}

/* ── Atajos de teclado ─────────────────────────────────────────── */
export function usePosShortcuts(o: PosShortcutsOptions) {
  const {
    anyDialogOpen, canCharge, finalizeSale, openSession, focusCash,
    sizePickerFor, setSizePickerFor, products, filtered, chooseProduct,
    searchInputRef, setSearchQuery, lines, loyaltyRedeem, setPaymentMethod,
    setShowTickets, setShowCashDialog, setShowDiscount, setShowShortcuts, setConfirmClear,
  } = o
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (anyDialogOpen) return
      const typing = isTypingTarget(e.target)
      const inSearch = e.target === searchInputRef.current

      // Globales (funcionan aunque estés escribiendo)
      if (e.key === "F2") {
        e.preventDefault()
        if (canCharge) finalizeSale()
        else if (!openSession) setShowCashDialog(true)
        return
      }
      if (e.key === "F4") {
        e.preventDefault()
        focusCash()
        return
      }

      // Selector de tamaños abierto: 1-9 eligen tamaño, Esc cierra
      if (sizePickerFor) {
        const product = products.find((p) => p.id === sizePickerFor)
        if (product?.sizes && /^[1-9]$/.test(e.key)) {
          const size = product.sizes[Number(e.key) - 1]
          if (size) {
            e.preventDefault()
            chooseProduct(product, size)
          }
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          setSizePickerFor(null)
          return
        }
      }

      if (inSearch) {
        if (e.key === "Enter") {
          e.preventDefault()
          const first = filtered[0]
          if (!first) return
          if (first.sizes && first.sizes.length > 0) setSizePickerFor(first.id)
          else chooseProduct(first)
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          setSearchQuery("")
          searchInputRef.current?.blur()
          return
        }
        return
      }

      if (typing) {
        if (e.key === "Escape") (e.target as HTMLElement).blur()
        return
      }

      // Fuera de campos de texto
      if (e.key === "/") {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }
      if (e.key === "?") {
        e.preventDefault()
        setShowShortcuts(true)
        return
      }
      if (e.ctrlKey && e.key === "Backspace") {
        e.preventDefault()
        if (lines.length > 0) setConfirmClear(true)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case "1":
          setPaymentMethod("efectivo")
          break
        case "2":
          setPaymentMethod("transferencia")
          break
        case "3":
          setPaymentMethod("tarjeta_clip")
          break
        case "t":
        case "T":
          setShowTickets(true)
          break
        case "k":
        case "K":
          setShowCashDialog(true)
          break
        case "d":
        case "D":
          if (lines.length > 0) {
            if (loyaltyRedeem) toast.info("Quita el canje del premio para cambiar el descuento.")
            else setShowDiscount(true)
          }
          break
        default:
          return
      }
      e.preventDefault()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    anyDialogOpen,
    canCharge,
    loyaltyRedeem,
    finalizeSale,
    openSession,
    focusCash,
    sizePickerFor,
    products,
    chooseProduct,
    filtered,
    lines.length,
    setPaymentMethod,
    // Estables (vienen de useState/useRef), pero como props el linter no lo sabe.
    setSizePickerFor,
    searchInputRef,
    setSearchQuery,
    setShowTickets,
    setShowCashDialog,
    setShowDiscount,
    setShowShortcuts,
    setConfirmClear,
  ])
}
