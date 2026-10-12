import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { esUnidad, type ItemExistencia, type Unidad } from "@/lib/existencias"
import type { AccountVisit } from "./parked"
import { creditAccountsFrom } from "@/lib/credit"
import { getContext } from "@/lib/context"
import { homePathFor, isManager } from "@/lib/context-shape"
import { parseBusinessSettings } from "@/lib/settings"
import { businessDayRange } from "@/lib/dates"
import { sweepStaleSession } from "@/lib/stale-cash"
import { avisoCierreAutomatico } from "@/lib/cash-session"
import POSClient from "./pos-client"
import { vozHabilitada } from "@/lib/voz"
import { MENU_PRODUCTS_SELECT, armarCategorias, armarProductos, productosVendibles } from "./menu"

/* ------------------------------------------------------------------ */
/*  Server component – fetches menu from Supabase & checks user role   */
/* ------------------------------------------------------------------ */
export default async function POSPage() {
  const supabase = await createClient()

  /* ── Contexto (negocio activo + rol) ────────────────────────────── */
  /**
   * La guardia completa vive AQUÍ, no en el middleware.
   *
   * Antes el middleware comprobaba negocio suspendido y plantilla, y esta
   * página solo miraba que hubiera negocio. Al quitarle esa consulta al
   * middleware —costaba un viaje a la base en cada petición del sistema— las
   * tres condiciones se juntaron donde corresponde: junto a los datos que
   * protegen. `homePathFor` ya sabe a dónde mandar cada caso (sin negocio al
   * selector, suspendido al aviso, plantilla al panel).
   */
  const ctx = await getContext()
  if (!ctx?.business || ctx.business.status !== "active" || ctx.business.isTemplate) {
    redirect(homePathFor(ctx))
  }
  const isAdmin = isManager(ctx.role)
  const businessId = ctx.business.id

  /* ── Todo lo que el POS necesita, en UNA sola tanda ──────────────── */
  /**
   * Esta es la pantalla que más se abre en todo el sistema, y se abría en
   * escalones: barrer la caja vencida, luego el menú, luego las ventas del
   * día. Cada escalón esperaba a que terminara el anterior sin necesitarlo,
   * y en un celular con mala señal esas esperas se suman y se sienten.
   *
   * Ahora sale todo junto. El barrido de caja va en la misma tanda porque
   * es independiente del menú, y devuelve él mismo la caja que queda abierta
   * —antes se consultaba dos veces: una para decidir si vencía y otra para
   * mostrarla—.
   *
   * El rango del día se calcula ANTES de la tanda porque solo depende de la
   * zona horaria del negocio, que ya viene en el contexto.
   */
  const { fromIso, toIso } = businessDayRange(ctx.business.timezone)
  const settings = parseBusinessSettings(ctx.business.settings)

  const [
    barrido,
    { data: dbCategories },
    { data: dbProducts },
    { data: todayTickets },
    { data: pinSet },
    { data: topVariants },
    { data: visitas },
    { count: promosActivas },
    { data: fiados },
    { data: recientesFuera },
    { data: contado },
  ] = await Promise.all([
    // Si la caja del turno pasado quedó abierta y ya venció, se cierra sola.
    // Aquí y no solo en el cron porque este es el momento en que importa:
    // quien llega a abrir su turno la encuentra limpia y registra su fondo.
    sweepStaleSession(ctx.business),
    supabase
      .from("menu_categories")
      .select("id, name, slug, sort_order, color")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select(MENU_PRODUCTS_SELECT)
      .eq("is_active", true)
      .order("sort_order"),
    // Ventas de hoy (día de operación del negocio, solo completadas)
    supabase
      .from("tickets")
      .select("total")
      .eq("status", "completado")
      .gte("created_at", fromIso)
      .lt("created_at", toIso),
    supabase.rpc("my_pin_set"),
    // Más vendidos del último mes → fila de favoritos del POS
    supabase.rpc("top_variants", { p_days: 30, p_limit: 8 }),
    // Quién suele venir a esta hora (P33): nombres de cuenta por hora, 60 días.
    supabase.rpc("account_name_suggestions"),
    // ¿Hay promociones encendidas? Si no, el POS no las consulta en cada cambio del carrito.
    supabase.from("promotions").select("id", { count: "exact", head: true }).eq("is_active", true),
    // Fiados (P38): quién debe cuánto, para el selector «¿a nombre de quién?» y el diálogo de abonos.
    settings.credit ? supabase.rpc("credit_balances") : Promise.resolve({ data: null }),
    // Fuera de menú (P39): lo vendido así en 60 días, para repetirlo en un toque.
    settings.customItems ? supabase.rpc("custom_items_recent", { p_days: 60 }) : Promise.resolve({ data: null }),
    // Lo que el café cuenta (P45): insumos y artículos del menú, en una lista.
    // Vacía en un café que no cuenta nada, y entonces el POS no enseña nada
    // nuevo. Va aparte del menú porque los insumos no están en la carta, y
    // aquí dentro para no sumar un viaje en serie a cada arranque del POS.
    supabase
      .from("stock_items")
      .select(`id, variant_id, supply_id, qty, min_qty,
         supplies(name, unit),
         menu_variants(name, menu_products(name))`)
      .eq("tracked", true),
  ])

  const session = barrido.session

  // Lo que se dejó de fondo en el último corte: se sugiere al abrir caja (P27).
  const { data: ultimoCorte } = await supabase
    .from("cash_sessions")
    .select("next_float")
    .eq("business_id", businessId)
    .eq("status", "cerrada")
    .not("next_float", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Sin caja abierta, la anterior pudo cerrarla el barrido de madrugada. Hay
  // que decirlo: el motivo solo vivía en `closing_notes`, dentro de un corte
  // que la dueña no abre, así que ella solo veía una caja cerrada que no
  // cerró. Se consulta únicamente cuando no hay caja: en el caso normal no
  // cuesta ni un viaje.
  const cierreSolo = session
    ? null
    : (
        await supabase
          .from("cash_sessions")
          .select("closed_at, expected_cash")
          .eq("business_id", businessId)
          .eq("status", "cerrada")
          .eq("auto_closed", true)
          .order("closed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data

  // Solo el del último día: un cierre de la semana pasada ya no explica nada.
  const avisoCierre =
    cierreSolo?.closed_at && Date.now() - new Date(cierreSolo.closed_at).getTime() < 24 * 3_600_000
      ? {
          ...avisoCierreAutomatico({
            closedAt: new Date(cierreSolo.closed_at),
            timezone: ctx.business.timezone,
            closingTime: settings.closingTime,
            expectedCash: cierreSolo.expected_cash,
          }),
          clave: cierreSolo.closed_at,
        }
      : null

  /* ── Menú (compartido con el pedido por voz: app/pos/menu.ts) ───── */
  const categories = armarCategorias(dbCategories ?? [])
  const vendibles = productosVendibles(dbProducts ?? [])
  const products = armarProductos(vendibles)

  // La primera pantalla: primero lo que la dueña fijó, en su orden; luego lo
  // más vendido hasta completar ocho. Un producto fijado con tamaños pone un
  // tile por tamaño.
  const fijados = vendibles
    .filter((p) => p.pinned_order != null)
    .sort((a, b) => (a.pinned_order ?? 0) - (b.pinned_order ?? 0))
    .flatMap((p) =>
      [...(p.menu_variants ?? [])]
        .filter((v) => v.is_active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((v) => v.id),
    )
  const automaticos = (topVariants ?? [])
    .map((t) => t.variant_id)
    .filter((id): id is string => !!id && !fijados.includes(id))
  const favoriteVariantIds = [...fijados, ...automaticos].slice(0, Math.max(8, fijados.length))

  const existencias: ItemExistencia[] = (contado ?? []).map((f) => {
    const v = f.menu_variants
    const nombreMenu = v ? `${v.menu_products?.name ?? ""}${v.name && v.name !== "Único" ? ` · ${v.name}` : ""}` : ""
    const unidad = f.supplies && esUnidad(f.supplies.unit) ? (f.supplies.unit as Unidad) : "pieza"
    return {
      itemId: f.id,
      variantId: f.variant_id,
      supplyId: f.supply_id,
      nombre: f.supply_id ? (f.supplies?.name ?? "") : nombreMenu,
      unidad,
      qty: Number(f.qty),
      minQty: Number(f.min_qty),
    }
  })

  const dbTotalSales = (todayTickets ?? []).reduce((sum, t) => sum + (t.total || 0), 0)

  return (
    <POSClient
      categories={categories}
      products={products}
      existencias={existencias}
      vozEnMostrador={vozHabilitada(ctx.business.slug)}
      isAdmin={isAdmin}
      businessId={businessId}
      cashierId={ctx.userId}
      lockMinutes={settings.lockMinutes}
      autoPrint={settings.autoPrint}
      modifiersPrompt={settings.modifiersPrompt}
      parkedOrders={settings.parkedOrders}
      tableCount={settings.tableCount}
      accountLabels={settings.accountLabels}
      publicReceipt={settings.publicReceipt}
      loyalty={settings.loyalty}
      loyaltyTarget={settings.loyaltyTarget}
      loyaltyReward={settings.loyaltyReward}
      discountMaxCashier={settings.discountMaxCashier}
      takeoutFee={settings.takeoutFee}
      cardFeePct={settings.cardFeePct}
      hasPin={pinSet === true}
      favoriteVariantIds={favoriteVariantIds}
      initialTotalSales={dbTotalSales}
      openSession={
        session
          ? { id: session.id, openedAt: session.opened_at, openingFloat: session.opening_float }
          : null
      }
      suggestedFloat={ultimoCorte?.next_float ?? null}
      avisoCierre={avisoCierre}
      visitas={Array.isArray(visitas) ? (visitas as unknown as AccountVisit[]) : []}
      hayPromociones={(promosActivas ?? 0) > 0}
      creditEnabled={settings.credit}
      fiados={creditAccountsFrom(fiados)}
      customItemsEnabled={settings.customItems}
      recientesFueraDeMenu={
        Array.isArray(recientesFuera)
          ? (recientesFuera as Array<{ name: string; price: number; n: number }>).map((r) => ({ name: String(r.name), price: Number(r.price), n: Number(r.n) }))
          : []
      }
    />
  )
}
