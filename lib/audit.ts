import "server-only"
import { createClient } from "@/lib/supabase/server"

/**
 * Registra un evento en la bitácora del negocio activo (RPC `log_audit`,
 * solo owner|admin).
 *
 * Es de buen esfuerzo A PROPÓSITO: que la bitácora tosa no debe impedir
 * guardar la carta. Pero callar del todo era peor —una auditoría que puede
 * fallar sin ruido es decorativa—, así que un fallo queda en los logs del
 * servidor con la acción que se perdió. Lo que SÍ es dinero (condonar un
 * fiado, ajustar sellos) ya no pasa por aquí: lo escribe el propio RPC en la
 * misma transacción que el cambio (migración 37), o no ocurre.
 */
export async function logAudit(
  action: string,
  entity?: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc("log_audit", {
      p_action: action,
      p_entity: entity ?? undefined,
      p_details: details as never,
    })
    if (error) throw error
  } catch (e) {
    console.error(`[bitácora] no se pudo registrar «${action}»:`, e instanceof Error ? e.message : e)
  }
}

/** Etiquetas en español para la vista Actividad. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "fiado.condonado": "Deuda condonada",
  "categoria.creada": "Categoría creada",
  "categoria.editada": "Categoría editada",
  "categoria.eliminada": "Categoría eliminada",
  "producto.creado": "Producto creado",
  "producto.editado": "Producto editado",
  "producto.activado": "Producto activado",
  "producto.desactivado": "Producto desactivado",
  "producto.eliminado": "Producto eliminado",
  "variante.creada": "Variante creada",
  "variante.editada": "Variante editada",
  "precio.cambiado": "Precio cambiado",
  "costo.cambiado": "Costo cambiado",
  "precios.lote": "Cambio de precios en lote",
  "variante.eliminada": "Variante eliminada",
  "variante.activada": "Variante activada",
  "variante.desactivada": "Variante desactivada",
  "grupo.creado": "Grupo de modificadores creado",
  "grupo.editado": "Grupo de modificadores editado",
  "grupo.eliminado": "Grupo de modificadores eliminado",
  "modificador.creado": "Modificador creado",
  "modificador.editado": "Modificador editado",
  "modificador.eliminado": "Modificador eliminado",
  "producto.modificadores": "Modificadores del producto",
  "miembro.creado": "Miembro creado",
  "miembro.agregado": "Miembro agregado",
  "miembro.editado": "Miembro editado",
  "miembro.desactivado": "Miembro desactivado",
  "miembro.reactivado": "Miembro reactivado",
  "miembro.eliminado": "Miembro quitado del equipo",
  "miembro.contrasena": "Contraseña restablecida",
  "miembro.correo": "Correo de miembro cambiado",
  "miembro.pin": "PIN de caja cambiado",
  "negocio.ajustes": "Ajustes del negocio",
}
