import { Shield } from "lucide-react"

/**
 * Qué puede hacer cada rol, dicho en la pantalla donde se asigna.
 *
 * Los tres roles existían desde el principio, pero su alcance solo vivía en
 * el código (RLS, RPCs, `requireAdmin`) y en una línea de la guía. Quien da
 * de alta a alguien tiene que decidir «¿cajero o administrador?» sin ir a
 * buscar qué significa. Esta tabla dice EXACTAMENTE lo que el servidor
 * permite; si una regla cambia allá, cambia aquí.
 */
const FILAS: { que: string; cajero: string; admin: string; owner: string }[] = [
  {
    que: "Punto de venta: cobrar, abrir y cerrar caja, movimientos de efectivo, cuentas abiertas, Por preparar, sellos",
    cajero: "Sí",
    admin: "Sí",
    owner: "Sí",
  },
  {
    que: "Ver ventas",
    cajero: "Solo las suyas (Tickets del día)",
    admin: "Todas, con reportes",
    owner: "Todas, con reportes",
  },
  {
    que: "Cancelar una venta",
    cajero: "Solo las suyas, mientras la caja siga abierta",
    admin: "Cualquiera, cuando sea",
    owner: "Cualquiera, cuando sea",
  },
  {
    que: "Corregir una venta (vuelve al carrito y se cobra de nuevo; la original queda cancelada)",
    cajero: "Solo las suyas, mientras la caja siga abierta",
    admin: "Cualquiera, mientras la caja de esa venta siga abierta",
    owner: "Cualquiera, mientras la caja de esa venta siga abierta",
  },
  {
    que: "Fiar una venta y registrar abonos (con el módulo Fiados encendido)",
    cajero: "Sí",
    admin: "Sí",
    owner: "Sí",
  },
  {
    que: "Descuentos en caja",
    cajero: "Hasta el tope de Datos y ajustes (0 = ninguno)",
    admin: "Sin tope",
    owner: "Sin tope",
  },
  {
    que: "Panel: menú, precios y costos, extras, promociones, gastos, análisis, cortes, actividad, datos y ajustes",
    cajero: "No entra",
    admin: "Sí",
    owner: "Sí",
  },
  {
    que: "Equipo",
    cajero: "No",
    admin: "Agrega y edita cajeros y administradores; PIN y contraseña de cuentas de café",
    owner: "Además nombra o quita dueños y cambia su correo. Siempre queda al menos un dueño",
  },
  {
    que: "Resumen semanal por correo",
    cajero: "No",
    admin: "Sí",
    owner: "Sí",
  },
  {
    que: "Mi cuenta: su propia contraseña y su PIN de caja",
    cajero: "Sí",
    admin: "Sí",
    owner: "Sí",
  },
]

export function RoleLegend() {
  return (
    <details id="roles" className="admin-ancla scroll-mt-20 group rounded-xl border border-stone-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-stone-700 marker:hidden [&::-webkit-details-marker]:hidden">
        <Shield className="h-4 w-4 text-indigo-600" />
        ¿Qué puede hacer cada rol?
        <span className="ml-auto text-xs font-normal text-stone-400 group-open:hidden">ver</span>
        <span className="ml-auto hidden text-xs font-normal text-stone-400 group-open:inline">ocultar</span>
      </summary>
      <div className="overflow-x-auto border-t border-stone-100">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-400">
              <th className="px-4 py-2 font-medium">Puede…</th>
              <th className="px-3 py-2 font-medium text-amber-700">Cajero</th>
              <th className="px-3 py-2 font-medium text-indigo-700">Administrador</th>
              <th className="px-3 py-2 pr-4 font-medium text-purple-700">Dueño</th>
            </tr>
          </thead>
          <tbody className="text-stone-600">
            {FILAS.map((f) => (
              <tr key={f.que} className="border-t border-stone-100 align-top">
                <td className="px-4 py-2 text-stone-700">{f.que}</td>
                <td className="px-3 py-2">{f.cajero}</td>
                <td className="px-3 py-2">{f.admin}</td>
                <td className="px-3 py-2 pr-4">{f.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-xs text-stone-400">
          Estas reglas las aplica el servidor, no solo la pantalla: un cajero no puede saltárselas desde el navegador.
        </p>
      </div>
    </details>
  )
}

/** La versión de un renglón, junto al selector de rol. */
export function RoleHint() {
  return (
    <p className="mt-1 text-xs text-stone-400">
      <strong className="font-medium text-amber-700">Cajero</strong>: solo el punto de venta y sus propias ventas ·{" "}
      <strong className="font-medium text-indigo-700">Administrador</strong>: también todo el panel ·{" "}
      <strong className="font-medium text-purple-700">Dueño</strong>: además nombra dueños. La tabla completa está
      arriba, en «¿Qué puede hacer cada rol?».
    </p>
  )
}
