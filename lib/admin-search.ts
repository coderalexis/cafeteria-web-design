/**
 * El buscador del panel: «¿dónde se cambia la leche por omisión?».
 *
 * Los ajustes viven repartidos en una docena de pantallas y la pregunta más
 * común de un dueño nuevo no es «cómo» sino «dónde». Este índice es puro:
 * una lista de destinos con sus sinónimos, y una función que los filtra.
 * Sin red y sin React, para poder probarlo aislado; el componente que lo
 * pinta vive en components/admin-search.tsx.
 *
 * Cada entrada apunta a una pantalla y, cuando la pantalla es larga, a la
 * tarjeta exacta (#ancla): llegar a «Datos y ajustes» no resuelve nada si
 * hay que desplazarse por trece tarjetas para dar con «Impresión».
 */
export interface DestinoAdmin {
  /** Lo que se lee en el resultado. */
  titulo: string
  /** Dónde está: pantalla (y tarjeta) en palabras. */
  donde: string
  href: string
  /** Sinónimos y palabras con las que la gente lo pide. */
  palabras: string
}

export const INDICE_ADMIN: DestinoAdmin[] = [
  // ── Resumen ──
  { titulo: "Resumen del día", donde: "Resumen", href: "/admin", palabras: "inicio tablero dashboard ventas hoy como va el dia ayer semana pasada producto estrella pagos" },
  { titulo: "Primeros pasos (checklist)", donde: "Resumen", href: "/admin", palabras: "checklist arranque empezar configurar lista pendientes" },

  // ── Menú ──
  { titulo: "Categorías del menú", donde: "Menú → Categorías", href: "/admin/categorias", palabras: "categoria categorias seccion color colores orden nota de categoria letra chica" },
  { titulo: "Productos, precios y tamaños", donde: "Menú → Productos", href: "/admin/productos", palabras: "producto productos precio precios tamano tamanos variante variantes costo margen activar desactivar ocultar orden descripcion precios en lote" },
  { titulo: "Nuevo producto, de la mano (con precios y extras)", donde: "Menú → Productos → Nuevo producto", href: "/admin/productos", palabras: "nuevo producto crear producto agregar producto asistente paso a paso de la mano comida platillo guarniciones proteina porciones extras preguntas como agrego" },
  { titulo: "Costo de cada producto (para el margen)", donde: "Menú → Productos", href: "/admin/productos", palabras: "costo costos margen utilidad cuanto me cuesta ganancia" },
  { titulo: "Armar la carta con paquetes", donde: "Menú → Productos", href: "/admin/productos", palabras: "paquete paquetes carta plantilla menu inicial espresso frappes panaderia instalar" },
  { titulo: "Opciones y extras (tipo de leche, shots)", donde: "Menú → Opciones y extras", href: "/admin/modificadores", palabras: "extras extra opciones modificadores grupo grupos leche shot jarabe pregunta al vender obligatorio minimo maximo cuantas en que productos va vincular asignar toda la categoria de un toque enganchar en todos" },
  { titulo: "Opción por omisión de un grupo (p. ej. leche deslactosada)", donde: "Menú → Opciones y extras", href: "/admin/modificadores", palabras: "omision por defecto default deslactosada siempre la misma marcada sola no preguntar leche" },

  // ── Ventas ──
  { titulo: "Ventas y tickets", donde: "Ventas", href: "/admin/ventas", palabras: "ventas tickets folio buscar folio cancelar cancelacion reimprimir csv exportar excel reporte por dia por hora por cajero periodo fechas" },
  { titulo: "Exportar ventas (CSV)", donde: "Ventas", href: "/admin/ventas", palabras: "csv excel exportar descargar hoja de calculo" },
  { titulo: "Cortes de caja", donde: "Cortes de caja", href: "/admin/cortes", palabras: "corte cortes caja turno arqueo diferencia faltante sobrante efectivo esperado cerrar caja abrir caja fondo" },
  { titulo: "Cerrar caja contando billetes y dejar fondo", donde: "POS → Caja abierta → Cerrar caja", href: "/pos", palabras: "contar billetes monedas denominacion conteo corte fondo siguiente turno retiro cuadra falta sobra me llevo" },
  { titulo: "Por cobrar (fiados)", donde: "Por cobrar", href: "/admin/por-cobrar", palabras: "fiado fiados por cobrar deben deuda cuenta pendiente cobrar despues perdonar" },
  { titulo: "Gastos del mes", donde: "Gastos y utilidad", href: "/admin/gastos#variables", palabras: "gasto gastos compras reparaciones capturar gasto proveedores insumos" },
  { titulo: "Gastos fijos (renta, luz, sueldos)", donde: "Gastos y utilidad", href: "/admin/gastos#fijos", palabras: "renta luz agua internet sueldos nomina fijos cada mes lo mismo" },
  { titulo: "Punto de equilibrio: cuánto necesitas vender", donde: "Gastos y utilidad", href: "/admin/gastos#equilibrio", palabras: "punto de equilibrio cuanto necesito vender utilidad ganancia perdida meta minima" },
  { titulo: "Promociones por horario", donde: "Promociones", href: "/admin/promociones", palabras: "promocion promociones oferta descuento por horario happy hour tarde de frappes dias semana porcentaje vista previa ejemplo empalme" },
  { titulo: "Análisis: comparativos y patrones", donde: "Análisis", href: "/admin/analisis", palabras: "analisis comparativo dia de la semana mapa de calor hora pico por cajero descuentos cancelaciones sin movimiento se compran juntos extras mas pedidos margen" },

  // ── Personas ──
  { titulo: "Equipo: cajeros y accesos", donde: "Equipo", href: "/admin/equipo", palabras: "equipo cajero cajeros usuario usuarios acceso accesos contrasena restablecer rol administrador dueno invitar dar de alta baja desactivar pin de caja" },
  { titulo: "Qué puede hacer cada rol (cajero, administrador, dueño)", donde: "Equipo → ¿Qué puede hacer cada rol?", href: "/admin/equipo#roles", palabras: "roles rol permisos alcance que puede hacer cajero administrador dueno diferencia quien puede cancelar descuento ver ventas panel" },
  { titulo: "Lealtad: clientes y sellos", donde: "Lealtad", href: "/admin/lealtad", palabras: "lealtad sellos clientes telefono premio tarjeta canje puntos frecuentes" },
  { titulo: "Actividad (bitácora de cambios)", donde: "Actividad", href: "/admin/actividad", palabras: "actividad bitacora historial quien cambio que auditoria registro" },

  // ── Datos y ajustes (una entrada por tarjeta) ──
  { titulo: "Nombre, dirección y teléfono", donde: "Datos y ajustes → Datos generales", href: "/admin/negocio#datos", palabras: "nombre del negocio direccion telefono datos generales identificador slug cafe" },
  { titulo: "Zona horaria", donde: "Datos y ajustes → Zona horaria", href: "/admin/negocio#zona-horaria", palabras: "zona horaria hora dia de operacion reloj tijuana cancun" },
  { titulo: "Textos del ticket (encabezado y pie)", donde: "Datos y ajustes → Ticket impreso", href: "/admin/negocio#ticket", palabras: "ticket encabezado pie del ticket recibo leyenda gracias por su compra vista previa" },
  { titulo: "Metas de venta (diaria y mensual)", donde: "Datos y ajustes → Metas de venta", href: "/admin/negocio#metas", palabras: "meta metas objetivo diaria mensual barra de avance" },
  { titulo: "Módulos del POS: cuentas abiertas, mesas, extras al tocar, descuento máximo", donde: "Datos y ajustes → Módulos del POS", href: "/admin/negocio#modulos", palabras: "modulos pos cuentas abiertas mesas etiquetas barra terraza para llevar botones extras al tocar un producto preguntar siempre solo obligatorios descuento maximo cajero techo por preparar ritmo segundos" },
  { titulo: "Impresión automática, ancho del papel y nota QR", donde: "Datos y ajustes → Impresión al cobrar", href: "/admin/negocio#impresion", palabras: "impresora imprimir impresion automatica ticket comanda rollo 58 80 mm ancho papel nota de compra qr web sin impresora" },
  { titulo: "Hora de cierre y caja olvidada", donde: "Datos y ajustes → Hora de cierre", href: "/admin/negocio#cierre", palabras: "hora de cierre cerrar cierra caja olvidada se cierra sola automatica gracia" },
  { titulo: "Cargo por Para llevar y comisión de tarjeta", donde: "Datos y ajustes → Para llevar y comisión", href: "/admin/negocio#para-llevar", palabras: "para llevar cargo empaque comision terminal tarjeta mercado pago clip neto porcentaje" },
  { titulo: "Lealtad con sellos: activar y premio", donde: "Datos y ajustes → Lealtad con sellos", href: "/admin/negocio#lealtad", palabras: "lealtad sellos premio activar cuantos sellos bebida gratis" },
  { titulo: "Menú público con código QR", donde: "Datos y ajustes → Menú público", href: "/admin/negocio#menu-publico", palabras: "menu publico qr codigo publicar carta en linea nota al pie del menu imprimir cartel enlace" },
  { titulo: "Resumen semanal por correo", donde: "Datos y ajustes → Resumen semanal", href: "/admin/negocio#resumen-semanal", palabras: "resumen semanal correo email lunes apagar" },
  { titulo: "Seguridad de caja: bloqueo por inactividad y PIN", donde: "Datos y ajustes → Seguridad de caja", href: "/admin/negocio#seguridad", palabras: "seguridad bloqueo bloquear inactividad pin candado pantalla minutos" },

  // ── Mi cuenta ──
  { titulo: "Cambiar mi contraseña", donde: "Mi cuenta", href: "/cuenta#contrasena", palabras: "contrasena password cambiar clave mi cuenta" },
  { titulo: "Mi PIN de caja", donde: "Mi cuenta", href: "/cuenta#pin", palabras: "pin de caja desbloquear candado mi pin" },

  // ── Fuera del panel ──
  { titulo: "Ir al punto de venta", donde: "POS", href: "/pos", palabras: "pos punto de venta cobrar vender caja" },
  { titulo: "Aprender: recorrido de la primera venta, práctica y lecturas", donde: "POS → ⋮ → Aprender", href: "/pos?recorrido=1", palabras: "aprender tutorial tutoriales recorrido primera venta practica paso a paso ensenar cajero nuevo como se vende repetir" },
  { titulo: "Por preparar (comanda en pantalla)", donde: "POS → ⋮ → Por preparar", href: "/pos/preparar", palabras: "por preparar comanda pantalla cocina barra pedidos listo" },
]

