"use server"

import { z } from "@/lib/zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getContext } from "@/lib/context"
import { isSyntheticEmail, slugify, validatePassword } from "@/lib/accounts"
import { isValidTimeZone } from "@/lib/dates"
import { presetByKey, PRESETS } from "@/lib/presets"
import { serializeBusinessSettings, DEFAULT_SETTINGS } from "@/lib/settings"
import { MAX_SELF_SIGNUPS_PER_DAY, pickSlug, trialEndsAt, TRIAL_DAYS } from "@/lib/signup"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Auto-registro (/registro). Es la única superficie del sistema que  */
/*  cualquiera en internet puede empujar, así que:                     */
/*   · el negocio NO se crea hasta que el correo está verificado (los  */
/*     datos viajan en la metadata del usuario mientras tanto);        */
/*   · una cafetería por cuenta;                                       */
/*   · el slug se genera del nombre — nadie se aparta uno reservado.   */
/* ------------------------------------------------------------------ */

const registroSchema = z.object({
  businessName: z.string().trim().min(2, "Escribe el nombre de tu cafetería.").max(80),
  ownerName: z.string().trim().min(2, "Escribe tu nombre.").max(80),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido."),
  password: z.string(),
  timezone: z.string().trim().refine(isValidTimeZone, "Zona horaria no reconocida."),
  preset: z.string().trim().refine((p) => PRESETS.some((x) => x.key === p), "Elige cómo opera tu cafetería."),
})

