import {
  addUnit,
  cartItemCount,
  cartSubtotal,
  getLineLabel,
  getLinePrice,
  serializeCart,
  type CartLine,
  type ModifierGroup,
  type ModifierOption,
  type PersistedCart,
  type Product,
  type SizeOption,
} from "../cart"

/**
 * El pedido por voz, sin voz: lo que el bot PUEDE hacer con el pedido y las
 * reglas con que se le contesta. Puro, sin red ni React, para probarlo aislado.
 *
 * La decisión de fondo: el modelo de voz nunca toca precios ni ids del menú.
 * Habla con CÓDIGOS cortos (p12, e3) que esta capa traduce, valida contra el
 * menú real del café y convierte en renglones del mismo carrito que arma un
 * toque. Si el modelo inventa un código, pide un extra que no aplica o se
 * salta un grupo obligatorio, la respuesta se lo dice y le indica qué
 * preguntar. Los importes que el bot dice en voz alta salen de aquí, no de
 * su cabeza, y al cobrar `create_ticket` los vuelve a calcular como siempre.
 *
 * Códigos y no UUID: cada UUID son ~20 tokens que el modelo tiene que copiar
 * sin un error, en cada llamada y en cada renglón del menú. Un código de tres
 * letras es más barato y más difícil de equivocar.
 */

export interface Catalogo {
  /** En el orden del menú: el texto que lee el bot sale de aquí. */
  productos: Array<{ codigo: string; product: Product }>
  porCodigo: Map<string, Product>
  /** Un grupo de extras se comparte entre productos: se define una vez. */
  grupos: Array<{ codigo: string; grupo: ModifierGroup }>
  codigoDeGrupo: Map<string, string>
  extraPorCodigo: Map<string, ModifierOption>
  codigoDeExtra: Map<string, string>
}

export function armarCatalogo(products: Product[]): Catalogo {
  const productos = products
    .filter((p) => !p.custom)
    .map((product, i) => ({ codigo: `p${i + 1}`, product }))
  const grupos: Catalogo["grupos"] = []
  const codigoDeGrupo = new Map<string, string>()
  const extraPorCodigo = new Map<string, ModifierOption>()
  const codigoDeExtra = new Map<string, string>()
  for (const { product } of productos) {
    for (const g of product.modifierGroups ?? []) {
      if (!codigoDeGrupo.has(g.id)) {
        const codigo = `g${grupos.length + 1}`
        codigoDeGrupo.set(g.id, codigo)
        grupos.push({ codigo, grupo: g })
      }
      for (const o of g.options) {
        if (codigoDeExtra.has(o.id)) continue
        const codigo = `e${codigoDeExtra.size + 1}`
        codigoDeExtra.set(o.id, codigo)
        extraPorCodigo.set(codigo, o)
      }
    }
  }
  return {
    productos,
    porCodigo: new Map(productos.map((p) => [p.codigo, p.product])),
    grupos,
    codigoDeGrupo,
    extraPorCodigo,
    codigoDeExtra,
  }
}

/** «$45» o «$45.50»: como se dice en voz alta, sin centavos de sobra. */
export function pesos(n: number): string {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`
}

function reglaDeGrupo(g: ModifierGroup): string {
  const max = g.maxSelect
  if (g.minSelect > 0 && max === g.minSelect) return `obligatorio, elige ${g.minSelect}`
  if (g.minSelect > 0) return `obligatorio, elige al menos ${g.minSelect}${max ? ` y máximo ${max}` : ""}`
  return max ? `opcional, máximo ${max}` : "opcional"
}

/**
 * El menú como lo lee el bot. Compacto a propósito: va en las instrucciones
 * de CADA sesión, y cada palabra de más se paga en cada pedido.
 */
export function catalogoEnTexto(cat: Catalogo): string {
  const lineas: string[] = []
  let seccion = ""
  for (const { codigo, product } of cat.productos) {
    if (product.subcategory !== seccion) {
      seccion = product.subcategory
      lineas.push(`\n## ${seccion}`)
    }
    const precio = product.sizes?.length
      ? product.sizes.map((s) => `${s.label} ${pesos(s.price)}`).join(" · ")
      : pesos(product.price ?? 0)
    const grupos = (product.modifierGroups ?? []).map((g) => cat.codigoDeGrupo.get(g.id)).filter(Boolean)
    const desc = product.description ? ` (${product.description.slice(0, 80)})` : ""
    lineas.push(`${codigo} ${product.name}${desc} | ${precio}${grupos.length ? ` | extras: ${grupos.join(", ")}` : ""}`)
  }
  if (cat.grupos.length > 0) {
    lineas.push("\n## Grupos de extras")
    for (const { codigo, grupo } of cat.grupos) {
      const opciones = grupo.options
        .map((o) => {
          const pre = o.priceDelta ? ` +${pesos(o.priceDelta)}` : ""
          const omision = grupo.defaultOptionId === o.id ? " (por omisión)" : ""
          return `${cat.codigoDeExtra.get(o.id)} ${o.name}${pre}${omision}`
        })
        .join(", ")
      lineas.push(`${codigo} ${grupo.name} [${reglaDeGrupo(grupo)}]: ${opciones}`)
    }
  }
  return lineas.join("\n").trim()
}

