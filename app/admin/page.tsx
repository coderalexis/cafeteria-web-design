import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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
  Banknote,
  CreditCard,
  Smartphone,
} from "lucide-react"
import Link from "next/link"

export default async function AdminDashboard() {
  const supabase = await createClient()
  const admin = createAdminClient()

  /* ── Fetch counts ───────────────────────────────────────────────── */
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    { count: categoryCount },
    { count: productCount },
    { count: variantCount },
    { data: todayTickets },
    { data: recentTickets },
    { data: todayItems },
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
    supabase
      .from("tickets")
      .select("id, total, payment_method")
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("tickets")
      .select("id, total, payment_method, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    // Fetch today's ticket items with product names for "best seller"
    admin
      .from("ticket_items")
      .select(
        `quantity,
         menu_variants(name, menu_products(name)),
         tickets!inner(created_at)`
      )
      .gte("tickets.created_at", todayStart.toISOString()),
  ])

  const todaySales = (todayTickets || []).reduce(
    (sum, t) => sum + (t.total || 0),
    0
  )
  const todayCount = todayTickets?.length || 0

  /* ── Payment method breakdown ──────────────────────────────────── */
  const paymentBreakdown = {
    efectivo: { count: 0, total: 0 },
    transferencia: { count: 0, total: 0 },
    tarjeta_clip: { count: 0, total: 0 },
  }

  ;(todayTickets || []).forEach((t: any) => {
    const method = t.payment_method as keyof typeof paymentBreakdown
    if (paymentBreakdown[method]) {
      paymentBreakdown[method].count += 1
      paymentBreakdown[method].total += t.total || 0
    }
  })

  /* ── Best selling product today ────────────────────────────────── */
  const productSales: Record<string, { name: string; qty: number }> = {}

  ;(todayItems || []).forEach((item: any) => {
    const variant = item.menu_variants as any
    const productName =
      variant?.menu_products?.name || variant?.name || "Producto"
    if (!productSales[productName]) {
      productSales[productName] = { name: productName, qty: 0 }
    }
    productSales[productName].qty += item.quantity || 1
  })

  const topProduct = Object.values(productSales).sort(
    (a, b) => b.qty - a.qty
  )[0]

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
      href: "/admin/variantes",
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

  const paymentMethods = [
    {
      key: "efectivo" as const,
      label: "Efectivo",
      icon: Banknote,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      barColor: "bg-emerald-500",
    },
    {
      key: "transferencia" as const,
      label: "Transferencia",
      icon: Smartphone,
      color: "text-violet-600",
      bg: "bg-violet-50",
      barColor: "bg-violet-500",
    },
    {
      key: "tarjeta_clip" as const,
      label: "Tarjeta",
      icon: CreditCard,
      color: "text-blue-600",
      bg: "bg-blue-50",
      barColor: "bg-blue-500",
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Dashboard</h1>
        <p className="text-sm text-stone-500 mt-1">
          Resumen general de tu menú y ventas
        </p>
      </div>

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
              ${todaySales.toFixed(2)}
            </p>
            <p className="text-sm text-stone-500 mt-1">
              {todayCount} {todayCount === 1 ? "venta" : "ventas"} registradas
              hoy
            </p>
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
                          ${data.total.toFixed(2)}
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
              {recentTickets?.slice(0, 5).map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-700">
                      ${ticket.total?.toFixed(2)}
                    </p>
                    <p className="text-xs text-stone-400">
                      {ticket.payment_method === "efectivo"
                        ? "Efectivo"
                        : ticket.payment_method === "transferencia"
                        ? "Transferencia"
                        : "Tarjeta"}
                    </p>
                  </div>
                  <p className="text-xs text-stone-400">
                    {new Date(ticket.created_at).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
              href="/admin/variantes"
              className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-purple-300 hover:bg-purple-50/50 transition-all"
            >
              <Layers className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-stone-800">
                  Gestionar variantes
                </p>
                <p className="text-xs text-stone-400">
                  Precios y tamaños
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
                  Ver y gestionar ventas
                </p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
