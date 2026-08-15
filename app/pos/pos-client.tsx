"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { formatCurrency, formatTime, paymentLabel, PAYMENT_METHODS, PAYMENT_METHOD_KEYS } from "@/lib/format"
import { buildTicketLines, printLines, type ReceiptData } from "@/lib/receipt"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { CashSessionDialog, type OpenSession } from "./cash-session-dialog"
import { TicketHistoryDialog } from "./ticket-history-dialog"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type PaymentMethod = "efectivo" | "transferencia" | "tarjeta_clip"

interface SizeOption {
  variantId: string
  label: string
  oz: string
  price: number
}

interface Product {
  id: string
  name: string
  price?: number
  variantId?: string
  sizes?: SizeOption[]
  category: string
  subcategory: string
  description?: string
}

interface CartItem {
  cartId: string
  product: Product
  size?: SizeOption
  quantity: number
  isNew?: boolean
}

interface Category {
  id: string
  label: string
}

interface CompletedSale {
  ticketId: string
  folio: number
  items: CartItem[]
  total: number
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
  initialTotalSales: number
  openSession: OpenSession | null
}

const CASH_QUICK_AMOUNTS = [50, 100, 200, 500]

function parseCash(value: string): number | null {
  const n = Number(value.replace(",", "."))
  return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getDisplayPrice(p: Product): string {
  if (p.price !== undefined) return `$${p.price}`
  if (p.sizes && p.sizes.length > 0) {
    const min = Math.min(...p.sizes.map((s) => s.price))
    const max = Math.max(...p.sizes.map((s) => s.price))
    return min === max ? `$${min}` : `$${min} - $${max}`
  }
  return ""
}

function getItemPrice(item: CartItem): number {
  return item.size ? item.size.price : item.product.price ?? 0
}

function getItemVariantId(item: CartItem): string | undefined {
  return item.size ? item.size.variantId : item.product.variantId
}

function getItemLabel(item: CartItem): string {
  return item.size
    ? `${item.product.name} (${item.size.label})`
    : item.product.name
}

/* ------------------------------------------------------------------ */
/*  Receipt / Ticket View                                              */
/* ------------------------------------------------------------------ */
function ReceiptView({
  sale,
  onClose,
}: {
  sale: CompletedSale
  onClose: () => void
}) {
  const paymentInfo = PAYMENT_METHODS[sale.paymentMethod]
  const PaymentIcon = paymentInfo.icon

  const handlePrint = () => {
    const receipt: ReceiptData = {
      folio: sale.folio,
      date: sale.date,
      paymentMethod: sale.paymentMethod,
      notes: sale.notes,
      items: sale.items.map((item) => ({
        label: getItemLabel(item),
        quantity: item.quantity,
        unitPrice: getItemPrice(item),
        lineTotal: getItemPrice(item) * item.quantity,
      })),
      total: sale.total,
      cashReceived: sale.cashReceived,
      changeDue: sale.changeDue,
    }
    if (!printLines(buildTicketLines(receipt), `Ticket ${sale.folio}`)) {
      toast.error("El navegador bloqueó la ventana de impresión. Puedes reimprimir desde «Tickets».")
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
          <span>
            {sale.date.toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {sale.notes && (
          <p className="text-xs text-stone-500 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            📝 {sale.notes}
          </p>
        )}

        <Separator />

        {/* Items */}
        <div className="space-y-2">
          {sale.items.map((item) => {
            const price = getItemPrice(item)
            return (
              <div
                key={item.cartId}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-stone-700 font-medium">
                    {item.quantity}x{" "}
                  </span>
                  <span className="text-stone-700">{getItemLabel(item)}</span>
                </div>
                <span className="font-semibold text-stone-800 ml-3">
                  {formatCurrency(price * item.quantity)}
                </span>
              </div>
            )
          })}
        </div>

        <Separator />

        {/* Total & payment */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PaymentIcon className={`h-4 w-4 ${paymentInfo.iconColor}`} />
            <span className="text-sm text-stone-500">{paymentInfo.label}</span>
          </div>
          <span className="text-xl font-bold text-stone-800">
            {formatCurrency(sale.total)}
          </span>
        </div>

        {/* Cambio (solo efectivo con monto recibido) */}
        {sale.paymentMethod === "efectivo" && sale.cashReceived != null && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-green-700">
              Recibido {formatCurrency(sale.cashReceived)}
            </span>
            <span className="text-base font-bold text-green-700">
              Cambio: {formatCurrency(sale.changeDue ?? 0)}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-5 w-full">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={handlePrint}
        >
          <Printer className="h-4 w-4" />
          Imprimir ticket
        </Button>
        <Button
          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={onClose}
        >
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
  initialTotalSales,
  openSession,
}: POSClientProps) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [totalSales, setTotalSales] = useState<number>(initialTotalSales)
  const [activeCategory, setActiveCategory] = useState<string>("todos")
  const [sizePickerFor, setSizePickerFor] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo")
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [ticketNotes, setTicketNotes] = useState("")
  const [cashReceivedInput, setCashReceivedInput] = useState("")
  const [showTickets, setShowTickets] = useState(false)
  const [showCashDialog, setShowCashDialog] = useState(false)

  // El total del día viene del servidor; tras vender/cancelar las actions
  // revalidan /pos y esta prop se actualiza → se sincroniza aquí.
  useEffect(() => {
    setTotalSales(initialTotalSales)
  }, [initialTotalSales])

  // Clave de idempotencia de la venta en curso: reintentar el mismo cobro
  // (p.ej. tras un timeout) no duplica el ticket. Se renueva al vender o
  // al modificar el carrito.
  const saleRef = useRef<string>(crypto.randomUUID())

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

  /* cart helpers */
  const addToCart = useCallback((product: Product, size?: SizeOption) => {
    const cartId = size ? `${product.id}__${size.label}` : product.id
    saleRef.current = crypto.randomUUID()

    setCart((prev) => {
      const existing = prev.find((i) => i.cartId === cartId)
      if (existing) {
        return prev.map((i) =>
          i.cartId === cartId
            ? { ...i, quantity: i.quantity + 1, isNew: true }
            : { ...i, isNew: false }
        )
      }
      return [
        ...prev.map((i) => ({ ...i, isNew: false })),
        { cartId, product, size, quantity: 1, isNew: true },
      ]
    })

    setTimeout(() => {
      setCart((prev) => prev.map((i) => ({ ...i, isNew: false })))
    }, 350)
  }, [])

  const removeFromCart = useCallback((cartId: string) => {
    saleRef.current = crypto.randomUUID()
    setCart((prev) => prev.filter((i) => i.cartId !== cartId))
  }, [])

  const updateQuantity = useCallback((cartId: string, delta: number) => {
    saleRef.current = crypto.randomUUID()
    setCart((prev) =>
      prev
        .map((i) =>
          i.cartId === cartId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }, [])

  const total = cart.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0)

  // Efectivo recibido / cambio (solo aplica al pago en efectivo)
  const cashReceived = paymentMethod === "efectivo" ? parseCash(cashReceivedInput) : null
  const changeDue = cashReceived !== null ? cashReceived - total : null
  const cashInsufficient = cashReceived !== null && cashReceived < total

  const finalizeSale = async () => {
    if (cart.length === 0 || isProcessing || !openSession || cashInsufficient) return
    setIsProcessing(true)

    try {
      // Los precios NO se mandan: el servidor los recalcula desde el menú.
      const result = await createTicket({
        clientRef: saleRef.current,
        paymentMethod,
        notes: ticketNotes.trim() || undefined,
        cashReceived: cashReceived ?? undefined,
        items: cart.map((item) => ({
          variant_id: getItemVariantId(item) ?? "",
          quantity: item.quantity,
        })),
      })

      if (result.success) {
        // Store completed sale data for receipt (total = el del servidor)
        setCompletedSale({
          ticketId: result.ticketId,
          folio: result.folio,
          items: [...cart],
          total: result.total,
          paymentMethod,
          date: new Date(),
          notes: ticketNotes.trim() || undefined,
          cashReceived: result.cashReceived,
          changeDue: result.changeDue,
        })
        setTotalSales((prev) => prev + result.total)
        setCart([])
        setTicketNotes("")
        setCashReceivedInput("")
        saleRef.current = crypto.randomUUID()
      } else {
        toast.error(result.error || "Error al registrar la venta")
      }
    } catch {
      toast.error("Error de conexión al registrar la venta. Intenta de nuevo.")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleProductClick = (product: Product) => {
    if (product.sizes && product.sizes.length > 0) {
      setSizePickerFor(sizePickerFor === product.id ? null : product.id)
    } else {
      addToCart(product)
      setSizePickerFor(null)
    }
  }

  const handleCloseReceipt = () => {
    setCompletedSale(null)
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="relative flex h-screen bg-stone-50 overflow-hidden">
      {/* ── Top-right actions ── */}
      <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
        {/* Estado de caja */}
        <Button
          variant="outline"
          onClick={() => setShowCashDialog(true)}
          className={`backdrop-blur gap-1.5 font-semibold ${
            openSession
              ? "bg-green-50/90 border-green-300 text-green-700 hover:bg-green-100"
              : "bg-red-50/90 border-red-300 text-red-700 hover:bg-red-100"
          }`}
          title={openSession ? "Cerrar caja (corte)" : "Abrir caja"}
        >
          {openSession ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {openSession ? `Caja abierta · ${formatTime(openSession.openedAt)}` : "Caja cerrada"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowTickets(true)}
          className="bg-white/80 backdrop-blur gap-1.5"
        >
          <Receipt className="h-4 w-4" />
          Tickets
        </Button>
        {isAdmin && (
          <Link href="/admin">
            <Button
              variant="outline"
              className="bg-white/80 backdrop-blur gap-1.5"
            >
              <Settings className="h-4 w-4" />
              Administrar
            </Button>
          </Link>
        )}
        <form action={logout}>
          <Button
            type="submit"
            variant="outline"
            className="bg-white/80 backdrop-blur"
          >
            Cerrar sesión
          </Button>
        </form>
      </div>

      {/* ───── LEFT PANEL (Products) ───── */}
      <div className="w-3/5 flex flex-col h-full border-r border-stone-200">
        {/* Header */}
        <header className="shrink-0 px-5 pt-4 pb-3 bg-white border-b border-stone-200 shadow-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Coffee className="h-6 w-6 text-amber-700" />
              <h1 className="text-2xl font-bold text-stone-800 tracking-tight">
                El Cafecito
              </h1>
            </div>
            <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl flex items-center gap-2">
              <span className="text-sm text-amber-800 font-medium">
                Total vendido hoy:
              </span>
              <span className="text-xl font-bold text-amber-800">
                {formatCurrency(totalSales)}
              </span>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Buscar producto..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSizePickerFor(null)
              }}
              className="pl-9 bg-stone-50 border-stone-200 h-9 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
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
                className={`rounded-full shrink-0 text-sm ${
                  activeCategory === cat.id
                    ? "bg-amber-700 hover:bg-amber-800 text-white"
                    : "border-stone-300 text-stone-600 hover:bg-stone-100"
                }`}
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </header>

        {/* Product grid */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {products.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <Coffee className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-base font-medium">
                  No hay productos en el menú
                </p>
                <p className="text-sm">
                  Agrega productos desde el panel de administración
                </p>
              </div>
            )}
            {Object.entries(grouped).map(([subcategory, items]) => (
              <div key={subcategory}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3 px-1">
                  {subcategory}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map((product) => (
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
                        <div className="p-3">
                          <p className="font-semibold text-stone-800 text-sm leading-tight line-clamp-2">
                            {product.name}
                          </p>
                          {product.description &&
                            product.description !== subcategory && (
                              <p className="text-xs text-stone-400 mt-0.5 truncate">
                                {product.description}
                              </p>
                            )}
                          <p className="text-amber-700 font-bold text-base mt-1">
                            {getDisplayPrice(product)}
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
                              {product.sizes.map((size) => (
                                <motion.button
                                  key={size.label}
                                  whileTap={{ scale: 0.92 }}
                                  onClick={() => {
                                    addToCart(product, size)
                                    setSizePickerFor(null)
                                  }}
                                  className="flex-1 py-2 px-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-center transition-colors"
                                >
                                  <span className="block text-xs font-bold">
                                    {size.label}
                                  </span>
                                  <span className="block text-[10px] opacity-80">
                                    {size.oz}
                                  </span>
                                  <span className="block text-xs font-bold mt-0.5">
                                    ${size.price}
                                  </span>
                                </motion.button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ───── RIGHT PANEL (Cart) ───── */}
      <div className="w-2/5 flex flex-col h-full bg-white">
        <header className="shrink-0 px-5 py-4 border-b border-stone-200 bg-amber-50/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-bold text-stone-800">
                Venta Actual
              </h2>
            </div>
            {cart.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
                {cart.reduce((s, i) => s + i.quantity, 0)} items
              </Badge>
            )}
          </div>
        </header>

        {/* Cart items */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {cart.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-stone-300">
                <ShoppingBag className="h-14 w-14 mb-3 opacity-40" />
                <p className="text-base font-medium text-stone-400">
                  No hay productos
                </p>
                <p className="text-sm text-stone-300">
                  Toca un producto para agregarlo
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {cart.map((item) => (
                  <motion.div
                    key={item.cartId}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      backgroundColor: item.isNew
                        ? "rgba(251,191,36,0.12)"
                        : "rgba(255,255,255,0)",
                    }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-between py-3 border-b border-stone-100 rounded-lg px-2 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-800 text-sm truncate">
                        {item.product.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-stone-400">
                          {formatCurrency(getItemPrice(item))}
                        </span>
                        {item.size && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 border-stone-300 text-stone-500"
                          >
                            {item.size.label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full border-stone-300 text-stone-500"
                        onClick={() => updateQuantity(item.cartId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold text-stone-700">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-full border-stone-300 text-stone-500"
                        onClick={() => updateQuantity(item.cartId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <span className="font-bold text-sm text-stone-800 w-16 text-right">
                      {formatCurrency(getItemPrice(item) * item.quantity)}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-stone-300 hover:text-red-500 hover:bg-red-50 shrink-0"
                      onClick={() => removeFromCart(item.cartId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>

        {/* Checkout */}
        <div className="shrink-0 p-4 border-t border-stone-200 bg-stone-50/80 space-y-3">
          {/* Ticket notes */}
          <Input
            placeholder="Nota: mesa, nombre, para llevar..."
            value={ticketNotes}
            onChange={(e) => setTicketNotes(e.target.value)}
            className="bg-white border-stone-200 h-8 text-sm"
          />

          {/* Payment method selector */}
          <div className="flex gap-2">
            {PAYMENT_METHOD_KEYS.map((key) => {
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
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                    active ? activeClass : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {info.shortLabel}
                </button>
              )
            })}
          </div>

          {/* Efectivo recibido + cambio */}
          {paymentMethod === "efectivo" && (
            <div className="rounded-lg border border-green-200 bg-green-50/60 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-800 shrink-0">Recibido</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="Opcional"
                  value={cashReceivedInput}
                  onChange={(e) => setCashReceivedInput(e.target.value)}
                  className={`h-8 text-sm font-semibold bg-white ${
                    cashInsufficient ? "border-red-400 focus-visible:ring-red-400" : "border-green-200"
                  }`}
                />
                <span
                  className={`text-sm font-bold shrink-0 min-w-[7.5rem] text-right ${
                    cashInsufficient ? "text-red-600" : changeDue !== null ? "text-green-700" : "text-stone-400"
                  }`}
                >
                  {cashInsufficient
                    ? `Faltan ${formatCurrency(total - (cashReceived ?? 0))}`
                    : changeDue !== null
                    ? `Cambio ${formatCurrency(changeDue)}`
                    : "Cambio —"}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setCashReceivedInput(total > 0 ? String(total) : "")}
                  className="flex-1 py-1 rounded-md bg-white border border-green-200 text-xs font-semibold text-green-800 hover:bg-green-100"
                >
                  Exacto
                </button>
                {CASH_QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCashReceivedInput(String(amount))}
                    className="flex-1 py-1 rounded-md bg-white border border-green-200 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-40"
                    disabled={amount < total}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center">
            <span className="text-base font-medium text-stone-500">Total</span>
            <span className="text-2xl font-bold text-stone-800">
              {formatCurrency(total)}
            </span>
          </div>

          {/* Cobrar button / gate de caja */}
          {openSession ? (
            <Button
              className={`w-full py-6 text-lg font-bold rounded-xl text-white transition-colors ${
                paymentMethod === "efectivo"
                  ? "bg-green-600 hover:bg-green-700"
                  : paymentMethod === "transferencia"
                  ? "bg-violet-600 hover:bg-violet-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
              size="lg"
              disabled={cart.length === 0 || isProcessing || cashInsufficient}
              onClick={finalizeSale}
            >
              {isProcessing
                ? "Procesando..."
                : `Cobrar ${formatCurrency(total)} · ${paymentLabel(paymentMethod)}`}
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

      {/* ── Dialogs de caja e historial ── */}
      <CashSessionDialog open={showCashDialog} onOpenChange={setShowCashDialog} session={openSession} />
      <TicketHistoryDialog open={showTickets} onOpenChange={setShowTickets} isAdmin={isAdmin} />

      {/* ── Receipt dialog ── */}
      <Dialog
        open={completedSale !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseReceipt()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Ticket de venta</DialogTitle>
          </DialogHeader>
          {completedSale && (
            <ReceiptView sale={completedSale} onClose={handleCloseReceipt} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
