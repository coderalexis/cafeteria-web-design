"use client"

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react"
import { formatCurrency, paymentLabel, formatDate } from "@/lib/format"
import { accountChips, DEFAULT_SETTINGS } from "@/lib/settings"
import { type AccountData } from "@/lib/receipt"
import { LazyMotion, m } from "framer-motion"
import cargarAnimaciones from "./motion-features"
import {
  Coffee,
  ShoppingBag,
  Plus,
  Search,
  Lock,
  ChevronUp,
  Star,
} from "lucide-react"
import { useAppContext } from "@/components/business-provider"
import { OfflineBanner, PosLockScreen } from "./lock-screen"
import { TrialBanner } from "@/components/trial-banner"
import { colorClasses } from "@/lib/category-colors"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { createTicket } from "@/app/actions/sales"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { RecentOrdersDialog } from "./recent-orders-dialog"
import { ModifierSheet } from "./modifier-sheet"
import { ParkDialog, ParkedTrayDialog } from "./parked-dialog"
import { AccountDialog } from "./account-dialog"
import { useParkedOrders } from "./use-parked-orders"
import {
  autoName,
  conflictName,
  esFiado,
  isVieja,
  mergeParkedCarts,
  parkedSummary,
  parkedAccount,
  waitingLabel,
  PARKED_MAX_AGE_MS,
  type ParkedOrder,
} from "./parked"
import { DiscountDialog } from "./discount-dialog"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { CashTenderDialog } from "./cash-tender-dialog"
import { formatPhone, LoyaltyDialog, RedeemDialog } from "./loyalty-dialog"
import type { LoyaltyCustomer } from "@/app/actions/loyalty"
import { ProductInfoDialog } from "./product-info-dialog"
import { usePosTextSize } from "./use-text-size"
import { usePosCart } from "./use-pos-cart"
import { useOfflineQueue } from "./use-offline-queue"
import { QueueBanner } from "./queue-banner"
import { QueueReviewDialog } from "./queue-review-dialog"
import { QUEUE_MAX, serializeLines } from "./queue"
import { CartPanel } from "./cart-panel"
import { PosHeader } from "./pos-header"
import { ProductCard } from "./product-card"
import { ReceiptView, type CompletedSale } from "./receipt-view"
import { FlyLayer, useCartFeedback } from "./use-cart-feedback"
import { usePromoPreview } from "./use-promo-preview"
import { usePosShortcuts } from "./use-pos-shortcuts"
import { cashSuggestions, vibra, MORE_OPTIONS_KEY, type TipChoice } from "./pos-utils"
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
  type Product,
  type SizeOption,
} from "./cart"
// Re-export de tipos para los componentes hermanos (modifier-sheet, discount-dialog)
export type { ModifierGroup, ModifierOption, Product, SizeOption, TicketDiscount } from "./cart"

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
  /** Módulo de cuentas abiertas activado para esta cafetería. */
  parkedOrders: boolean
  /** Cuántas mesas tiene: genera los chips «Mesa 1…N» al abrir una cuenta. */
  tableCount: number
  /** Etiquetas propias de un toque, además de las mesas («Barra», «Terraza»). */
  accountLabels: string[]
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
  /** Nota de compra en la web: QR al cobrar para que el cliente la vea. */
  publicReceipt: boolean
  /** Comisión de la terminal (%), solo para mostrar el neto en el corte. */
  cardFeePct: number
  initialTotalSales: number
  openSession: OpenSession | null
}

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
  tableCount,
  accountLabels,
  publicReceipt,
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
  /**
   * Zona horaria del NEGOCIO para toda hora que se pinte en pantalla.
   *
   * Sin ella, `toLocaleTimeString` usa la del aparato que renderiza: en el
   * servidor la del centro de datos (Oregón) y en el celular la del cajero.
   * Eso daba dos horas distintas para la misma caja y React se quejaba de que
   * la pantalla no coincidía con lo que había mandado el servidor. La hora de
   * una cafetería es la de la CAFETERÍA, no la de quien la mira.
   */
  const tz = appCtx.business?.timezone
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
  const [showRecent, setShowRecent] = useState(false)
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
    openSession != null && formatDate(openSession.openedAt, tz) !== formatDate(new Date(), tz)
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
  // Producto/tamaño esperando modificadores: alta nueva, o edición de una
  // línea existente (lineId presente = "mejor con avena" sin rearmar todo).
  const [pendingModifiers, setPendingModifiers] = useState<{
    product: Product
    size?: SizeOption
    initial?: CartLine["modifiers"]
    editing?: boolean
    lineId?: string
  } | null>(null)
  // Cuentas abiertas de la cafetería (compartidas entre aparatos)
  const parked = useParkedOrders(businessId)
  const [showPark, setShowPark] = useState(false)
  const [showTray, setShowTray] = useState(false)
  /** Cuenta que se está viendo con precios («¿me trae la cuenta?»). */
  const [accountToView, setAccountToView] = useState<AccountData | null>(null)
  /**
   * La cuenta que está ABIERTA en este carrito, si la hay.
   *
   * Es lo que le da continuidad entre rondas: el carrito deja de ser una venta
   * suelta y pasa a ser «lo que lleva la mesa 3». Sin esto cada ronda creaba
   * una cuenta nueva y había que reescribir el nombre.
   *
   * Vive también en localStorage porque el carrito sobrevive a una recarga: si
   * el puntero no sobreviviera con él, guardar después de recargar crearía una
   * cuenta duplicada de la misma mesa.
   */
  const [openAccount, setOpenAccount] = useState<{
    id: string
    name: string
    openedAt: number
    /** Sello de la última escritura; se manda al guardar para no pisar a nadie. */
    updatedAt: string
  } | null>(null)
  const openAccountKey = `pos-open-account:${businessId}:${cashierId}`
  /**
   * La cuenta que se está editando no se lista: ya está aquí, en el carrito.
   * Verla también en la bandeja invitaría a abrirla dos veces y a acabar con
   * dos versiones de la misma mesa.
   */
  const cuentasVisibles = useMemo(
    () => parked.orders.filter((o) => o.id !== openAccount?.id),
    [parked.orders, openAccount],
  )
  /**
   * Las que llevan horas o días sin cobrarse, con nombre y edad, para el
   * aviso del corte. Antes solo se decía cuántas había: quien ve «3 cuentas
   * abiertas» cada noche deja de leerlo, y ahí se pierde el café del viernes.
   */
  const cuentasViejas = useMemo(() => {
    const ahora = Date.now()
    return cuentasVisibles
      .filter((o) => !esFiado(o) && isVieja(o.savedAt, ahora))
      .map((o) => `«${o.name}» — abierta ${waitingLabel(o.savedAt, ahora)}`)
  }, [cuentasVisibles])

  /** Chips del diálogo «Abrir cuenta», según los ajustes de esta cafetería. */
  const chipsDeNombre = useMemo(
    () =>
      accountChips(
        { ...DEFAULT_SETTINGS, tableCount, accountLabels },
        cuentasVisibles.filter((o) => !esFiado(o)).map((o) => o.name),
      ),
    [tableCount, accountLabels, cuentasVisibles],
  )

  /** Chips de la rejilla: solo cuentas del día, con su total al menú de hoy. */
  const chipsCuentas = useMemo(() => {
    const ahora = Date.now()
    return cuentasVisibles
      .filter((o) => !esFiado(o))
      .map((o) => {
        const r = parkedSummary(o, products, ahora)
        return { o, total: r.total, vieja: isVieja(o.savedAt, ahora) }
      })
  }, [cuentasVisibles, products])

  /**
   * Pasa una cuenta a «Por cobrar». Si era la que estaba abierta en este
   * carrito, se suelta el puntero: ya no se le va a seguir agregando.
   */
  const marcarFiado = useCallback(
    async (id: string, contact: string | undefined) => {
      const ok = await parked.fiar(id, contact)
      if (ok) {
        if (openAccount?.id === id) setOpenAccount(null)
        toast.success("Pasó a «Por cobrar». No se registró ninguna venta.")
      }
      return ok
    },
    [parked, openAccount],
  )
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

  /** Recuperar a qué cuenta pertenece el carrito que sobrevivió a la recarga. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(openAccountKey)
      if (raw) setOpenAccount(JSON.parse(raw))
    } catch {
      /* dato corrupto: se trata como carrito suelto */
    }
  }, [openAccountKey])

  useEffect(() => {
    try {
      if (openAccount) window.localStorage.setItem(openAccountKey, JSON.stringify(openAccount))
      else window.localStorage.removeItem(openAccountKey)
    } catch {
      /* sin espacio: solo se pierde la continuidad tras recargar */
    }
  }, [openAccount, openAccountKey])

  /**
   * La cuenta apuntada puede haber desaparecido mientras este aparato no
   * miraba: otra persona la cobró o la descartó. Guardar sobre una cuenta que
   * ya no existe no fallaría —el update afecta 0 filas— pero se vería como si
   * hubiera guardado. Mejor avisarlo y soltar el puntero: lo que hay en el
   * carrito no se toca y se guardará como cuenta nueva.
   */
  useEffect(() => {
    if (!openAccount || !parked.listo) return
    if (parked.orders.some((o) => o.id === openAccount.id)) return
    setOpenAccount(null)
    toast.warning(
      `La cuenta «${openAccount.name}» ya no existe: alguien la cobró o la descartó. Lo que tienes en el carrito sigue aquí.`,
    )
  }, [openAccount, parked.listo, parked.orders])

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

  // ── Vuelo al carrito y «¿sí lo agregó?» (móvil) ──
  const feedback = useCartFeedback({ lines, isMobile, cartOpen })
  const { lastAdded, markFlyOrigin, cartPulse, barDip, barTargetRef, bagTargetRef } = feedback

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
  // Filtrar y agrupar ~90 productos es trabajo que solo cambia si cambia la
  // búsqueda o la categoría. Sin `useMemo` se rehacía en CADA render —y el
  // carrito redibuja el componente entero en cada toque—, así que agregar algo
  // volvía a recorrer y reagrupar toda la carta sin razón.
  const searchLower = searchQuery.toLowerCase().trim()
  const filtered = useMemo(
    () =>
      products.filter((p) => {
        const matchesSearch = !searchLower || p.name.toLowerCase().includes(searchLower)
        const matchesCategory = searchLower || activeCategory === "todos" || p.category === activeCategory
        return matchesSearch && matchesCategory
      }),
    [products, searchLower, activeCategory],
  )

  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, Product[]>>((acc, p) => {
        const key = p.subcategory
        if (!acc[key]) acc[key] = []
        acc[key].push(p)
        return acc
      }, {}),
    [filtered],
  )

  const subtotal = cartSubtotal(lines)
  const discountAmount = computeDiscount(subtotal, discount)

  // La promoción viva (espejo de lo que el servidor descontará al cobrar).
  const { promo, sinPromo } = usePromoPreview(lines, discount !== null || loyaltyRedeem)

  // El descuento que de verdad va a llevar el ticket: el de la promoción solo
  // cuando no hay otro. Nunca se suman.
  const promoDiscount = sinPromo ? 0 : Math.min(promo?.discount ?? 0, subtotal)
  // «Para llevar» activo = el ticket lleva el cargo del negocio. La bandera
  // sale del MISMO predicado que pinta el chip; el monto real lo pone el
  // servidor con sus ajustes — esto es solo el espejo en pantalla.
  const esParaLlevar = ticketNotes === "Para llevar" || ticketNotes.startsWith("Para llevar · ")
  const takeoutCharge = esParaLlevar && lines.length > 0 ? takeoutFee : 0
  const total = Math.round((subtotal - discountAmount - promoDiscount + takeoutCharge) * 100) / 100
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
      const limpio = name.trim().slice(0, 40)

      /* Nombre repetido = SUMARLE a esa cuenta, no crear otra. Tocar el chip
         «Mesa 1» cuando la mesa ya tiene cuenta es el gesto más natural para
         mandarle otra ronda — y antes creaba una segunda «Mesa 1» que nadie
         sabía juntar. Solo cuentas del día: a un fiado (alguien que YA se
         fue) no se le suma un pedido nuevo. */
      const existente = parked.orders.find(
        (o) => !esFiado(o) && o.name.trim().toLowerCase() === limpio.toLowerCase(),
      )
      if (existente) {
        void (async () => {
          const combinado = mergeParkedCarts(existente.cart, serializeCart(cartStateNow(), Date.now()))
          const r = await parked.update(existente.id, existente.updatedAt, combinado)
          if (!r) return // el hook ya avisó; el carrito no se toca
          if (r.saved) {
            clearTip()
            clearCart()
            setOpenAccount(null)
            vibra(12)
            toast.success(`Se sumó a la cuenta «${existente.name}».`)
            return
          }
          // Otro aparato la movió justo ahora: mismo trato que en
          // saveToOpenAccount — no se pisa ni se tira, se guarda aparte.
          const alterno = conflictName(existente.name, parked.orders.map((o) => o.name))
          if (!parked.park(cartStateNow(), alterno)) {
            toast.error("La bandeja está llena: cobra o descarta una cuenta y vuelve a guardar.")
            return
          }
          clearTip()
          clearCart()
          setOpenAccount(null)
          toast.warning(
            `«${existente.name}» se movió en otro aparato. Esto se guardó como «${alterno}»: júntalas antes de cobrar.`,
            { duration: 12000 },
          )
        })()
        return
      }

      if (!parked.park(cartStateNow(), limpio)) {
        toast.error(`Ya hay ${parked.orders.length} cuentas abiertas; cobra o descarta alguna.`)
        return
      }
      clearTip()
      clearCart()
      setOpenAccount(null)
      vibra(12)
      toast.success(`Cuenta «${limpio}» abierta.`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines.length, parked, cartStateNow, clearCart],
  )

  /**
   * Guarda la ronda actual EN la cuenta que está abierta.
   *
   * Este es el camino normal de una cafetería con mesas: la cuenta se abre una
   * vez y cada ronda se le suma, sin volver a escribir el nombre ni reiniciar
   * el reloj de «abierta hace 40 min».
   *
   * Si otro aparato la movió mientras tanto, lo de aquí NO se pisa ni se tira:
   * se guarda aparte con nombre reconocible. Son productos ya servidos; una
   * ronda perdida en silencio es comida que nunca se cobra.
   */
  const saveToOpenAccount = useCallback(async (): Promise<boolean> => {
    if (!openAccount || lines.length === 0) return false
    const r = await parked.update(openAccount.id, openAccount.updatedAt, serializeCart(cartStateNow(), Date.now()))
    if (!r) return false // el hook ya avisó
    if (r.saved) {
      clearTip()
      clearCart()
      setOpenAccount(null)
      vibra(12)
      toast.success(`Guardado en «${openAccount.name}».`)
      return true
    }
    const alterno = conflictName(
      openAccount.name,
      parked.orders.map((o) => o.name),
    )
    if (!parked.park(cartStateNow(), alterno)) {
      toast.error(
        `«${openAccount.name}» cambió en otro aparato y la bandeja está llena. Cobra o descarta una cuenta y vuelve a guardar.`,
      )
      return false
    }
    clearTip()
    clearCart()
    setOpenAccount(null)
    vibra(12)
    toast.warning(
      `«${openAccount.name}» se movió en otro aparato. Para no perder nada, esto se guardó como «${alterno}»: júntalas antes de cobrar.`,
      { duration: 12000 },
    )
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAccount, lines.length, parked, cartStateNow, clearCart])

  /**
   * Abre una cuenta en el carrito para agregarle o cobrarla.
   *
   * La fila NO se borra del servidor: se apunta cuál es y se actualiza al
   * guardar. Antes se borraba, y eso tenía dos costos — la cuenta perdía su
   * nombre y su hora en cada ronda, y si este aparato moría en medio, la mesa
   * desaparecía también del otro.
   *
   * Si hay algo en el carrito se guarda solo antes: con prisa nadie debe poder
   * tirar una venta a medias por contestar mal un "¿seguro?".
   */
  const resumeParked = useCallback(
    async (order: ParkedOrder) => {
      const estado = rehydrateCart(order.cart, products, Date.now(), PARKED_MAX_AGE_MS)
      if (!estado || estado.lines.length === 0) {
        toast.error(
          "Esta cuenta no se puede cobrar: sus productos ya no están en el menú. Reactívalos en Menú → Productos.",
          { duration: 10000 },
        )
        return
      }
      if (lines.length > 0) {
        // Lo que está en el carrito va a su sitio: a su propia cuenta si ya
        // tenía una, o a una nueva si era una venta suelta.
        if (openAccount) {
          // Si no se pudo poner a salvo, NO se sigue: abrir la otra cuenta
          // reemplazaría el carrito y esas líneas se perderían.
          if (!(await saveToOpenAccount())) return
        } else {
          const auto = autoName(new Date())
          if (!parked.park(cartStateNow(), auto)) {
            toast.error("La bandeja está llena: cobra o descarta una cuenta antes de cambiar.")
            return
          }
          toast.info(`Lo que tenías en el carrito se guardó como «${auto}».`)
        }
      }
      setOpenAccount({
        id: order.id,
        name: order.name,
        openedAt: order.savedAt,
        updatedAt: order.updatedAt,
      })
      restoreLines(estado.lines)
      setTicketNotes(estado.ticketNotes)
      clearTip()
      setShowTray(false)
      // En celular la hoja del carrito tapa la rejilla: se cierra para que
      // el siguiente gesto —tocar productos de la ronda— ya sea posible.
      setCartOpen(false)
      vibra(12)
      const caidos = order.cart.lines.length - estado.lines.length
      if (caidos > 0) {
        // Con dinero de por medio no basta «algo cambió»: lo que importa es
        // que se va a cobrar de menos, y qué hacer para cobrarlo completo.
        toast.warning(
          caidos === 1
            ? "1 artículo de esta cuenta ya no está en el menú y NO se va a cobrar. Reactívalo en Menú → Productos si quieres cobrarlo."
            : `${caidos} artículos de esta cuenta ya no están en el menú y NO se van a cobrar. Reactívalos en Menú → Productos si quieres cobrarlos.`,
          { duration: 12000 },
        )
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, lines.length, openAccount, saveToOpenAccount, parked, cartStateNow, restoreLines, setTicketNotes],
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

  /**
   * La cuenta ya se cobró: se borra del servidor y se suelta el puntero.
   *
   * Es el único momento en que una cuenta desaparece por buenas razones —el
   * resto de las veces sobrevive a propósito—. Se hace después de que el
   * servidor confirmó la venta (o de que quedó en la cola), nunca antes.
   */
  const cerrarCuentaCobrada = useCallback(() => {
    if (!openAccount) return
    parked.remove(openAccount.id)
    setOpenAccount(null)
  }, [openAccount, parked])

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
        cerrarCuentaCobrada()
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
        // La cuenta se cierra igual: la venta ya está capturada y va en la
        // cola. Dejarla abierta invitaría a cobrarla dos veces.
        cerrarCuentaCobrada()
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
  }, [canCharge, saleRef, businessId, paymentMethod, ticketNotes, esParaLlevar, cashReceived, tipAmount, discount, total, lines, lastSaleKey, clearTip, resetAfterSale, loyaltyCustomer, loyaltyRedeem, cola, cerrarCuentaCobrada])

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

  // La actualización va en forma de función para NO depender de `sizePickerFor`:
  // si dependiera, esta función cambiaría cada vez que se abre o cierra un
  // selector de tamaño y volvería a redibujar las ~90 tarjetas.
  const handleProductClick = useCallback(
    (product: Product) => {
      if (product.sizes && product.sizes.length > 0) {
        setSizePickerFor((actual) => (actual === product.id ? null : product.id))
      } else {
        chooseProduct(product)
      }
    },
    [chooseProduct],
  )

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
  usePosShortcuts({
    anyDialogOpen, canCharge, finalizeSale, openSession, focusCash,
    sizePickerFor, setSizePickerFor, products, filtered, chooseProduct,
    searchInputRef, setSearchQuery, lines, loyaltyRedeem, setPaymentMethod,
    setShowTickets, setShowCashDialog, setShowDiscount, setShowShortcuts, setConfirmClear,
  })

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  const itemCount = cartItemCount(lines)

  /* Panel del carrito (header + líneas + cobro). Se monta una sola vez:
     como columna derecha en escritorio o dentro de una hoja inferior en
     móvil, para que refs y foco apunten al panel visible. */
  const cartPanel = (
    <CartPanel
      lines={lines}
      products={products}
      itemCount={itemCount}
      isMobile={isMobile}
      setCartOpen={setCartOpen}
      updateQuantity={updateQuantity}
      setQuantityTo={setQuantityTo}
      duplicateLine={duplicateLine}
      removeLine={removeLine}
      restoreLines={restoreLines}
      setLineNotes={setLineNotes}
      setPendingModifiers={setPendingModifiers}
      lastSale={lastSale}
      setConfirmClear={setConfirmClear}
      parkedEnabled={parkedEnabled}
      openAccount={openAccount}
      cuentasVisibles={cuentasVisibles}
      saveToOpenAccount={saveToOpenAccount}
      setShowPark={setShowPark}
      setShowTray={setShowTray}
      loyaltyEnabled={loyaltyEnabled}
      loyaltyCustomer={loyaltyCustomer}
      loyaltyRedeem={loyaltyRedeem}
      loyaltyTarget={loyaltyTarget}
      setLoyaltyCustomer={setLoyaltyCustomer}
      setLoyaltyRedeem={setLoyaltyRedeem}
      setShowLoyalty={setShowLoyalty}
      setShowRedeem={setShowRedeem}
      cartPulse={cartPulse}
      bagTargetRef={bagTargetRef}
      paymentMethod={paymentMethod}
      setPaymentMethod={setPaymentMethod}
      cashReceivedInput={cashReceivedInput}
      setCashReceivedInput={setCashReceivedInput}
      cashInputRef={cashInputRef}
      cashReceived={cashReceived}
      changeDue={changeDue}
      cashInsufficient={cashInsufficient}
      setShowTender={setShowTender}
      tipChoice={tipChoice}
      setTipChoice={setTipChoice}
      tipCustomInput={tipCustomInput}
      setTipCustomInput={setTipCustomInput}
      tipAmount={tipAmount}
      moreOpen={moreOpen}
      toggleMore={toggleMore}
      extrasResumen={extrasResumen}
      ticketNotes={ticketNotes}
      setTicketNotes={setTicketNotes}
      takeoutFee={takeoutFee}
      discount={discount}
      setDiscount={setDiscount}
      setShowDiscount={setShowDiscount}
      subtotal={subtotal}
      discountAmount={discountAmount}
      discountInvalid={discountInvalid}
      promo={promo}
      promoDiscount={promoDiscount}
      takeoutCharge={takeoutCharge}
      total={total}
      due={due}
      openSession={openSession}
      canCharge={canCharge}
      isProcessing={isProcessing}
      finalizeSale={finalizeSale}
      setShowCashDialog={setShowCashDialog}
    />
  )

  return (
    // `LazyMotion` con carga diferida: el POS aparece con el motor mínimo de
    // animación y las capacidades completas (arrastre incluido) llegan un
    // instante después. Por eso los componentes de aquí abajo son `m.*` y no
    // `motion.*`: usar `motion.*` dentro de este árbol funcionaría igual, pero
    // volvería a bajar la librería entera de entrada y anularía el ahorro.
    <LazyMotion features={cargarAnimaciones}>
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
        <PosHeader
          businessName={businessName}
          appCtx={appCtx}
          isMobile={isMobile}
          isAdmin={isAdmin}
          lockMinutes={lockMinutes}
          tz={tz}
          totalSales={totalSales}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          gridScrolled={gridScrolled}
          searchPinned={searchPinned}
          setSearchPinned={setSearchPinned}
          setSizePickerFor={setSizePickerFor}
          openSession={openSession}
          cajaDeOtroDia={cajaDeOtroDia}
          setShowCashDialog={setShowCashDialog}
          setShowTray={setShowTray}
          setShowRecent={setShowRecent}
          setShowTickets={setShowTickets}
          setShowShortcuts={setShowShortcuts}
          textSize={textSize}
          parkedEnabled={parkedEnabled}
          openAccount={openAccount}
          cuentasVisibles={cuentasVisibles}
          chipsCuentas={chipsCuentas}
          setCartOpen={setCartOpen}
          resumeParked={resumeParked}
          categories={categories}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />

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
                    <m.button
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
                    </m.button>
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
                  {items.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      accent={colorClasses(categoryColor[product.category])?.accent}
                      subcategory={subcategory}
                      abierto={sizePickerFor === product.id}
                      onInfo={setInfoProduct}
                      onMarcarOrigen={markFlyOrigin}
                      onElegir={handleProductClick}
                      onElegirTamano={chooseProduct}
                    />
                  ))}
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
          <m.div
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
                {/* La bifurcación real de una cafetería con mesas: tomado el
                    pedido, o se cobra o se va a una cuenta. Las dos salidas al
                    alcance del pulgar, en la misma ranura.

                    Abrir la cuenta obligaba antes a abrir la hoja del carrito
                    primero — dos toques para algo que pasa una vez por mesa.
                    Cobrar sigue siendo el botón grande y a la derecha porque
                    es, de lejos, lo más frecuente: degradarlo para acelerar lo
                    ocasional saldría carísimo. */}
                {parkedEnabled && (
                  <Button
                    className="h-12 shrink-0 rounded-xl bg-amber-600 px-3 text-base font-bold text-white hover:bg-amber-700"
                    onClick={() => (openAccount ? void saveToOpenAccount() : setShowPark(true))}
                    title={
                      openAccount
                        ? `Guardar esta ronda en «${openAccount.name}»`
                        : "Abrir una cuenta con esto para cobrarla al final"
                    }
                  >
                    {openAccount ? "Guardar" : "Cuenta"}
                  </Button>
                )}
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
          </m.div>
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

      <FlyLayer
        flights={feedback.flights}
        landings={feedback.landings}
        onFlightDone={feedback.completeFlight}
        onLandingDone={feedback.completeLanding}
      />

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
        parkedCount={parkedEnabled ? cuentasVisibles.length : 0}
        parkedOld={parkedEnabled ? cuentasViejas : []}
        cardFeePct={cardFeePct}
        pendingUploads={cola.pendientes + cola.porRevisar}
      />
      <TicketHistoryDialog
        open={showTickets}
        onOpenChange={setShowTickets}
        isAdmin={isAdmin}
        publicReceipt={publicReceipt}
      />
      <RecentOrdersDialog open={showRecent} onOpenChange={setShowRecent} />
      <ProductInfoDialog product={infoProduct} onClose={() => setInfoProduct(null)} />
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
        abiertas={chipsCuentas.map(({ o }) => o.name)}
        chips={chipsDeNombre}
      />
      <ParkedTrayDialog
        open={showTray}
        onOpenChange={setShowTray}
        orders={cuentasVisibles}
        products={products}
        cartHasLines={lines.length > 0}
        onResume={resumeParked}
        onRemove={parked.remove}
        onViewAccount={(o) => setAccountToView(parkedAccount(o, products, Date.now()))}
        onMarkOwed={marcarFiado}
      />
      {appCtx.business && (
        <AccountDialog
          account={accountToView}
          business={appCtx.business}
          onClose={() => setAccountToView(null)}
        />
      )}
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
            <AlertDialogTitle>{openAccount ? `¿Salir de «${openAccount.name}»?` : "¿Vaciar el carrito?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {openAccount
                ? `Se quitan de aquí los ${itemCount} artículo${itemCount === 1 ? "" : "s"} que tienes en pantalla. La cuenta «${openAccount.name}» se queda como estaba, con lo que ya tenía guardado.`
                : `Se quitarán ${itemCount} artículo${itemCount === 1 ? "" : "s"}, la nota y el descuento de esta venta. No se registra nada.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                clearCart()
                clearTip()
                // Solo se suelta el puntero: la fila del servidor no se tocó
                // en ningún momento, así que la cuenta queda intacta.
                setOpenAccount(null)
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
            <ReceiptView
              sale={completedSale}
              autoPrint={autoPrint}
              publicReceipt={publicReceipt}
              onClose={() => setCompletedSale(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
    </LazyMotion>
  )
}
