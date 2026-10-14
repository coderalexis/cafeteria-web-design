"use server"

import { createHash } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { requireContext } from "@/lib/context"
import { registrarAviso } from "@/lib/avisos"
import { VOZ_CLAVE_SEGUNDOS, VOZ_MODELO, vozHabilitada } from "@/lib/voz"
import { MENU_PRODUCTS_SELECT, armarProductos, productosVendibles } from "@/app/pos/menu"
import { HERRAMIENTAS_VOZ, armarCatalogo, catalogoEnTexto, instruccionesVoz } from "@/app/pos/voz/pedido"
import type { Product } from "@/app/pos/cart"
import type { ActionResult } from "./types"

/* ------------------------------------------------------------------ */
/*  Pedido por voz en el mostrador (prototipo).                         */
/*                                                                     */
/*  El navegador habla DIRECTO con OpenAI (WebRTC), pero nunca con la   */
/*  clave de la cuenta: esta acción pide una clave temporal que solo    */
/*  sirve para abrir UNA conversación en los próximos minutos, con las  */
/*  instrucciones, el menú y las herramientas ya fijados aquí. Así una  */
/*  pestaña curiosa no puede cambiarle el menú al bot ni usar la clave  */
/*  para otra cosa.                                                    */
/* ------------------------------------------------------------------ */

export interface SesionVoz {
  clave: string
  modelo: string
  /** El menú con el que se armó la sesión: el navegador traduce los códigos del bot con ESTE, no con uno que pudo cambiar. */
  products: Product[]
}

export async function iniciarSesionVoz(): Promise<ActionResult<SesionVoz>> {
  const { ctx, error: ctxError } = await requireContext()
  if (ctxError !== null) return { error: ctxError }
  if (!vozHabilitada(ctx.business.slug)) return { error: "El pedido por voz no está encendido para esta cafetería." }

  const supabase = await createClient()
  const { data: filas, error } = await supabase
    .from("menu_products")
    .select(MENU_PRODUCTS_SELECT)
    .eq("is_active", true)
    .order("sort_order")
  if (error) return { error: "No se pudo leer el menú. Revisa la conexión e intenta de nuevo." }

  const products = armarProductos(productosVendibles(filas ?? []))
  if (products.length === 0) return { error: "El menú está vacío: no hay nada que pedir todavía." }
  const catalogo = armarCatalogo(products)

  const cuerpo = {
    expires_after: { anchor: "created_at", seconds: VOZ_CLAVE_SEGUNDOS },
    session: {
      type: "realtime",
      model: VOZ_MODELO,
      instructions: instruccionesVoz(ctx.business.name, catalogoEnTexto(catalogo)),
      tools: HERRAMIENTAS_VOZ,
      tool_choice: "auto",
      max_output_tokens: 1024,
      audio: {
        input: {
          // Mostrador: el cliente habla a medio metro, con la cafetera atrás.
          noise_reduction: { type: "far_field" },
          // La transcripción es para la pantalla y para revisar después; el
          // modelo escucha el audio directo, no este texto.
          transcription: { model: "gpt-4o-mini-transcribe", language: "es" },
          turn_detection: { type: "semantic_vad", eagerness: "medium" },
        },
        output: { voice: "marin" },
      },
    },
  }

  let respuesta: Response
  try {
    respuesta = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        // Identificador estable y anónimo de quién usa la sesión (OpenAI lo
        // pide para atribuir abusos sin recibir datos personales).
        "OpenAI-Safety-Identifier": createHash("sha256").update(ctx.userId).digest("hex"),
      },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
    })
  } catch {
    return { error: "No hubo conexión con el servicio de voz. Intenta de nuevo." }
  }

  const datos = (await respuesta.json().catch(() => null)) as { value?: string; error?: { message?: string } } | null
  if (!respuesta.ok || !datos?.value) {
    const detalle = datos?.error?.message ?? `HTTP ${respuesta.status}`
    await registrarAviso(supabase, {
      route: "/pos/voz",
      digest: "voz-sesion-fallo",
      message: `No se pudo abrir la sesión de voz (${respuesta.status})`,
      detalle: `modelo ${VOZ_MODELO} · ${detalle}`,
    })
    return { error: "El servicio de voz no respondió. Intenta de nuevo en un momento." }
  }

  return { success: true, clave: datos.value, modelo: VOZ_MODELO, products }
}