/** Paso 1: crea la cuenta y manda el correo de verificación. */
export async function startRegistration(formData: FormData): Promise<ActionResult<{ email: string }>> {
  const parsed = registroSchema.safeParse({
    businessName: formData.get("business_name") ?? "",
    ownerName: formData.get("owner_name") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    timezone: formData.get("timezone") ?? "America/Mexico_City",
    preset: formData.get("preset") ?? "",
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos." }
  const v = parsed.data

  const passwordError = validatePassword(v.password)
  if (passwordError) return { error: passwordError }
  if (isSyntheticEmail(v.email)) {
    return { error: "Ese dominio es interno del sistema; usa tu correo real." }
  }

  const admin = createAdminClient()

  // Freno de avalancha. No es la defensa principal (esa es el correo
  // verificado): solo evita que alguien llene la base en una madrugada.
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const { count } = await admin
    .from("businesses")
    .select("*", { count: "exact", head: true })
    .eq("signup_source", "self")
    .gte("created_at", desde.toISOString())
  if ((count ?? 0) >= MAX_SELF_SIGNUPS_PER_DAY) {
    return { error: "Hoy se alcanzó el límite de registros nuevos. Escríbenos y te damos de alta a mano." }
  }

  const { data: yaExiste } = await admin.rpc("find_user_id_by_email", { p_email: v.email })
  if (yaExiste) {
    return { error: "Ya hay una cuenta con ese correo. Entra con ella o usa «¿Olvidaste tu contraseña?»." }
  }

  // signUp (no admin.createUser) porque es el que dispara el correo de
  // verificación. El negocio se arma al confirmar, con estos datos.
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://cafecitopos.com"
  const { error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${origin}/registro/confirmar`,
      data: {
        full_name: v.ownerName,
        pending_business: {
          name: v.businessName,
          timezone: v.timezone,
          preset: v.preset,
        },
      },
    },
  })
  if (error) {
    if (/rate|seconds|frequen/i.test(error.message)) {
      return { error: "Se enviaron varios correos seguidos. Espera unos minutos e intenta de nuevo." }
    }
    return { error: "No se pudo crear la cuenta. Intenta de nuevo más tarde." }
  }

  return { success: true, email: v.email }
}

/**
 * Paso 2: con el correo ya verificado y sesión abierta, arma la cafetería con
 * los datos que viajaron en la metadata. Idempotente: si el usuario ya tiene
 * cafetería, no crea otra (una por cuenta).
 */
export async function finishRegistration(): Promise<ActionResult<{ redirectTo: string }>> {
  const ctx = await getContext()
  if (!ctx) return { error: "Sesión inválida." }

  const admin = createAdminClient()

  // Una cafetería por cuenta. Se pregunta a la base, no al contexto: esta
  // función se dispara al renderizar /registro/listo y esa página puede
  // pedirse más de una vez (prefetch del router, un reintento, doble clic).
  if (await yaTieneCafeteria(admin, ctx.userId)) {
    return { success: true, redirectTo: "/admin" }
  }
  const { data: userData } = await admin.auth.admin.getUserById(ctx.userId)
  const user = userData?.user
  if (!user?.email_confirmed_at) {
    return { error: "Confirma tu correo antes de continuar." }
  }

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string
    pending_business?: { name?: string; timezone?: string; preset?: string }
  }
  const pend = meta.pending_business
  if (!pend?.name) {
    return { error: "No encontramos los datos de tu cafetería. Vuelve a registrarte." }
  }

  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const { count } = await admin
    .from("businesses")
    .select("*", { count: "exact", head: true })
    .eq("signup_source", "self")
    .gte("created_at", desde.toISOString())
  if ((count ?? 0) >= MAX_SELF_SIGNUPS_PER_DAY) {
    return { error: "Hoy se alcanzó el límite de registros. Escríbenos y te damos de alta a mano." }
  }

  // Slug del nombre, esquivando los tomados y los reservados.
  const { data: existentes } = await admin.from("businesses").select("slug")
  const tomados = new Set((existentes ?? []).map((b) => b.slug))
  const slug = pickSlug(slugify(pend.name), tomados)
  if (!slug) return { error: "No pudimos generar un identificador para tu cafetería. Escríbenos." }

  const ahora = new Date()
  const { data: biz, error: bizError } = await admin
    .from("businesses")
    .insert({
      name: pend.name.slice(0, 80),
      slug,
      timezone: isValidTimeZone(pend.timezone ?? "") ? pend.timezone! : "America/Mexico_City",
      created_by: ctx.userId,
      signup_source: "self",
      trial_ends_at: trialEndsAt(ahora).toISOString(),
      settings: serializeBusinessSettings({
        ...DEFAULT_SETTINGS,
        ...(presetByKey(pend.preset)?.settings ?? {}),
      }) as never,
    })
    .select("id, name, slug")
    .single()
  if (bizError || !biz) {
    // Puede ser la carrera de dos renders simultáneos: si el otro ya terminó,
    // esto no es un error, es que el trabajo ya está hecho.
    if (await yaTieneCafeteria(admin, ctx.userId)) {
      return { success: true, redirectTo: "/admin" }
    }
    return { error: bizError?.message ?? "No se pudo crear la cafetería." }
  }

  const { error: memberError } = await admin
    .from("business_members")
    .insert({ business_id: biz.id, user_id: ctx.userId, role: "owner", username: null })
  if (memberError) {
    // Sin dueño la cafetería es inservible: mejor no dejarla huérfana.
    await admin.from("businesses").delete().eq("id", biz.id)
    return { error: memberError.message }
  }

  // La cafetería nace SIN menú, a propósito. Antes se clonaba entero el de la
  // plantilla: 88 productos que nadie eligió, y borrarlos a mano para dejar los
  // seis que sí se venden es peor que empezar de cero. Al entrar, /admin le
  // pide que arme su carta con paquetes (o que copie el ejemplo, si lo quiere).

  const supabase = await createClient()
  await supabase.rpc("set_active_business", { p_business_id: biz.id })

  // Limpiar la metadata: ya cumplió su función de llevar los datos.
  await admin.auth.admin.updateUserById(ctx.userId, {
    user_metadata: { full_name: meta.full_name ?? "" },
  })

  await notifyOperator(biz.name, biz.slug, user.email ?? "", meta.full_name ?? "")
  return { success: true, redirectTo: "/admin" }
}

/** ¿Este usuario ya es miembro de alguna cafetería? Consulta directa, sin caché. */
async function yaTieneCafeteria(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  const { count } = await admin
    .from("business_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
  return (count ?? 0) > 0
}

/** Avisa al operador que hay una cafetería nueva por revisar. */
async function notifyOperator(name: string, slug: string, email: string, ownerName: string) {
  const apiKey = process.env.RESEND_API_KEY
  const destino = process.env.OPERATOR_EMAIL
  if (!apiKey || !destino) return
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Cafecito POS <registro@cafecitopos.com>",
        to: [destino],
        subject: `Nueva cafetería: ${name}`,
        text: [
          `${name} (${slug}) se registró sola y ya está usando el sistema.`,
          `Dueño: ${ownerName} · ${email}`,
          `Prueba de ${TRIAL_DAYS} días.`,
          "",
          "Revísala en https://cafecitopos.com/super",
        ].join("\n"),
      }),
    })
  } catch {
    /* que no falle el registro por no poder avisar */
  }
}

/**
 * ¿Este usuario confirmó su correo pero se quedó sin cafetería? Sirve de red:
 * el enlace del correo puede dejarlo en la raíz del sitio si la lista de
 * "Redirect URLs" de Supabase no incluye /registro/confirmar, y desde ahí
 * acabaría en el selector de cafeterías sin nada que elegir.
 */
export async function hasPendingRegistration(): Promise<boolean> {
  const ctx = await getContext()
  if (!ctx || ctx.memberships.length > 0) return false
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.getUserById(ctx.userId)
  const meta = (data?.user?.user_metadata ?? {}) as { pending_business?: { name?: string } }
  return Boolean(data?.user?.email_confirmed_at && meta.pending_business?.name)
}