/* ------------------------------------------------------------------ */
/*  Lo que el bot puede hacer                                          */
/* ------------------------------------------------------------------ */

export interface RenglonResumen {
  renglon: number
  descripcion: string
  importe: number
}

export interface Resumen {
  renglones: RenglonResumen[]
  articulos: number
  total: number
}

/** Lo que se le contesta al bot en cada herramienta. Siempre lleva el pedido al día. */
export interface Respuesta {
  ok: boolean
  mensaje: string
  /** Cuando falta un dato: qué preguntarle al cliente. */
  preguntar?: string
  pedido: Resumen
}

function sinAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

export function describirRenglon(l: CartLine): string {
  const extras = l.modifiers.map((m) => m.name).join(", ")
  const nota = l.notes ? ` — nota: ${l.notes}` : ""
  return `${l.quantity} × ${getLineLabel(l)}${extras ? ` con ${extras}` : ""}${nota}`
}

export function resumir(lines: CartLine[]): Resumen {
  return {
    renglones: lines.map((l, i) => ({
      renglon: i + 1,
      descripcion: describirRenglon(l),
      importe: Math.round(getLinePrice(l) * l.quantity * 100) / 100,
    })),
    articulos: cartItemCount(lines),
    total: cartSubtotal(lines),
  }
}

/**
 * ¿La nota nombra un extra del menú? La nota libre era una puerta trasera:
 * en la primera prueba en un teléfono el cliente pidió leche deslactosada en
 * un mocha, el menú no ofrece ese extra ($8) para el mocha, y el bot lo puso
 * como NOTA — la barra lo prepara y la caja no lo cobra. Se compara sin
 * acentos y en las dos direcciones («deslactosada» ⊂ «Leche deslactosada»),
 * con un mínimo de largo para que «con» no case con nada.
 */
function extraNombradoEn(nota: string, cat: Catalogo): ModifierOption | null {
  const n = sinAcentos(nota)
  let mejor: ModifierOption | null = null
  for (const o of cat.extraPorCodigo.values()) {
    const nombre = sinAcentos(o.name)
    if (nombre.length < 4) continue
    const casa = n.includes(nombre) || (n.length >= 6 && nombre.includes(n))
    // El nombre más largo gana: «leche de avena» antes que «avena».
    if (casa && (!mejor || nombre.length > sinAcentos(mejor.name).length)) mejor = o
  }
  return mejor
}

export interface ArgsAgregar {
  producto: string
  tamano?: string | null
  cantidad?: number | null
  extras?: string[] | null
  nota?: string | null
}

export const CANTIDAD_MAX = 20

function elegirTamano(product: Product, tamano: string | null | undefined): SizeOption | null | "falta" | "no-existe" {
  const sizes = product.sizes ?? []
  if (sizes.length === 0) return null
  if (!tamano || !tamano.trim()) return sizes.length === 1 ? sizes[0] : "falta"
  const buscado = sinAcentos(tamano)
  return (
    sizes.find((s) => sinAcentos(s.label) === buscado) ??
    sizes.find((s) => sinAcentos(s.label).includes(buscado) || buscado.includes(sinAcentos(s.label))) ??
    "no-existe"
  )
}

