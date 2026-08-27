"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { MENU_PACKS, packByKey, packPayload } from "@/lib/menu-packs"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Paquetes de menú: el dueño arma su carta eligiendo, en vez de       */
/*  heredar un menú completo que no pidió. Ver lib/menu-packs.ts.       */
/* ------------------------------------------------------------------ */

function revalidateAll() {
  revalidatePath("/admin", "layout")
  revalidatePath("/pos")
}

export interface InstallResult {
  categorias: number
  productos: number
  variantes: number
  grupos: number
}

/**
 * Instala uno o varios paquetes. El cliente manda CLAVES, no contenido: el
 * payload que llega al RPC lo arma este servidor a partir del catálogo, así que
 * nadie puede inyectar productos inventados aunque llame a la action directo.
 *
 * Cada paquete es su propia transacción (el RPC). Si el tercero fallara, los
 * dos primeros quedan instalados — que es lo correcto: son independientes, y
 * revertir un menú que el dueño ya vio sería peor que decirle qué faltó.
 */
export async function installMenuPacks(keys: string[]): Promise<ActionResult<{ installed: InstallResult }>> {
  const { error: authError } = await requireAdmin()
  if (authError) return { error: authError }

  if (!Array.isArray(keys) || keys.length === 0) {
    return { error: "Elige al menos un paquete." }
  }
  if (keys.length > MENU_PACKS.length) {
    return { error: "Selección inválida." }
  }

  const packs = [...new Set(keys)].map(packByKey)
  if (packs.some((p) => !p)) return { error: "Ese paquete ya no existe." }

  const supabase = await createClient()
  const total: InstallResult = { categorias: 0, productos: 0, variantes: 0, grupos: 0 }

  for (const pack of packs) {
    const { data, error } = await supabase.rpc("install_menu_pack", {
      p_pack: packPayload(pack!) as never,
    })
    if (error) return { error: error.message }
    const r = data as unknown as InstallResult
    total.categorias += r?.categorias ?? 0
    total.productos += r?.productos ?? 0
    total.variantes += r?.variantes ?? 0
    total.grupos += r?.grupos ?? 0
  }

  // Enganchar a lo recién instalado los grupos de opciones que el negocio YA
  // tenía. Sin esto, quien instaló "Personalizaciones" en su primer día y meses
  // después agrega "Bebidas con leche" se encuentra con que sus opciones de
  // leche no aplican a las bebidas de leche — justo lo contrario de lo obvio.
  if (total.categorias > 0) {
    const enganche = await attachExistingGroups(supabase)
    total.grupos += enganche
  }

  await logAudit("menu.paquetes_instalados", packs.map((p) => p!.key).join(", "), { ...total })
  revalidateAll()
  return { success: true, installed: total }
}

/**
 * Reenvía al RPC los grupos del catálogo que ya existen en este negocio, sin
 * categorías. El RPC no los vuelve a crear (los encuentra por nombre): lo único
 * que corre es el enganche a los productos de las categorías que declaran.
 */
async function attachExistingGroups(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const delCatalogo = MENU_PACKS.flatMap((p) => p.modifierGroups ?? [])
  if (delCatalogo.length === 0) return 0

  const { data: existentes } = await supabase
    .from("modifier_groups")
    .select("name")
    .in("name", delCatalogo.map((g) => g.name))
  const nombres = new Set((existentes ?? []).map((g) => g.name))
  const aEnganchar = delCatalogo.filter((g) => nombres.has(g.name))
  if (aEnganchar.length === 0) return 0

  await supabase.rpc("install_menu_pack", {
    p_pack: {
      categories: [],
      modifier_groups: aEnganchar.map((g) => ({
        name: g.name,
        min_select: g.minSelect,
        max_select: g.maxSelect,
        is_required: g.isRequired,
        attach_to: g.attachTo,
        options: g.options.map((o) => ({ name: o.name, price_delta: o.priceDelta })),
      })),
    } as never,
  })
  return 0 // no se crearon grupos nuevos; solo se engancharon
}

/**
 * Copia el menú completo de la plantilla interna (lo que antes pasaba solo por
 * registrarse). Sigue disponible para quien lo quiera, pero ahora se elige.
 *
 * Usa la service role porque `clone_menu` es solo para ella; el permiso ya se
 * verificó arriba y el negocio sale del contexto, nunca del cliente.
 */
export async function installFullTemplate(): Promise<ActionResult<{ productos: number }>> {
  const { ctx, error: authError } = await requireAdmin()
  if (authError || !ctx?.business) return { error: authError ?? "No tienes un negocio activo." }
  if (ctx.business.isTemplate) return { error: "Este negocio ES la plantilla." }

  const admin = createAdminClient()
  const { data: tpl } = await admin
    .from("businesses")
    .select("id")
    .eq("is_template", true)
    .order("created_at")
    .limit(1)
    .maybeSingle()
  if (!tpl) return { error: "No hay un menú de ejemplo configurado." }

  const { error } = await admin.rpc("clone_menu", { p_source: tpl.id, p_target: ctx.business.id })
  if (error) {
    // clone_menu se niega si el destino ya tiene menú, y con razón: duplicaría
    // todo. Se dice en cristiano en vez de soltar el mensaje del RPC.
    return {
      error: /menú|menu/i.test(error.message)
        ? "El menú de ejemplo solo se puede copiar cuando tu carta está vacía. Usa los paquetes para agregar más."
        : error.message,
    }
  }

  const { count } = await admin
    .from("menu_products")
    .select("*", { count: "exact", head: true })
    .eq("business_id", ctx.business.id)

  await logAudit("menu.ejemplo_copiado", null, { productos: count ?? 0 })
  revalidateAll()
  return { success: true, productos: count ?? 0 }
}