/** Sin acentos ni mayúsculas: «Categoría» y «categoria» son lo mismo. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

/**
 * Filtra el índice: cada palabra de la búsqueda tiene que aparecer en el
 * título, el «dónde» o los sinónimos. Primero los que la traen en el título,
 * porque es lo que la persona va a leer. Tope de 8: más que eso ya no es una
 * respuesta, es otra lista que recorrer.
 */
export function buscarAdmin(consulta: string, indice: DestinoAdmin[] = INDICE_ADMIN, tope = 8): DestinoAdmin[] {
  const palabras = normalizarBusqueda(consulta).split(/\s+/).filter((p) => p.length >= 2)
  if (palabras.length === 0) return []
  const conPeso = indice
    .map((d) => {
      const titulo = normalizarBusqueda(d.titulo)
      const todo = `${titulo} ${normalizarBusqueda(d.donde)} ${normalizarBusqueda(d.palabras)}`
      if (!palabras.every((p) => todo.includes(p))) return null
      const enTitulo = palabras.filter((p) => titulo.includes(p)).length
      return { d, peso: enTitulo }
    })
    .filter((x): x is { d: DestinoAdmin; peso: number } => x !== null)
    .sort((a, b) => b.peso - a.peso)
  return conPeso.slice(0, tope).map((x) => x.d)
}