function opcionesDeTamano(product: Product): string {
  return (product.sizes ?? []).map((s) => `${s.label} (${pesos(s.price)})`).join(", ")
}

/**
 * Agrega un producto. Aplica las mismas reglas que la hoja de extras del POS:
 * el tamaño es obligatorio si hay más de uno, cada extra tiene que ser de un
 * grupo del producto, ningún grupo pasa de su máximo, la opción por omisión
 * entra sola donde el cliente no eligió nada, y un grupo obligatorio sin
 * respuesta detiene el alta para preguntar — nunca se adivina.
 */
export function agregar(lines: CartLine[], args: ArgsAgregar, cat: Catalogo, nuevoId: () => string): { lines: CartLine[]; respuesta: Respuesta } {
  const falla = (mensaje: string, preguntar?: string) => ({
    lines,
    respuesta: { ok: false, mensaje, ...(preguntar ? { preguntar } : {}), pedido: resumir(lines) },
  })

  const product = cat.porCodigo.get(String(args.producto ?? "").trim().toLowerCase())
  if (!product) return falla(`No existe el código «${args.producto}». Usa solo los códigos del menú.`)

  const cantidad = args.cantidad == null ? 1 : Number(args.cantidad)
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAX) {
    return falla(`La cantidad tiene que ser un entero de 1 a ${CANTIDAD_MAX}.`)
  }

  const size = elegirTamano(product, args.tamano)
  if (size === "falta") {
    return falla(`Falta el tamaño de ${product.name}.`, `¿De qué tamaño? ${opcionesDeTamano(product)}`)
  }
  if (size === "no-existe") {
    return falla(`${product.name} no viene en «${args.tamano}».`, `Los tamaños son: ${opcionesDeTamano(product)}`)
  }

  const grupos = product.modifierGroups ?? []
  const elegidos: ModifierOption[] = []
  const vistos = new Set<string>()
  for (const codigo of args.extras ?? []) {
    const opt = cat.extraPorCodigo.get(String(codigo).trim().toLowerCase())
    if (!opt) return falla(`No existe el extra «${codigo}». Usa solo los códigos del menú.`)
    if (!grupos.some((g) => g.options.some((o) => o.id === opt.id))) {
      return falla(`«${opt.name}» no aplica a ${product.name}.`)
    }
    if (vistos.has(opt.id)) continue
    vistos.add(opt.id)
    elegidos.push(opt)
  }

  const modifiers: ModifierOption[] = []
  for (const g of grupos) {
    const delGrupo = elegidos.filter((o) => g.options.some((x) => x.id === o.id))
    if (g.maxSelect != null && delGrupo.length > g.maxSelect) {
      return falla(`En «${g.name}» se elige máximo ${g.maxSelect}.`, `¿Cuál${g.maxSelect > 1 ? "es" : ""} de esas quiere?`)
    }
    if (delGrupo.length === 0 && g.defaultOptionId) {
      const omision = g.options.find((o) => o.id === g.defaultOptionId)
      if (omision) delGrupo.push(omision)
    }
    if (delGrupo.length < g.minSelect) {
      const opciones = g.options.map((o) => `${o.name}${o.priceDelta ? ` (+${pesos(o.priceDelta)})` : ""}`).join(", ")
      const cuantos = g.minSelect > 1 ? `Elige ${g.minSelect}` : "Elige una"
      return falla(`Para ${product.name} falta «${g.name}».`, `${g.name}: ${cuantos} de: ${opciones}`)
    }
    modifiers.push(...delGrupo)
  }

  const nota = (args.nota ?? "").trim().replace(/\s+/g, " ").slice(0, 120)
  const extraEnNota = nota ? extraNombradoEn(nota, cat) : null
  if (extraEnNota) {
    const codigo = cat.codigoDeExtra.get(extraEnNota.id)
    if (grupos.some((g) => g.options.some((o) => o.id === extraEnNota.id))) {
      return falla(`«${extraEnNota.name}» es un extra del menú: mándalo en «extras» con su código (${codigo}), no como nota, para que se cobre.`)
    }
    if (extraEnNota.priceDelta > 0) {
      const cual = `${product.name}${size ? ` ${size.label}` : ""}`
      return falla(
        `«${extraEnNota.name}» no está disponible para ${product.name} (es un extra con costo que este producto no tiene): no lo pongas como nota. Si el cliente acepta ${cual} sin eso, vuelve a llamar agregar_producto igual pero sin la nota.`,
        `${extraEnNota.name} no está disponible para ${product.name}. ¿Te lo preparo sin eso?`,
      )
    }
  }
  let nuevas: CartLine[]
  if (nota) {
    // Con nota no se fusiona: «uno sin azúcar» es otro renglón, como en el POS.
    nuevas = [
      ...lines.map((l) => ({ ...l, isNew: false })),
      { lineId: nuevoId(), product, size: size ?? undefined, modifiers, quantity: cantidad, notes: nota, isNew: true },
    ]
  } else {
    nuevas = lines
    for (let i = 0; i < cantidad; i++) nuevas = addUnit(nuevas, product, size ?? undefined, modifiers, nuevoId)
  }

  const linea: CartLine = { lineId: "", product, size: size ?? undefined, modifiers, quantity: cantidad, notes: nota }
  const importe = getLinePrice(linea) * cantidad
  const pedido = resumir(nuevas)
  return {
    lines: nuevas,
    respuesta: {
      ok: true,
      mensaje: `Agregado: ${describirRenglon(linea)} — ${pesos(importe)}. Total del pedido: ${pesos(pedido.total)}.`,
      pedido,
    },
  }
}

