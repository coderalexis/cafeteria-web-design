import "server-only"
import { createClient } from "@/lib/supabase/server"

/**
 * Registra un evento en la bitácora del negocio activo (RPC `log_audit`,
 * solo owner|admin). Es "fire-and-forget": un fallo de auditoría nunca debe
 * romper la acción principal.
 */
export async function logAudit(
  action: string,
  entity?: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.rpc("log_audit", {
      p_action: action,
      p_entity: entity ?? undefined,
      p_details: details as never,
    })
  } catch {
    // silencioso a propósito
  }
}

/** Etiquetas en español para la vista Actividad. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
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
  "miembro.pin": "PIN de caja cambiado",
  "negocio.ajustes": "Ajustes del negocio",
}
