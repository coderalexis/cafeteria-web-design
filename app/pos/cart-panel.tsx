"use client"

import { useRef, useState, type RefObject } from "react"
import { AnimatePresence, m } from "framer-motion"
import { toast } from "sonner"
import {
  Calculator,
  ChevronDown,
  Copy,
  HandCoins,
  Lock,
  Minus,
  ArchiveRestore,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  ShoppingBag,
  Stamp,
  StickyNote,
  Trash2,
  X,
  Gift,
} from "lucide-react"
import { formatCurrency, paymentLabel, PAYMENT_METHODS, PAYMENT_METHOD_KEYS } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CartLineDialog } from "./cart-line-dialog"
import { formatPhone } from "./loyalty-dialog"
import type { LoyaltyCustomer } from "@/app/actions/loyalty"
import type { OpenSession } from "./cash-session-dialog"
import { getLinePrice, type CartLine, type PaymentMethod, type Product, type SizeOption, type TicketDiscount } from "./cart"
import { gestoEnTarjeta, vibra, PRESION_LARGA_MS, QUICK_NOTES, TIP_OPTIONS, UMBRAL_GESTO, type TipChoice } from "./pos-utils"
import { avisoRecuperada, type Recuperada, type ParkedOrder } from "./parked"
import type { usePosCart } from "./use-pos-cart"

type Cart = ReturnType<typeof usePosCart>

/** La cuenta abierta en este carrito (ver POSClient). */
export interface OpenAccountRef {
  id: string
  name: string
  openedAt: number
  updatedAt: string
}

/** Producto/tamaño esperando modificadores: alta nueva o edición de una línea. */
export interface PendingModifiers {
  product: Product
  size?: SizeOption
  initial?: CartLine["modifiers"]
  editing?: boolean
  lineId?: string
}

export interface CartPanelProps {
  // Carrito
  lines: CartLine[]
  products: Product[]
  itemCount: number
  isMobile: boolean
  setCartOpen: (open: boolean) => void
  updateQuantity: Cart["updateQuantity"]
  setQuantityTo: Cart["setQuantityTo"]
  duplicateLine: Cart["duplicateLine"]
  removeLine: Cart["removeLine"]
  restoreLines: Cart["restoreLines"]
  setLineNotes: Cart["setLineNotes"]
  setPendingModifiers: (p: PendingModifiers | null) => void
  lastSale: { folio: number; payload: unknown } | null
  /** Vuelve a poner en el carrito la última venta (validada contra el menú de hoy). */
  onRepeatLast: () => void
  setConfirmClear: (open: boolean) => void
  // Cuentas abiertas
  parkedEnabled: boolean
  openAccount: OpenAccountRef | null
  cuentasVisibles: ParkedOrder[]
  saveToOpenAccount: () => Promise<boolean>
  setShowPark: (open: boolean) => void
  setShowTray: (open: boolean) => void
  // Lealtad
  loyaltyEnabled: boolean
  loyaltyCustomer: LoyaltyCustomer | null
  loyaltyRedeem: boolean
  loyaltyTarget: number
  setLoyaltyCustomer: (c: LoyaltyCustomer | null) => void
  setLoyaltyRedeem: (v: boolean) => void
  setShowLoyalty: (open: boolean) => void
  setShowRedeem: (open: boolean) => void
  // Vuelo al carrito (la bolsa rebota al aterrizar)
  cartPulse: number
  bagTargetRef: RefObject<HTMLSpanElement | null>
  /** Cuenta (o última venta) que acaba de volver al carrito: se anuncia un instante. */
  recuperada: Recuperada | null
  // Pago
  paymentMethod: PaymentMethod
  setPaymentMethod: Cart["setPaymentMethod"]
  cashReceivedInput: string
  setCashReceivedInput: Cart["setCashReceivedInput"]
  cashInputRef: RefObject<HTMLInputElement | null>
  cashReceived: number | null
  changeDue: number | null
  cashInsufficient: boolean
  setShowTender: (open: boolean) => void
  // Propina
  tipChoice: TipChoice
  setTipChoice: (t: TipChoice) => void
  tipCustomInput: string
  setTipCustomInput: (v: string) => void
  tipAmount: number
  // Más opciones (nota, para llevar, descuento)
  moreOpen: boolean
  toggleMore: () => void
  extrasResumen: string
  ticketNotes: string
  setTicketNotes: Cart["setTicketNotes"]
  takeoutFee: number
  discount: TicketDiscount | null
  setDiscount: Cart["setDiscount"]
  setShowDiscount: (open: boolean) => void
  // Totales (espejo de lo que el servidor cobrará)
  subtotal: number
  discountAmount: number
  discountInvalid: boolean
  promo: { id: string; name: string; discount: number } | null
  promoDiscount: number
  takeoutCharge: number
  total: number
  due: number
  // Cobro
  openSession: OpenSession | null
  canCharge: boolean
  isProcessing: boolean
  finalizeSale: () => void | Promise<void>
  setShowCashDialog: (open: boolean) => void
  /** Modo práctica: se puede «cobrar» sin caja abierta y nada se registra. */
  practica: boolean
  /** Tarjeta del recorrido de la primera venta, cuando el paso ocurre aquí. */
  recorrido?: React.ReactNode
}

