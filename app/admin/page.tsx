import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor } from "@/lib/context-shape"
import { addDays, dateStringInTz, formatDateString, hourInTz, startOfMonth } from "@/lib/dates"
import { parseBusinessSettings } from "@/lib/settings"
import { hideStartupChecklist } from "@/app/actions/business"
import { ActionForm } from "@/components/action-form"
import { formatCurrency, formatTime, paymentLabel, PAYMENT_METHODS } from "@/lib/format"
import type { SalesReport } from "@/app/admin/ventas/params"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tag,
  Package,
  Layers,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Receipt,
  Star,
  Wallet,
  SlidersHorizontal,
  Target,
  ListChecks,
  CheckCircle2,
  Circle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
import Link from "next/link"
import { MenuPackPicker } from "@/components/menu-pack-picker"

export default async function AdminDashboard() {
  const supabase = await createClient()

  /* ── Datos: conteos del menú + reporte de hoy (agregado en SQL) ─── */
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  const tz = ctx.business.timezone
  const today = dateStringInTz(tz)
  const yesterday = addDays(today, -1)
  const lastWeekDay = addDays(today, -7)
  const monthStart = startOfMonth(today)
  const settings = parseBusinessSettings(ctx.business.settings)

  // Checklist de arranque: solo se consulta si no está oculta. Se arma aquí
  // —antes del await— para que salga en la MISMA tanda que todo lo demás.
  const checklistCounts = settings.hideChecklist
    ? Promise.resolve(null)
    : Promise.all([
        supabase
          .from("business_members")
          .select("*", { count: "exact", head: true })
          .eq("role", "cajero")
          .eq("is_active", true),
        supabase.from("tickets").select("*", { count: "exact", head: true }),
        supabase.from("cash_sessions").select("*", { count: "exact", head: true }).eq("status", "cerrada"),
      ])

  // Todo el tablero en UNA sola tanda.
  //
  // Antes eran tres esperas encadenadas —conteos, luego comparativos, luego
  // checklist— aunque ninguna necesitaba el resultado de la anterior: todas
  // salen del contexto y de las fechas, que ya están en mano. En serie se
  // pagaba el viaje de ida y vuelta a la base TRES veces seguidas; juntas se
  // paga una. Es la misma lección del 504: los eslabones en serie se suman.
  const [
    { count: categoryCount },
    { count: productCount },
    { count: variantCount },
    { data: reportData },
    { data: recentTickets },
    { data: yData },
    { data: wData },
    { data: mData },
    checklistData,
  ] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("menu_products")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("menu_variants")
      .select("*", { count: "exact", head: true }),
    supabase.rpc("sales_report", { p_from: today, p_to: today }),
    supabase
      .from("tickets")
      .select("id, folio, total, payment_method, created_at, status")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("sales_report", { p_from: yesterday, p_to: yesterday }),
    supabase.rpc("sales_report", { p_from: lastWeekDay, p_to: lastWeekDay }),
    supabase.rpc("sales_report", { p_from: monthStart, p_to: today }),
    checklistCounts,
  ])

  const yReport = (yData as unknown as SalesReport | null) ?? null
  const wReport = (wData as unknown as SalesReport | null) ?? null
  const monthRevenue = (mData as unknown as SalesReport | null)?.totals.revenue ?? 0

  let checklist: Array<{ label: string; hint: string; done: boolean; href: string }> | null = null
  if (checklistData) {
    const [{ count: cashierCount }, { count: ticketEver }, { count: closedSessions }] = checklistData
    const biz = ctx.business
    checklist = [
      {
        label: "Arma tu menú",
        hint: "Categorías, productos y precios",
        done: (productCount ?? 0) > 0,
        href: "/admin/productos",
      },
      {
        label: "Completa los datos del negocio",
        hint: "Dirección, teléfono o encabezado del ticket",
        done: !!(biz.address || biz.phone || biz.receiptHeader || biz.receiptFooter),
        href: "/admin/negocio",
      },
      {
        label: "Da de alta a tu equipo",
        hint: "Al menos un cajero con su usuario",
        done: (cashierCount ?? 0) > 0,
        href: "/admin/equipo",
      },
      {
        label: "Activa la seguridad de caja",
        hint: "Bloqueo por inactividad con PIN",
        done: settings.lockMinutes > 0,
        href: "/admin/negocio",
      },
      {
        label: "Registra tu primera venta",
        hint: "Abre la caja y cobra desde el POS",
        done: (ticketEver ?? 0) > 0,
        href: "/pos",
      },
      {
        label: "Cierra tu primer corte",
        hint: "Cuenta el efectivo al terminar el turno",
        done: (closedSessions ?? 0) > 0,
        href: "/admin/cortes",
      },
    ]
    if (checklist.every((c) => c.done)) checklist = null
  }

  const report = (reportData as unknown as SalesReport | null) ?? null
  const todaySales = report?.totals.revenue ?? 0
  const todayCount = report?.totals.tickets ?? 0
  const todayTips = report?.totals.tips_total ?? 0

  /* ── Payment method breakdown ──────────────────────────────────── */
  const paymentBreakdown = {
    efectivo: { count: 0, total: 0 },
    transferencia: { count: 0, total: 0 },
    tarjeta_clip: { count: 0, total: 0 },
  }
  for (const m of report?.by_method ?? []) {
    const data = paymentBreakdown[m.method as keyof typeof paymentBreakdown]
    if (data) {
      data.count = m.tickets
      data.total = m.revenue
    }
  }

  /* ── Best selling product today (agrupado por producto) ───────── */
  const productSales: Record<string, { name: string; qty: number }> = {}
  for (const p of report?.top_products ?? []) {
    productSales[p.product_name] ??= { name: p.product_name, qty: 0 }
    productSales[p.product_name].qty += p.qty
  }
  const topProduct = Object.values(productSales).sort((a, b) => b.qty - a.qty)[0]

  /* ── Stats cards ───────────────────────────────────────────────── */
  const stats = [
    {
      label: "Categorías",
      value: categoryCount ?? 0,
      icon: Tag,
      href: "/admin/categorias",
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Productos",
      value: productCount ?? 0,
      icon: Package,
      href: "/admin/productos",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Variantes",
      value: variantCount ?? 0,
      icon: Layers,
      href: "/admin/productos",
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Ventas hoy",
      value: todayCount,
      icon: ShoppingBag,
      href: "/admin/ventas",
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ]

  /* ── Comparativo: hoy vs. ayer y vs. hace 7 días, a esta hora ──── */
  const nowHour = hourInTz(tz)
  const revenueUpTo = (r: SalesReport | null, hour: number) =>
    (r?.by_hour ?? []).reduce((sum, h) => (h.hour <= hour ? sum + h.revenue : sum), 0)
  const comparisons = [
    {
      label: "Ayer a esta hora",
      closing: `Ayer cerró en ${formatCurrency(yReport?.totals.revenue ?? 0)}`,
      value: revenueUpTo(yReport, nowHour),
    },
    {
      label: `El ${formatDateString(lastWeekDay, { weekday: "long" })} pasado a esta hora`,
      closing: `Ese día cerró en ${formatCurrency(wReport?.totals.revenue ?? 0)}`,
      value: revenueUpTo(wReport, nowHour),
    },
  ]

  /* ── Metas ─────────────────────────────────────────────────────── */
  const goals = [
    settings.dailyGoal ? { label: "Meta del día", goal: settings.dailyGoal, actual: todaySales } : null,
    settings.monthlyGoal ? { label: "Meta del mes", goal: settings.monthlyGoal, actual: monthRevenue } : null,
  ].filter((g): g is { label: string; goal: number; actual: number } => g !== null)

  // Etiquetas e iconos desde lib/format; colores de barra propios del dashboard.
  const paymentMethods = [
    { ...PAYMENT_METHODS.efectivo, color: "text-emerald-600", barColor: "bg-emerald-500" },
    { ...PAYMENT_METHODS.transferencia, color: "text-violet-600", barColor: "bg-violet-500" },
    { ...PAYMENT_METHODS.tarjeta_clip, color: "text-blue-600", barColor: "bg-blue-500" },
  ]

  // Carta vacía: no tiene caso enseñar un tablero de ceros. Lo único que
  // importa ahora es que elija qué vende — el POS no sirve sin productos.
  if ((productCount ?? 0) === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Arma tu carta</h1>
          <p className="mt-1 text-stone-600">
            Elige lo que vendes y lo dejamos listo con precios de referencia. Puedes cambiarlos, quitar lo que no uses
            y agregar más paquetes cuando quieras.
          </p>
        </div>
        <MenuPackPicker menuEmpty />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Resumen</h1>
        <p className="text-sm text-stone-500 mt-1">
          Resumen general de tu menú y ventas
        </p>
      </div>

      {/* Checklist de arranque (solo mientras falte algo) */}
      {checklist && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-amber-700" />
                Primeros pasos ({checklist.filter((c) => c.done).length}/{checklist.length})
              </CardTitle>
              <ActionForm action={hideStartupChecklist}>
                <button type="submit" className="text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2">
                  Ocultar
                </button>
              </ActionForm>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {checklist.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                    item.done
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-stone-200 bg-white hover:border-amber-300"
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="h-4 w-4 text-stone-300 shrink-0 mt-0.5" />
                  )}
                  <span>
                    <span className={`block text-sm font-medium ${item.done ? "text-emerald-800 line-through decoration-emerald-300" : "text-stone-800"}`}>
                      {item.label}
                    </span>
                    <span className="block text-xs text-stone-400">{item.hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-500">
                      {stat.label}
                    </p>
                    <p className="text-3xl font-bold text-stone-800 mt-1">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Comparativo + metas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              ¿Cómo va el día?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-stone-500">
              Hoy llevas <span className="font-bold text-stone-800">{formatCurrency(todaySales)}</span>
              {todayCount > 0 && <span> en {todayCount} venta{todayCount === 1 ? "" : "s"}</span>}.
            </p>
            {comparisons.map((c) => {
              const delta = c.value > 0 ? Math.round(((todaySales - c.value) / c.value) * 100) : null
              const up = delta !== null && delta > 0
              const down = delta !== null && delta < 0
              return (
                <div key={c.label} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-stone-600">{c.label}</span>
                    <span className="text-sm font-semibold text-stone-800">{formatCurrency(c.value)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-xs text-stone-400">{c.closing}</span>
                    {delta === null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-stone-400">
                        <Minus className="h-3 w-3" /> sin base
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          up ? "text-emerald-700" : down ? "text-red-600" : "text-stone-500"
                        }`}
                      >
                        {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {delta > 0 ? "+" : ""}
                        {delta}% hoy
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-amber-600" />
              Metas de venta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {goals.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm text-stone-500">Aún no defines metas de venta.</p>
                <p className="text-xs text-stone-400 mt-1">
                  Con una meta diaria o mensual, aquí verás el avance.{" "}
                  <Link href="/admin/negocio" className="text-amber-700 underline underline-offset-2">
                    Definir metas
                  </Link>
                </p>
              </div>
            ) : (
              goals.map((g) => {
                const pct = Math.round((g.actual / g.goal) * 100)
                const width = Math.min(pct, 100)
                const reached = pct >= 100
                return (
                  <div key={g.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-600">{g.label}</span>
                      <span className={`font-semibold ${reached ? "text-emerald-700" : "text-stone-800"}`}>
                        {formatCurrency(g.actual)} <span className="text-stone-400 font-normal">/ {formatCurrency(g.goal)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-3 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${reached ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className={`mt-1 text-xs ${reached ? "text-emerald-700 font-medium" : "text-stone-400"}`}>
                      {reached
                        ? `¡Meta superada! (${pct}%)`
                        : `${pct}% · faltan ${formatCurrency(Math.max(0, g.goal - g.actual))}`}
                    </p>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Best seller + Payment breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
              Ingresos de hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-stone-800">
              {formatCurrency(todaySales)}
            </p>
            <p className="text-sm text-stone-500 mt-1">
              {todayCount} {todayCount === 1 ? "venta" : "ventas"} registradas
              hoy
            </p>
            {todayTips > 0 && (
              <p className="text-sm text-emerald-700 mt-1">
                + {formatCurrency(todayTips)} en propinas (aparte de la venta)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Best seller */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="h-5 w-5 text-amber-500" />
              Producto estrella
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProduct ? (
              <>
                <p className="text-xl font-bold text-stone-800 truncate">
                  {topProduct.name}
                </p>
                <p className="text-sm text-stone-500 mt-1">
                  {topProduct.qty}{" "}
                  {topProduct.qty === 1 ? "unidad vendida" : "unidades vendidas"}{" "}
                  hoy
                </p>
              </>
            ) : (
              <p className="text-sm text-stone-400 py-3">
                Aún no hay ventas hoy
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5 text-blue-600" />
              Desglose de pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayCount === 0 ? (
              <p className="text-sm text-stone-400 py-3">
                Aún no hay ventas hoy
              </p>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((pm) => {
                  const data = paymentBreakdown[pm.key]
                  const pct =
                    todaySales > 0
                      ? Math.round((data.total / todaySales) * 100)
                      : 0
                  return (
                    <div key={pm.key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <pm.icon className={`h-3.5 w-3.5 ${pm.color}`} />
                          <span className="text-stone-600">{pm.label}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 border-stone-200 text-stone-400"
                          >
                            {data.count}
                          </Badge>
                        </div>
                        <span className="font-semibold text-stone-700">
                          {formatCurrency(data.total)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pm.barColor} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent sales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            Ventas recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(recentTickets?.length ?? 0) === 0 ? (
            <p className="text-sm text-stone-400 py-4 text-center">
              No hay ventas registradas aún
            </p>
          ) : (
            <div className="space-y-3">
              {recentTickets?.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                >
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        ticket.status === "cancelado" ? "text-stone-400 line-through" : "text-stone-700"
                      }`}
                    >
                      #{ticket.folio} · {formatCurrency(ticket.total ?? 0)}
                    </p>
                    <p className="text-xs text-stone-400">
                      {paymentLabel(ticket.payment_method)}
                      {ticket.status === "cancelado" && <span className="text-red-500"> · cancelado</span>}
                    </p>
                  </div>
                  <p className="text-xs text-stone-400">
                    {formatTime(ticket.created_at, tz)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              href="/admin/categorias"
              className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all"
            >
              <Tag className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Gestionar categorías
                </p>
                <p className="text-xs text-stone-400">
                  Crear, editar y ordenar
                </p>
              </div>
            </Link>
            <Link
              href="/admin/productos"
              className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all"
            >
              <Package className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Gestionar productos
                </p>
                <p className="text-xs text-stone-400">
                  Agregar y modificar menú
                </p>
              </div>
            </Link>
            <Link
              href="/admin/modificadores"
              className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-purple-300 hover:bg-purple-50/50 transition-all"
            >
              <SlidersHorizontal className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Opciones y extras
                </p>
                <p className="text-xs text-stone-400">
                  Tipo de leche, extras…
                </p>
              </div>
            </Link>
            <Link
              href="/admin/ventas"
              className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all"
            >
              <Receipt className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Historial de ventas
                </p>
                <p className="text-xs text-stone-400">
                  Ver, reimprimir y cancelar
                </p>
              </div>
            </Link>
            <Link
              href="/admin/cortes"
              className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all"
            >
              <Wallet className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Cortes de caja
                </p>
                <p className="text-xs text-stone-400">
                  Turnos, esperado vs contado
                </p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
