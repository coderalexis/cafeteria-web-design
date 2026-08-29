"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { formatCurrency, formatTime, paymentLabel, PAYMENT_METHODS, PAYMENT_METHOD_KEYS, formatDate } from "@/lib/format"
import {
  buildKitchenLines,
  buildShareText,
  buildTicketLines,
  printLines,
  receiptBusinessFrom,
  type ReceiptData,
} from "@/lib/receipt"
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from "framer-motion"
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
  AArrowUp,
  Gift,
  Stamp,
  Info,
  Calculator,
  MoreVertical,
  LogOut,
  BookOpen,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  UserCircle,
  Star,
  Share2,
  HandCoins,
  Copy,
  RotateCcw,
  Pencil,
  PauseCircle,
} from "lucide-react"
import { useAppContext, useBusiness } from "@/components/business-provider"
import { BusinessSwitcher } from "@/components/business-switcher"
import { OfflineBanner, PosLockScreen, POS_LOCK_EVENT } from "./lock-screen"
import { TrialBanner } from "@/components/trial-banner"
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
import { ParkDialog, ParkedTrayDialog } from "./parked-dialog"
import { useParkedOrders } from "./use-parked-orders"
import { autoName, type ParkedOrder } from "./parked"
import { DiscountDialog } from "./discount-dialog"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { CashTenderDialog } from "./cash-tender-dialog"
import { formatPhone, LoyaltyDialog, RedeemDialog } from "./loyalty-dialog"
import type { LoyaltyCustomer } from "@/app/actions/loyalty"
import { ProductInfoDialog } from "./product-info-dialog"
import { CartLineDialog } from "./cart-line-dialog"
import { TextSizeControl } from "./text-size-control"
import { usePosTextSize } from "./use-text-size"
import { usePosCart } from "./use-pos-cart"
import { useOfflineQueue } from "./use-offline-queue"
import { QueueBanner } from "./queue-banner"
import { QueueReviewDialog } from "./queue-review-dialog"
import { QUEUE_MAX, serializeLines } from "./queue"
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
  /** Cargo por «Para llevar», ya incluido en total. */
  takeoutFee: number
  /** Propina cobrada encima del total (no cuenta como venta). */
  tip: number
  paymentMethod: PaymentMethod
  date: Date
  notes?: string
  cashReceived: number | null
  changeDue: number | null
  loyalty: { stamps: number; target: number; redeemed: boolean } | null
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
  /** Módulo de pedidos en espera activado para esta cafetería. */
  parkedOrders: boolean
  /** Lealtad con sellos activada para esta cafetería. */
  loyalty: boolean
  /** Sellos necesarios para el premio. */
  loyaltyTarget: number
  /** Qué es el premio, en palabras del negocio. */
  loyaltyReward: string
  /** Techo de descuento en % para cajeros (100 = sin límite). */
  discountMaxCashier: number
  /** Cargo por «Para llevar» ($, 0 = sin cargo). El monto lo valida el servidor. */
  takeoutFee: number
  /** Comisión de la terminal (%), solo para mostrar el neto en el corte. */
  cardFeePct: number
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

/** ¿El navegador sabe animar sobre una curva? (Safari viejo no; ahí el
 *  vuelo cae al arco de tres cuadros.) En SSR no existe CSS. */
const FLIGHT_PATH_SUPPORTED =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("offset-path", 'path("M 0 0 L 1 1")')

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

/** Si el plegable de "Más opciones" queda abierto, por dispositivo. */
const MORE_OPTIONS_KEY = "pos-more-options"

/** Cuánto hay que arrastrar una línea del carrito para que cuente el gesto.
 *  90px: un tirón franco. Menos y el scroll diagonal disparaba acciones. */
const UMBRAL_GESTO = 90
/** Mantener presionado este tiempo abre la nota de la línea. */
const PRESION_LARGA_MS = 500

/**
 * ¿El evento nació DE VERDAD dentro de la tarjeta, y no sobre un control?
 *
 * Dos trampas que ya mordieron:
 * - Los eventos de React ATRAVIESAN los portales: tocar una opción del menú ⋯
 *   (que vive en un portal del body) burbujea por el árbol de React hasta la
 *   tarjeta. contains() lo descarta, porque en el DOM esa opción no es hija
 *   de la tarjeta.
 * - Las opciones de Radix son div[role="menuitem"], no <button>: la lista de
 *   exclusión debe nombrarlas.
 */