/**
 * La columna del carrito: encabezado (cuenta abierta, sellos, vaciar), las
 * líneas con sus gestos, y el bloque de cobro con el total y el botón.
 *
 * Se monta UNA sola vez —como columna derecha en escritorio o dentro de la
 * hoja inferior en celular— para que refs y foco apunten al panel visible.
 * El estado que solo existe aquí (qué línea edita su nota o su cantidad, el
 * gesto en curso, el detalle abierto) vive aquí; lo que afecta al cobro
 * sigue arriba, en el POS, que es quien manda la venta al servidor.
 */
export function CartPanel(p: CartPanelProps) {
  const {
    lines, itemCount, isMobile, setCartOpen,
    updateQuantity, setQuantityTo, duplicateLine, removeLine, setLineNotes,
    setPendingModifiers, lastSale, setConfirmClear,
    parkedEnabled, openAccount, cuentasVisibles, saveToOpenAccount, setShowPark, setShowTray,
    loyaltyEnabled, loyaltyCustomer, loyaltyRedeem, loyaltyTarget,
    setLoyaltyCustomer, setLoyaltyRedeem, setShowLoyalty, setShowRedeem,
    cartPulse, bagTargetRef, recuperada,
    paymentMethod, setPaymentMethod, cashReceivedInput, setCashReceivedInput, cashInputRef,
    cashReceived, changeDue, cashInsufficient, setShowTender,
    tipChoice, setTipChoice, tipCustomInput, setTipCustomInput, tipAmount,
    moreOpen, toggleMore, extrasResumen, ticketNotes, setTicketNotes, takeoutFee,
    discount, setDiscount, setShowDiscount,
    subtotal, discountAmount, discountInvalid, promo, promoDiscount, takeoutCharge, total, due,
    openSession, canCharge, isProcessing, finalizeSale, setShowCashDialog, practica,
  } = p
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
  // Teclear la cantidad exacta en vez de tocar «+» once veces
  const [editingQtyFor, setEditingQtyFor] = useState<string | null>(null)
  return (
    <div className="flex flex-col h-full bg-white">
      <header className="shrink-0 px-5 py-3 md:py-4 border-b border-stone-200 bg-amber-50/60">
        {/* Se envuelve a propósito: el tamaño de letra escala TODO en rem
            (la X de 2.5rem llega a 50px) y este renglón deja de caber en un
            celular. Mejor dos renglones que una X fuera de la pantalla. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {/* key=cartPulse: al aterrizar un vuelo se remonta y rebota */}
            <m.span
              key={cartPulse}
              ref={bagTargetRef}
              initial={{ scale: cartPulse ? 1.35 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="inline-flex"
            >
              <ShoppingBag className="h-5 w-5 text-amber-700" />
            </m.span>
            {/* Con una cuenta abierta el carrito ya no es «una venta»: es lo
                que lleva esa mesa. Decirlo aquí evita cobrarle a la mesa 3 lo
                que se estaba anotando para la 1. */}
            <h2 className="truncate text-lg font-bold text-stone-800">
              {openAccount ? openAccount.name : "Venta Actual"}
            </h2>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {parkedEnabled && (cuentasVisibles.length > 0 || lines.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-stone-500 hover:bg-amber-50 hover:text-amber-700"
                onClick={() => {
                  // Con una cuenta abierta no hay nada que preguntar: ya tiene
                  // nombre. Volver a pedirlo en cada ronda era justamente lo
                  // que hacía que esto se sintiera un carrito y no una cuenta.
                  if (openAccount && lines.length > 0) void saveToOpenAccount()
                  else if (lines.length > 0) setShowPark(true)
                  else setShowTray(true)
                }}
                title={
                  openAccount && lines.length > 0
                    ? `Guardar esta ronda en «${openAccount.name}»`
                    : lines.length > 0
                      ? "Abrir una cuenta con esto para cobrarla al final"
                      : "Ver cuentas abiertas"
                }
                aria-label={
                  openAccount && lines.length > 0
                    ? `Guardar en ${openAccount.name}`
                    : lines.length > 0
                      ? "Abrir cuenta"
                      : "Cuentas abiertas"
                }
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span className="hidden truncate md:inline">
                  {openAccount && lines.length > 0
                    ? `Guardar en ${openAccount.name}`
                    : lines.length > 0
                      ? "Abrir cuenta"
                      : "Cuentas"}
                </span>
              </Button>
            )}
            {parkedEnabled && cuentasVisibles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowTray(true)}
                title="Cuentas abiertas"
                className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white hover:bg-amber-700"
              >
                {cuentasVisibles.length}
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

      {/* Confirmación de que la cuenta volvió completa: se lee un instante y
          se va sola; las líneas entran escalonadas debajo para que se lea
          «llegaron estas», no «aparecieron». */}
      <AnimatePresence>
        {recuperada && (
          <m.div
            key={recuperada.key}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            role="status"
            className="flex shrink-0 items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"
            data-recuperada
          >
            <ArchiveRestore className="h-4 w-4 shrink-0" />
            <span className="truncate">{avisoRecuperada(recuperada.name, recuperada.articulos)}</span>
          </m.div>
        )}
      </AnimatePresence>

      {/* Cart items */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-4">
          {p.recorrido}
          {lines.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-stone-300">
              <ShoppingBag className="h-14 w-14 mb-3 opacity-40" />
              <p className="text-base font-medium text-stone-400">No hay productos</p>
              <p className="text-sm text-stone-300">Toca un producto para agregarlo</p>
              {lastSale && (
                <button
                  type="button"
                  onClick={p.onRepeatLast}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:border-amber-300 hover:text-amber-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Repetir última venta · #{lastSale.folio}
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {lines.map((line, i) => (
                <m.div
                  key={line.lineId}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2, delay: recuperada ? Math.min(i, 8) * 0.06 : 0 }}
                  data-recorrido={i === 0 ? "linea" : undefined}
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
                  <m.div
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
                  </m.div>
                </m.div>
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
          <div className="flex gap-2" data-recorrido="pago">
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
            {/* La promoción se ve ANTES de cobrar: es lo que la cajera le dice
                al cliente («hoy los frappés están al 20»). El monto de verdad
                lo recalcula el servidor al cerrar la venta. */}
            {promoDiscount > 0 && promo && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 text-emerald-700">
                  <Percent className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate font-medium">{promo.name}</span>
                </span>
                <span className="shrink-0 font-medium text-emerald-700">-{formatCurrency(promoDiscount)}</span>
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

          {/* Cobrar button / gate de caja.

              En escritorio la bifurcación va abajo igual que en el celular:
              el botón de arriba del carrito existe desde antes, pero la
              decisión —¿cobra o se sienta?— se toma mirando el total, y ahí
              es donde está la mano. Tenerla en los dos lados y en el mismo
              orden evita aprender dos POS distintos según el aparato. */}
          {parkedEnabled && lines.length > 0 && openSession && (
            <Button
              variant="outline"
              className="mb-2 w-full gap-2 rounded-xl border-amber-300 py-5 text-base font-bold text-amber-800 hover:bg-amber-50"
              onClick={() => (openAccount ? void saveToOpenAccount() : setShowPark(true))}
            >
              <PauseCircle className="h-4 w-4" />
              {openAccount ? `Guardar en ${openAccount.name}` : "Abrir cuenta"}
            </Button>
          )}
          {openSession || practica ? (
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
              data-recorrido="cobrar"
            >
              {isProcessing
                ? "Procesando..."
                : `${practica ? "Práctica · " : ""}Cobrar ${formatCurrency(due)} · ${paymentLabel(paymentMethod)}`}
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
      <CartLineDialog line={infoLine} onClose={() => setInfoLine(null)} />
    </div>
  )
}
