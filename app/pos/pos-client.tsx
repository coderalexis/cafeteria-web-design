"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { formatCurrency, formatTime, paymentLabel, PAYMENT_METHODS, PAYMENT_METHOD_KEYS } from "@/lib/format"
import {
  buildKitchenLines,
  buildShareText,
  buildTicketLines,
  printLines,
  receiptBusinessFrom,
  type ReceiptData,
} from "@/lib/receipt"
import { motion, AnimatePresence } from "framer-motion"
import {
  Trash2,
  Coffee,
  ShoppingBag,
  Minus,
  Plus,
  Settings,
  Printer,
  CheckCircle2,
  Search,
  X,
  Receipt,
  Lock,
  Unlock,
  Percent,
  SlidersHorizontal,
  StickyNote,
  ChefHat,
  Keyboard,
  MoreVertical,
  LogOut,
  BookOpen,
  ChevronUp,
  UserCircle,
  Star,
  Share2,
  HandCoins,
  Copy,
  RotateCcw,
  Pencil,
} from "lucide-react"
import { useAppContext, useBusiness } from "@/components/business-provider"
import { BusinessSwitcher } from "@/components/business-switcher"
import { OfflineBanner, PosLockScreen, POS_LOCK_EVENT } from "./lock-screen"
import { DEFAULT_CHIP, DEFAULT_CHIP_ACTIVE, colorClasses } from "@/lib/category-colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/kbd"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { logout } from "@/app/actions/auth"
import { createTicket } from "@/app/actions/sales"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CashSessionDialog, type OpenSession } from "./cash-session-dialog"
import { TicketHistoryDialog } from "./ticket-history-dialog"
import { ModifierSheet } from "./modifier-sheet"
import { DiscountDialog } from "./discount-dialog"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { usePosCart } from "./use-pos-cart"
import {
  cartItemCount,
  cartSubtotal,
  computeDiscount,
  findVariant,
  rehydrateCart,
  serializeCart,
  getDisplayPrice,
  getLineLabel,
  getLinePrice,
  getLineVariantId,
  parseCash,
  type CartLine,
  type Category,
  type PaymentMethod,
  type Product,
  type SizeOption,
} from "./cart"

// Re-export de tipos para los componentes hermanos (modifier-sheet, discount-dialog)
export type { ModifierGroup, ModifierOption, Product, SizeOption, TicketDiscount } from "./cart"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface CompletedSale {
  ticketId: string
  folio: number
  lines: CartLine[]
  subtotal: number
  discountTotal: number
  discountReason: string | null
  total: number
  /** Propina cobrada encima del total (no cuenta como venta). */
  tip: number
  paymentMethod: PaymentMethod
  date: Date
  notes?: string
  cashReceived: number | null
  changeDue: number | null
}

interface POSClientProps {
  categories: Category[]
  products: Product[]
  isAdmin: boolean
  businessId: string
  cashierId: string
  /** Minutos de inactividad para bloquear el POS (0 = desactivado). */
  lockMinutes: number
  /** ¿El usuario ya tiene PIN de caja en este negocio? */
  hasPin: boolean
  /** Variantes más vendidas del último mes (fila de favoritos). */
  favoriteVariantIds: string[]
  /** Qué imprimir en automático al cobrar (ajuste del negocio). */
  autoPrint: "none" | "ticket" | "comanda" | "both"
  initialTotalSales: number
  openSession: OpenSession | null
}

const CASH_QUICK_AMOUNTS = [50, 100, 200, 500]

/**
 * Billetes probables para ESTE total (una cuenta de $87 se paga con $90, $100
 * o $200 — no con $50). Redondeos típicos hacia arriba, sin repetidos.
 */
function cashSuggestions(due: number): number[] {
  if (due <= 0) return CASH_QUICK_AMOUNTS.slice(0, 3)
  const up = (m: number) => Math.ceil(due / m) * m
  const out: number[] = []
  for (const c of [up(10), up(20), up(50), up(100), up(200), up(500)]) {
    if (c > due && !out.includes(c)) out.push(c)
    if (out.length === 3) break
  }
  return out
}

/** Vibración corta si el aparato puede: confirma el toque sin mirar. */
function vibra(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* sin soporte */
  }
}

/** Notas rápidas de un toque; el texto libre sigue disponible. */
const QUICK_NOTES = ["Para llevar", "Aquí"]

/** Opciones de propina: porcentaje del total, "sin propina" o monto libre. */
type TipChoice = number | "otro"
const TIP_OPTIONS: TipChoice[] = [0, 5, 10, 15, "otro"]

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
}

/* ------------------------------------------------------------------ */
/*  Receipt / Ticket View                                              */
/* ------------------------------------------------------------------ */
function saleToReceipt(sale: CompletedSale): ReceiptData {
  return {
    folio: sale.folio,
    date: sale.date,
    paymentMethod: sale.paymentMethod,
    notes: sale.notes,
    items: sale.lines.map((line) => ({
      label: getLineLabel(line),
      quantity: line.quantity,
      unitPrice: getLinePrice(line),
      lineTotal: getLinePrice(line) * line.quantity,
      notes: line.notes || undefined,
      modifiers: line.modifiers.map((m) => ({ name: m.name, price: m.priceDelta })),
    })),
    subtotal: sale.subtotal,
    discountTotal: sale.discountTotal,
    discountReason: sale.discountReason,
    total: sale.total,
    tip: sale.tip,
    cashReceived: sale.cashReceived,
    changeDue: sale.changeDue,
  }
}

