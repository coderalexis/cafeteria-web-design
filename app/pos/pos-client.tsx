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
import { LazyMotion } from "framer-motion"
import cargarAnimaciones from "./motion-features"
import { useAppContext } from "@/components/business-provider"
import { OfflineBanner, PosLockScreen } from "./lock-screen"
import { PracticeBanner } from "./practice-banner"
import { RecorridoTarjeta } from "./recorrido-tarjeta"
import { useRecorrido } from "./use-recorrido"
import { AprenderDialog } from "./aprender-dialog"
import { useInstallPrompt } from "./use-install-prompt"
import { TrialBanner } from "@/components/trial-banner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { correctTicket, createTicket } from "@/app/actions/sales"
import type { TicketRecord } from "@/lib/tickets"
import { useRouter } from "next/navigation"
import type { CreditAccount } from "@/app/actions/credit"
import { CreditAccountsDialog, CreditPickerDialog, type CuentaFiado } from "./credit-dialogs"
import { CustomItemDialog, type CustomRecent } from "./custom-item-dialog"
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
import { DividirCuentaDialog } from "./dividir-cuenta-dialog"
import { TicketHistoryDialog } from "./ticket-history-dialog"
import { RecentOrdersDialog } from "./recent-orders-dialog"
import { ModifierSheet } from "./modifier-sheet"
import { useDictado } from "./voz/use-dictado"
import { DictadoPanel } from "./voz/dictado-panel"
import { ParkDialog, ParkedTrayDialog } from "./parked-dialog"
import { AccountDialog } from "./account-dialog"
import { useParkedOrders } from "./use-parked-orders"
import { RecuperadaCard } from "./recuperada-card"
import { esErrorDeVersion, marcarRecargaPorVersion } from "@/lib/version"
import {
  autoName,
  esFiado,
  isVieja,
  parkedSummary,
  parkedAccount,
  cambiosPendientes,
  waitingLabel,
  PARKED_MAX_AGE_MS,
  type ParkedOrder, cuentasParaSumar, detalleRecuperada, suggestAccountNames, type AccountVisit, type Recuperada } from "./parked"
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
import { QUEUE_MAX } from "./queue"
import { CartPanel } from "./cart-panel"
import { PosHeader } from "./pos-header"
import { BarraMovil } from "./barra-movil"
import { avisarEncolada, avisarVersionNueva } from "./avisos-cobro"
import { ventaCompletada, ventaParaLaCola } from "./cobro"
import { useCobrarCuenta } from "./use-cobrar-cuenta"
import { useCuentaAbierta, useGuardarCuenta } from "./use-cuenta-abierta"
import { RejillaProductos } from "./rejilla-productos"
import { ReceiptView, type CompletedSale } from "./receipt-view"
import { FlyLayer, useCartFeedback } from "./use-cart-feedback"
import { usePromoPreview } from "./use-promo-preview"
import { usePosShortcuts } from "./use-pos-shortcuts"
import { cashSuggestions, vibra, MORE_OPTIONS_KEY, type TipChoice } from "./pos-utils"
import {
  cartItemCount,
  cartSubtotal,
  computeDiscount,
  defaultModifiers,
  findVariant,
  rehydrateCart,
  serializeCart,
  needsModifierPrompt,
  parseCash,
  type CartLine,
  type Category,
  type Product,
  type SizeOption, type PersistedCart, CART_STORAGE_VERSION, customProduct, linesToItems } from "./cart"
// Re-export de tipos para los componentes hermanos (modifier-sheet, discount-dialog)
export type { ModifierGroup, ModifierOption, Product, SizeOption, TicketDiscount } from "./cart"
import { aplicarCambios, esquinaProducto, porVariante, type CambioExistencia, type ItemExistencia } from "@/lib/existencias"
import { ExistenciasPosDialog } from "./existencias-dialog"

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
  /** Cuándo abrir la hoja de extras al tocar un producto (ajuste del negocio). */
  modifiersPrompt: "required" | "always"
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
  /** Lo que se dejó de fondo en el último corte (P27): se sugiere al abrir caja. */
  suggestedFloat: number | null
  /** La caja anterior la cerró el barrido, no una persona: hay que avisarlo. */
  avisoCierre: { titulo: string; detalle: string; clave: string } | null
  /** Nombres con cuenta abierta por hora, últimos 60 días (P33): «quién suele venir a esta hora». */
  visitas: AccountVisit[]
  /** ¿Hay alguna promoción encendida? Si no, el carrito no consulta promociones (P34). */
  hayPromociones: boolean
  /** Módulo de fiados encendido: el POS gana el método «Fiado» y «Fiados y abonos» en ⋮. */
  creditEnabled: boolean
  /** Cuentas de fiado con su saldo (vacío si el módulo está apagado). */
  fiados: CreditAccount[]
  /** Fuera de menú (P39): vender algo que no está en la carta con precio de caja. */
  customItemsEnabled: boolean
  recientesFueraDeMenu: CustomRecent[]
  /** Lo que el café cuenta (P45): insumos y artículos del menú; vacío si no cuenta nada. */
  existencias: ItemExistencia[]
  /** Pedido por voz en el mostrador (prototipo): solo en los cafés de VOZ_CAFES. */
  vozEnMostrador?: boolean
}