export interface ArgsQuitar {
  /** Número de renglón (el de `pedido.renglones`). */
  renglon?: number | null
  /** O el código del producto, sin buscar antes el renglón. */
  producto?: string | null
  cantidad?: number | null
}

/**
 * Quita un renglón entero, o solo unas piezas si se dice cuántas.
 *
 * Acepta el CÓDIGO del producto además del renglón: en las pruebas con voz el
 * modelo, para quitar, tenía que consultar primero el pedido y luego usar el
 * número, y ese paso de más era justo el que se saltaba — decía «ya lo
 * quité» sin haber quitado nada.
 */
export function quitar(lines: CartLine[], args: ArgsQuitar, cat?: Catalogo): { lines: CartLine[]; respuesta: Respuesta } {
  const falla = (mensaje: string) => ({ lines, respuesta: { ok: false, mensaje, pedido: resumir(lines) } })
  let i = -1
  if (args.renglon != null) {
    i = Number(args.renglon) - 1
    if (!Number.isInteger(i) || !lines[i]) return falla(`No hay renglón ${args.renglon}. Los renglones están en «pedido.renglones».`)
  } else if (args.producto) {
    const product = cat?.porCodigo.get(String(args.producto).trim().toLowerCase())
    if (!product) return falla(`No existe el código «${args.producto}».`)
    const indices = lines.flatMap((l, j) => (l.product.id === product.id ? [j] : []))
    if (indices.length === 0) return falla(`No hay ${product.name} en el pedido.`)
    if (indices.length > 1) return falla(`Hay ${indices.length} renglones de ${product.name}: di cuál con su número de renglón.`)
    i = indices[0]
  } else {
    return falla("Di qué quitar: el número de renglón o el código del producto.")
  }
  const l = lines[i]
  const cantidad = args.cantidad == null ? l.quantity : Number(args.cantidad)
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return { lines, respuesta: { ok: false, mensaje: "La cantidad a quitar tiene que ser un entero positivo.", pedido: resumir(lines) } }
  }
  const nuevas =
    cantidad >= l.quantity
      ? lines.filter((_, j) => j !== i)
      : lines.map((x, j) => (j === i ? { ...x, quantity: x.quantity - cantidad } : x))
  const pedido = resumir(nuevas)
  const quitado = Math.min(cantidad, l.quantity)
  return {
    lines: nuevas,
    respuesta: { ok: true, mensaje: `Quitado: ${quitado} × ${getLineLabel(l)}. Total del pedido: ${pesos(pedido.total)}.`, pedido },
  }
}

export const NOMBRE_MAX = 30

