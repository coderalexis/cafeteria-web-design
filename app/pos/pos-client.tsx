"use client"

import { useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Trash2,
  Coffee,
  ShoppingBag,
  Minus,
  Plus,
  Settings,
  Banknote,
  CreditCard,
  Smartphone,
  Printer,
  CheckCircle2,
  Search,
  X,
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
  items: CartItem[]
  total: number
  paymentMethod: PaymentMethod
  date: Date
  notes?: string
}

interface POSClientProps {
  categories: Category[]
  products: Product[]
  isAdmin: boolean
  initialTotalSales: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_clip: "Tarjeta",
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
  const handlePrint = () => {
    const lines = [
      "================================",
      "         EL CAFECITO",
      "================================",
      "",
      `Ticket: ${sale.ticketId.slice(0, 8).toUpperCase()}`,
      `Fecha: ${sale.date.toLocaleDateString("es-MX")}`,
      `Hora: ${sale.date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`,
      `Pago: ${PAYMENT_LABELS[sale.paymentMethod]}`,
      ...(sale.notes ? [`Nota: ${sale.notes}`] : []),
      "",
      "--------------------------------",
      ...sale.items.flatMap((item) => {
        const price = getItemPrice(item)
        const lineTotal = price * item.quantity
        return [
          `${item.quantity}x ${getItemLabel(item)}`,
          `     $${price.toFixed(2)} c/u  = $${lineTotal.toFixed(2)}`,
        ]
      }),
      "--------------------------------",
      "",
      `  TOTAL:  $${sale.total.toFixed(2)}`,
      "",
      "================================",
      "    ¡Gracias por tu compra!",
      "================================",
    ]

    const printWindow = window.open("", "_blank", "width=320,height=600")
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Ticket ${sale.ticketId.slice(0, 8)}</title>
            <style>
              body {
                font-family: 'Courier New', monospace;
                font-size: 12px;
                width: 280px;
                margin: 0 auto;
                padding: 10px 0;
                line-height: 1.4;
              }
              pre { margin: 0; white-space: pre-wrap; }
              @media print {
                body { width: 72mm; font-size: 11px; }
              }
            </style>
          </head>
          <body>
            <pre>${lines.join("\n")}</pre>
            <script>
              window.onload = function() { window.print(); };
            <\/script>
          </body>
        </html>
      `)
      printWindow.document.close()
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
        <p className="text-sm text-stone-500">
          Ticket #{sale.ticketId.slice(0, 8).toUpperCase()}
        </p>
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
                  ${(price * item.quantity).toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>

        <Separator />

        {/* Total & payment */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {sale.paymentMethod === "efectivo" ? (
              <Banknote className="h-4 w-4 text-green-600" />
            ) : sale.paymentMethod === "transferencia" ? (
              <Smartphone className="h-4 w-4 text-violet-600" />
            ) : (
              <CreditCard className="h-4 w-4 text-blue-600" />
            )}
            <span className="text-sm text-stone-500">
              {PAYMENT_LABELS[sale.paymentMethod]}
            </span>
          </div>
          <span className="text-xl font-bold text-stone-800">
            ${sale.total.toFixed(2)}
          </span>
        </div>
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
    setCart((prev) => prev.filter((i) => i.cartId !== cartId))
  }, [])

  const updateQuantity = useCallback((cartId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.cartId === cartId ? { ...i, quantity: i.quantity + delta } : i
        )
        .filter((i) => i.quantity > 0)
    )
  }, [])

  const total = cart.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0)

  const finalizeSale = async () => {
    if (cart.length === 0 || isProcessing) return
    setIsProcessing(true)

    try {
      const items = cart.map((item) => ({
        variant_id: getItemVariantId(item) || "",
        quantity: item.quantity,
        unit_price: getItemPrice(item),
      }))

      const formData = new FormData()
      formData.set("payment_method", paymentMethod)
      formData.set("items", JSON.stringify(items))
      if (ticketNotes.trim()) formData.set("notes", ticketNotes.trim())

      const result = await createTicket(formData)

      if (result.success) {
        // Store completed sale data for receipt
        setCompletedSale({
          ticketId: result.ticketId || "",
          items: [...cart],
          total,
          paymentMethod,
          date: new Date(),
          notes: ticketNotes.trim() || undefined,
        })
        setTotalSales((prev) => prev + total)
        setCart([])
        setTicketNotes("")
      } else {
        toast.error(result.error || "Error al registrar la venta")
      }
    } catch {
      toast.error("Error de conexión al registrar la venta")
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
                ${totalSales.toFixed(2)}
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
                          ${getItemPrice(item).toFixed(2)}
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
                      ${(getItemPrice(item) * item.quantity).toFixed(2)}
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
            <button
              type="button"
              onClick={() => setPaymentMethod("efectivo")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                paymentMethod === "efectivo"
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
              }`}
            >
              <Banknote className="h-4 w-4" />
              Efectivo
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("transferencia")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                paymentMethod === "transferencia"
                  ? "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              Transfer
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("tarjeta_clip")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                paymentMethod === "tarjeta_clip"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
              }`}
            >
              <CreditCard className="h-4 w-4" />
              Tarjeta
            </button>
          </div>

          {/* Total */}
          <div className="flex justify-between items-center">
            <span className="text-base font-medium text-stone-500">Total</span>
            <span className="text-2xl font-bold text-stone-800">
              ${total.toFixed(2)}
            </span>
          </div>

          {/* Cobrar button */}
          <Button
            className={`w-full py-6 text-lg font-bold rounded-xl text-white transition-colors ${
              paymentMethod === "efectivo"
                ? "bg-green-600 hover:bg-green-700"
                : paymentMethod === "transferencia"
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            size="lg"
            disabled={cart.length === 0 || isProcessing}
            onClick={finalizeSale}
          >
            {isProcessing
              ? "Procesando..."
              : `Cobrar $${total.toFixed(2)} · ${PAYMENT_LABELS[paymentMethod]}`}
          </Button>
        </div>
      </div>

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
