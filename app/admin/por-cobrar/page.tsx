import { redirect } from "next/navigation"
import { HandCoins } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getContext } from "@/lib/context"
import { homePathFor, isManager } from "@/lib/context-shape"
import { parseBusinessSettings } from "@/lib/settings"
import { creditAccountsFrom } from "@/lib/credit"
import { PorCobrarClient, type Deuda } from "./por-cobrar-client"

export const dynamic = "force-dynamic"

/** Un renglón guardado del carrito, lo mínimo para poder sumar la deuda. */
interface LineaGuardada {
  productId: string
  sizeLabel: string | null
  quantity: number
  modifierIds: string[]
  custom?: { name: string; price: number } | null
}

/**
 * Dos cosas distintas viven aquí, y se dice cuál es cuál:
 *   · Fiados por persona (P38): ventas hechas, con método «Fiado», a nombre
 *     de alguien, con saldo y abonos. Sí son ventas.
 *   · Cuentas que se fueron sin pagar (P11c): una cuenta abierta marcada
 *     así. NO son ventas hasta que se cobran.
 */
export default async function PorCobrarPage() {
  const ctx = await getContext()
  if (!ctx?.business) redirect(homePathFor(ctx))
  if (!isManager(ctx.role)) redirect("/pos")

  const supabase = await createClient()
  const settings = parseBusinessSettings(ctx.business.settings)

  const [{ data: filas }, { data: variantes }, { data: modificadores }, { data: fiados }] = await Promise.all([
    supabase
      .from("parked_orders")
      .select("id, name, cart, created_at, owed_since, owed_contact")
      .not("owed_since", "is", null)
      .order("owed_since", { ascending: true }),
    // Precios de HOY, igual que al cobrar: lo que aquí se suma es lo que se
    // va a cobrar, no lo que costaba el día que se sirvió.
    supabase.from("menu_variants").select("product_id, name, price").eq("is_active", true),
    supabase.from("modifiers").select("id, price_delta").eq("is_active", true),
    settings.credit ? supabase.rpc("credit_balances") : Promise.resolve({ data: null }),
  ])

  // OJO con la llave: lo que el carrito guarda como `sizeLabel` es el NOMBRE
  // de la variante (`menu_variants.name`), no su `size_label` —esa columna es
  // la medida («12 oz») y va aparte—. Con la columna equivocada, toda cuenta
  // con tamaños sumaba $0 y se reportaba como «ya no está en el menú»: un
  // total inventado a la baja, que es peor que no mostrar ninguno.
  const precioVariante = new Map(
    (variantes ?? []).map((v) => [`${v.product_id}|${v.name}`, Number(v.price)]),
  )
  const precioModificador = new Map((modificadores ?? []).map((m) => [m.id, Number(m.price_delta)]))
  // Un producto sin tamaños guarda `sizeLabel: null` y su variante es la
  // única activa: ahí se busca por producto. NaN marca las ambiguas (varias
  // activas), que se tratan como sin precio en vez de adivinar.
  const unicaVariante = new Map<string, number>()
  for (const v of variantes ?? []) {
    unicaVariante.set(v.product_id, unicaVariante.has(v.product_id) ? NaN : Number(v.price))
  }

  const deudas: Deuda[] = (filas ?? []).map((f) => {
    const lineas = ((f.cart as { lines?: LineaGuardada[] } | null)?.lines ?? []) as LineaGuardada[]
    let total = 0
    let articulos = 0
    // Cualquier renglón cuyo producto ya no esté en el menú no suma: es
    // exactamente lo que tampoco se le podrá cobrar en el POS, y enseñar
    // aquí un total que la caja no va a poder cobrar sería mentir.
    let sinPrecio = 0
    for (const l of lineas) {
      const base = l.custom
        ? Number(l.custom.price)
        : l.sizeLabel === null
          ? unicaVariante.get(l.productId)
          : precioVariante.get(`${l.productId}|${l.sizeLabel}`)
      if (base === undefined || Number.isNaN(base)) {
        sinPrecio += 1
        continue
      }
      const extras = (l.modifierIds ?? []).reduce((s, id) => s + (precioModificador.get(id) ?? 0), 0)
      total += (base + extras) * l.quantity
      articulos += l.quantity
    }
    return {
      id: f.id,
      name: f.name,
      contact: f.owed_contact,
      owedSince: f.owed_since!,
      openedAt: f.created_at,
      total: Math.round(total * 100) / 100,
      articulos,
      sinPrecio,
    }
  })

  const cuentas = creditAccountsFrom(fiados)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-800">
          <HandCoins className="h-6 w-6 text-red-700" />
          Por cobrar
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {settings.credit ? (
            <>
              Lo que te deben: <strong>fiados por persona</strong> (ventas ya hechas, con saldo y abonos) y{" "}
              <strong>cuentas que se fueron sin pagar</strong> (no son ventas hasta que se cobran).
            </>
          ) : (
            <>
              Cuentas de gente que se fue sin pagar. <strong>No son ventas todavía</strong>: no cuentan en tus
              reportes ni en los cortes. La venta se registra el día que te paguen, desde el POS.
            </>
          )}
        </p>
      </div>

      <PorCobrarClient deudas={deudas} cuentas={cuentas} creditEnabled={settings.credit} timezone={ctx.business.timezone} />
    </div>
  )
}
