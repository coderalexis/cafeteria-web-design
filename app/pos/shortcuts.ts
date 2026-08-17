/** Atajos del POS. Fuente única para el overlay «?» y la página /ayuda. */
export const POS_SHORTCUTS: Array<{ keys: string[]; label: string; hint?: string }> = [
  { keys: ["/"], label: "Ir al buscador" },
  { keys: ["Enter"], label: "Agregar el primer resultado", hint: "en el buscador; si tiene tamaños los abre" },
  { keys: ["1", "2", "3"], label: "Elegir tamaño", hint: "cuando el selector de tamaños está abierto" },
  { keys: ["Esc"], label: "Limpiar búsqueda / cerrar" },
  { keys: ["F2"], label: "Cobrar" },
  { keys: ["F4"], label: "Ir a «Recibido» (efectivo)" },
  { keys: ["1", "2", "3"], label: "Efectivo · Transferencia · Tarjeta", hint: "fuera de un campo de texto" },
  { keys: ["T"], label: "Tickets del día" },
  { keys: ["K"], label: "Caja (abrir / corte)" },
  { keys: ["D"], label: "Descuento" },
  { keys: ["Ctrl", "⌫"], label: "Vaciar carrito", hint: "pide confirmación" },
  { keys: ["?"], label: "Esta lista" },
]