function gestoEnTarjeta(e: { currentTarget: EventTarget & Element; target: EventTarget }): boolean {
  const t = e.target as HTMLElement
  return e.currentTarget.contains(t) && !t.closest("button, input, a, [role='menuitem']")
}

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
    takeoutFee: sale.takeoutFee,
    total: sale.total,
    tip: sale.tip,
    cashReceived: sale.cashReceived,
    changeDue: sale.changeDue,
    loyalty: sale.loyalty,
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

        {/* Subtotal / descuento / para llevar: con cualquiera de los dos,
            el total no se explica solo y se enseña la suma completa. */}
        {(sale.discountTotal > 0 || sale.takeoutFee > 0) && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal)}</span>
            </div>
            {sale.discountTotal > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Descuento{sale.discountReason ? ` · ${sale.discountReason}` : ""}</span>
                <span>-{formatCurrency(sale.discountTotal)}</span>
              </div>
            )}
            {sale.takeoutFee > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Para llevar</span>
                <span>+{formatCurrency(sale.takeoutFee)}</span>
              </div>
            )}
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
  parkedOrders: parkedEnabled,
  loyalty,
  loyaltyTarget,
  loyaltyReward,
  discountMaxCashier,
  takeoutFee,
  cardFeePct,
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
  const [showTender, setShowTender] = useState(false)
  // Lealtad: el cliente se adjunta POR VENTA y no se guarda con el carrito —
  // una tarjeta pegada de una venta anterior sellaría al cliente equivocado.
  // Una caja de otro día no se distingue de una recién abierta si el chip solo
  // dice la hora: hay que decirlo con todas sus letras.
  const cajaDeOtroDia =
    openSession != null && formatDate(openSession.openedAt) !== formatDate(new Date())
  const loyaltyEnabled = loyalty
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<LoyaltyCustomer | null>(null)
  const [loyaltyRedeem, setLoyaltyRedeem] = useState(false)
  const [showLoyalty, setShowLoyalty] = useState(false)
  const [showRedeem, setShowRedeem] = useState(false)
  const [infoProduct, setInfoProduct] = useState<Product | null>(null)
  // Aquí y no en el control: el control vive dentro del menú, que casi siempre
  // está cerrado, y el tamaño guardado debe aplicarse al abrir el POS.
  const textSize = usePosTextSize()
  // Cola de ventas sin internet (docs/cola-sin-internet.md). Vive aquí y no
  // dentro de un componente hijo porque cobrar la usa y el aviso la muestra.
  const cola = useOfflineQueue(businessId)
  const [showQueueReview, setShowQueueReview] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // "Más opciones": nota, «Para llevar» y descuento son de cada tantas ventas,
  // no de cada venta — y eran las que obligaban a desplazar dentro del bloque
  // de cobro. Plegadas, lo de siempre (método, efectivo, propina, total, botón)
  // cabe sin scroll. Se recuerda POR DISPOSITIVO: una cafetería con servicio a
  // mesa escribe la mesa en todas, y para ellos lo correcto es abrirlo una vez
  // y que se quede así.
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => {
    try {
      setMoreOpen(window.localStorage.getItem(MORE_OPTIONS_KEY) === "1")
    } catch {
      /* sin almacenamiento: queda plegado */
    }
  }, [])
  const toggleMore = useCallback(() => {
    setMoreOpen((abierto) => {
      const next = !abierto
      try {
        window.localStorage.setItem(MORE_OPTIONS_KEY, next ? "1" : "0")
      } catch {
        /* vale solo para esta sesión */
      }
      return next
    })
  }, [])
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null)
  // ── Gestos sobre las líneas del carrito ──
  // Toque = detalle en ventana; arrastre a la derecha = duplicar; a la
  // izquierda = quitar; presión larga = nota. Todo existe también en el menú
  // ⋯ de la línea — los gestos son el atajo, no el único camino, porque un
  // gesto no se descubre solo. El ref lleva el gesto EN CURSO (solo hay uno):
  // el click que llega al final decide si fue toque limpio o resto de un
  // arrastre/presión, y los toques sobre botones/inputs no cuentan.
  const [infoLine, setInfoLine] = useState<CartLine | null>(null)
  const gestoRef = useRef<{ x: number; y: number; lineId: string; downAt: number; largo: boolean; arrastre: boolean } | null>(null)
  // La nota pedida desde el menú ⋯: al cerrarse, Radix devuelve el foco al
  // botón que lo abrió — y ese robo mataría el autoFocus del campo de nota
  // (sin foco no hay teclado, y sin foco tampoco hay «toca afuera para
  // guardar», que es un blur). Este ref avisa a onCloseAutoFocus que esta vez
  // el foco es del campo.
  const notaDesdeMenuRef = useRef(false)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  // Pedidos en espera (este dispositivo, por cafetería)
  const parked = useParkedOrders(businessId)
  const [showPark, setShowPark] = useState(false)
  const [showTray, setShowTray] = useState(false)
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

  // ── Encabezado que se encoge (móvil) ──
  // Antes del primer producto hay nombre, chip de caja, "Vendido hoy",
  // buscador y categorías: en un celular chico queda UNA fila de productos.
  // Al bajar se ocultan las dos filas prescindibles; las categorías se quedan,
  // que son la navegación. Con búsqueda activa (o recién pedida con la lupa)
  // nunca se colapsa: quitarle el buscador a quien lo está usando no.
  const [gridScrolled, setGridScrolled] = useState(false)
  const [searchPinned, setSearchPinned] = useState(false)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const cashInputRef = useRef<HTMLInputElement>(null)

  // El total del día viene del servidor; tras vender/cancelar las actions
  // revalidan /pos y esta prop se actualiza → se sincroniza aquí.
  useEffect(() => {
    setTotalSales(initialTotalSales)
  }, [initialTotalSales])

  useEffect(() => {
    if (!isMobile) {
      setGridScrolled(false)
      return
    }
    const viewport = gridScrollRef.current?.querySelector("[data-radix-scroll-area-viewport]")
    if (!viewport) return
    let compact = false
    // Histéresis: colapsar achica el encabezado y mueve el contenido; con un
    // solo umbral, ese brinco lo volvería a expandir y quedaría parpadeando.
    const onScroll = () => {
      const next = compact ? viewport.scrollTop > 8 : viewport.scrollTop > 40
      if (next !== compact) {
        compact = next
        setGridScrolled(next)
      }
    }
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [isMobile])

  // La lupa del encabezado colapsado: expandir y enfocar cuando ya exista el input.
  useEffect(() => {
    if (searchPinned) searchInputRef.current?.focus()
  }, [searchPinned])

  // ── "¿Sí lo agregó?" (móvil) ──
  // En tablet ves el carrito crecer al tocar un producto; en celular solo
  // cambia un numerito en la barra de abajo. Ese silencio provoca dobles
  // toques. Se detecta la línea nueva (o la cantidad que subió) comparando
  // con el carrito anterior y la barra lo dice con nombre, precio y una
  // vibración corta. Con la hoja abierta no hace falta: el carrito se ve.
  const [lastAdded, setLastAdded] = useState<{ label: string; price: number; key: number } | null>(null)
  const prevLinesRef = useRef<CartLine[]>(lines)

  // ── Vuelo al carrito ──
  // Un punto sale de la tarjeta tocada y aterriza en el carrito: barra
  // inferior en celular, panel en tablet/escritorio. El origen se apunta en el
  // onClick de la tarjeta/chip — si el producto abre modificadores, el punto
  // vuela al confirmar DESDE esa tarjeta, que es lo que el ojo espera. Las
  // altas que no nacen de un toque en el menú (repetir venta, duplicar línea,
  // retomar pedido) no vuelan: ahí el carrito ya está a la vista.
  const reducedMotion = useReducedMotion()
  const flyOriginRef = useRef<{ x: number; y: number } | null>(null)
  const flightSeq = useRef(0)
  const [flights, setFlights] = useState<
    { id: number; from: { x: number; y: number }; to: { x: number; y: number }; kind: "main" | "trail"; delay: number; duration: number }[]
  >([])
  // Aterrizajes: el anillo que se expande y el «+1» que rebota donde cayó el
  // punto. Los dispara SOLO el punto principal — la estela aterriza muda.
  const [landings, setLandings] = useState<{ id: number; x: number; y: number }[]>([])
  const [cartPulse, setCartPulse] = useState(0)
  const barDip = useAnimationControls()
  const barTargetRef = useRef<HTMLButtonElement>(null)
  const bagTargetRef = useRef<HTMLSpanElement>(null)
  const markFlyOrigin = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    flyOriginRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  useEffect(() => {
    const prev = prevLinesRef.current
    prevLinesRef.current = lines
    let added: CartLine | null = null
    for (const line of lines) {
      const before = prev.find((x) => x.lineId === line.lineId)
      if (!before || line.quantity > before.quantity) {
        added = line
        break
      }
    }
    // El origen se consume aunque no haya alta (p. ej. abrió el picker y no
    // eligió): así no vuela después desde una tarjeta que ya nadie tocó.
    const origin = flyOriginRef.current
    flyOriginRef.current = null
    if (!added) return
    if (origin && !reducedMotion) {
      const targetEl = isMobile ? barTargetRef.current : bagTargetRef.current
      if (targetEl) {
        const r = targetEl.getBoundingClientRect()
        const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        // Principal + dos rezagados (la estela): más chicos, translúcidos y
        // con salida escalonada, como en la demo que eligió el usuario.
        setFlights((cur) => [
          ...cur,
          { id: ++flightSeq.current, from: origin, to, kind: "main", delay: 0, duration: 0.48 },
          { id: ++flightSeq.current, from: origin, to, kind: "trail", delay: 0.09, duration: 0.42 },
          { id: ++flightSeq.current, from: origin, to, kind: "trail", delay: 0.16, duration: 0.36 },
        ])
      }
    }
    if (!isMobile || cartOpen) return
    vibra(15)
    setLastAdded({
      label: added.size ? `${added.product.name} · ${added.size.label}` : added.product.name,
      price: getLinePrice(added),
      key: Date.now(),
    })
  }, [lines, isMobile, cartOpen, reducedMotion])
  useEffect(() => {
    if (!lastAdded) return
    const t = setTimeout(() => setLastAdded(null), 1800)
    return () => clearTimeout(t)
  }, [lastAdded])

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
  // «Para llevar» activo = el ticket lleva el cargo del negocio. La bandera
  // sale del MISMO predicado que pinta el chip; el monto real lo pone el
  // servidor con sus ajustes — esto es solo el espejo en pantalla.
  const esParaLlevar = ticketNotes === "Para llevar" || ticketNotes.startsWith("Para llevar · ")
  const takeoutCharge = esParaLlevar && lines.length > 0 ? takeoutFee : 0
  const total = Math.round((subtotal - discountAmount + takeoutCharge) * 100) / 100
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

  /** Estado actual del carrito, tal como lo persiste el hook. */
  const cartStateNow = useCallback(
    () => ({ saleRef, paymentMethod, ticketNotes, cashReceivedInput, discount, lines }),
    [saleRef, paymentMethod, ticketNotes, cashReceivedInput, discount, lines],
  )

  const parkCurrent = useCallback(
    (name: string) => {
      if (lines.length === 0) return
      if (!parked.park(cartStateNow(), name)) {
        toast.error(`Ya hay ${parked.orders.length} pedidos en espera; cobra o descarta alguno.`)
        return
      }
      clearTip()
      clearCart()
      vibra(12)
      toast.success(`Pedido «${name}» guardado.`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines.length, parked, cartStateNow, clearCart],
  )

  /**
   * Retoma un pedido. Si hay algo en el carrito se guarda solo antes: con
   * prisa nadie debe poder tirar una venta a medias por contestar mal un
   * "¿seguro?".
   */
  const resumeParked = useCallback(
    (order: ParkedOrder) => {
      const estado = rehydrateCart(order.cart, products, Date.now())
      if (!estado || estado.lines.length === 0) {
        toast.error("Ese pedido ya no se puede retomar; el menú cambió o caducó.")
        return
      }
      if (lines.length > 0) {
        const auto = autoName(new Date())
        if (!parked.park(cartStateNow(), auto)) {
          toast.error("La bandeja está llena: cobra o descarta un pedido antes de cambiar.")
          return
        }
        toast.info(`Tu pedido en curso se guardó como «${auto}».`)
      }
      parked.remove(order.id)
      restoreLines(estado.lines)
      setTicketNotes(estado.ticketNotes)
      clearTip()
      setShowTray(false)
      vibra(12)
      if (estado.lines.length < order.cart.lines.length) {
        toast.info("Se retomó, pero algún artículo ya no está en el menú.")
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, lines.length, parked, cartStateNow, restoreLines, setTicketNotes],
  )

  const clearTip = useCallback(() => {
    setTipChoice(0)
    setTipCustomInput("")
  }, [])

  // Efectivo recibido / cambio (solo aplica al pago en efectivo)
  const cashReceived = paymentMethod === "efectivo" ? parseCash(cashReceivedInput) : null
  const changeDue = cashReceived !== null ? cashReceived - due : null
  const cashInsufficient = cashReceived !== null && cashReceived < due
  // Lo plegado nunca queda invisible: si hay nota o descuento, el propio
  // botón de "Más opciones" lo dice.
  const extrasResumen = [
    ticketNotes.trim() || null,
    discount
      ? `Descuento ${discount.type === "percent" ? `${discount.value}%` : formatCurrency(discount.value)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

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
        loyaltyCustomerId: loyaltyCustomer?.id,
        loyaltyRedeem: loyaltyRedeem || undefined,
        takeout: esParaLlevar || undefined,
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
          takeoutFee: result.takeoutFee,
          tip: result.tip,
          paymentMethod,
          date: new Date(),
          notes: ticketNotes.trim() || undefined,
          cashReceived: result.cashReceived,
          changeDue: result.changeDue,
          loyalty: result.loyalty
            ? { stamps: result.loyalty.stamps, target: result.loyalty.target, redeemed: result.loyalty.redeemed }
            : null,
        })
        if (result.loyalty) {
          const quien = result.loyalty.name || formatPhone(result.loyalty.phone)
          if (result.loyalty.redeemed) {
            toast.success(`Premio canjeado 🎁 ${quien} vuelve a empezar (0 de ${result.loyalty.target}).`)
          } else if (result.loyalty.stamps >= result.loyalty.target) {
            toast.success(`Sello ${result.loyalty.stamps}/${result.loyalty.target} para ${quien} — ¡ya tiene premio!`)
          } else {
            toast.success(`Sello ${result.loyalty.stamps} de ${result.loyalty.target} para ${quien}.`)
          }
        }
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
        setLoyaltyCustomer(null)
        setLoyaltyRedeem(false)
        resetAfterSale()
        setCartOpen(false)
      } else {
        toast.error(result.error || "Error al registrar la venta")
      }
    } catch {
      // No llegó al servidor: en vez de dejar al cajero con la fila parada,
      // la venta se guarda en la cola con SU MISMO clientRef y se sube sola
      // al volver la señal. La idempotencia de create_ticket hace que
      // reenviarla sea inofensivo aunque en realidad sí hubiera entrado.
      const provisional = cola.encolar({
        clientRef: saleRef,
        capturedAt: Date.now(),
        items: lines.map((line) => ({
          variant_id: getLineVariantId(line) ?? "",
          quantity: line.quantity,
          notes: line.notes.trim() || undefined,
          modifiers: line.modifiers.length > 0 ? line.modifiers.map((m) => m.id) : undefined,
        })),
        paymentMethod,
        notes: ticketNotes.trim() || undefined,
        tip: tipAmount > 0 ? tipAmount : undefined,
        discount: discount ?? undefined,
        cashReceived: cashReceived ?? undefined,
        takeout: esParaLlevar || undefined,
        loyaltyCustomerId: loyaltyCustomer?.id,
        // El total de la VENTA, sin propina: es lo que el servidor
        // recalcula y devuelve como `total`. Comparar contra `due` marcaba
        // como «cambió un precio» cualquier venta con propina.
        chargedTotal: total,
        lines: serializeLines(lines, getLinePrice, getLineLabel),
      })
      if (provisional) {
        toast.success(`Venta guardada sin conexión · ${provisional}. Se subirá sola al volver el internet.`)
        vibra(30)
        clearTip()
        setLoyaltyCustomer(null)
        setLoyaltyRedeem(false)
        resetAfterSale()
        setCartOpen(false)
      } else {
        toast.error(
          `Ya hay ${QUEUE_MAX} ventas esperando internet. Recupera la señal antes de seguir cobrando.`,
        )
      }
    } finally {
      setIsProcessing(false)
    }
  }, [canCharge, saleRef, businessId, paymentMethod, ticketNotes, esParaLlevar, cashReceived, tipAmount, discount, total, lines, lastSaleKey, clearTip, resetAfterSale, loyaltyCustomer, loyaltyRedeem, cola])

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
    showTender ||
    showLoyalty ||
    showRedeem ||
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
        {/* Se envuelve a propósito: el tamaño de letra escala TODO en rem
            (la X de 2.5rem llega a 50px) y este renglón deja de caber en un
            celular. Mejor dos renglones que una X fuera de la pantalla. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {/* key=cartPulse: al aterrizar un vuelo se remonta y rebota */}
            <motion.span
              key={cartPulse}
              ref={bagTargetRef}
              initial={{ scale: cartPulse ? 1.35 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="inline-flex"
            >
              <ShoppingBag className="h-5 w-5 text-amber-700" />
            </motion.span>
            <h2 className="truncate text-lg font-bold text-stone-800">Venta Actual</h2>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {parkedEnabled && (parked.orders.length > 0 || lines.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-stone-500 hover:bg-amber-50 hover:text-amber-700"
                onClick={() => (lines.length > 0 ? setShowPark(true) : setShowTray(true))}
                title={lines.length > 0 ? "Guardar este pedido para retomarlo después" : "Ver pedidos en espera"}
                aria-label={lines.length > 0 ? "Guardar pedido" : "Pedidos en espera"}
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{lines.length > 0 ? "Guardar" : "En espera"}</span>
              </Button>
            )}
            {parkedEnabled && parked.orders.length > 0 && (
              <button
                type="button"
                onClick={() => setShowTray(true)}
                title="Pedidos en espera"
                className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white hover:bg-amber-700"
              >
                {parked.orders.length}
              </button>
            )}
            {lines.length > 0 && (
              <>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                  {itemCount}
                  <span className="hidden md:inline">&nbsp;items</span>
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-stone-400 hover:text-red-600 hover:bg-red-50 gap-1"
                  onClick={() => setConfirmClear(true)}
                  title="Vaciar carrito (Ctrl+⌫)"
                  aria-label="Vaciar carrito"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Vaciar</span>
                </Button>
              </>
            )}
            {isMobile && (
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
                onClick={() => setCartOpen(false)}
                aria-label="Cerrar carrito"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
        {/* Tarjeta de sellos de esta venta (solo con el módulo encendido) */}
        {loyaltyEnabled && (
          <div className="mt-2">
            {loyaltyCustomer === null ? (
              <button
                type="button"
                onClick={() => setShowLoyalty(true)}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-stone-300 px-3 py-1 text-xs font-medium text-stone-500 hover:border-amber-400 hover:text-amber-700"
              >
                <Stamp className="h-3.5 w-3.5" />
                Tarjeta de sellos
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    loyaltyRedeem
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-amber-300 bg-amber-50 text-amber-800"
                  }`}
                >
                  <Stamp className="h-3.5 w-3.5" />
                  {loyaltyCustomer.name || formatPhone(loyaltyCustomer.phone)} ·{" "}
                  {loyaltyRedeem
                    ? "canjeando premio"
                    : `${loyaltyCustomer.stamps}/${loyaltyTarget}`}
                  <button
                    type="button"
                    aria-label="Quitar la tarjeta de esta venta"
                    onClick={() => {
                      setLoyaltyCustomer(null)
                      if (loyaltyRedeem) {
                        setLoyaltyRedeem(false)
                        setDiscount(null)
                      }
                    }}
                    className="-mr-1 rounded-full p-0.5 hover:bg-black/10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
                {!loyaltyRedeem && loyaltyCustomer.stamps >= loyaltyTarget && lines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRedeem(true)}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <Gift className="h-3.5 w-3.5" />
                    Canjear premio
                  </button>
                )}
                {loyaltyRedeem && (
                  <button
                    type="button"
                    onClick={() => {
                      setLoyaltyRedeem(false)
                      setDiscount(null)
                    }}
                    className="text-xs font-medium text-stone-400 underline underline-offset-2 hover:text-stone-600"
                  >
                    quitar canje
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Cart items */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-4">
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
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative border-b border-stone-100"
                >
                  {/* Debajo de la tarjeta viven las pistas del gesto: al
                      arrastrar a la derecha asoma «Duplicar», a la izquierda
                      «Quitar». En reposo la tarjeta (fondo blanco sólido) las
                      tapa por completo. */}
                  <div aria-hidden className="absolute inset-0 flex items-center justify-between rounded-lg bg-stone-100 px-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <Copy className="h-4 w-4" />
                      Duplicar
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-600">
                      Quitar
                      <Trash2 className="h-4 w-4" />
                    </span>
                  </div>
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.9}
                    onDragStart={() => {
                      if (gestoRef.current) gestoRef.current.arrastre = true
                      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
                    }}
                    onDragEnd={(_, info) => {
                      // info.offset trae el desplazamiento del PUNTERO, no el
                      // de la tarjeta (que el elástico recorta) — es el gesto
                      // real de la mano.
                      if (info.offset.x > UMBRAL_GESTO) {
                        duplicateLine(line.lineId)
                        vibra(12)
                      } else if (info.offset.x < -UMBRAL_GESTO) {
                        removeLine(line.lineId)
                        vibra(20)
                      }
                    }}
                    onPointerDown={(e) => {
                      if (!gestoEnTarjeta(e)) return
                      gestoRef.current = { x: e.clientX, y: e.clientY, lineId: line.lineId, downAt: Date.now(), largo: false, arrastre: false }
                      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
                      pressTimerRef.current = setTimeout(() => {
                        const g = gestoRef.current
                        if (!g || g.lineId !== line.lineId || g.arrastre) return
                        // Solo marcar y vibrar: el editor se abre AL SOLTAR.
                        // Abrirlo aquí, con el dedo abajo, moría al instante:
                        // al soltar, el navegador dispara mousedown/click de
                        // compatibilidad DESPUÉS del pointerup, ese mousedown
                        // cae fuera del campo recién enfocado y su onBlur lo
                        // cierra. Además el teclado del teléfono solo se abre
                        // de forma confiable dentro de un gesto del usuario.
                        g.largo = true
                        vibra(20)
                      }, PRESION_LARGA_MS)
                    }}
                    onPointerMove={(e) => {
                      const g = gestoRef.current
                      if (!g) return
                      // Moverse cancela la presión larga: ya es scroll o arrastre.
                      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10 && pressTimerRef.current) {
                        clearTimeout(pressTimerRef.current)
                      }
                    }}
                    onPointerUp={() => {
                      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
                      const g = gestoRef.current
                      if (g && g.largo && !g.arrastre && g.lineId === line.lineId) {
                        gestoRef.current = null
                        setTimeout(() => setEditingNoteFor(line.lineId), 60)
                      }
                    }}
                    onPointerCancel={() => {
                      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
                    }}
                    onClick={(e) => {
                      if (!gestoEnTarjeta(e)) return
                      const g = gestoRef.current
                      gestoRef.current = null
                      if (!g) return
                      // El arrastre y la presión larga ya decidieron lo suyo.
                      if (g.arrastre || g.largo) return
                      // Un toque limpio es CORTO. Si el "gesto" tiene más de
                      // 700 ms es un residuo (un scroll sin click, o el click
                      // fantasma que suelta el navegador al cerrar el menú ⋯
                      // sobre la tarjeta) — cobrarlo abría el detalle sin que
                      // nadie lo pidiera.
                      if (Date.now() - g.downAt > 700) return
                      setInfoLine(line)
                    }}
                    // Sin el menú contextual del navegador: en Android la
                    // presión larga lo dispara y se tragaría nuestro click.
                    onContextMenu={(e) => e.preventDefault()}
                    animate={{ backgroundColor: line.isNew ? "rgba(251,191,36,0.12)" : "#ffffff" }}
                    className="relative cursor-pointer select-none rounded-lg px-1.5 py-2"
                  >
                  <div className="flex items-center justify-between gap-[8px]">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-800 text-sm truncate">{line.product.name}</p>
                      {/* min-w-0: sin esto, precio + tamaño fijaban un ancho
                          mínimo que la columna del nombre no podía bajar, y con
                          la letra en Muy grande la fila entera se salía de la
                          pantalla llevándose el menú de la línea. */}
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 text-xs text-stone-400">{formatCurrency(getLinePrice(line))}</span>
                        {line.size && (
                          <Badge
                            variant="outline"
                            className="h-4 min-w-0 truncate border-stone-300 px-1.5 py-0 text-[10px] text-stone-500"
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

                    {/* Cantidad. Medidas en PÍXELES a propósito, no en rem:
                        un dedo mide lo mismo con la letra en Normal que en Muy
                        grande. Dejarlos escalar los llevaba a 50 px cada uno y
                        el ancho mínimo de la fila superaba la pantalla —y el
                        visor de la lista se ensancha al mínimo de su contenido,
                        así que el menú de la línea terminaba fuera.
                        Sin gap: los botones abrazan al número —el
                        aire entre ellos costaba 8 px por línea y no ayudaba a
                        distinguirlos, que para eso son redondos. Siguen siendo
                        de 40 px táctiles en celular. */}
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-[40px] w-[40px] shrink-0 rounded-full border-stone-300 text-stone-500 md:h-[32px] md:w-[32px]"
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
                          className="h-8 w-[38px] shrink-0 rounded-md border border-amber-300 bg-white text-center text-sm font-bold text-stone-800"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingQtyFor(line.lineId)}
                          title="Teclear la cantidad"
                          className="w-[28px] shrink-0 rounded text-center text-sm font-bold text-stone-700 hover:bg-stone-100"
                        >
                          {line.quantity}
                        </button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-[40px] w-[40px] shrink-0 rounded-full border-stone-300 text-stone-500 md:h-[32px] md:w-[32px]"
                        onClick={() => updateQuantity(line.lineId, 1)}
                        aria-label="Agregar uno"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <span className="min-w-[52px] shrink-0 text-right text-sm font-bold text-stone-800">
                      {formatCurrency(getLinePrice(line) * line.quantity)}
                    </span>

                    {/* Duplicar, nota y quitar en UN menú. Como tres iconos
                        reservaban 120 px fijos por línea, la fila medía 416 px
                        dentro de una pantalla de 390 y los últimos quedaban
                        cortados —también en el panel de 304 px de una tablet—.
                        Aquí no se pierde nada: el menú los nombra con palabras,
                        que se leen mejor que tres iconos grises. Quitar sigue
                        estando a un toque por otro lado: «−» en cantidad 1
                        borra la línea. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-[40px] w-[40px] shrink-0 md:h-[32px] md:w-[32px] ${
                            line.notes ? "text-amber-600" : "text-stone-400"
                          } hover:text-amber-700 hover:bg-amber-50`}
                          aria-label={`Opciones de ${line.product.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52"
                        onCloseAutoFocus={(e) => {
                          if (notaDesdeMenuRef.current) {
                            notaDesdeMenuRef.current = false
                            e.preventDefault()
                          }
                        }}
                      >
                        <DropdownMenuItem
                          onSelect={() => {
                            duplicateLine(line.lineId)
                            vibra(12)
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar (otro igual)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            notaDesdeMenuRef.current = true
                            // Igual que la presión larga: el campo se monta
                            // DESPUÉS de que el menú cierre y pasen los
                            // eventos fantasma — así el autoFocus sobrevive
                            // y el teléfono sube el teclado.
                            setTimeout(() => setEditingNoteFor(line.lineId), 60)
                          }}
                        >
                          <StickyNote className="mr-2 h-4 w-4" />
                          {line.notes ? "Cambiar la nota" : "Nota para este artículo"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => removeLine(line.lineId)}
                          className="text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Quitar del carrito
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Nota por artículo */}
                  {editingNoteFor === line.lineId && (
                    /* dentro de la tarjeta arrastrable, para moverse con ella */
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
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {/* Checkout */}
      {/* Bloque de cobro. En una tablet horizontal (768 px de alto) esto medía
          555 px y, siendo shrink-0, aplastaba la lista de artículos a 125 px: el
          cajero no alcanzaba a ver lo que estaba cobrando. Se topa en 46% del
          panel (52% en celular, donde el usuario pidió darle un poco más de
          aire al cobro a costa de la lista); los controles ceden y se
          desplazan, y el total con el botón de cobro nunca se mueven — son lo
          único que no se puede perder de vista. */}
      <div className="flex max-h-[52%] md:max-h-[46%] shrink-0 flex-col border-t border-stone-200 bg-stone-50/80">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-0">
          {/* Orden por frecuencia de uso, no por lógica de formulario: el
              espacio visible sin desplazar es corto en una tablet acostada,
              así que arriba va lo de cada venta (método y efectivo) y abajo
              lo ocasional (propina, para llevar, nota). */}
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
              <button
                type="button"
                onClick={() => setShowTender(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-green-200 bg-white py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"
              >
                <Calculator className="h-3.5 w-3.5" />
                Teclado y montos rápidos
              </button>
            </div>
          )}
          {/* Propina: se cobra encima del total y no cuenta como venta */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Solo el icono cuando el carrito es angosto: con la palabra
                completa la fila se partía en dos y costaba 32 px de alto. */}
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-stone-500">
              <HandCoins className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Propina</span>
              <span className="sr-only xl:hidden">Propina</span>
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
          {/* Plegable con lo ocasional. El botón dice qué trae cuando está
              cerrado, para que nada quede escondido sin avisar. */}
          <button
            type="button"
            onClick={toggleMore}
            aria-expanded={moreOpen}
            className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-500 transition-colors hover:border-amber-400 hover:text-amber-700"
          >
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            <span className="shrink-0">Más opciones</span>
            {!moreOpen && extrasResumen && (
              <span className="ml-auto min-w-0 truncate font-medium text-amber-700">{extrasResumen}</span>
            )}
          </button>
          {moreOpen && (
          <>
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
                  {qn === "Para llevar" && takeoutFee > 0 ? `${qn} +${formatCurrency(takeoutFee)}` : qn}
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
          {/* El descuento se muda aquí: el CONTROL es ocasional. Su efecto en
              el dinero sigue siempre a la vista, abajo en los totales. */}
          <button
            type="button"
            onClick={() => {
              if (loyaltyRedeem) toast.info("Quita el canje del premio para cambiar el descuento.")
              else setShowDiscount(true)
            }}
            disabled={lines.length === 0}
            className={`inline-flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
              discount
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-stone-200 bg-white text-stone-500 hover:border-amber-300 hover:text-amber-700"
            }`}
          >
            <Percent className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              {discount
                ? `Descuento ${discount.type === "percent" ? `${discount.value}%` : formatCurrency(discount.value)} · ${discount.reason}`
                : "Agregar descuento"}
            </span>
            <Kbd className="ml-auto shrink-0">D</Kbd>
          </button>
          </>
          )}
        </div>
        <div className="shrink-0 space-y-3 p-4 pt-3">
          {/* Subtotal / descuento / total */}
          <div className="space-y-1">
            {(discount || subtotal > 0) && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Subtotal</span>
                <span className="text-stone-600">{formatCurrency(subtotal)}</span>
              </div>
            )}
            {takeoutCharge > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-500">Para llevar</span>
                <span className="text-stone-700">+{formatCurrency(takeoutCharge)}</span>
              </div>
            )}
            {/* Solo de lectura: el botón para PONER descuento vive en "Más
                opciones", pero el descuento aplicado nunca se pliega — es
                dinero que ya se le quitó al total. */}
            {discount && (
              <div className="flex justify-between items-center gap-2 text-sm">
                <span className="min-w-0 truncate text-amber-700">
                  Descuento {discount.type === "percent" ? `${discount.value}%` : formatCurrency(discount.value)} ·{" "}
                  {discount.reason}
                </span>
                <span className={discountInvalid ? "shrink-0 text-red-600 font-medium" : "shrink-0 text-amber-700"}>
                  {discountInvalid ? "Mayor al subtotal" : `-${formatCurrency(discountAmount)}`}
                </span>
              </div>
            )}
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
    </div>
  )

  /* Chip de estado de caja (compartido entre escritorio y móvil) */
  const headerCompact = isMobile && gridScrolled && !searchQuery && !searchPinned

  const cashChip = (compact: boolean) => (
    <Button
      variant="outline"
      size={compact ? "sm" : "default"}
      onClick={() => setShowCashDialog(true)}
      className={`backdrop-blur gap-1.5 font-semibold ${
        openSession
          ? cajaDeOtroDia
            ? "bg-amber-50/90 border-amber-400 text-amber-800 hover:bg-amber-100"
            : "bg-green-50/90 border-green-300 text-green-700 hover:bg-green-100"
          : "bg-red-50/90 border-red-300 text-red-700 hover:bg-red-100"
      }`}
      title={openSession ? "Cerrar caja (corte) · movimientos de efectivo" : "Abrir caja"}
    >
      {openSession ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      {compact
        ? openSession
          ? cajaDeOtroDia
            ? "Caja de otro día"
            : "Caja"
          : "Cerrada"
        : openSession
        ? cajaDeOtroDia
          ? `Caja abierta desde ${formatDate(openSession.openedAt)}`
          : `Caja abierta · ${formatTime(openSession.openedAt)}`
        : "Caja cerrada"}
      {!compact && <Kbd>K</Kbd>}
    </Button>
  )

  return (
    <div className="flex h-[100dvh] flex-col bg-stone-50 overflow-hidden">
      {/* Aviso de fin de prueba: arriba de todo, para que nadie lo descubra con la caja abierta. */}
      <TrialBanner trialEndsAt={appCtx.business?.trialEndsAt ?? null} />
      {/* Ventas por subir: arriba de todo y sin forma de descartarlo — una
          cola olvidada es dinero cobrado que no está registrado. */}
      <QueueBanner
        state={cola.state}
        pendientes={cola.pendientes}
        porRevisar={cola.porRevisar}
        subiendo={cola.subiendo}
        onSubir={() => void cola.subir()}
        onRevisar={() => setShowQueueReview(true)}
        onCerrarDiferencias={cola.limpiarDiferencias}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <OfflineBanner />
      <PosLockScreen
        lockMinutes={lockMinutes}
        initialHasPin={hasPin}
        businessName={businessName}
        userName={appCtx.fullName || "quien está en caja"}
      />
      {/* ───── LEFT PANEL (Products) ───── */}
      <div className={`flex flex-col h-full ${isMobile ? "w-full" : "flex-1 min-w-0 border-r border-stone-200"}`}>
        {/* Header */}
        <header className="shrink-0 px-4 md:px-5 pt-3 md:pt-4 pb-3 bg-white border-b border-stone-200 shadow-sm">
          {/* Se envuelve a propósito: con la letra en Muy grande no caben en un
              renglón, y sin wrap el nombre del negocio se aplastaba a 0 px y las
              acciones se salían. Preferible un encabezado más alto —que es lo
              que pidió quien subió la letra— a contenido invisible. */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
            <div className="flex min-w-[7rem] max-w-[14rem] items-center gap-2">
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
            {/* El buscador vive en este renglón y no en uno propio: en una tablet
                acostada sobra ancho y falta alto, y su renglón se llevaba 48 px
                que valen una fila entera de productos. */}
            {!isMobile && (
              <div className="relative min-w-[7rem] max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <Input
                  ref={searchInputRef}
                  placeholder="Buscar producto…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSizePickerFor(null)
                  }}
                  className="h-9 border-stone-200 bg-stone-50 pl-9 pr-10 text-sm"
                />
                <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
                  {searchQuery ? (
                    <button
                      onClick={() => {
                        setSearchQuery("")
                        searchInputRef.current?.focus()
                      }}
                      className="p-1 text-stone-400 hover:text-stone-600"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <Kbd className="text-stone-400">/</Kbd>
                  )}
                </div>
              </div>
            )}
            {/* Un solo grupo de acciones, DENTRO del encabezado. Antes flotaba
                encima con position:absolute y tapaba el nombre del negocio y el
                total del día. Solo queda a la vista lo que se consulta de un
                vistazo (el estado de la caja); el resto vive en el menú. */}
            <div className="flex shrink-0 items-center gap-1.5">
              {!isMobile && (
                <div className="hidden items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 xl:flex">
                  <span className="text-sm font-medium text-amber-800">Hoy</span>
                  <span className="text-lg font-bold text-amber-800">{formatCurrency(totalSales)}</span>
                </div>
              )}
              {headerCompact && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Buscar producto"
                  onClick={() => setSearchPinned(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
              <span className="lg:hidden">{cashChip(true)}</span>
              <span className="hidden lg:inline-flex">{cashChip(false)}</span>
              {isMobile && (
                <BusinessSwitcher
                  memberships={appCtx.memberships}
                  activeId={appCtx.business?.id ?? null}
                  variant="compact"
                />
              )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Menú">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {parkedEnabled && parked.orders.length > 0 && (
                      <DropdownMenuItem onSelect={() => setShowTray(true)}>
                        <PauseCircle className="h-4 w-4 mr-2" />
                        Pedidos en espera ({parked.orders.length})
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setShowTickets(true)}>
                      <Receipt className="h-4 w-4 mr-2" /> Tickets del día
                    </DropdownMenuItem>
                    {/* No es un DropdownMenuItem a propósito: ajustar la letra
                        suele ser probar un tamaño y luego otro, y un Item
                        cerraría el menú en cada toque. */}
                    <div className="px-2 py-1.5">
                      <p className="mb-1.5 flex items-center gap-2 text-sm text-stone-600">
                        <AArrowUp className="h-4 w-4" /> Tamaño de letra
                      </p>
                      <TextSizeControl size={textSize.size} setSize={textSize.setSize} block />
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowShortcuts(true)}>
                      <Keyboard className="h-4 w-4 mr-2" /> Atajos de teclado
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
          </div>
          {isMobile && !headerCompact && (
            <p className="text-xs text-amber-800 mt-1">
              Vendido hoy: <span className="font-bold">{formatCurrency(totalSales)}</span>
            </p>
          )}
          {/* Buscador (móvil): en su propio renglón; colapsado, lo reabre la lupa */}
          {isMobile && !headerCompact && (
            <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              ref={searchInputRef}
              placeholder="Buscar producto…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSizePickerFor(null)
              }}
              onBlur={() => {
                if (!searchQuery) setSearchPinned(false)
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
          )}

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
        <ScrollArea ref={gridScrollRef} className="flex-1 min-h-0">
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
                      onClick={(e) => {
                        markFlyOrigin(e)
                        chooseProduct(product, size)
                      }}
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
                {/* Columnas por el ancho REAL del panel, no por el de la ventana.
                    El mínimo es 9rem tras medirlo: a 7rem entraban 5 columnas en
                    la tablet pero NO se veía ni un producto más (los títulos de
                    categoría mandan) y se cortaban 9 nombres en vez de 2. En
                    pantallas grandes sí caben 6 columnas, donde antes el
                    grid-cols-4 fijo desperdiciaba el ancho. */}
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))]">
                  {items.map((product) => {
                    const accent = colorClasses(categoryColor[product.category])?.accent
                    return (
                      <div key={product.id} className="relative">
                        {/* La "i" va FUERA del botón del producto —un botón
                            dentro de otro no es HTML válido— y encima de él con
                            z-10, así que tocarla no agrega el producto. */}
                        {product.description && (
                          <button
                            type="button"
                            onClick={() => setInfoProduct(product)}
                            aria-label={`Qué lleva ${product.name}`}
                            title={`Qué lleva ${product.name}`}
                            className="absolute right-0 top-0 z-10 rounded-full p-2 text-stone-300 transition-colors hover:bg-amber-50 hover:text-amber-700"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        )}
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            markFlyOrigin(e)
                            handleProductClick(product)
                          }}
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
                            <p
                              className={`text-sm font-semibold leading-tight text-stone-800 line-clamp-2 ${
                                product.description ? "pr-5" : ""
                              }`}
                            >
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
                                    onClick={(e) => {
                                      markFlyOrigin(e)
                                      chooseProduct(product, size)
                                    }}
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
      {/* Ancho fijo, no un porcentaje: los renglones del carrito («Latte ·
          Grande · $58») no crecen con la pantalla, así que el 40% le sobraba
          espacio al carrito y se lo quitaba a los productos. A 1024 px esto le
          devuelve 58 px a la rejilla. Escalonado porque el corte de «móvil» está
          en 768: una tablet EN VERTICAL usa este mismo diseño y ahí 352 px de
          carrito le dejarían 416 a los productos. */}
      {!isMobile && <div className="h-full w-[19rem] shrink-0 lg:w-[22rem] xl:w-[25rem]">{cartPanel}</div>}

      {/* ───── Barra inferior + hoja del carrito — móvil ───── */}
      {isMobile && (
        <>
          <motion.div
            animate={barDip}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          >
            {lines.length === 0 ? (
              <Button
                className="w-full h-12 rounded-xl text-base font-bold justify-between px-4 bg-stone-100 text-stone-500 hover:bg-stone-200"
                onClick={() => setCartOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Carrito vacío
                </span>
                <ChevronUp className="h-4 w-4 opacity-70" />
              </Button>
            ) : (
              /* Con artículos, la barra se parte: ver el carrito a la
                 izquierda, Cobrar directo a la derecha. La venta común es "2
                 cosas y ya" — abrir la hoja solo para tocar Cobrar era un
                 viaje de más. Mismo finalizeSale y mismo color por método que
                 el botón de la hoja: verde efectivo, violeta transferencia. */
              <div className="flex gap-2">
                <Button
                  ref={barTargetRef}
                  className="h-12 flex-1 min-w-0 rounded-xl border border-stone-200 bg-white text-base font-bold text-stone-800 hover:bg-stone-50 justify-between px-4"
                  onClick={() => setCartOpen(true)}
                >
                  {lastAdded ? (
                    <span key={lastAdded.key} className="flex min-w-0 items-center gap-1.5 text-amber-700">
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">{lastAdded.label}</span>
                      <span className="shrink-0 text-sm">{formatCurrency(lastAdded.price)}</span>
                    </span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">
                      <ShoppingBag className="h-5 w-5 shrink-0" />
                      <span className="truncate">
                        {itemCount} artículo{itemCount === 1 ? "" : "s"} · {formatCurrency(total)}
                      </span>
                    </span>
                  )}
                  <ChevronUp className="h-4 w-4 shrink-0 opacity-70" />
                </Button>
                {openSession ? (
                  <Button
                    className={`h-12 shrink-0 rounded-xl px-4 text-base font-bold text-white ${
                      paymentMethod === "efectivo"
                        ? "bg-green-600 hover:bg-green-700"
                        : paymentMethod === "transferencia"
                        ? "bg-violet-600 hover:bg-violet-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                    disabled={!canCharge}
                    onClick={finalizeSale}
                    title={`Cobrar · ${paymentLabel(paymentMethod)}`}
                  >
                    {isProcessing ? "Procesando…" : `Cobrar ${formatCurrency(due)}`}
                  </Button>
                ) : (
                  <Button
                    className="h-12 shrink-0 gap-1.5 rounded-xl bg-red-600 px-4 text-base font-bold text-white hover:bg-red-700"
                    onClick={() => setShowCashDialog(true)}
                  >
                    <Lock className="h-4 w-4" />
                    Abrir caja
                  </Button>
                )}
              </div>
            )}
          </motion.div>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            {/* El hueco de arriba es deliberado y se decidió DOS veces: se
                probó a pantalla completa y el usuario lo regresó — la rendija
                es el escape universal (tocarla cierra el carrito, cortesía del
                overlay de Radix) que funciona aunque algún tamaño de letra
                descuadre la X. La X ámbar del encabezado se queda igual.
                5% y no 8%: lo justo para que se vea el POS atrás y haya dónde
                tocar (~42px en un celular de 844), sin regalar más carrito. */}
            <SheetContent side="bottom" className="h-[95dvh] p-0 flex flex-col rounded-t-2xl overflow-hidden [&>button]:hidden">
              <SheetTitle className="sr-only">Venta actual</SheetTitle>
              <div className="flex-1 min-h-0">{cartPanel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Puntos volando al carrito, en curva Bézier (offset-path) con el
          arco de tres cuadros como reserva para navegadores viejos. Sin
          AnimatePresence a propósito: el punto desaparece justo al llegar —
          "entró al carrito" — y así onAnimationComplete corre una sola vez
          (con exit correría dos y el aterrizaje se duplicaba). */}
      {flights.map((flight) => {
        const trail = flight.kind === "trail"
        // Control de la curva: 25% del camino en x y 90px por encima del
        // punto más alto — el mismo trazo que la demo aprobada.
        const cx = flight.from.x + (flight.to.x - flight.from.x) * 0.25
        const cy = Math.min(flight.from.y, flight.to.y) - 90
        const finish = () => {
          setFlights((cur) => cur.filter((x) => x.id !== flight.id))
          if (trail) return
          // Solo el principal aterriza: rebote de la bolsa (escritorio),
          // anillo + «+1», y el hundimiento de la barra (celular).
          setCartPulse((c) => c + 1)
          setLandings((cur) => [...cur, { id: ++flightSeq.current, x: flight.to.x, y: flight.to.y }])
          if (isMobile) {
            barDip.start({ y: [0, 3, 0], transition: { duration: 0.26, ease: "easeOut" } })
          }
        }
        const common = {
          "data-fly-dot": "",
          className: `pointer-events-none fixed left-0 top-0 z-[60] rounded-full bg-amber-600 shadow-md ${
            trail ? "h-[11px] w-[11px]" : "h-4 w-4"
          }`,
          transition: { duration: flight.duration, delay: flight.delay, ease: [0.5, 0.05, 0.75, 0.5] as const },
          onAnimationComplete: finish,
        }
        // La estela nace invisible: con delay de framer el elemento ya existe
        // en el DOM, y sin esto se verían tres puntos apilados en el origen.
        return FLIGHT_PATH_SUPPORTED ? (
          <motion.span
            key={flight.id}
            {...common}
            // offset-anchor por defecto centra la caja sobre el trazo: sin
            // márgenes ni translate, o quedaría corrido media caja.
            style={{
              offsetPath: `path("M ${flight.from.x} ${flight.from.y} Q ${cx} ${cy} ${flight.to.x} ${flight.to.y}")`,
              offsetRotate: "0deg",
            }}
            initial={{ offsetDistance: "0%", scale: 1, opacity: trail ? 0 : 0.95 }}
            animate={{ offsetDistance: "100%", scale: 0.4, opacity: trail ? 0.35 : 0.9 }}
          />
        ) : (
          <motion.span
            key={flight.id}
            {...common}
            // Centrado con márgenes y no con translate de Tailwind: framer
            // escribe transform completo y pisaría esas clases.
            style={trail ? { marginLeft: -5.5, marginTop: -5.5 } : { marginLeft: -8, marginTop: -8 }}
            initial={{ x: flight.from.x, y: flight.from.y, scale: 1, opacity: trail ? 0 : 0.95 }}
            animate={{
              x: flight.to.x,
              y: [flight.from.y, Math.min(flight.from.y, flight.to.y) - 40, flight.to.y],
              scale: 0.4,
              opacity: trail ? 0.35 : 0.9,
            }}
          />
        )
      })}

      {/* Aterrizajes: anillo que se expande + «+1» que sube y se apaga. El
          par se retira cuando termina el «+1», que es el que dura más. */}
      {landings.map((landing) => (
        <span key={landing.id} className="pointer-events-none">
          <motion.span
            className="pointer-events-none fixed z-[60] h-11 w-11 rounded-full border-[3px] border-amber-600"
            style={{ left: landing.x - 22, top: landing.y - 22 }}
            initial={{ scale: 0.25, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.42, ease: "easeOut" }}
          />
          <motion.span
            className="pointer-events-none fixed z-[61] flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-700 px-1 text-[11px] font-bold text-white"
            style={{ left: landing.x - 10, top: landing.y - 40 }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.15, 1, 0.9], opacity: [0, 1, 1, 0], y: [0, 0, 0, -6] }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            onAnimationComplete={() => setLandings((cur) => cur.filter((x) => x.id !== landing.id))}
          >
            +1
          </motion.span>
        </span>
      ))}

      {/* ── Dialogs ── */}
      <QueueReviewDialog
        open={showQueueReview}
        onOpenChange={setShowQueueReview}
        state={cola.state}
        onQuitar={cola.quitar}
      />
      <CashSessionDialog
        open={showCashDialog}
        onOpenChange={setShowCashDialog}
        session={openSession}
        parkedCount={parkedEnabled ? parked.orders.length : 0}
        cardFeePct={cardFeePct}
        pendingUploads={cola.pendientes + cola.porRevisar}
      />
      <TicketHistoryDialog open={showTickets} onOpenChange={setShowTickets} isAdmin={isAdmin} />
      <ProductInfoDialog product={infoProduct} onClose={() => setInfoProduct(null)} />
      <CartLineDialog line={infoLine} onClose={() => setInfoLine(null)} />
      <LoyaltyDialog
        open={showLoyalty}
        onOpenChange={setShowLoyalty}
        target={loyaltyTarget}
        onAttach={(customer) => setLoyaltyCustomer(customer)}
      />
      <RedeemDialog
        open={showRedeem}
        onOpenChange={setShowRedeem}
        lines={lines}
        reward={loyaltyReward}
        onPick={(unitPrice) => {
          // El canje ocupa el lugar del descuento: monto fijo por UNA unidad,
          // con el motivo exacto que el servidor exige y revalida.
          setDiscount({ type: "amount", value: unitPrice, reason: "Premio de lealtad" })
          setLoyaltyRedeem(true)
        }}
      />
      <ShortcutsDialog
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
        textSize={textSize.size}
        setTextSize={textSize.setSize}
      />
      <CashTenderDialog
        open={showTender}
        onOpenChange={setShowTender}
        due={due}
        value={cashReceivedInput}
        onChange={setCashReceivedInput}
        suggestions={cashSuggestions(due)}
      />
      <ParkDialog
        open={showPark}
        onOpenChange={setShowPark}
        sugerido={autoName(new Date())}
        onPark={parkCurrent}
      />
      <ParkedTrayDialog
        open={showTray}
        onOpenChange={setShowTray}
        orders={parked.orders}
        products={products}
        cartHasLines={lines.length > 0}
        onResume={resumeParked}
        onRemove={parked.remove}
      />
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
        maxPercent={isAdmin ? 100 : discountMaxCashier}
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
    </div>
  )
}
