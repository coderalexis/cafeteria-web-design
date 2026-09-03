"use client"

import Link from "next/link"
import type { RefObject } from "react"
import {
  AArrowUp,
  BookOpen,
  ChefHat,
  GraduationCap,
  ChevronRight,
  Coffee,
  History,
  Keyboard,
  Lock,
  LogOut,
  MoreVertical,
  PauseCircle,
  Receipt,
  Search,
  Settings,
  Unlock,
  UserCircle,
  X,
} from "lucide-react"
import { formatCurrency, formatDate, formatTime } from "@/lib/format"
import { BusinessSwitcher } from "@/components/business-switcher"
import { TextSizeControl } from "@/components/text-size-control"
import { DEFAULT_CHIP, DEFAULT_CHIP_ACTIVE, colorClasses } from "@/lib/category-colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/kbd"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout } from "@/app/actions/auth"
import { POS_LOCK_EVENT } from "./lock-screen"
import type { OpenSession } from "./cash-session-dialog"
import type { ParkedOrder } from "./parked"
import type { Category } from "./cart"
import type { usePosTextSize } from "./use-text-size"
import type { AppContext } from "@/lib/context-shape"

export interface PosHeaderProps {
  businessName: string
  appCtx: AppContext
  isMobile: boolean
  isAdmin: boolean
  lockMinutes: number
  /** Zona horaria del negocio, para la hora del chip de caja. */
  tz: string | undefined
  totalSales: number
  // Buscador
  searchInputRef: RefObject<HTMLInputElement | null>
  searchQuery: string
  setSearchQuery: (q: string) => void
  gridScrolled: boolean
  searchPinned: boolean
  setSearchPinned: (v: boolean) => void
  setSizePickerFor: (id: string | null) => void
  // Caja
  openSession: OpenSession | null
  cajaDeOtroDia: boolean
  setShowCashDialog: (open: boolean) => void
  // Menú ⋮
  setShowTray: (open: boolean) => void
  setShowRecent: (open: boolean) => void
  setShowTickets: (open: boolean) => void
  setShowShortcuts: (open: boolean) => void
  /** Modo práctica (ventas que no se registran) y cómo entrar/salir. */
  practica: boolean
  onTogglePractica: () => void
  textSize: ReturnType<typeof usePosTextSize>
  // Cuentas abiertas
  parkedEnabled: boolean
  openAccount: { id: string; name: string } | null
  cuentasVisibles: ParkedOrder[]
  chipsCuentas: { o: ParkedOrder; total: number; vieja: boolean }[]
  setCartOpen: (open: boolean) => void
  resumeParked: (order: ParkedOrder) => Promise<void>
  // Categorías
  categories: Category[]
  activeCategory: string
  setActiveCategory: (id: string) => void
}

/**
 * El encabezado del panel de productos: marca y selector de cafetería,
 * buscador, estado de la caja y el menú ⋮, la fila de cuentas abiertas y las
 * categorías. En celular se encoge al bajar (ver gridScrolled en el POS).
 */
export function PosHeader(p: PosHeaderProps) {
  const {
    businessName, appCtx, isMobile, isAdmin, lockMinutes, tz, totalSales,
    searchInputRef, searchQuery, setSearchQuery, gridScrolled, searchPinned, setSearchPinned, setSizePickerFor,
    openSession, cajaDeOtroDia, setShowCashDialog,
    setShowTray, setShowRecent, setShowTickets, setShowShortcuts, textSize, practica, onTogglePractica,
    parkedEnabled, openAccount, cuentasVisibles, chipsCuentas, setCartOpen, resumeParked,
    categories, activeCategory, setActiveCategory,
  } = p
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
          ? `Caja abierta desde ${formatDate(openSession.openedAt, tz)}`
          : `Caja abierta · ${formatTime(openSession.openedAt, tz)}`
        : "Caja cerrada"}
      {!compact && <Kbd>K</Kbd>}
    </Button>
  )
  return (
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
                    {parkedEnabled && cuentasVisibles.length > 0 && (
                      <DropdownMenuItem onSelect={() => setShowTray(true)}>
                        <PauseCircle className="h-4 w-4 mr-2" />
                        Cuentas abiertas ({cuentasVisibles.length})
                      </DropdownMenuItem>
                    )}
                    {/* La comanda en pantalla, para quien no tiene impresora.
                        Se abre en otra pestaña a propósito: lo normal es
                        dejarla puesta —en un segundo aparato o en otra
                        pestaña— y volver aquí a cobrar. */}
                    <DropdownMenuItem asChild>
                      <Link href="/pos/preparar" target="_blank">
                        <ChefHat className="h-4 w-4 mr-2" /> Por preparar
                      </Link>
                    </DropdownMenuItem>
                    {/* Solo para consultar: qué se pidió, sin precios ni
                        acciones. Marcar se hace en «Por preparar» — dos
                        lugares donde marcar serían dos donde equivocarse. */}
                    <DropdownMenuItem onSelect={() => setShowRecent(true)}>
                      <History className="h-4 w-4 mr-2" /> Últimos pedidos
                    </DropdownMenuItem>
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
                    {/* Aprender tocando, sin ensuciar las ventas reales. */}
                    <DropdownMenuItem onSelect={onTogglePractica}>
                      <GraduationCap className="h-4 w-4 mr-2" />
                      {practica ? "Salir del modo práctica" : "Practicar sin registrar"}
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

          {/* Cuentas abiertas, mesa-primero. En una mesa primero sabes QUIÉN
              pide y después qué: el chip abre la cuenta en un toque, en vez
              del viaje ⋮ → Cuentas → Abrir. La fila solo existe cuando hay
              cuentas (y con el módulo encendido): un café de barra no gasta
              ni un pixel en esto. Los fiados no salen aquí — son de alguien
              que ya se fue, no una mesa activa; viven en la bandeja. */}
          {parkedEnabled && (openAccount || chipsCuentas.length > 0) && (
            <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide">
              {openAccount && (
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
                  title={`«${openAccount.name}» está en el carrito`}
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  {openAccount.name}
                  <span className="opacity-80">· en el carrito</span>
                </button>
              )}
              {chipsCuentas.map(({ o, total, vieja }) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => void resumeParked(o)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    vieja
                      ? "border-amber-400 bg-amber-50 text-amber-800 hover:border-amber-500"
                      : "border-stone-200 bg-white text-stone-700 hover:border-amber-400 hover:text-amber-700"
                  }`}
                  title={`Abrir «${o.name}» para agregarle o cobrarla`}
                >
                  <PauseCircle className={`h-3.5 w-3.5 ${vieja ? "text-amber-600" : "text-amber-500"}`} />
                  {o.name}
                  <span className={vieja ? "text-amber-700" : "text-stone-400"}>{formatCurrency(total)}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowTray(true)}
                className="shrink-0 rounded-full border border-stone-200 bg-white p-1.5 text-stone-400 hover:border-amber-400 hover:text-amber-700"
                title="Ver todas las cuentas"
                aria-label="Ver todas las cuentas"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
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
  )
}