/** Lo que el modelo escribe cuando no sabe el nombre: nunca es un nombre. */
const NOMBRES_GENERICOS = new Set(["cliente", "el cliente", "usuario", "anonimo", "sin nombre", "nombre", "desconocido", "senor", "senora", "amigo", "amiga", "persona", "invitado", "n/a", "na"])

export interface Confirmacion {
  nombre: string
  articulos: number
  /** El pedido cambió desde la última vez que el bot lo leyó con ver_pedido. */
  cambioDesdeLaLectura: boolean
  /** ¿El cliente habló después de esa lectura? */
  clienteHabloDespues: boolean
  /** ¿El bot hizo una pregunta en la MISMA respuesta en la que quiere confirmar? */
  preguntoEnLaMismaRespuesta: boolean
}

/**
 * Las reglas para guardar, que el modelo no puede saltarse porque las aplica
 * la app y no las instrucciones. Salieron de probar con un cliente simulado:
 * el bot preguntó «¿a nombre de quién?» y en la misma respuesta guardó el
 * pedido como «cliente»; y en otra dijo «ya quité un cappuccino» sin haberlo
 * quitado. Con estas reglas, lo que se guarda es exactamente lo que el
 * cliente oyó leer y aceptó, a su nombre.
 */
export function validarConfirmacion(c: Confirmacion): { ok: true; nombre: string } | { ok: false; mensaje: string; preguntar?: string } {
  if (c.articulos === 0) return { ok: false, mensaje: "El pedido está vacío: no hay nada que guardar." }
  if (c.preguntoEnLaMismaRespuesta) {
    return { ok: false, mensaje: "No confirmes en la misma respuesta en que preguntas: espera a que el cliente conteste." }
  }
  if (c.cambioDesdeLaLectura) {
    return { ok: false, mensaje: "El pedido cambió desde la última vez que lo leíste. Usa ver_pedido, léeselo al cliente y espera su sí." }
  }
  if (!c.clienteHabloDespues) {
    return { ok: false, mensaje: "El cliente todavía no ha contestado a la lectura del pedido. Espera su respuesta." }
  }
  const nombre = c.nombre.trim().replace(/\s+/g, " ")
  if (!nombre || NOMBRES_GENERICOS.has(sinAcentos(nombre))) {
    return { ok: false, mensaje: "Falta el nombre del cliente; no lo inventes.", preguntar: "¿A nombre de quién lo pongo?" }
  }
  return { ok: true, nombre }
}

/** El nombre con que la cajera la ve en su bandeja: «Juan (voz)». */
export function nombreDeCuenta(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ").slice(0, NOMBRE_MAX)
  return `${limpio} (voz)`
}

/**
 * Lo que se guarda como cuenta abierta: el mismo carrito serializado que
 * guarda el POS, con una nota para que la cajera sepa de dónde vino.
 */
export function carritoParaGuardar(lines: CartLine[], saleRef: string, now: number): PersistedCart {
  return serializeCart(
    {
      saleRef,
      paymentMethod: "efectivo",
      ticketNotes: "Pedido tomado por voz",
      cashReceivedInput: "",
      discount: null,
      lines: lines.map((l) => ({ ...l, isNew: false })),
    },
    now,
  )
}

/* ------------------------------------------------------------------ */
/*  Las herramientas y las instrucciones del bot                       */
/* ------------------------------------------------------------------ */