/** Segundos de calma antes de recargar por versión nueva: que un aviso de venta alcance a leerse. */
const CALMA_ANTES_DE_RECARGAR_MS = 8_000


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
  modifiersPrompt,
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
  suggestedFloat,
  avisoCierre,
  visitas,
  hayPromociones,
  creditEnabled,
  fiados,
  customItemsEnabled,
  recientesFueraDeMenu,
  existencias: existenciasIniciales,
  vozEnMostrador = false,
}: POSClientProps) {
  const router = useRouter()
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
    addLineas,
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
  const [showAprender, setShowAprender] = useState(false)
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
  // Lo que el café cuenta (P45): nace del servidor y se pone al día con lo que
  // cada cobro, cancelación o merma DEVUELVE, sin volver a pedir la carta. Con
  // `router.refresh()` llega de nuevo por props. Va antes de la cola porque las
  // ventas que suben desde ella también descuentan.
  const [existencias, setExistencias] = useState(existenciasIniciales)
  useEffect(() => setExistencias(existenciasIniciales), [existenciasIniciales])
  const [showExistencias, setShowExistencias] = useState(false)
  const aplicarExistencias = useCallback(
    (cambios: CambioExistencia[]) => setExistencias((lista) => aplicarCambios(lista, cambios)),
    [],
  )
  /** Solo lo del menú, que es lo que se pinta en las tarjetas. */
  const porVarianteMapa = useMemo(() => porVariante(existencias), [existencias])
  const cola = useOfflineQueue(businessId, aplicarExistencias)
  const [showQueueReview, setShowQueueReview] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // Se avisa UNA vez por cierre, no en cada recarga, y solo mientras no haya
  // caja abierta: en cuanto abre la suya, el aviso ya no viene a cuento.
  useEffect(() => {
    if (!avisoCierre || openSession) return
    const clave = `aviso-cierre:${avisoCierre.clave}`
    try {
      if (sessionStorage.getItem(clave)) return
      sessionStorage.setItem(clave, "1")
    } catch {
      /* sin almacenamiento: se avisa igual, aunque se repita */
    }
    toast.info(avisoCierre.titulo, { description: avisoCierre.detalle, duration: 12000 })
  }, [avisoCierre, openSession])
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
  // Tras un deploy, la pestaña que quedó abierta se recarga sola en un
  // momento de calma: carrito vacío, sin recibo a la vista, sin diálogo
  // abierto, y así durante unos segundos (justo después de cobrar el
  // carrito queda vacío, pero la persona está leyendo el aviso o el recibo).
  // Si no, la siguiente acción que revalide traería módulos de otro build y
  // tronaría (ver lib/version.ts). El contador cambia en cada sondeo, así que
  // se vuelve a intentar hasta que llegue la calma.
  useEffect(() => {
    if (!parked.versionNueva || cart.lines.length > 0 || completedSale) return
    const t = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return
      if (marcarRecargaPorVersion()) window.location.reload()
    }, CALMA_ANTES_DE_RECARGAR_MS)
    return () => window.clearTimeout(t)
  }, [parked.versionNueva, cart.lines.length, completedSale])
  const [showPark, setShowPark] = useState(false)
  const [showTray, setShowTray] = useState(false)
  /** Cuenta que se está viendo con precios («¿me trae la cuenta?»). */
  const [accountToView, setAccountToView] = useState<AccountData | null>(null)
  const { openAccount, setOpenAccount, cuentasVisibles, marcarFiado, cerrarCuentaCobrada } = useCuentaAbierta({
    businessId,
    cashierId,
    parked,
  })
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

  /** Quién suele venir a esta hora: se calcula al abrir el diálogo, con la hora de ese momento. */
  const sugeridosNombre = useMemo(
    () =>
      showPark
        ? // Fuera los chips fijos y también las cuentas abiertas: esas ya se
          // ofrecen arriba, con su total. Verlas dos veces a dos renglones de
          // distancia solo hace dudar de si son la misma.
          suggestAccountNames(visitas, new Date().getHours(), [
            ...chipsDeNombre,
            ...cuentasVisibles.filter((o) => !esFiado(o)).map((o) => o.name),
          ])
        : [],
    [showPark, visitas, chipsDeNombre, cuentasVisibles],
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
   * Cuentas abiertas que se ofrecen al abrir otra (las que no son un chip
   * fijo). El sello es el de la última escritura, para que la ronda más
   * reciente quede a la izquierda; si el servidor no lo mandó, vale la hora
   * en que se abrió.
   */
  const cuentasQueSuman = useMemo(
    () =>
      showPark
        ? cuentasParaSumar(
            chipsCuentas.map(({ o, total }) => ({ name: o.name, total, at: Date.parse(o.updatedAt) || o.savedAt })),
            chipsDeNombre,
          )
        : [],
    [showPark, chipsCuentas, chipsDeNombre],
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

  // Modo ayudante (voz): el cajero dicta y entra directo al carrito. Lo que
  // llega sin un extra obligatorio abre la MISMA hoja que un toque.
  const dictado = useDictado({
    productos: products,
    alAgregar: (product, size, modifiers, cantidad, nota) => {
      addLineas(product, size, modifiers, cantidad, nota)
      vibra(12)
    },
    alAbrirHoja: (product, size) => setPendingModifiers({ product, size }),
    lineas: lines,
    alQuitarLinea: removeLine,
    alCambiarCantidad: (lineId, cantidad) => (cantidad <= 0 ? removeLine(lineId) : setQuantityTo(lineId, cantidad)),
  })
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
  // Lo que acaba de volver entero al carrito (una cuenta o la última venta):
  // se anuncia unos segundos en el carrito y en la barra de celular.
  const [recuperada, setRecuperada] = useState<Recuperada | null>(null)
  useEffect(() => {
    if (!recuperada) return
    const t = setTimeout(() => setRecuperada(null), 3000)
    return () => clearTimeout(t)
  }, [recuperada])
  // ── Fuera de menú (P39) ──
  // «La fruta picada pero sin yogurt»: qué es y cuánto, y entra al carrito
  // como un renglón más, con su nombre. Se abre desde la fila de más
  // vendidos o desde una búsqueda sin resultados, ya con lo buscado escrito.
  const [fueraDeMenu, setFueraDeMenu] = useState<{ open: boolean; name: string }>({ open: false, name: "" })
  const agregarFueraDeMenu = useCallback(
    (item: { name: string; price: number }) => {
      addLine(customProduct(item.name, item.price))
      vibra(12)
    },
    [addLine],
  )

  // ── Fiados (P38) ──
  // Con «Fiado» elegido, la venta va a nombre de alguien: se pregunta al
  // momento y se conserva hasta cobrar. La propina no se fía.
  const [creditCustomer, setCreditCustomer] = useState<CuentaFiado | null>(null)
  const [showCreditPicker, setShowCreditPicker] = useState(false)
  const [showCredit, setShowCredit] = useState(false)
  useEffect(() => {
    if (paymentMethod !== "fiado") return
    if (!creditEnabled) {
      setPaymentMethod("efectivo")
      return
    }
    clearTip()
    if (!creditCustomer) setShowCreditPicker(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, creditEnabled])

  // ── Corregir una venta cobrada (P37) ──
  // La venta vuelve al carrito tal como se cobró; al cobrar de nuevo, el
  // servidor cancela la original y cobra esta con la hora original.
  const [corrigiendo, setCorrigiendo] = useState<{ id: string; folio: number; total: number } | null>(null)

  /** «Quedan 3» / «Agotado» de una tarjeta; null si no se cuenta o hay de sobra. */
  const esquinaDe = useCallback(
    (p: Product): string | null => {
      const ids = p.sizes ? p.sizes.map((s) => s.variantId) : p.variantId ? [p.variantId] : []
      const lista = ids.flatMap((id) => (porVarianteMapa[id] ? [porVarianteMapa[id]] : []))
      return lista.length ? esquinaProducto(lista) : null
    },
    [porVarianteMapa],
  )
  const feedback = useCartFeedback({ lines, isMobile, cartOpen, recuperada })
  const { lastAdded, markFlyOrigin, marcarOrigenEn, cartPulse, barDip, barTargetRef, bagTargetRef } = feedback

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
  const { promo, sinPromo } = usePromoPreview(lines, discount !== null || loyaltyRedeem, hayPromociones)

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

  const clearTip = useCallback(() => {
    setTipChoice(0)
    setTipCustomInput("")
  }, [])

  const { parkCurrent, saveToOpenAccount, dividirCuenta } = useGuardarCuenta({
    parked,
    openAccount,
    setOpenAccount,
    lines,
    cartStateNow,
    clearCart,
    clearTip,
    restoreLines,
  })

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
    async (
      order: ParkedOrder,
      e?: React.MouseEvent<HTMLElement>,
      /** Lo que respondió el diálogo; sin esto, se pregunta. */
      respuesta?: { guardar: boolean; desde?: { x: number; y: number } | null },
    ) => {
      // El chip se mide AHORA —después de un await, `currentTarget` ya es
      // null—, pero el vuelo se apunta más abajo, cuando ya se sabe que la
      // cuenta sí va a volver al carrito.
      const desde = e ? (() => {
        const r = e.currentTarget.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })() : (respuesta?.desde ?? null)
      const estado = rehydrateCart(order.cart, products, Date.now(), PARKED_MAX_AGE_MS)
      if (!estado || estado.lines.length === 0) {
        toast.error(
          "Esta cuenta no se puede cobrar: sus productos ya no están en el menú. Reactívalos en Menú → Productos.",
          { duration: 10000 },
        )
        return
      }
      // Cambiarse de mesa guardaba SIEMPRE lo que hubiera en pantalla, y eso
      // incluía las equivocaciones: bastaba subir una cantidad sin querer y
      // tocar otra cuenta para dejarla mal, sin verlo. Ahora se pregunta,
      // pero solo cuando hay algo que preguntar: si lo que está en pantalla
      // es lo mismo que la cuenta ya tiene guardado, cambiarse sigue siendo
      // un solo toque —que es el gesto de toda la hora pico—.
      if (openAccount && lines.length > 0 && !respuesta) {
        const cambios = cambiosPendientes(openAccount.cartAtOpen, serializeCart(cartStateNow(), Date.now()))
        if (cambios.hay) {
          setCambioDeCuenta({ order, desde, cambios, nombre: openAccount.name })
          return
        }
      }
      // Qué se puso a salvo antes de traer la otra cuenta. En celular lo dice
      // la tarjeta —«Mesa 2» volvió · «Mesa 1» quedó guardada—, en un solo
      // mensaje: dos avisos a la vez arriba se encimaban y no se leía ninguno.
      let guardada: string | undefined
      if (lines.length > 0) {
        // Lo que está en el carrito va a su sitio: a su propia cuenta si ya
        // tenía una, o a una nueva si era una venta suelta.
        if (openAccount && respuesta?.guardar === false) {
          // Dijo que no: la cuenta se queda con lo último guardado y lo de
          // pantalla se descarta. La fila del servidor no se toca.
        } else if (openAccount) {
          // Si no se pudo poner a salvo, NO se sigue: abrir la otra cuenta
          // reemplazaría el carrito y esas líneas se perderían.
          const g = await saveToOpenAccount({ callado: isMobile })
          if (!g.ok) return
          if (isMobile && g.guardadaComo) guardada = g.guardadaComo
        } else {
          const auto = autoName(new Date())
          if (!parked.park(cartStateNow(), auto)) {
            toast.error("La bandeja está llena: cobra o descarta una cuenta antes de cambiar.")
            return
          }
          if (isMobile) guardada = auto
          else toast.info(`Lo que tenías en el carrito se guardó como «${auto}».`)
        }
      }
      setOpenAccount({
        id: order.id,
        name: order.name,
        openedAt: order.savedAt,
        updatedAt: order.updatedAt,
        cartAtOpen: order.cart,
      })
      if (desde) marcarOrigenEn(desde.x, desde.y)
      restoreLines(estado.lines)
      setRecuperada({
        key: Date.now(),
        name: order.name,
        articulos: estado.lines.reduce((s, l) => s + l.quantity, 0),
        detalle: detalleRecuperada(estado.lines),
        total: cartSubtotal(estado.lines),
        guardada,
      })
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
    [products, lines.length, openAccount, saveToOpenAccount, parked, cartStateNow, restoreLines, setTicketNotes, marcarOrigenEn],
  )

  /**
   * Corregir una venta cobrada (P37): vuelve al carrito tal como se cobró
   * —líneas, método, notas (y con ellas «Para llevar»), descuento a mano,
   * propina, tarjeta de sellos— y al cobrar de nuevo el servidor cancela la
   * original y cobra esta con la hora original. Lo que hubiera en el
   * carrito se pone a salvo como al abrir una cuenta.
   */
  const iniciarCorreccion = useCallback(
    async (ticket: TicketRecord) => {
      if (practica) {
        toast.error("Sal del modo práctica para corregir una venta de verdad.")
        return
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("Para corregir una venta hace falta conexión.")
        return
      }
      const porId = new Map(products.map((p) => [p.id, p]))
      const guardado: PersistedCart = {
        v: CART_STORAGE_VERSION,
        savedAt: Date.now(),
        saleRef: crypto.randomUUID(),
        paymentMethod:
          ticket.paymentMethod === "transferencia" || ticket.paymentMethod === "tarjeta_clip"
            ? ticket.paymentMethod
            : "efectivo",
        ticketNotes: ticket.notes,
        cashReceivedInput: "",
        discount: null,
        lines: ticket.items.map((it) => ({
          lineId: crypto.randomUUID(),
          productId: it.productId,
          // Un producto con tamaños guarda el NOMBRE de la variante; uno sin
          // tamaños, null. Es la misma llave que usan las cuentas abiertas.
          sizeLabel: porId.get(it.productId)?.sizes?.length ? it.variantName : null,
          modifierIds: it.modifiers.map((m) => m.modifierId),
          quantity: it.quantity,
          notes: it.notes,
          // Fuera de menú: no hay producto que buscar; vuelve con su nombre y precio.
          ...(it.isCustom ? { custom: { name: it.productName, price: it.unitPrice } } : {}),
        })),
      }
      const estado = rehydrateCart(guardado, products, Date.now())
      if (!estado || estado.lines.length === 0) {
        toast.error("No se puede corregir: sus productos ya no están en el menú. Cancélala y cóbrala de nuevo.", {
          duration: 10000,
        })
        return
      }
      let guardada: string | undefined
      if (lines.length > 0) {
        if (openAccount) {
          const g = await saveToOpenAccount({ callado: isMobile })
          if (!g.ok) return
          if (isMobile && g.guardadaComo) guardada = g.guardadaComo
        } else {
          const auto = autoName(new Date())
          if (!parked.park(cartStateNow(), auto)) {
            toast.error("La bandeja está llena: cobra o descarta una cuenta antes de corregir.")
            return
          }
          if (isMobile) guardada = auto
          else toast.info(`Lo que tenías en el carrito se guardó como «${auto}».`)
        }
      }
      setOpenAccount(null)
      restoreLines(estado.lines)
      setPaymentMethod(estado.paymentMethod)
      setTicketNotes(estado.ticketNotes)
      // El descuento a mano vuelve tal cual; el de promoción no (la promoción
      // se vuelve a evaluar sola) y el canje de lealtad vuelve como canje.
      const esCanje = !!ticket.loyalty && ticket.discountReason === "Premio de lealtad"
      setDiscount(
        ticket.discountTotal > 0 && ticket.discountReason && (esCanje || !ticket.promotionId)
          ? { type: "amount", value: ticket.discountTotal, reason: ticket.discountReason }
          : null,
      )
      setLoyaltyCustomer(
        ticket.loyalty
          ? {
              id: ticket.loyalty.id,
              phone: ticket.loyalty.phone,
              name: ticket.loyalty.name,
              stamps: ticket.loyalty.stamps,
              visits: ticket.loyalty.visits,
              rewardsRedeemed: ticket.loyalty.rewardsRedeemed,
              lastVisitAt: ticket.loyalty.lastVisitAt,
            }
          : null,
      )
      setLoyaltyRedeem(esCanje)
      if (ticket.tip > 0) {
        setTipChoice("otro")
        setTipCustomInput(String(ticket.tip))
      } else {
        clearTip()
      }
      setCorrigiendo({ id: ticket.id, folio: ticket.folio, total: ticket.total })
      setRecuperada({
        key: Date.now(),
        name: `Venta #${ticket.folio}`,
        articulos: estado.lines.reduce((s, l) => s + l.quantity, 0),
        detalle: detalleRecuperada(estado.lines),
        total: cartSubtotal(estado.lines),
        guardada,
      })
      setShowTray(false)
      if (isMobile) setCartOpen(true)
      vibra(12)
      const caidos = ticket.items.length - estado.lines.length
      if (caidos > 0) {
        toast.warning(
          caidos === 1
            ? "1 artículo de esa venta ya no está en el menú y no se va a cobrar. Reactívalo en Menú → Productos si hace falta."
            : `${caidos} artículos de esa venta ya no están en el menú y no se van a cobrar. Reactívalos en Menú → Productos si hace falta.`,
          { duration: 12000 },
        )
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, lines.length, openAccount, saveToOpenAccount, parked, cartStateNow, restoreLines, setPaymentMethod, setTicketNotes, setDiscount, clearTip, isMobile],
  )

  /** Dejar la venta como estaba: el carrito se vacía y no se cancela nada. */
  const cancelarCorreccion = useCallback(() => {
    if (!corrigiendo) return
    const folio = corrigiendo.folio
    setCorrigiendo(null)
    clearCart()
    clearTip()
    setLoyaltyCustomer(null)
    setLoyaltyRedeem(false)
    toast.info(`La venta #${folio} se queda como estaba.`)
  }, [corrigiendo, clearCart, clearTip])

  // ── Modo práctica ──
  // Para aprender el POS tocando, sin miedo a ensuciar las ventas reales:
  // «siento que es más rápido en la libreta» casi siempre es falta de
  // práctica, y nadie practica con dinero de verdad. Solo entra con el
  // carrito vacío y sin cuenta abierta, y al salir se vacía: lo que se armó
  // practicando no debe poder cobrarse de verdad un toque después. No se
  // guarda en ningún lado: recargar la página lo apaga.
  const [practica, setPractica] = useState(false)
  // Cobros de práctica desde que se abrió el POS: el recorrido termina con el siguiente.
  const [ventasPractica, setVentasPractica] = useState(0)
  const togglePractica = useCallback(() => {
    if (practica) {
      clearCart()
      clearTip()
      setLoyaltyCustomer(null)
      setLoyaltyRedeem(false)
      setPractica(false)
      toast.info("Saliste del modo práctica. El carrito se vació.")
      return
    }
    if (lines.length > 0 || openAccount) {
      toast.info("Vacía el carrito (o cobra la cuenta abierta) antes de practicar.")
      return
    }
    setPractica(true)
    toast.success("Modo práctica: cobra lo que quieras, nada se registra.")
  }, [practica, lines.length, openAccount, clearCart, clearTip])
  // Practicando no se abren cuentas: también viven en el servidor.
  const cuentasActivas = parkedEnabled && !practica
  // «Ponlo en tu pantalla de inicio»: la tarjeta de arranque y el menú ⋮ lo ofrecen.
  const instalar = useInstallPrompt()

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

  // Practicando no hace falta caja abierta: no se registra nada.
  const canCharge =
    lines.length > 0 &&
    !isProcessing &&
    (practica || !!openSession) &&
    !cashInsufficient &&
    !discountInvalid &&
    (paymentMethod !== "fiado" || creditCustomer !== null)

  /** Cambio de cuenta en pausa: hay algo sin guardar y falta la respuesta. */
  const [cambioDeCuenta, setCambioDeCuenta] = useState<{
    order: ParkedOrder
    desde: { x: number; y: number } | null
    cambios: { piezasGuardadas: number; piezasAhora: number }
    nombre: string
  } | null>(null)
  /** Nombre de la cuenta que se va a eliminar, o null. */
  const [eliminarCuenta, setEliminarCuenta] = useState<string | null>(null)
  // Abierto y nombre van SEPARADOS, y el nombre no se limpia al cerrar: la
  // cuenta se suelta antes de que termine la animación de salida, y leer el
  // nombre de `openAccount` —o borrarlo al cerrar— dejaba «Separar «»» a la
  // vista esos milisegundos.
  const [dividirAbierto, setDividirAbierto] = useState(false)
  const [nombreDividir, setNombreDividir] = useState("")

  const finalizeSale = useCallback(async () => {
    if (!canCharge) return
    if (practica) {
      // Nada viaja al servidor: ni ticket, ni cola, ni sellos, ni cuenta. Se
      // dice el mismo resultado que en una venta real para que el ensayo
      // enseñe lo que va a pasar de verdad.
      const cambio = changeDue !== null && changeDue > 0 ? ` · Cambio ${formatCurrency(changeDue)}` : ""
      toast.success(`Práctica: ${formatCurrency(due)} · ${paymentLabel(paymentMethod)}${cambio}`, {
        description: "No se registró nada. Así se cobra de verdad.",
        duration: 5000,
      })
      vibra(30)
      setVentasPractica((n) => n + 1)
      clearTip()
      setLoyaltyCustomer(null)
      setLoyaltyRedeem(false)
      resetAfterSale()
      setCartOpen(false)
      return
    }

    // Lo que se va a cobrar, congelado ahora: con el cobro instantáneo el
    // carrito se vacía antes de que el servidor conteste, y la venta tiene
    // que ser exactamente la que la persona vio.
    const venta = {
      lines: [...lines],
      paymentMethod,
      ticketNotes: ticketNotes.trim(),
      cashReceived,
      tipAmount,
      discount,
      esParaLlevar,
      saleRef,
      total,
      due,
    }
    // Los precios NO se mandan: el servidor los recalcula desde el menú
    // (variante + modificadores) y valida el descuento.
    const items = linesToItems(venta.lines)
    // Cobro instantáneo: en celular sin impresora la venta se da por hecha al
    // momento —aviso, carrito limpio, siguiente cliente— y el servidor
    // confirma por detrás; si la rechaza, el carrito regresa con el motivo.
    // Con cuenta abierta, lealtad o impresora se espera, porque ahí lo que
    // sigue necesita la respuesta del servidor.
    const optimista =
      isMobile && autoPrint === "none" && !openAccount && !loyaltyCustomer && !loyaltyRedeem && !corrigiendo && venta.paymentMethod !== "fiado"
    let avisoId: string | number | undefined
    if (optimista) {
      avisoId = toast.loading(`Cobrando ${formatCurrency(venta.due)} · ${paymentLabel(venta.paymentMethod)}…`)
      vibra(30)
      clearTip()
      resetAfterSale()
      setCartOpen(false)
    } else {
      setIsProcessing(true)
    }
    const restaurar = () => {
      restoreLines(venta.lines)
      setTicketNotes(venta.ticketNotes)
      setDiscount(venta.discount)
      setCartOpen(true)
    }
    const cerrarVenta = () => {
      vibra(30)
      clearTip()
      setLoyaltyCustomer(null)
      setLoyaltyRedeem(false)
      setCreditCustomer(null)
      // Fiar es la excepción, no la regla: la siguiente venta arranca en
      // efectivo y, si vuelve a ser fiado, se vuelve a preguntar a quién.
      if (venta.paymentMethod === "fiado") setPaymentMethod("efectivo")
      cerrarCuentaCobrada()
      resetAfterSale()
      setCartOpen(false)
    }

    try {
      const entrada = {
        clientRef: venta.saleRef,
        expectedBusinessId: businessId,
        paymentMethod: venta.paymentMethod,
        notes: venta.ticketNotes || undefined,
        cashReceived: venta.cashReceived ?? undefined,
        tip: venta.tipAmount > 0 ? venta.tipAmount : undefined,
        discount: venta.discount ?? undefined,
        loyaltyCustomerId: loyaltyCustomer?.id,
        loyaltyRedeem: loyaltyRedeem || undefined,
        takeout: venta.esParaLlevar || undefined,
        creditCustomerId: venta.paymentMethod === "fiado" ? creditCustomer?.id : undefined,
        items,
      }
      // Corrigiendo: el servidor cancela la original y cobra esta, en una
      // sola transacción y con la hora de la original.
      const result = corrigiendo
        ? await correctTicket({ ...entrada, originalId: corrigiendo.id })
        : await createTicket(entrada)

      if (result.success) {
        aplicarExistencias(result.stock)
        const completada = ventaCompletada(result, {
          lines: venta.lines,
          paymentMethod: venta.paymentMethod,
          notes: venta.ticketNotes,
          discountReason: venta.discount?.reason ?? null,
        })
        if (result.credit) {
          toast.success(`Fiado a ${result.credit.name} · ahora debe ${formatCurrency(result.credit.balance)}`, { duration: 8000 })
          // Las cuentas del selector traen el saldo: que se vea el nuevo.
          router.refresh()
        }
        // En celular sin impresora, un aviso con folio, monto y cambio dice lo
        // mismo que el recibo sin estorbar; «Ver ticket» abre el recibo
        // completo (imprimir, compartir, nota con QR) cuando sí hace falta.
        // Con impresión automática el diálogo se queda: ahí pasa algo.
        if (isMobile && autoPrint === "none") {
          const cambio =
            result.changeDue != null && result.changeDue > 0 ? ` · Cambio ${formatCurrency(result.changeDue)}` : ""
          toast.success(
            `Venta #${result.folio} · ${formatCurrency(result.total + result.tip)} · ${paymentLabel(venta.paymentMethod)}${cambio}`,
            {
              id: avisoId,
              duration: cambio ? 8000 : 5000,
              action: { label: "Ver ticket", onClick: () => setCompletedSale(completada) },
            },
          )
        } else {
          setCompletedSale(completada)
        }
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
        // El total del día son ventas: la propina no suma aquí. Si se
        // corrigió una venta, la original ya no cuenta.
        setTotalSales((prev) => prev + result.total - (corrigiendo ? corrigiendo.total : 0))
        // Acaba de llegar una venta: hay señal. Lo que esperaba en la cola, que suba ya.
        if (cola.pendientes > 0) void cola.subir()
        if (corrigiendo) {
          toast.success(`Venta #${corrigiendo.folio} corregida · ahora es el ticket #${result.folio}`, { duration: 7000 })
          setCorrigiendo(null)
        }
        // Guardar las líneas para «Repetir última venta» (validadas contra el
        // menú vigente al momento de repetir, no ahora).
        try {
          const payload = serializeCart(
            { saleRef: "", paymentMethod: venta.paymentMethod, ticketNotes: "", cashReceivedInput: "", discount: null, lines: venta.lines },
            Date.now(),
          )
          window.localStorage.setItem(lastSaleKey, JSON.stringify({ folio: result.folio, payload }))
          setLastSale({ folio: result.folio, payload })
        } catch {
          /* sin espacio: solo se pierde el botón de repetir */
        }
        if (!optimista) cerrarVenta()
      } else if (optimista) {
        restaurar()
        toast.error(result.error || "No se registró la venta. Revisa el carrito y vuelve a cobrar.", {
          id: avisoId,
          duration: 8000,
        })
      } else {
        toast.error(result.error || "Error al registrar la venta")
      }
    } catch (e) {
      if (esErrorDeVersion(e)) {
        // No es falta de señal: hay un deploy nuevo y la venta no entró.
        // A la cola no va (subiría con el mismo id viejo y fallaría igual).
        if (optimista) restaurar()
        avisarVersionNueva(avisoId)
        return
      }
      if (venta.paymentMethod === "fiado") {
        // Un fiado no va a la cola: lleva una cuenta que el servidor debe
        // validar, y sin señal no se sabe si ya quedó.
        if (optimista) restaurar()
        toast.error("Sin conexión: el fiado no se guardó. Vuelve a intentar cuando regrese la señal.", { id: avisoId, duration: 8000 })
        return
      }
      if (corrigiendo) {
        // Una corrección no va a la cola: cancela y cobra en el servidor, y
        // a ciegas no se sabe qué quedó. Se reintenta con señal.
        if (optimista) restaurar()
        toast.error("Sin conexión: la corrección no se guardó. Vuelve a intentar cuando regrese la señal.", {
          id: avisoId,
          duration: 8000,
        })
        return
      }
      // No llegó al servidor: en vez de dejar al cajero con la fila parada,
      // la venta se guarda en la cola con SU MISMO clientRef y se sube sola
      // al volver la señal. La idempotencia de create_ticket hace que
      // reenviarla sea inofensivo aunque en realidad sí hubiera entrado.
      const encolada = cola.encolar(ventaParaLaCola({
        clientRef: venta.saleRef,
        items,
        paymentMethod: venta.paymentMethod,
        notes: venta.ticketNotes || undefined,
        tip: venta.tipAmount > 0 ? venta.tipAmount : undefined,
        discount: venta.discount ?? undefined,
        cashReceived: venta.cashReceived ?? undefined,
        takeout: venta.esParaLlevar || undefined,
        loyaltyCustomerId: loyaltyCustomer?.id,
        loyaltyRedeem: loyaltyRedeem || undefined,
        // El total de la VENTA, sin propina: es lo que el servidor
        // recalcula y devuelve como `total`.
        chargedTotal: venta.total,
        lines: venta.lines,
      }))
      if (encolada) {
        avisarEncolada(encolada, avisoId)
        // La cuenta se cierra igual: la venta ya está capturada y va en la
        // cola. Dejarla abierta invitaría a cobrarla dos veces.
        if (!optimista) cerrarVenta()
      } else {
        if (optimista) restaurar()
        toast.error(`Ya hay ${QUEUE_MAX} ventas esperando internet. Recupera la señal antes de seguir cobrando.`, {
          id: avisoId,
        })
      }
    } finally {
      if (!optimista) setIsProcessing(false)
    }
  }, [canCharge, saleRef, businessId, paymentMethod, ticketNotes, esParaLlevar, cashReceived, tipAmount, discount, total, lines, lastSaleKey, clearTip, resetAfterSale, loyaltyCustomer, loyaltyRedeem, cola, cerrarCuentaCobrada, isMobile, autoPrint, practica, due, changeDue, openAccount, restoreLines, setTicketNotes, setDiscount, corrigiendo, creditCustomer, router, setPaymentMethod, aplicarExistencias])

  /**
   * Producto/tamaño elegido: si algún extra es obligatorio (o el negocio pide
   * preguntar siempre), abre la hoja; si no, directo al carrito. Los extras
   * opcionales se agregan después desde «cambiar» en la línea.
   */
  const chooseProduct = useCallback(
    (product: Product, size?: SizeOption) => {
      setSizePickerFor(null)
      if (needsModifierPrompt(product, modifiersPrompt)) {
        setPendingModifiers({ product, size })
      } else {
        // Sin hoja, la línea nace con las opciones por omisión de sus grupos
        // («deslactosada, siempre»); se cambian desde la línea si hace falta.
        addLine(product, size, defaultModifiers(product))
        vibra(12)
      }
    },
    [addLine, modifiersPrompt],
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

  // ── Recorrido de la primera venta ──
  // Cinco pasos sobre el POS real, en práctica, que avanzan cuando la persona
  // hace cada cosa (no cuando lee). Lo que está pasando se le pasa como
  // señales; la máquina (lib/recorrido-pos.ts) decide el paso y la tarjeta.
  const recorrido = useRecorrido({
    lineas: lines.length,
    articulos: itemCount,
    eligiendoTamano: sizePickerFor !== null,
    preguntaAbierta: pendingModifiers !== null,
    esMovil: isMobile === true,
    carritoAbierto: cartOpen,
    efectivoEscrito: cashReceivedInput.trim() !== "",
    ventasPractica,
  })
  const empezarRecorrido = useCallback(() => {
    if (lines.length > 0 || openAccount) {
      toast.info("Vacía el carrito (o cobra la cuenta abierta) antes del recorrido.")
      return
    }
    if (!practica) togglePractica()
    setCartOpen(false)
    recorrido.iniciar()
  }, [lines.length, openAccount, practica, togglePractica, recorrido])
  // /pos?recorrido=1 (desde la guía): empieza solo, ya restaurado el carrito
  // guardado; si no estaba vacío, el aviso de arriba lo dice.
  const empezarRef = useRef(empezarRecorrido)
  empezarRef.current = empezarRecorrido
  useEffect(() => {
    if (!cart.hydrated) return
    const u = new URL(window.location.href)
    if (u.searchParams.get("recorrido") !== "1") return
    u.searchParams.delete("recorrido")
    window.history.replaceState(null, "", u.toString())
    empezarRef.current()
  }, [cart.hydrated])
  const tarjetaRecorrido = recorrido.tarjeta ? (
    <RecorridoTarjeta
      tarjeta={recorrido.tarjeta}
      esMovil={isMobile === true}
      onSiguiente={recorrido.siguiente}
      onCerrar={recorrido.cerrar}
      onVender={() => {
        recorrido.cerrar()
        if (practica) togglePractica()
      }}
      onOtraVez={() => recorrido.iniciar()}
    />
  ) : null

  /* Panel del carrito (header + líneas + cobro). Se monta una sola vez:
     como columna derecha en escritorio o dentro de una hoja inferior en
     móvil, para que refs y foco apunten al panel visible. */
  /**
   * Vuelve a poner la última venta en el carrito, validada contra el menú de
   * hoy: si algo cambió de precio o se desactivó, esa línea no regresa (y se
   * avisa). Después de una clase se venden cinco lattes iguales seguidos.
   */
  const repetirUltimaVenta = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    if (!lastSale) return
    const desde = e ? (() => {
      const r = e.currentTarget.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })() : null
    const estado = rehydrateCart(lastSale.payload, products, Date.now())
    if (!estado || estado.lines.length === 0) {
      toast.error("El menú cambió y ya no se puede repetir esa venta.")
      return
    }
    if (desde) marcarOrigenEn(desde.x, desde.y)
    restoreLines(estado.lines)
    setRecuperada({
      key: Date.now(),
      name: `Venta #${lastSale.folio}`,
      articulos: estado.lines.reduce((s, l) => s + l.quantity, 0),
      detalle: detalleRecuperada(estado.lines),
      total: cartSubtotal(estado.lines),
    })
    vibra(12)
    const guardadas = (lastSale.payload as { lines?: unknown[] }).lines?.length ?? 0
    if (estado.lines.length < guardadas) {
      toast.info("Se repitió la venta, pero algún artículo ya no está en el menú.")
    }
  }, [lastSale, products, restoreLines, marcarOrigenEn])
  const ultimaTotal = useMemo(() => {
    if (!lastSale) return null
    const estado = rehydrateCart(lastSale.payload, products, Date.now())
    return estado && estado.lines.length > 0 ? cartSubtotal(estado.lines) : null
  }, [lastSale, products])


  const { cobrandoCuenta, confirmarCobro, tocarCobro } = useCobrarCuenta({
    products, openSession, businessId, parked, openAccount, setOpenAccount, clearCart, cola, aplicarExistencias,
    setCompletedSale, setTotalSales,
  })

  const cartPanel = (
    <CartPanel
      onRepeatLast={repetirUltimaVenta}
      onEliminarCuenta={() => openAccount && setEliminarCuenta(openAccount.name)}
      onDividir={() => {
        if (!openAccount) return
        setNombreDividir(openAccount.name)
        setDividirAbierto(true)
      }}
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
      parkedEnabled={cuentasActivas}
      practica={practica}
      recorrido={recorrido.tarjeta?.donde === "carrito" ? tarjetaRecorrido : undefined}
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
      recuperada={recuperada}
      corrigiendo={corrigiendo ? { folio: corrigiendo.folio } : null}
      cancelarCorreccion={cancelarCorreccion}
      creditEnabled={creditEnabled}
      creditCustomer={creditCustomer}
      setShowCreditPicker={setShowCreditPicker}
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
      {practica && <PracticeBanner onExit={togglePractica} />}
      {recorrido.tarjeta?.donde === "flotante" && tarjetaRecorrido}
      {/* Ventas por subir: arriba de todo y sin forma de descartarlo — una
          cola olvidada es dinero cobrado que no está registrado. */}
      <QueueBanner
        state={cola.state}
        pendientes={cola.pendientes}
        porRevisar={cola.porRevisar}
        subiendo={cola.subiendo}
        soloEnMemoria={cola.soloEnMemoria}
        atorada={cola.atorada}
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
          creditEnabled={creditEnabled}
          setShowCredit={setShowCredit}
          setShowShortcuts={setShowShortcuts}
          textSize={textSize}
          practica={practica}
          onTogglePractica={togglePractica}
          onAprender={() => setShowAprender(true)}
          onExistencias={existencias.length > 0 ? () => setShowExistencias(true) : undefined}
          vozEnMostrador={vozEnMostrador}
          dictado={vozEnMostrador ? { activo: dictado.estado === "conectando" || dictado.estado === "escuchando", alternar: dictado.alternar } : undefined}
          instalar={instalar}
          parkedEnabled={cuentasActivas}
          openAccount={openAccount}
          cuentasVisibles={cuentasVisibles}
          chipsCuentas={chipsCuentas}
          cuentasEnBarra={isMobile === true}
          setCartOpen={setCartOpen}
          resumeParked={resumeParked}
          categories={categories}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />

        {/* Product grid */}
        <RejillaProductos
          gridScrollRef={gridScrollRef}
          isMobile={isMobile}
          cuentasActivas={cuentasActivas}
          openAccount={openAccount}
          chipsCuentas={chipsCuentas}
          products={products}
          favorites={favorites}
          filtered={filtered}
          grouped={grouped}
          empezarRecorrido={empezarRecorrido}
          instalar={instalar}
          searchQuery={searchQuery}
          searchLower={searchLower}
          activeCategory={activeCategory}
          customItemsEnabled={customItemsEnabled}
          setFueraDeMenu={setFueraDeMenu}
          porVarianteMapa={porVarianteMapa}
          esquinaDe={esquinaDe}
          markFlyOrigin={markFlyOrigin}
          chooseProduct={chooseProduct}
          handleProductClick={handleProductClick}
          sizePickerFor={sizePickerFor}
          setInfoProduct={setInfoProduct}
          categoryColor={categoryColor}
        />
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
          <BarraMovil
            barDip={barDip}
            barTargetRef={barTargetRef}
            lastAdded={lastAdded}
            cuentasActivas={cuentasActivas}
            openAccount={openAccount}
            chipsCuentas={chipsCuentas}
            setCartOpen={setCartOpen}
            resumeParked={resumeParked}
            tocarCobro={tocarCobro}
            cobrandoCuenta={cobrandoCuenta}
            confirmarCobro={confirmarCobro}
            openSession={openSession}
            setShowTray={setShowTray}
            lines={lines}
            lastSale={lastSale}
            ultimaTotal={ultimaTotal}
            repetirUltimaVenta={repetirUltimaVenta}
            itemCount={itemCount}
            total={total}
            due={due}
            saveToOpenAccount={saveToOpenAccount}
            setShowPark={setShowPark}
            practica={practica}
            paymentMethod={paymentMethod}
            canCharge={canCharge}
            finalizeSale={finalizeSale}
            isProcessing={isProcessing}
            setShowCashDialog={setShowCashDialog}
          />
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

      {/* El anuncio de «volvió esta cuenta», solo en celular: en escritorio
          el carrito está a la vista y ya lo dice su franja verde. Con la hoja
          abierta tampoco hace falta —se ven las líneas entrando—. */}
      {isMobile && !cartOpen && <RecuperadaCard recuperada={recuperada} />}

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
        onReintentar={cola.reintentar}
      />
      <AprenderDialog
        open={showAprender}
        onOpenChange={setShowAprender}
        recorridoHecho={recorrido.hecho}
        practica={practica}
        parkedEnabled={parkedEnabled}
        loyaltyEnabled={loyaltyEnabled}
        onRecorrido={empezarRecorrido}
        onPracticar={togglePractica}
      />
      {/* Cambiarse de cuenta con algo sin guardar: se pregunta UNA vez y
          solo si de verdad cambió algo. Las tres salidas son explícitas
          —guardar, descartar, volver— porque aquí se decide qué le queda
          anotado a una mesa que todavía no paga. */}
      {/* Eliminar la cuenta entera. Es lo único de la cabecera que no tiene
          vuelta atrás, así que el aviso dice qué se pierde y el botón va en
          rojo — el mismo trato que en la bandeja. */}
      <AlertDialog open={eliminarCuenta !== null} onOpenChange={(abierto) => !abierto && setEliminarCuenta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar «{eliminarCuenta}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se pierde lo que lleva y no se puede recuperar. Úsalo cuando el pedido se canceló; si solo quieres
              atender otra mesa, usa <strong>Salir</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="blanco-comodo">Volver</AlertDialogCancel>
            <AlertDialogAction
              className="blanco-comodo bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (openAccount) {
                  parked.remove(openAccount.id)
                  toast.success(`Se eliminó «${openAccount.name}».`)
                }
                clearCart()
                clearTip()
                setOpenAccount(null)
                setEliminarCuenta(null)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={cambioDeCuenta !== null} onOpenChange={(abierto) => !abierto && setCambioDeCuenta(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios en «{cambioDeCuenta?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {cambioDeCuenta && cambioDeCuenta.cambios.piezasGuardadas > 0
                ? `«${cambioDeCuenta.nombre}» tiene ${cambioDeCuenta.cambios.piezasGuardadas} ${
                    cambioDeCuenta.cambios.piezasGuardadas === 1 ? "artículo guardado" : "artículos guardados"
                  } y en pantalla hay ${cambioDeCuenta.cambios.piezasAhora}. Si no los guardas, la cuenta se queda como estaba.`
                : "Lo que hay en pantalla no está guardado en la cuenta. Si no lo guardas, se descarta."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="blanco-comodo">Volver</AlertDialogCancel>
            <Button
              variant="outline"
              className="blanco-comodo"
              onClick={() => {
                const p = cambioDeCuenta
                setCambioDeCuenta(null)
                if (p) void resumeParked(p.order, undefined, { guardar: false, desde: p.desde })
              }}
            >
              Cambiar sin guardar
            </Button>
            <AlertDialogAction
              className="blanco-comodo"
              onClick={() => {
                const p = cambioDeCuenta
                setCambioDeCuenta(null)
                if (p) void resumeParked(p.order, undefined, { guardar: true, desde: p.desde })
              }}
            >
              Guardar y cambiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DividirCuentaDialog
        open={dividirAbierto}
        onOpenChange={setDividirAbierto}
        lines={lines}
        accountName={nombreDividir}
        onConfirm={(elegido) => void dividirCuenta(elegido)}
      />
      <CashSessionDialog
        open={showCashDialog}
        onOpenChange={setShowCashDialog}
        session={openSession}
        suggestedFloat={suggestedFloat}
        avisoCierre={avisoCierre}
        parkedCount={parkedEnabled ? cuentasVisibles.length : 0}
        parkedOld={parkedEnabled ? cuentasViejas : []}
        cardFeePct={cardFeePct}
        pendingUploads={cola.pendientes + cola.porRevisar}
      />
      {customItemsEnabled && (
        <CustomItemDialog
          open={fueraDeMenu.open}
          onOpenChange={(o) => setFueraDeMenu((f) => ({ ...f, open: o }))}
          initialName={fueraDeMenu.name}
          recientes={recientesFueraDeMenu}
          onAdd={agregarFueraDeMenu}
        />
      )}
      {creditEnabled && (
        <>
          <CreditPickerDialog
            open={showCreditPicker}
            onOpenChange={(o) => {
              setShowCreditPicker(o)
              // Cerró sin elegir: la venta no puede quedar «fiada a nadie».
              if (!o && !creditCustomer && paymentMethod === "fiado") setPaymentMethod("efectivo")
            }}
            cuentas={fiados}
            onPick={(c) => {
              setCreditCustomer(c)
              setShowCreditPicker(false)
            }}
          />
          <CreditAccountsDialog open={showCredit} onOpenChange={setShowCredit} cuentas={fiados} onChanged={() => router.refresh()} />
        </>
      )}
      <TicketHistoryDialog
        onCorrect={iniciarCorreccion}
        onStock={aplicarExistencias}
        open={showTickets}
        onOpenChange={setShowTickets}
        isAdmin={isAdmin}
        publicReceipt={publicReceipt}
      />
      <RecentOrdersDialog open={showRecent} onOpenChange={setShowRecent} />
      <ExistenciasPosDialog
        open={showExistencias}
        onOpenChange={setShowExistencias}
        existencias={existencias}
        isAdmin={isAdmin}
        onCambios={aplicarExistencias}
      />
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
        paraSumar={cuentasQueSuman}
        chips={chipsDeNombre}
        sugeridos={sugeridosNombre}
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
      {vozEnMostrador && <DictadoPanel dictado={dictado} isMobile={isMobile === true} />}
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
            <AlertDialogCancel className="blanco-comodo">Volver</AlertDialogCancel>
            {/* Rojo y «Vaciar» solo cuando de verdad se pierde algo. Con una
                cuenta abierta no se pierde nada —la fila del servidor no se
                toca—, y un botón rojo ahí es lo último que ve quien está
                decidiendo si se atreve. */}
            <AlertDialogAction
              className={openAccount ? "blanco-comodo" : "blanco-comodo bg-red-600 hover:bg-red-700"}
              onClick={() => {
                clearCart()
                clearTip()
                // Solo se suelta el puntero: la fila del servidor no se tocó
                // en ningún momento, así que la cuenta queda intacta.
                setOpenAccount(null)
                setConfirmClear(false)
              }}
            >
              {openAccount ? "Salir" : "Vaciar"}
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