function ReceiptView({
  sale,
  autoPrint,
  onClose,
}: {
  sale: CompletedSale
  autoPrint: "none" | "ticket" | "comanda" | "both"
  onClose: () => void
}) {
  const paymentInfo = PAYMENT_METHODS[sale.paymentMethod]
  const PaymentIcon = paymentInfo.icon
  const business = useBusiness()
  const receiptBiz = receiptBusinessFrom(business)

  const handlePrint = () => {
    if (!printLines(buildTicketLines(saleToReceipt(sale), receiptBiz), `Ticket ${sale.folio}`)) {
      toast.error("El navegador bloqueó la ventana de impresión. Puedes reimprimir desde «Tickets».")
    }
  }

  const handleKitchen = () => {
    if (!printLines(buildKitchenLines(saleToReceipt(sale), receiptBiz), `Comanda ${sale.folio}`)) {
      toast.error("El navegador bloqueó la ventana de impresión.")
    }
  }

  const [printedAuto, setPrintedAuto] = useState(false)
  useEffect(() => {
    if (autoPrint === "none") return
    const r = saleToReceipt(sale)
    const lineas =
      autoPrint === "ticket"
        ? buildTicketLines(r, receiptBiz)
        : autoPrint === "comanda"
        ? buildKitchenLines(r, receiptBiz)
        : [...buildTicketLines(r, receiptBiz), "", "", "- - - - - ✂ - - - - -", "", ...buildKitchenLines(r, receiptBiz)]
    if (printLines(lineas, `Venta ${sale.folio}`)) {
      setPrintedAuto(true)
    } else {
      toast.error("El navegador bloqueó la impresión automática; usa los botones.")
    }
    // Solo al montar: una venta = una impresión automática.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Manda el ticket por WhatsApp (o lo copia si el navegador no puede compartir). */
  const handleShare = async () => {
    const text = buildShareText(saleToReceipt(sale), receiptBiz)
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `Ticket #${sale.folio}`, text })
        return
      }
    } catch (err) {
      // El usuario cerró el diálogo: no es un error que valga la pena reportar.
      if (err instanceof DOMException && err.name === "AbortError") return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Ticket copiado: pégalo en WhatsApp.")
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Success header */}
      <div className="flex flex-col items-center gap-2 mb-5">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-green-700">¡Venta registrada!</h3>
        <p className="text-sm text-stone-500">Folio #{sale.folio}</p>
      </div>

      {/* Ticket preview */}
      <div className="w-full bg-stone-50 rounded-xl border border-stone-200 p-4 space-y-3">
        <div className="flex justify-between text-sm text-stone-500">
          <span>{sale.date.toLocaleDateString("es-MX")}</span>
          <span>{formatTime(sale.date)}</span>
        </div>

        {sale.notes && (
          <p className="text-xs text-stone-500 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            📝 {sale.notes}
          </p>
        )}

        <Separator />

        {/* Items */}
        <div className="space-y-2">
          {sale.lines.map((line) => {
            const price = getLinePrice(line)
            return (
              <div key={line.lineId} className="text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-stone-700 font-medium">{line.quantity}x </span>
                    <span className="text-stone-700">{getLineLabel(line)}</span>
                  </div>
                  <span className="font-semibold text-stone-800 ml-3">
                    {formatCurrency(price * line.quantity)}
                  </span>
                </div>
                {line.modifiers.length > 0 && (
                  <p className="text-xs text-stone-400 pl-6">
                    {line.modifiers.map((m) => `+ ${m.name}`).join(", ")}
                  </p>
                )}
                {line.notes && <p className="text-xs text-amber-700 pl-6 italic">{line.notes}</p>}
              </div>
            )
          })}
        </div>

        <Separator />

        {/* Subtotal / descuento */}
        {sale.discountTotal > 0 && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between text-amber-700">
              <span>Descuento{sale.discountReason ? ` · ${sale.discountReason}` : ""}</span>
              <span>-{formatCurrency(sale.discountTotal)}</span>
            </div>
          </div>
        )}

        {/* Total & payment */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PaymentIcon className={`h-4 w-4 ${paymentInfo.iconColor}`} />
            <span className="text-sm text-stone-500">{paymentInfo.label}</span>
          </div>
          <span className="text-xl font-bold text-stone-800">{formatCurrency(sale.total)}</span>
        </div>

        {/* Propina (se cobró aparte de la venta) */}
        {sale.tip > 0 && (
          <div className="flex justify-between items-center text-sm border-t border-stone-100 pt-2">
            <span className="text-stone-500">Propina</span>
            <span className="text-emerald-700 font-semibold">+{formatCurrency(sale.tip)}</span>
          </div>
        )}
        {sale.tip > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-stone-500">Cobrado</span>
            <span className="text-lg font-bold text-stone-800">{formatCurrency(sale.total + sale.tip)}</span>
          </div>
        )}

        {/* Cambio (solo efectivo con monto recibido) */}
        {sale.paymentMethod === "efectivo" && sale.cashReceived != null && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-green-700">Recibido {formatCurrency(sale.cashReceived)}</span>
            <span className="text-base font-bold text-green-700">Cambio: {formatCurrency(sale.changeDue ?? 0)}</span>
          </div>
        )}
      </div>

      {printedAuto && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <Printer className="h-3.5 w-3.5" />
          {autoPrint === "both" ? "Ticket y comanda enviados a imprimir" : autoPrint === "ticket" ? "Ticket enviado a imprimir" : "Comanda enviada a imprimir"}
        </p>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mt-5 w-full">
        <Button variant="outline" className="gap-2" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Ticket
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleKitchen} title="Imprimir comanda para barra (sin precios)">
          <ChefHat className="h-4 w-4" />
          Comanda
        </Button>
        <Button
          variant="outline"
          className="col-span-2 gap-2"
          onClick={handleShare}
          title="Compartir el ticket por WhatsApp o copiarlo"
        >
          <Share2 className="h-4 w-4" />
          Compartir ticket
        </Button>
        <Button className="col-span-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={onClose} autoFocus>
          Nueva venta
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main POS Component                                                 */
/* ------------------------------------------------------------------ */
export default function POSClient({
  categories,
  products,
  isAdmin,
  businessId,
  cashierId,
  lockMinutes,
  hasPin,
  favoriteVariantIds,
  autoPrint,
  initialTotalSales,
  openSession,
}: POSClientProps) {
  const appCtx = useAppContext()
  const businessName = appCtx.business?.name ?? "Cafecito POS"
  // Carrito por negocio y cajero: cambiar de cafetería no mezcla carritos.
  const cart = usePosCart(`pos-cart:${businessId}:${cashierId}`, products)
  const {
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
    setQuantityTo,
    duplicateLine,
    setLineModifiers,
    restoreLines,
    setLineNotes,
    clearCart,
    resetAfterSale,
  } = cart

  const [totalSales, setTotalSales] = useState<number>(initialTotalSales)
  const [activeCategory, setActiveCategory] = useState<string>("todos")
  const [sizePickerFor, setSizePickerFor] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showTickets, setShowTickets] = useState(false)
  const [showCashDialog, setShowCashDialog] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  // La propina se elige al cobrar y NO se guarda con el carrito: una propina
  // vieja restaurada de otra venta cobraría de más sin que nadie lo note.
  const [tipChoice, setTipChoice] = useState<TipChoice>(0)
  const [tipCustomInput, setTipCustomInput] = useState("")
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null)
  // Producto/tamaño esperando modificadores: alta nueva, o edición de una
  // línea existente (lineId presente = "mejor con avena" sin rearmar todo).
  const [pendingModifiers, setPendingModifiers] = useState<{
    product: Product
    size?: SizeOption
    initial?: CartLine["modifiers"]
    editing?: boolean
    lineId?: string
  } | null>(null)
  // Teclear la cantidad exacta en vez de tocar «+» once veces
  const [editingQtyFor, setEditingQtyFor] = useState<string | null>(null)
  // Última venta cobrada, para «Repetir» (sobrevive recargas)
  const [lastSale, setLastSale] = useState<{ folio: number; payload: unknown } | null>(null)
  const lastSaleKey = `pos-last:${businessId}:${cashierId}`

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lastSaleKey)
      if (raw) setLastSale(JSON.parse(raw))
    } catch {
      /* dato corrupto: sin repetir */
    }
  }, [lastSaleKey])

  /* Pantalla despierta mientras la caja esté abierta: una tablet que se
     bloquea sola a media fila es un "toca-espera-desbloquea" constante. */
  useEffect(() => {
    if (!openSession) return
    let sentinel: { release?: () => Promise<void> } | null = null
    let activo = true
    const pedir = async () => {
      try {
        sentinel = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<never> } })
          .wakeLock?.request("screen") ?? null
      } catch {
        /* sin soporte o sin permiso: no pasa nada */
      }
    }
    const alVolver = () => {
      if (document.visibilityState === "visible" && activo) void pedir()
    }
    void pedir()
    document.addEventListener("visibilitychange", alVolver)
    return () => {
      activo = false
      document.removeEventListener("visibilitychange", alVolver)
      void sentinel?.release?.()
    }
  }, [openSession])
  // Layout: en pantallas chicas el carrito vive en una hoja inferior
  const isMobile = useIsMobile()
  const [cartOpen, setCartOpen] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const cashInputRef = useRef<HTMLInputElement>(null)

  // El total del día viene del servidor; tras vender/cancelar las actions
  // revalidan /pos y esta prop se actualiza → se sincroniza aquí.
  useEffect(() => {
    setTotalSales(initialTotalSales)
  }, [initialTotalSales])

  // Aviso único si se restauró un carrito guardado
  useEffect(() => {
    if (cart.hydrated && cart.restoredCount > 0) {
      toast.info(`Se restauró la venta en curso (${cart.restoredCount} línea${cart.restoredCount === 1 ? "" : "s"}).`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.hydrated])

  /* Más vendidos (últimos 30 días) que siguen en el menú */
  const favorites = useMemo(
    () =>
      favoriteVariantIds
        .map((variantId) => findVariant(products, variantId))
        .filter((f): f is { product: Product; size?: SizeOption } => f !== null),
    [favoriteVariantIds, products],
  )

  /** Color de cada categoría, por slug, para tarjetas y chips. */
  const categoryColor = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const c of categories) map[c.id] = c.color ?? null
    return map
  }, [categories])

  /* filtered & grouped products */
  const searchLower = searchQuery.toLowerCase().trim()
  const filtered = products.filter((p) => {
    const matchesSearch = !searchLower || p.name.toLowerCase().includes(searchLower)
    const matchesCategory = searchLower || activeCategory === "todos" || p.category === activeCategory
    return matchesSearch && matchesCategory
  })

  const grouped = filtered.reduce<Record<string, Product[]>>((acc, p) => {
    const key = p.subcategory
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const subtotal = cartSubtotal(lines)
  const discountAmount = computeDiscount(subtotal, discount)
  const total = Math.round((subtotal - discountAmount) * 100) / 100
  // Un descuento fijo mayor al subtotal (p.ej. tras quitar artículos) no se puede cobrar
  const discountInvalid = discount !== null && discount.type === "amount" && discount.value > subtotal && subtotal > 0

  // Propina: porcentaje sobre el total ya con descuento, o monto libre.
  const tipAmount =
    lines.length === 0
      ? 0
      : tipChoice === "otro"
      ? Math.max(0, parseCash(tipCustomInput) ?? 0)
      : Math.round(total * tipChoice) / 100
  // Lo que el cliente paga: la venta más la propina.
  const due = Math.round((total + tipAmount) * 100) / 100

  const clearTip = useCallback(() => {
    setTipChoice(0)
    setTipCustomInput("")
  }, [])

  // Efectivo recibido / cambio (solo aplica al pago en efectivo)
  const cashReceived = paymentMethod === "efectivo" ? parseCash(cashReceivedInput) : null
  const changeDue = cashReceived !== null ? cashReceived - due : null
  const cashInsufficient = cashReceived !== null && cashReceived < due

  const canCharge =
    lines.length > 0 && !isProcessing && !!openSession && !cashInsufficient && !discountInvalid

  const finalizeSale = useCallback(async () => {
    if (!canCharge) return
    setIsProcessing(true)

    try {
      // Los precios NO se mandan: el servidor los recalcula desde el menú
      // (variante + modificadores) y valida el descuento.
      const result = await createTicket({
        clientRef: saleRef,
        expectedBusinessId: businessId,
        paymentMethod,
        notes: ticketNotes.trim() || undefined,
        cashReceived: cashReceived ?? undefined,
        tip: tipAmount > 0 ? tipAmount : undefined,
        discount: discount ?? undefined,
        items: lines.map((line) => ({
          variant_id: getLineVariantId(line) ?? "",
          quantity: line.quantity,
          notes: line.notes.trim() || undefined,
          modifiers: line.modifiers.length > 0 ? line.modifiers.map((m) => m.id) : undefined,
        })),
      })

      if (result.success) {
        setCompletedSale({
          ticketId: result.ticketId,
          folio: result.folio,
          lines: [...lines],
          subtotal: result.subtotal,
          discountTotal: result.discountTotal,
          discountReason: discount?.reason ?? null,
          total: result.total,
          tip: result.tip,
          paymentMethod,
          date: new Date(),
          notes: ticketNotes.trim() || undefined,
          cashReceived: result.cashReceived,
          changeDue: result.changeDue,
        })
        // El total del día son ventas: la propina no suma aquí.
        setTotalSales((prev) => prev + result.total)
        // Guardar las líneas para «Repetir última venta» (validadas contra el
        // menú vigente al momento de repetir, no ahora).
        try {
          const payload = serializeCart(
            { saleRef: "", paymentMethod, ticketNotes: "", cashReceivedInput: "", discount: null, lines },
            Date.now(),
          )
          window.localStorage.setItem(lastSaleKey, JSON.stringify({ folio: result.folio, payload }))
          setLastSale({ folio: result.folio, payload })
        } catch {
          /* sin espacio: solo se pierde el botón de repetir */
        }
        vibra(30)
        clearTip()
        resetAfterSale()
        setCartOpen(false)
      } else {
        toast.error(result.error || "Error al registrar la venta")
      }
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine
      toast.error(
        offline
          ? "Sin conexión. El pedido queda guardado aquí; vuelve a pulsar Cobrar cuando regrese el internet."
          : "Error de conexión al registrar la venta. Intenta de nuevo.",
      )
    } finally {
      setIsProcessing(false)
    }
  }, [canCharge, saleRef, businessId, paymentMethod, ticketNotes, cashReceived, tipAmount, discount, lines, lastSaleKey, clearTip, resetAfterSale])

  /** Producto/tamaño elegido: si tiene modificadores, pregunta; si no, al carrito. */
  const chooseProduct = useCallback(
    (product: Product, size?: SizeOption) => {
      setSizePickerFor(null)
      if (product.modifierGroups && product.modifierGroups.length > 0) {
        setPendingModifiers({ product, size })
      } else {
        addLine(product, size)
        vibra(12)
      }
    },
    [addLine],
  )

  const handleProductClick = (product: Product) => {
    if (product.sizes && product.sizes.length > 0) {
      setSizePickerFor(sizePickerFor === product.id ? null : product.id)
    } else {
      chooseProduct(product)
    }
  }

  const focusCash = useCallback(() => {
    setPaymentMethod("efectivo")
    // el input aparece al cambiar de método; enfocar en el siguiente frame
    requestAnimationFrame(() => cashInputRef.current?.focus())
  }, [setPaymentMethod])

  /* ── Atajos de teclado ─────────────────────────────────────────── */
  const anyDialogOpen =
    completedSale !== null ||
    showTickets ||
    showCashDialog ||
    showDiscount ||
    showShortcuts ||
    confirmClear ||
    pendingModifiers !== null

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
          if (lines.length > 0) setShowDiscount(true)
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
    finalizeSale,
    openSession,
    focusCash,
    sizePickerFor,
    products,
    chooseProduct,
    filtered,
    lines.length,
    setPaymentMethod,
  ])

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  const itemCount = cartItemCount(lines)

  /* Panel del carrito (header + líneas + cobro). Se monta una sola vez:
     como columna derecha en escritorio o dentro de una hoja inferior en
     móvil, para que refs y foco apunten al panel visible. */
  const cartPanel = (
    <div className="flex flex-col h-full bg-white">
      <header className="shrink-0 px-5 py-3 md:py-4 border-b border-stone-200 bg-amber-50/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-bold text-stone-800">Venta Actual</h2>
          </div>
          <div className="flex items-center gap-2">
            {lines.length > 0 && (
              <>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                  {itemCount} items
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-stone-400 hover:text-red-600 hover:bg-red-50 gap-1"
                  onClick={() => setConfirmClear(true)}
                  title="Vaciar carrito (Ctrl+⌫)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Vaciar
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Cart items */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {lines.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-stone-300">
              <ShoppingBag className="h-14 w-14 mb-3 opacity-40" />
              <p className="text-base font-medium text-stone-400">No hay productos</p>
              <p className="text-sm text-stone-300">Toca un producto para agregarlo</p>
              {lastSale && (
                <button
                  type="button"
                  onClick={() => {
                    // Se valida contra el menú DE HOY: si algo cambió de precio
                    // o se desactivó, esa línea no regresa (y se avisa).
                    const estado = rehydrateCart(lastSale.payload, products, Date.now())
                    if (!estado || estado.lines.length === 0) {
                      toast.error("El menú cambió y ya no se puede repetir esa venta.")
                      return
                    }
                    restoreLines(estado.lines)
                    vibra(12)
                    const guardadas = (lastSale.payload as { lines?: unknown[] }).lines?.length ?? 0
                    if (estado.lines.length < guardadas) {
                      toast.info("Se repitió la venta, pero algún artículo ya no está en el menú.")
                    }
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:border-amber-300 hover:text-amber-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Repetir última venta · #{lastSale.folio}
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {lines.map((line) => (
                <motion.div
                  key={line.lineId}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    backgroundColor: line.isNew ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0)",
                  }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="py-3 border-b border-stone-100 rounded-lg px-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-800 text-sm truncate">{line.product.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-stone-400">{formatCurrency(getLinePrice(line))}</span>
                        {line.size && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 border-stone-300 text-stone-500"
                          >
                            {line.size.label}
                          </Badge>
                        )}
                      </div>
                      {line.product.modifierGroups && line.product.modifierGroups.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingModifiers({
                              product: line.product,
                              size: line.size,
                              initial: line.modifiers,
                              editing: true,
                              lineId: line.lineId,
                            })
                          }
                          title="Cambiar las opciones de esta línea"
                          className="mt-0.5 flex max-w-full items-center gap-1 truncate text-left text-[11px] text-amber-700 hover:underline"
                        >
                          <Pencil className="h-3 w-3 shrink-0 opacity-60" />
                          <span className="truncate">
                            {line.modifiers.length > 0
                              ? line.modifiers.map((m) => `+ ${m.name}`).join(" · ")
                              : "sin opciones — cambiar"}
                          </span>
                        </button>
                      ) : null}
                      {line.notes && editingNoteFor !== line.lineId && (
                        <button
                          type="button"
                          onClick={() => setEditingNoteFor(line.lineId)}
                          className="text-[11px] text-stone-500 italic mt-0.5 truncate max-w-full text-left hover:text-amber-700"
                          title="Editar nota"
                        >
                          📝 {line.notes}
                        </button>
                      )}
                    </div>

                    {/* Quantity controls (táctiles: 40px en móvil) */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 md:h-8 md:w-8 rounded-full border-stone-300 text-stone-500"
                        onClick={() => updateQuantity(line.lineId, -1)}
                        aria-label="Quitar uno"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      {editingQtyFor === line.lineId ? (
                        <input
                          autoFocus
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={99}
                          defaultValue={line.quantity}
                          onBlur={(e) => {
                            const n = Number(e.target.value)
                            if (Number.isFinite(n) && n >= 1) setQuantityTo(line.lineId, n)
                            setEditingQtyFor(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              e.preventDefault()
                              ;(e.target as HTMLInputElement).blur()
                            }
                          }}
                          className="h-8 w-11 rounded-md border border-amber-300 bg-white text-center text-sm font-bold text-stone-800"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingQtyFor(line.lineId)}
                          title="Teclear la cantidad"
                          className="w-8 rounded text-center text-sm font-bold text-stone-700 hover:bg-stone-100"
                        >
                          {line.quantity}
                        </button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 md:h-8 md:w-8 rounded-full border-stone-300 text-stone-500"
                        onClick={() => updateQuantity(line.lineId, 1)}
                        aria-label="Agregar uno"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <span className="font-bold text-sm text-stone-800 w-16 text-right">
                      {formatCurrency(getLinePrice(line) * line.quantity)}
                    </span>

                    <div className="flex items-center shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 md:h-8 md:w-8 text-stone-300 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          duplicateLine(line.lineId)
                          vibra(12)
                        }}
                        title="Duplicar esta línea (otro igual)"
                        aria-label="Duplicar esta línea"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-10 w-10 md:h-8 md:w-8 ${
                          line.notes ? "text-amber-600" : "text-stone-300"
                        } hover:text-amber-700 hover:bg-amber-50`}
                        onClick={() => setEditingNoteFor(editingNoteFor === line.lineId ? null : line.lineId)}
                        title="Nota para este artículo"
                        aria-label="Nota para este artículo"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 md:h-8 md:w-8 text-stone-300 hover:text-red-500 hover:bg-red-50"
                        onClick={() => removeLine(line.lineId)}
                        aria-label="Quitar línea"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Nota por artículo */}
                  {editingNoteFor === line.lineId && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        autoFocus
                        placeholder="ej. sin azúcar, extra caliente…"
                        defaultValue={line.notes}
                        maxLength={200}
                        className="h-9 text-sm bg-amber-50/50 border-amber-200"
                        onBlur={(e) => {
                          setLineNotes(line.lineId, e.target.value.trim())
                          setEditingNoteFor(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            e.preventDefault()
                            ;(e.target as HTMLInputElement).blur()
                          }
                        }}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {/* Checkout */}
      <div className="shrink-0 p-4 border-t border-stone-200 bg-stone-50/80 space-y-3">
        {/* Nota del ticket: chips de un toque + texto libre */}
        <div className="flex gap-1.5">
          {QUICK_NOTES.map((qn) => {
            const activa = ticketNotes === qn || ticketNotes.startsWith(qn + " · ")
            return (
              <button
                key={qn}
                type="button"
                onClick={() => {
                  const resto = QUICK_NOTES.reduce(
                    (t, otro) => (t === otro ? "" : t.startsWith(otro + " · ") ? t.slice(otro.length + 3) : t),
                    ticketNotes,
                  )
                  setTicketNotes(activa ? resto : resto ? `${qn} · ${resto}` : qn)
                }}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  activa
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-stone-200 bg-white text-stone-500 hover:border-amber-300"
                }`}
              >
                {qn}
              </button>
            )
          })}
        </div>
        <Input
          placeholder="Nota del ticket: mesa, nombre, para llevar..."
          value={ticketNotes}
          onChange={(e) => setTicketNotes(e.target.value)}
          maxLength={500}
          className="bg-white border-stone-200 h-9 text-sm"
        />

        {/* Payment method selector */}
        <div className="flex gap-2">
          {PAYMENT_METHOD_KEYS.map((key, index) => {
            const info = PAYMENT_METHODS[key]
            const Icon = info.icon
            const active = paymentMethod === key
            const activeClass =
              key === "efectivo"
                ? "border-green-500 bg-green-50 text-green-700"
                : key === "transferencia"
                ? "border-violet-500 bg-violet-50 text-violet-700"
                : "border-blue-500 bg-blue-50 text-blue-700"
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPaymentMethod(key)}
                className={`relative flex-1 flex items-center justify-center gap-2 py-3 md:py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                  active ? activeClass : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {info.shortLabel}
                <Kbd className="absolute top-1 right-1">{index + 1}</Kbd>
              </button>
            )
          })}
        </div>

        {/* Propina: se cobra encima del total y no cuenta como venta */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-stone-500 shrink-0 flex items-center gap-1">
            <HandCoins className="h-3.5 w-3.5" />
            Propina
          </span>
          {TIP_OPTIONS.map((option) => {
            const active = tipChoice === option
            return (
              <button
                key={String(option)}
                type="button"
                disabled={lines.length === 0}
                onClick={() => {
                  setTipChoice(option)
                  if (option !== "otro") setTipCustomInput("")
                }}
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors disabled:opacity-40 ${
                  active
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-stone-200 bg-white text-stone-500 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                {option === "otro" ? "Otro" : option === 0 ? "Sin" : `${option}%`}
              </button>
            )
          })}
          {tipChoice === "otro" && (
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              placeholder="$"
              value={tipCustomInput}
              onChange={(e) => setTipCustomInput(e.target.value)}
              className="h-8 w-24 text-sm font-semibold"
            />
          )}
          {tipAmount > 0 && (
            <span className="ml-auto text-sm font-bold text-emerald-700">+{formatCurrency(tipAmount)}</span>
          )}
        </div>

        {/* Efectivo recibido + cambio */}
        {paymentMethod === "efectivo" && (
          <div className="rounded-lg border border-green-200 bg-green-50/60 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-green-800 shrink-0 flex items-center gap-1">
                Recibido <Kbd>F4</Kbd>
              </span>
              <Input
                ref={cashInputRef}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Opcional"
                value={cashReceivedInput}
                onChange={(e) => setCashReceivedInput(e.target.value)}
                className={`h-9 text-sm font-semibold bg-white ${
                  cashInsufficient ? "border-red-400 focus-visible:ring-red-400" : "border-green-200"
                }`}
              />
              <span
                className={`text-sm font-bold shrink-0 min-w-[7.5rem] text-right ${
                  cashInsufficient ? "text-red-600" : changeDue !== null ? "text-green-700" : "text-stone-400"
                }`}
              >
                {cashInsufficient
                  ? `Faltan ${formatCurrency(due - (cashReceived ?? 0))}`
                  : changeDue !== null
                  ? `Cambio ${formatCurrency(changeDue)}`
                  : "Cambio —"}
              </span>
            </div>
            {/* Teclado numérico: en tablet es más rápido que el teclado del sistema */}
            <div className="grid grid-cols-6 gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "C"].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setCashReceivedInput((prev) =>
                      key === "C" ? "" : (prev + key).replace(/^0+(?=\d)/, "").slice(0, 7),
                    )
                  }
                  className="py-2 rounded-md bg-white border border-green-200 text-sm font-semibold text-green-900 hover:bg-green-100 active:bg-green-200"
                >
                  {key}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setCashReceivedInput(due > 0 ? String(due) : "")}
                className="flex-1 py-1.5 rounded-md bg-white border border-green-200 text-xs font-semibold text-green-800 hover:bg-green-100"
              >
                Exacto
              </button>
              {cashSuggestions(due).map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setCashReceivedInput(String(amount))}
                  className="flex-1 py-1.5 rounded-md bg-white border border-green-200 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-40"
                  disabled={amount < due}
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subtotal / descuento / total */}
        <div className="space-y-1">
          {(discount || subtotal > 0) && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-stone-500">Subtotal</span>
              <span className="text-stone-600">{formatCurrency(subtotal)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm">
            <button
              type="button"
              onClick={() => setShowDiscount(true)}
              disabled={lines.length === 0}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 -ml-1.5 transition-colors disabled:opacity-40 ${
                discount ? "text-amber-700 hover:bg-amber-50" : "text-stone-400 hover:text-amber-700 hover:bg-amber-50"
              }`}
            >
              <Percent className="h-3.5 w-3.5" />
              {discount
                ? `Descuento ${discount.type === "percent" ? `${discount.value}%` : formatCurrency(discount.value)} · ${discount.reason}`
                : "Agregar descuento"}
              <Kbd>D</Kbd>
            </button>
            {discount && (
              <span className={discountInvalid ? "text-red-600 font-medium" : "text-amber-700"}>
                {discountInvalid ? "Mayor al subtotal" : `-${formatCurrency(discountAmount)}`}
              </span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className={tipAmount > 0 ? "text-sm text-stone-500" : "text-base font-medium text-stone-500"}>
              Total
            </span>
            <span
              className={
                tipAmount > 0 ? "text-base font-semibold text-stone-700" : "text-2xl font-bold text-stone-800"
              }
            >
              {formatCurrency(total)}
            </span>
          </div>
          {tipAmount > 0 && (
            <>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Propina</span>
                <span className="text-emerald-700">+{formatCurrency(tipAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-base font-medium text-stone-500">A cobrar</span>
                <span className="text-2xl font-bold text-stone-800">{formatCurrency(due)}</span>
              </div>
            </>
          )}
        </div>

        {/* Cobrar button / gate de caja */}
        {openSession ? (
          <Button
            className={`relative w-full py-6 text-lg font-bold rounded-xl text-white transition-colors ${
              paymentMethod === "efectivo"
                ? "bg-green-600 hover:bg-green-700"
                : paymentMethod === "transferencia"
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            size="lg"
            disabled={!canCharge}
            onClick={finalizeSale}
          >
            {isProcessing ? "Procesando..." : `Cobrar ${formatCurrency(due)} · ${paymentLabel(paymentMethod)}`}
            <Kbd className="absolute right-3 top-1/2 -translate-y-1/2 border-white/40 bg-white/20 text-white">F2</Kbd>
          </Button>
        ) : (
          <Button
            className="w-full py-6 text-lg font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white gap-2"
            size="lg"
            onClick={() => setShowCashDialog(true)}
          >
            <Lock className="h-5 w-5" />
            Caja cerrada · Abrir caja para cobrar
          </Button>
        )}
      </div>
    </div>
  )

  /* Chip de estado de caja (compartido entre escritorio y móvil) */
  const cashChip = (compact: boolean) => (
    <Button
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={() => setShowCashDialog(true)}
      className={`backdrop-blur gap-1.5 font-semibold ${
        openSession
          ? "bg-green-50/90 border-green-300 text-green-700 hover:bg-green-100"
          : "bg-red-50/90 border-red-300 text-red-700 hover:bg-red-100"
      }`}
      title={openSession ? "Cerrar caja (corte) · movimientos de efectivo" : "Abrir caja"}
    >
      {openSession ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      {compact
        ? openSession
          ? "Caja"
          : "Cerrada"
        : openSession
        ? `Caja abierta · ${formatTime(openSession.openedAt)}`
        : "Caja cerrada"}
      {!compact && <Kbd>K</Kbd>}
    </Button>
  )

  return (
    <div className="relative flex h-[100dvh] bg-stone-50 overflow-hidden">
      <OfflineBanner />
      <PosLockScreen
        lockMinutes={lockMinutes}
        initialHasPin={hasPin}
        businessName={businessName}
        userName={appCtx.fullName || "quien está en caja"}
      />
      {/* ── Top-right actions (escritorio) ── */}
      {!isMobile && (
        <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
          {cashChip(false)}
          <Button
            variant="outline"
            onClick={() => setShowTickets(true)}
            className="bg-white/80 backdrop-blur gap-1.5"
          >
            <Receipt className="h-4 w-4" />
            Tickets
            <Kbd>T</Kbd>
          </Button>
          {isAdmin && (
            <Link href="/admin">
              <Button variant="outline" className="bg-white/80 backdrop-blur gap-1.5">
                <Settings className="h-4 w-4" />
                Administrar
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowShortcuts(true)}
            className="bg-white/80 backdrop-blur"
            title="Atajos y ayuda (?)"
            aria-label="Atajos y ayuda"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          {lockMinutes > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.dispatchEvent(new Event(POS_LOCK_EVENT))}
              className="bg-white/80 backdrop-blur"
              title="Bloquear pantalla"
              aria-label="Bloquear pantalla"
            >
              <Lock className="h-4 w-4" />
            </Button>
          )}
          <Link href="/cuenta" title="Mi cuenta" aria-label="Mi cuenta">
            <Button variant="outline" size="icon" className="bg-white/80 backdrop-blur">
              <UserCircle className="h-4 w-4" />
            </Button>
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" className="bg-white/80 backdrop-blur">
              Cerrar sesión
            </Button>
          </form>
        </div>
      )}

      {/* ───── LEFT PANEL (Products) ───── */}
      <div className={`flex flex-col h-full ${isMobile ? "w-full" : "w-3/5 border-r border-stone-200"}`}>
        {/* Header */}
        <header className="shrink-0 px-4 md:px-5 pt-3 md:pt-4 pb-3 bg-white border-b border-stone-200 shadow-sm">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Coffee className="h-6 w-6 text-amber-700 shrink-0" />
              <h1 className="text-xl md:text-2xl font-bold text-stone-800 tracking-tight truncate">{businessName}</h1>
              {!isMobile && (
                <BusinessSwitcher
                  memberships={appCtx.memberships}
                  activeId={appCtx.business?.id ?? null}
                  variant="compact"
                  className="ml-1"
                />
              )}
            </div>
            {isMobile ? (
              <div className="flex items-center gap-1.5 shrink-0">
                {cashChip(true)}
                <BusinessSwitcher
                  memberships={appCtx.memberships}
                  activeId={appCtx.business?.id ?? null}
                  variant="compact"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Menú">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => setShowTickets(true)}>
                      <Receipt className="h-4 w-4 mr-2" /> Tickets del día
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShowCashDialog(true)}>
                      {openSession ? <Unlock className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                      {openSession ? "Caja · corte y movimientos" : "Abrir caja"}
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin">
                          <Settings className="h-4 w-4 mr-2" /> Administrar
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href="/ayuda" target="_blank">
                        <BookOpen className="h-4 w-4 mr-2" /> Guía de uso
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/cuenta">
                        <UserCircle className="h-4 w-4 mr-2" /> Mi cuenta
                      </Link>
                    </DropdownMenuItem>
                    {lockMinutes > 0 && (
                      <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(POS_LOCK_EVENT))}>
                        <Lock className="h-4 w-4 mr-2" /> Bloquear pantalla
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => logout()} className="text-red-600 focus:text-red-700">
                      <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl flex items-center gap-2">
                <span className="text-sm text-amber-800 font-medium">Total vendido hoy:</span>
                <span className="text-xl font-bold text-amber-800">{formatCurrency(totalSales)}</span>
              </div>
            )}
          </div>
          {isMobile && (
            <p className="text-xs text-amber-800 mt-1">
              Vendido hoy: <span className="font-bold">{formatCurrency(totalSales)}</span>
            </p>
          )}

          {/* Search bar */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              ref={searchInputRef}
              placeholder={isMobile ? "Buscar producto…" : "Buscar producto…  (Enter agrega el primero)"}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSizePickerFor(null)
              }}
              className="pl-9 pr-16 bg-stone-50 border-stone-200 h-10 md:h-9 text-sm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery("")
                    searchInputRef.current?.focus()
                  }}
                  className="text-stone-400 hover:text-stone-600 p-1"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Kbd className="text-stone-400">/</Kbd>
              )}
            </div>
          </div>

          {/* Categories scroll */}
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "outline"}
                onClick={() => {
                  setActiveCategory(cat.id)
                  setSearchQuery("")
                  setSizePickerFor(null)
                }}
                className={`rounded-full shrink-0 text-sm border ${
                  activeCategory === cat.id
                    ? colorClasses(cat.color)?.chipActive ?? DEFAULT_CHIP_ACTIVE
                    : colorClasses(cat.color)?.chip ?? DEFAULT_CHIP
                }`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </header>

        {/* Product grid */}
        <ScrollArea className="flex-1 min-h-0">
          <div className={`p-4 space-y-6 ${isMobile ? "pb-24" : ""}`}>
            {products.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <Coffee className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-base font-medium">No hay productos en el menú</p>
                <p className="text-sm">Agrega productos desde el panel de administración</p>
              </div>
            )}
            {products.length > 0 && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-stone-400">
                <Search className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">Sin resultados para «{searchQuery}»</p>
              </div>
            )}
            {/* Más vendidos: un toque para los productos de siempre */}
            {favorites.length > 0 && !searchLower && activeCategory === "todos" && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-amber-500" />
                  Más vendidos
                </h3>
                <div className="flex flex-wrap gap-2">
                  {favorites.map(({ product, size }) => (
                    <motion.button
                      key={size?.variantId ?? product.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => chooseProduct(product, size)}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:border-amber-400 hover:bg-amber-100 transition-colors"
                    >
                      <span className="block text-sm font-semibold text-stone-800 leading-tight">
                        {product.name}
                        {size ? <span className="text-stone-500 font-normal"> · {size.label}</span> : null}
                      </span>
                      <span className="block text-xs font-bold text-amber-700">
                        {size ? formatCurrency(size.price) : getDisplayPrice(product)}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {Object.entries(grouped).map(([subcategory, items]) => (
              <div key={subcategory}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1">
                  {subcategory}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map((product) => {
                    const accent = colorClasses(categoryColor[product.category])?.accent
                    return (
                      <div key={product.id}>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleProductClick(product)}
                          className={`w-full text-left rounded-xl border transition-all duration-150 overflow-hidden ${
                            sizePickerFor === product.id
                              ? "border-amber-400 bg-amber-50 shadow-md"
                              : "border-stone-200 bg-white hover:border-amber-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="p-3 relative">
                            {accent && (
                              <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
                            )}
                            <p className="font-semibold text-stone-800 text-sm leading-tight line-clamp-2">
                              {product.name}
                            </p>
                            {product.description && product.description !== subcategory && (
                              <p className="text-xs text-stone-400 mt-0.5 truncate">{product.description}</p>
                            )}
                            <p className="text-amber-700 font-bold text-base mt-1 flex items-center justify-between">
                              {getDisplayPrice(product)}
                              {product.modifierGroups && (
                                <SlidersHorizontal className="h-3.5 w-3.5 text-stone-300" aria-label="Con opciones" />
                              )}
                            </p>
                          </div>
                        </motion.button>

                        {/* Size picker – inline below the card */}
                        <AnimatePresence>
                          {sizePickerFor === product.id && product.sizes && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="flex gap-1.5 mt-1.5">
                                {product.sizes.map((size, index) => (
                                  <motion.button
                                    key={size.label}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={() => chooseProduct(product, size)}
                                    className="relative flex-1 py-2.5 md:py-2 px-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-center transition-colors"
                                  >
                                    {index < 9 && (
                                      <Kbd className="absolute top-1 right-1 border-white/40 bg-white/20 text-white opacity-90">
                                        {index + 1}
                                      </Kbd>
                                    )}
                                    <span className="block text-xs font-bold">{size.label}</span>
                                    <span className="block text-[10px] opacity-80">{size.oz}</span>
                                    <span className="block text-xs font-bold mt-0.5">${size.price}</span>
                                  </motion.button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ───── RIGHT PANEL (Cart) — escritorio ───── */}
      {!isMobile && <div className="w-2/5 h-full">{cartPanel}</div>}

      {/* ───── Barra inferior + hoja del carrito — móvil ───── */}
      {isMobile && (
        <>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button
              className={`w-full h-12 rounded-xl text-base font-bold justify-between px-4 ${
                lines.length > 0 ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
              onClick={() => setCartOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                {lines.length === 0 ? "Carrito vacío" : `${itemCount} artículo${itemCount === 1 ? "" : "s"}`}
              </span>
              <span className="flex items-center gap-2">
                {formatCurrency(total)}
                <ChevronUp className="h-4 w-4 opacity-70" />
              </span>
            </Button>
          </div>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetContent side="bottom" className="h-[92dvh] p-0 flex flex-col rounded-t-2xl overflow-hidden">
              <SheetTitle className="sr-only">Venta actual</SheetTitle>
              <div className="flex-1 min-h-0">{cartPanel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* ── Dialogs ── */}
      <CashSessionDialog open={showCashDialog} onOpenChange={setShowCashDialog} session={openSession} />
      <TicketHistoryDialog open={showTickets} onOpenChange={setShowTickets} isAdmin={isAdmin} />
      <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
      <ModifierSheet
        pending={pendingModifiers}
        onClose={() => setPendingModifiers(null)}
        onConfirm={(product, size, modifiers) => {
          if (pendingModifiers?.editing && pendingModifiers.lineId) {
            setLineModifiers(pendingModifiers.lineId, modifiers)
          } else {
            addLine(product, size, modifiers)
          }
          vibra(12)
          setPendingModifiers(null)
        }}
      />
      <DiscountDialog
        open={showDiscount}
        onOpenChange={setShowDiscount}
        subtotal={subtotal}
        current={discount}
        onApply={setDiscount}
      />

      {/* Confirmar vaciar carrito */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Vaciar el carrito?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitarán {itemCount} artículo{itemCount === 1 ? "" : "s"}, la nota y el descuento de esta venta. No se
              registra nada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                clearCart()
                clearTip()
                setConfirmClear(false)
              }}
            >
              Vaciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Receipt dialog ── */}
      <Dialog
        open={completedSale !== null}
        onOpenChange={(open) => {
          if (!open) setCompletedSale(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Ticket de venta</DialogTitle>
          </DialogHeader>
          {completedSale && (
            <ReceiptView sale={completedSale} autoPrint={autoPrint} onClose={() => setCompletedSale(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