/** Definición de herramientas para la sesión de voz (formato Realtime de OpenAI). */
export const HERRAMIENTAS_VOZ = [
  {
    type: "function",
    name: "agregar_producto",
    description:
      "Agrega un producto al pedido. Úsala en cuanto el cliente pida algo; si la respuesta dice que falta un dato, pregúntaselo al cliente con el texto de «preguntar» y vuelve a llamarla completa.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Código del producto en el menú, p. ej. p12." },
        tamano: { type: "string", description: "Uno de los tamaños que el menú lista para ese producto (p. ej. Grande). Si la lista incluye «Frio» y el cliente lo pide frío, el tamaño es «Frio». Omitir si el producto tiene un solo precio." },
        cantidad: { type: "integer", minimum: 1, maximum: CANTIDAD_MAX },
        extras: { type: "array", items: { type: "string" }, description: "Códigos de extras (e1, e2…) que pidió el cliente." },
        nota: {
          type: "string",
          description: "Indicación que NO es un extra del menú, p. ej. «sin azúcar», «tibio». Nunca pongas aquí un extra del menú (leches, jarabes, shots…): esos van en «extras» y tienen precio.",
        },
      },
      required: ["producto", "cantidad"],
    },
  },
  {
    type: "function",
    name: "quitar_producto",
    description:
      "Quita un producto del pedido, o solo algunas piezas. Indica el código del producto (o el número de renglón si hay dos renglones del mismo producto). Úsala SIEMPRE que el cliente quite o reduzca algo: decir que lo quitaste sin llamarla no cambia el pedido.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Código del producto a quitar, p. ej. p5." },
        renglon: { type: "integer", minimum: 1, description: "Número de renglón (viene en «pedido.renglones» de cada respuesta)." },
        cantidad: { type: "integer", minimum: 1, description: "Cuántas piezas quitar; omitir para quitar todas las de ese renglón." },
      },
    },
  },
  {
    type: "function",
    name: "ver_pedido",
    description: "Devuelve el pedido con sus renglones numerados y el total. Úsala antes de confirmar y siempre que necesites decir el total.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "confirmar_pedido",
    description:
      "Guarda el pedido para que lo preparen y lo cobren en caja. Llámala SOLO cuando el cliente ya contestó que sí a la lectura del pedido Y te dijo su nombre. Si falta algo de eso, pregunta y espera.",
    parameters: {
      type: "object",
      properties: { nombre: { type: "string", description: "El nombre que dijo el cliente. Nunca lo inventes." } },
      required: ["nombre"],
    },
  },
  {
    type: "function",
    name: "cancelar_pedido",
    description: "Borra todo el pedido si el cliente dice que ya no quiere nada.",
    parameters: { type: "object", properties: {} },
  },
] as const

export function instruccionesVoz(cafe: string, menu: string): string {
  return `Eres quien toma los pedidos en el mostrador de ${cafe}, una cafetería en México. Hablas español mexicano, cálido y breve, como un buen cajero con fila: frases cortas, una pregunta a la vez, sin listas largas en voz alta.

Cómo atiendes:
- Saluda en una frase y pregunta qué va a llevar.
- Cada vez que el cliente pida algo, llama a agregar_producto con los códigos del menú. No lo repitas todo después de cada producto: basta un «listo» o «va» y preguntar si algo más.
- No anuncies lo que vas a hacer («déjame agregarlo», «déjame revisar»): llama a la herramienta directamente y habla cuando tengas su respuesta.
- Los tamaños son los que lista el menú para cada producto. En algunos productos «Frio» es uno de esos tamaños: si el cliente lo pide frío, ya dijo el tamaño.
- Si una herramienta responde con «preguntar», hazle esa pregunta al cliente con tus palabras y vuelve a llamarla con el dato.
- Si piden algo que no está en el menú, dilo y ofrece lo más parecido que sí haya. Nunca inventes productos, tamaños, extras ni precios.
- Los precios y el total salen SIEMPRE de las respuestas de las herramientas; no hagas cuentas tú.
- Si el cliente quiere quitar o reducir algo, llama a quitar_producto (y a agregar_producto si es un cambio). Nunca digas que agregaste, quitaste o cambiaste algo si la herramienta no te respondió ok: el pedido solo cambia con las herramientas.
- Cuando diga que es todo: usa ver_pedido, léele el pedido y el total de forma natural, y pregunta en la misma frase si está bien y a nombre de quién lo pones (si aún no sabes su nombre). Espera su respuesta; no confirmes en la misma respuesta en que preguntas.
- Cuando el cliente diga que sí y tengas su nombre, llama a confirmar_pedido. Si la herramienta se niega, haz lo que te indique.
- Después de confirmar, dile que pase a pagar a la caja y despídete en una frase.
- No cobras ni hablas de formas de pago: eso se hace en caja. Si preguntan algo que no tiene que ver con el pedido, contesta en una frase y vuelve al pedido.
- Si no entendiste, pide que lo repita; no adivines.

Menú (código, nombre, precios, grupos de extras que aplican):
${menu}`
}
