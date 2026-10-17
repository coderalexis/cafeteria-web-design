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
    // «grupos de extras» y no «extras»: con la etiqueta corta, el modelo a
    // veces copiaba el código del grupo (g1) dentro de los extras.
    lineas.push(`${codigo} ${product.name}${desc} | ${precio}${grupos.length ? ` | grupos de extras: ${grupos.join(", ")}` : ""}`)
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
  /** El nombre del producto, como verificación del código (ver `verificarProducto`). */
  nombre?: string | null
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

/* ── El nombre como dígito verificador del código ─────────────────── */

const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "sin", "y", "un", "una", "unos", "unas", "al", "a", "en", "por", "para"])

/** Palabras con peso de un nombre: sin acentos, sin palabras vacías y en singular («lattes» → «latte»). */
function palabras(texto: string): Set<string> {
  return new Set(
    sinAcentos(texto)
      .replace(/[^a-z0-9ñ]+/g, " ")
      .split(" ")
      .filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p))
      .map((p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p)),
  )
}

/**
 * ¿Cuánto se parece lo que dijo el modelo al producto? 0 si no corresponde.
 * Corresponde si todas las palabras del nombre del producto están en lo dicho
 * («panqué de limón» ⊇ «panque limon»), o todas las de lo dicho están en el
 * producto con su descripción. La cifra es cuántas palabras comparten
 * contando la descripción: así «frappé de taro» se va con el Taro que se
 * describe como frappé y no con el caliente.
 */
export function afinidad(dicho: string, product: Product): number {
  const d = palabras(dicho)
  const nombre = palabras(product.name)
  const completo = palabras(`${product.name} ${product.description ?? ""} ${product.subcategory ?? ""}`)
  if (d.size === 0 || nombre.size === 0) return 0
  const nombreEnDicho = [...nombre].every((p) => d.has(p))
  const dichoEnProducto = [...d].every((p) => completo.has(p))
  if (!nombreEnDicho && !dichoEnProducto) return 0
  return [...d].filter((p) => completo.has(p)).length
}

/**
 * El código es lo que el modelo más fácil copia mal: en una prueba pidió
 * «panqué de limón» (la transcripción lo dice así) y mandó p75, el panqué de
 * MANZANA del renglón de al lado. Por eso cada llamada trae también el nombre:
 *   · si el nombre corresponde al producto del código, el código vale;
 *   · si no, se busca el producto al que sí corresponde el nombre — si es uno
 *     solo (o uno se parece claramente más), ese es; si empatan, gana el más
 *     sencillo («capuchino» → el caliente, no el frappé); si ni así, se
 *     rechaza para que el modelo revise en vez de que la app adivine;
 *   · si el nombre no corresponde a NADA (lo escribió distinto: «capuchino»),
 *     se queda el código.
 */
export function verificarProducto(
  codigo: Product | undefined,
  dicho: string | null | undefined,
  cat: Catalogo,
): { product: Product | undefined } | { ambiguo: Product[] } {
  if (!dicho || !dicho.trim()) return { product: codigo }
  if (codigo && afinidad(dicho, codigo) > 0) return { product: codigo }
  const candidatos = cat.productos
    .map((p) => ({ p: p.product, a: afinidad(dicho, p.product) }))
    .filter((x) => x.a > 0)
    .sort((x, y) => y.a - x.a)
  if (candidatos.length === 0) return { product: codigo }
  const empatados = candidatos.filter((x) => x.a === candidatos[0].a)
  if (empatados.length === 1) return { product: empatados[0].p }
  // Empate («capuchino» a secas: el caliente y el frappé se llaman igual): gana
  // el MÁS SENCILLO, el que menos palabras trae de descripción. Quien quiere el
  // frappé dice «frappé de capuchino», y eso ya desempata por afinidad. Solo si
  // también empatan en sencillez se rechaza.
  const sencillez = (p: Product) => palabras(`${p.name} ${p.description ?? ""} ${p.subcategory ?? ""}`).size
  empatados.sort((x, y) => sencillez(x.p) - sencillez(y.p))
  if (sencillez(empatados[0].p) < sencillez(empatados[1].p)) return { product: empatados[0].p }
  return { ambiguo: empatados.filter((x) => sencillez(x.p) === sencillez(empatados[0].p)).map((x) => x.p) }
}

/** Lo que le faltó a un producto para poder entrar al carrito. */
export type Falta = { tipo: "tamano" } | { tipo: "extras"; grupo: ModifierGroup }

export type Resolucion =
  | { ok: true; product: Product; size?: SizeOption; modifiers: ModifierOption[]; cantidad: number; nota: string }
  | {
      ok: false
      mensaje: string
      preguntar?: string
      /** Solo cuando el producto existe pero le falta un dato: el modo ayudante lo deja pendiente. */
      falta?: Falta
      product?: Product
      size?: SizeOption
      cantidad?: number
    }

/**
 * Traduce lo que pidió el bot a un renglón válido, o dice qué falta. Aplica
 * las mismas reglas que la hoja de extras del POS: el tamaño es obligatorio
 * si hay más de uno, cada extra tiene que ser de un grupo del producto,
 * ningún grupo pasa de su máximo, la opción por omisión entra sola donde no
 * se eligió nada, y un grupo obligatorio sin respuesta detiene el alta —
 * nunca se adivina. Lo usan los dos modos: el cajero pregunta lo que falta,
 * el ayudante lo deja pendiente para que el cajero lo complete con un toque.
 */
export function resolver(args: ArgsAgregar, cat: Catalogo): Resolucion {
  const verificado = verificarProducto(cat.porCodigo.get(String(args.producto ?? "").trim().toLowerCase()), args.nombre, cat)
  if ("ambiguo" in verificado) {
    const cuales = verificado.ambiguo.map((p) => `${cat.productos.find((x) => x.product === p)?.codigo} ${p.name}${p.description ? ` (${p.description})` : ""}`).join("; ")
    return { ok: false, mensaje: `El código «${args.producto}» no es «${args.nombre}», y ese nombre puede ser: ${cuales}. Revisa cuál pidió.` }
  }
  const product = verificado.product
  if (!product) return { ok: false, mensaje: `No existe el código «${args.producto}». Usa solo los códigos del menú.` }

  const cantidad = args.cantidad == null ? 1 : Number(args.cantidad)
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAX) {
    return { ok: false, mensaje: `La cantidad tiene que ser un entero de 1 a ${CANTIDAD_MAX}.`, product }
  }

  const grupos = product.modifierGroups ?? []
  const elegidos: ModifierOption[] = []
  const vistos = new Set<string>()
  // Los códigos de GRUPO (g1) no son extras: el modelo a veces los manda junto
  // con la opción («extras: [g1, e1]», visto en una prueba) y antes eso
  // tumbaba el producto entero como «no encontré». Se ignoran.
  const codigosDeGrupo = new Set(cat.grupos.map((g) => g.codigo))
  for (const codigo of (args.extras ?? []).filter((c) => !codigosDeGrupo.has(String(c).trim().toLowerCase()))) {
    const opt = cat.extraPorCodigo.get(String(codigo).trim().toLowerCase())
    if (!opt) return { ok: false, mensaje: `No existe el extra «${codigo}». Usa solo los códigos del menú.`, product }
    if (!grupos.some((g) => g.options.some((o) => o.id === opt.id))) {
      return { ok: false, mensaje: `«${opt.name}» no aplica a ${product.name}.`, product }
    }
    if (vistos.has(opt.id)) continue
    vistos.add(opt.id)
    elegidos.push(opt)
  }
  for (const g of grupos) {
    const n = elegidos.filter((o) => g.options.some((x) => x.id === o.id)).length
    if (g.maxSelect != null && n > g.maxSelect) {
      return {
        ok: false,
        mensaje: `En «${g.name}» se elige máximo ${g.maxSelect}.`,
        preguntar: `¿Cuál${g.maxSelect > 1 ? "es" : ""} de esas quiere?`,
        product,
      }
    }
  }

  const tam = elegirTamano(product, args.tamano)
  const conocido = typeof tam === "object" && tam ? tam : undefined

  const nota = (args.nota ?? "").trim().replace(/\s+/g, " ").slice(0, 120)
  const extraEnNota = nota ? extraNombradoEn(nota, cat) : null
  if (extraEnNota) {
    const codigo = cat.codigoDeExtra.get(extraEnNota.id)
    if (grupos.some((g) => g.options.some((o) => o.id === extraEnNota.id))) {
      return {
        ok: false,
        mensaje: `«${extraEnNota.name}» es un extra del menú: mándalo en «extras» con su código (${codigo}), no como nota, para que se cobre.`,
        product,
      }
    }
    if (extraEnNota.priceDelta > 0) {
      const cual = `${product.name}${conocido ? ` ${conocido.label}` : ""}`
      return {
        ok: false,
        mensaje: `«${extraEnNota.name}» no está disponible para ${product.name} (es un extra con costo que este producto no tiene): no lo pongas como nota. Si el cliente acepta ${cual} sin eso, vuelve a llamar agregar_producto igual pero sin la nota.`,
        preguntar: `${extraEnNota.name} no está disponible para ${product.name}. ¿Te lo preparo sin eso?`,
        product,
      }
    }
  }

  if (tam === "falta") {
    return {
      ok: false,
      mensaje: `Falta el tamaño de ${product.name}.`,
      preguntar: `¿De qué tamaño? ${opcionesDeTamano(product)}`,
      falta: { tipo: "tamano" },
      product,
      cantidad,
    }
  }
  if (tam === "no-existe") {
    return {
      ok: false,
      mensaje: `${product.name} no viene en «${args.tamano}».`,
      preguntar: `Los tamaños son: ${opcionesDeTamano(product)}`,
      falta: { tipo: "tamano" },
      product,
      cantidad,
    }
  }

  const modifiers: ModifierOption[] = []
  for (const g of grupos) {
    const delGrupo = elegidos.filter((o) => g.options.some((x) => x.id === o.id))
    if (delGrupo.length === 0 && g.defaultOptionId) {
      const omision = g.options.find((o) => o.id === g.defaultOptionId)
      if (omision) delGrupo.push(omision)
    }
    if (delGrupo.length < g.minSelect) {
      const opciones = g.options.map((o) => `${o.name}${o.priceDelta ? ` (+${pesos(o.priceDelta)})` : ""}`).join(", ")
      const cuantos = g.minSelect > 1 ? `Elige ${g.minSelect}` : "Elige una"
      return {
        ok: false,
        mensaje: `Para ${product.name} falta «${g.name}».`,
        preguntar: `${g.name}: ${cuantos} de: ${opciones}`,
        falta: { tipo: "extras", grupo: g },
        product,
        size: conocido,
        cantidad,
      }
    }
    modifiers.push(...delGrupo)
  }

  return { ok: true, product, size: conocido, modifiers, cantidad, nota }
}

/** Agrega un producto al pedido del modo cajero, con las reglas de `resolver`. */
export function agregar(lines: CartLine[], args: ArgsAgregar, cat: Catalogo, nuevoId: () => string): { lines: CartLine[]; respuesta: Respuesta } {
  const r = resolver(args, cat)
  if (!r.ok) {
    return { lines, respuesta: { ok: false, mensaje: r.mensaje, ...(r.preguntar ? { preguntar: r.preguntar } : {}), pedido: resumir(lines) } }
  }
  const { product, size, modifiers, cantidad, nota } = r
  let nuevas: CartLine[]
  if (nota) {
    // Con nota no se fusiona: «uno sin azúcar» es otro renglón, como en el POS.
    nuevas = [
      ...lines.map((l) => ({ ...l, isNew: false })),
      { lineId: nuevoId(), product, size, modifiers, quantity: cantidad, notes: nota, isNew: true },
    ]
  } else {
    nuevas = lines
    for (let i = 0; i < cantidad; i++) nuevas = addUnit(nuevas, product, size, modifiers, nuevoId)
  }

  const linea: CartLine = { lineId: "", product, size, modifiers, quantity: cantidad, notes: nota }
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
/** El renglón al que se refiere el bot: por número o por código de producto. */
function encontrarRenglon(lines: CartLine[], args: { renglon?: number | null; producto?: string | null }, cat?: Catalogo): number | string {
  if (args.renglon != null) {
    const i = Number(args.renglon) - 1
    return Number.isInteger(i) && lines[i] ? i : `No hay renglón ${args.renglon}. Los renglones están en «pedido.renglones».`
  }
  if (args.producto) {
    const product = cat?.porCodigo.get(String(args.producto).trim().toLowerCase())
    if (!product) return `No existe el código «${args.producto}».`
    const indices = lines.flatMap((l, j) => (l.product.id === product.id ? [j] : []))
    if (indices.length === 0) return `No hay ${product.name} en el pedido.`
    if (indices.length > 1) return `Hay ${indices.length} renglones de ${product.name}: di cuál con su número de renglón.`
    return indices[0]
  }
  return "Di cuál: el número de renglón o el código del producto."
}

export interface ArgsCambiarCantidad {
  renglon?: number | null
  producto?: string | null
  /** La cantidad FINAL de ese renglón; 0 lo quita. */
  cantidad: number
}

/**
 * Deja un renglón con la cantidad que dijo el cliente. Existe porque «mejor
 * nada más un capuchino» obligaba al modelo a calcular «quitar 1 de 2», y en
 * las pruebas con las instrucciones breves a veces contestaba «va, lo ajusto»
 * sin hacer nada: se guardaron dos. Con esto solo tiene que repetir el número.
 */
export function cambiarCantidad(lines: CartLine[], args: ArgsCambiarCantidad, cat?: Catalogo): { lines: CartLine[]; respuesta: Respuesta } {
  const falla = (mensaje: string) => ({ lines, respuesta: { ok: false, mensaje, pedido: resumir(lines) } })
  const i = encontrarRenglon(lines, args, cat)
  if (typeof i === "string") return falla(i)
  const n = Number(args.cantidad)
  if (!Number.isInteger(n) || n < 0 || n > CANTIDAD_MAX) return falla(`La cantidad tiene que ser un entero de 0 a ${CANTIDAD_MAX}.`)
  const l = lines[i]
  const nuevas = n === 0 ? lines.filter((_, j) => j !== i) : lines.map((x, j) => (j === i ? { ...x, quantity: n } : x))
  const pedido = resumir(nuevas)
  return {
    lines: nuevas,
    respuesta: {
      ok: true,
      mensaje: n === 0 ? `Quitado: ${getLineLabel(l)}. Total del pedido: ${pesos(pedido.total)}.` : `Ahora: ${n} × ${getLineLabel(l)}. Total del pedido: ${pesos(pedido.total)}.`,
      pedido,
    },
  }
}

export function quitar(lines: CartLine[], args: ArgsQuitar, cat?: Catalogo): { lines: CartLine[]; respuesta: Respuesta } {
  const falla = (mensaje: string) => ({ lines, respuesta: { ok: false, mensaje, pedido: resumir(lines) } })
  const i = encontrarRenglon(lines, args, cat)
  if (typeof i === "string") return falla(i)
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

/**
 * Los dos modos del pedido por voz. Mismo motor, mismas reglas de dinero;
 * cambia quién habla y a dónde va el pedido.
 *   · cajero   — el CLIENTE habla con el bot en un aparato del mostrador; el
 *                bot pregunta lo que falta, lee el total y guarda una cuenta.
 *   · ayudante — el CAJERO dicta en su propio POS; el bot no habla ni
 *                pregunta, y lo dictado entra directo al carrito.
 */
export type ModoVoz = "cajero" | "ayudante"

function herramientaAgregar(description: string) {
  return {
    type: "function",
    name: "agregar_producto",
    description,
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Código del producto en el menú, p. ej. p12." },
        nombre: { type: "string", description: "El nombre de ese producto tal como aparece en el menú, para verificar que el código es el correcto." },
        tamano: {
          type: "string",
          description:
            "Uno de los tamaños que el menú lista para ese producto (p. ej. Grande). Si la lista incluye «Frio» y lo piden frío, el tamaño es «Frio». Omitir si el producto tiene un solo precio o si no lo dijeron.",
        },
        cantidad: { type: "integer", minimum: 1, maximum: CANTIDAD_MAX },
        extras: { type: "array", items: { type: "string" }, description: "Códigos de extras (e1, e2…) que pidieron." },
        nota: {
          type: "string",
          description:
            "Indicación que NO es un extra del menú, p. ej. «sin azúcar», «tibio». Nunca pongas aquí un extra del menú (leches, jarabes, shots…): esos van en «extras» y tienen precio.",
        },
      },
      required: ["producto", "nombre", "cantidad"],
    },
  } as const
}

/** Herramientas del modo cajero (formato Realtime de OpenAI). */
export const HERRAMIENTAS_VOZ = [
  herramientaAgregar(
    "Agrega un producto al pedido. Úsala en cuanto el cliente pida algo; si la respuesta dice que falta un dato, pregúntaselo al cliente con el texto de «preguntar» y vuelve a llamarla completa.",
  ),
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
    name: "cambiar_cantidad",
    description:
      "Deja un producto del pedido con la cantidad FINAL que dijo el cliente («mejor nada más uno» → 1; «que sean tres» → 3; 0 lo quita). Úsala SIEMPRE que el cliente cambie cuántos quiere, antes de contestarle.",
    parameters: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Código del producto, p. ej. p5." },
        renglon: { type: "integer", minimum: 1, description: "Número de renglón, solo si hay dos renglones del mismo producto." },
        cantidad: { type: "integer", minimum: 0, maximum: CANTIDAD_MAX, description: "Cuántos quiere en total." },
      },
      required: ["cantidad"],
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

/**
 * Cómo se describe un renglón del carrito al quitarlo o cambiarlo: sin números
 * de renglón (el cajero no los ve), con producto, tamaño y extras.
 */
function propiedadesRenglon(cantidad: string) {
  return {
    producto: { type: "string", description: "Código del producto, p. ej. p5." },
    nombre: { type: "string", description: "El nombre de ese producto en el menú, para verificar el código." },
    tamano: { type: "string", description: "El tamaño, si lo dijo." },
    extras: { type: "array", items: { type: "string" }, description: "Códigos de extras que el renglón SÍ tiene, si los dijo («el deslactosado»)." },
    sin_extras: { type: "array", items: { type: "string" }, description: "Códigos de extras que el renglón NO tiene («el que no es deslactosado»)." },
    cantidad: { type: "integer", minimum: 0, maximum: CANTIDAD_MAX, description: cantidad },
  } as const
}

/**
 * Herramientas del modo ayudante. La primera versión solo agregaba («el carrito
 * está a la vista, que corrija con el dedo»): el usuario lo probó, le dictó
 * «elimina el capuchino que no es deslactosado», y el bot, sin herramienta, lo
 * metió como «No encontré: … no es posible modificar…». Quitar y cambiar
 * cantidad por voz es parte de dictar.
 *
 * Vaciar el carrito entero al principio NO estaba, para que una frase mal oída
 * no borrara un pedido completo. El usuario lo pidió («elimina todo lo del
 * carrito» no hacía nada) y con Deshacer el riesgo ya es un toque: entra, pero
 * solo con una orden clara, quitando renglón por renglón como los toques — sin
 * tocar la cuenta abierta, el descuento ni el método de pago —, y siempre con
 * Deshacer que lo regresa todo.
 */
export const HERRAMIENTAS_AYUDANTE = [
  herramientaAgregar(
    "Agrega al carrito un producto que dictó el cajero. Llámala una vez por cada producto, todas en la misma respuesta. Si no dijo el tamaño o un extra obligatorio, llámala igual sin ese dato: el cajero lo completa en pantalla.",
  ),
  {
    type: "function",
    name: "quitar_producto",
    description:
      "Quita del carrito algo que el cajero pide quitar («quita el mocha», «elimina el capuchino que no es deslactosado», «quita uno de los capuchinos»). Describe el renglón con el producto y, si lo dijo, el tamaño y los extras que tiene o que NO tiene.",
    parameters: { type: "object", properties: propiedadesRenglon("Cuántas piezas quitar; sin dato se quita UNA. Para quitar todas, usa cambiar_cantidad con 0."), required: ["producto", "nombre"] },
  },
  {
    type: "function",
    name: "cambiar_cantidad",
    description: "Deja un renglón del carrito con la cantidad FINAL que dice el cajero («que sean tres capuchinos», «nada más un mocha»). Con 0 quita el renglón entero («quita los capuchinos», «ya no van los mokas»).",
    parameters: { type: "object", properties: propiedadesRenglon("La cantidad final de ese renglón."), required: ["producto", "nombre", "cantidad"] },
  },
  {
    type: "function",
    name: "vaciar_carrito",
    description:
      "Quita TODO lo del carrito. Solo cuando el cajero lo pide claramente para el carrito entero («vacía el carrito», «elimina todo lo del carrito», «borra todo»). Si nombra productos, usa quitar_producto o cambiar_cantidad.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "no_entendi",
    description: "Avisa al cajero de un PRODUCTO que dictó y no está en el menú. No adivines uno parecido. No la uses para nada más.",
    parameters: {
      type: "object",
      properties: { texto: { type: "string", description: "Solo el producto que oíste, en máximo 6 palabras, sin explicaciones." } },
      required: ["texto"],
    },
  },
] as const

/**
 * Modo cajero. El usuario lo probó en su teléfono y su queja fue una: «habla
 * demasiado». Por eso las instrucciones fijan un tope de palabras y dan
 * frases modelo; describir el tono («breve, cálido») no bastaba — el modelo
 * igual decía «Perfecto, déjame revisar tu pedido y te lo leo rápidamente».
 */
export function instruccionesVoz(cafe: string, menu: string): string {
  return `Tomas pedidos en el mostrador de ${cafe}, una cafetería en México. Hablas español mexicano.

REGLA PRINCIPAL: habla lo mínimo. Cada turno es UNA frase corta, de preferencia menos de 10 palabras. Sin muletillas («perfecto», «claro que sí», «con gusto»), sin repetir lo que dijo el cliente, sin explicar lo que haces y sin anunciar lo que vas a hacer. Una pregunta a la vez.

Así suenas (copia el estilo, no las palabras exactas):
- Saludo: «Hola, ¿qué vas a llevar?»
- Después de agregar: «Va. ¿Algo más?»
- Falta un dato: «¿Chico o grande?»
- No está en el menú: «No tenemos eso. ¿Te doy un frappé de mango?»
- Al final: «Dos lattes grandes y un panqué, 92 pesos. ¿Está bien y a nombre de quién?»
- Despedida: «Listo, Juan. Pasa a pagar a caja.»

Reglas del pedido:
- Cada vez que el cliente pida algo, llama a agregar_producto con los códigos del menú, sin avisar antes.
- Los tamaños son los que lista el menú. En algunos productos «Frio» es un tamaño: si lo pide frío, ya dijo el tamaño.
- Si una herramienta responde con «preguntar», haz esa pregunta con tus palabras, corta, y vuelve a llamarla con el dato.
- Nunca inventes productos, tamaños, extras ni precios. Los importes salen SIEMPRE de las herramientas.
- Cuando el cliente cambie el pedido, PRIMERO llama a la herramienta y DESPUÉS contesta: si cambia cuántos quiere («mejor nada más uno»), cambiar_cantidad con la cantidad final; si quita un producto, quitar_producto; si lo cambia por otro, quitar_producto y agregar_producto. Nunca digas que cambiaste algo si la herramienta no respondió ok: decirlo no cambia el pedido.
- Al leer el pedido, di EXACTAMENTE las cantidades y productos que devolvió ver_pedido, aunque no coincidan con lo que crees que pidió; si no coinciden, corrígelo con las herramientas y vuelve a leerlo.
- Cuando diga que es todo: llama a ver_pedido y di el pedido y el total en una sola frase, preguntando si está bien y a nombre de quién (si no lo sabes). Espera su respuesta; no confirmes en la misma respuesta en que preguntas.
- Cuando diga que sí y tengas su nombre, llama a confirmar_pedido. Si se niega, haz lo que indique.
- Después de confirmar, despídete en una frase y dile que pague en caja.
- No hablas de formas de pago. A lo que no sea el pedido, contesta en pocas palabras y vuelve al pedido.
- Si no entendiste, pide que lo repita; no adivines.

Menú (código, nombre, precios, grupos de extras que aplican):
${menu}`
}

/**
 * Modo ayudante. El cajero ya sabe lo que quiere y tiene el carrito enfrente:
 * cualquier palabra del bot le estorba. No conversa — ni siquiera tiene voz
 * (la sesión es solo de texto) —, solo convierte lo dictado en llamadas.
 */
export function instruccionesAyudante(cafe: string, menu: string): string {
  return `Eres el ayudante del cajero de ${cafe}, una cafetería en México. El cajero te dicta pedidos en voz alta mientras atiende; tú solo los capturas.

- Por cada producto que diga, llama a agregar_producto con los códigos del menú. Varios productos son varias llamadas, todas en la misma respuesta. «Dos capuchinos» es UNA llamada con cantidad 2.
- Si pide quitar algo («quita», «elimina», «ya no»), llama a quitar_producto describiendo el renglón: producto, y si lo dijo, tamaño y extras que tiene (extras) o que NO tiene (sin_extras). «Quita uno de los capuchinos» es cantidad 1; sin cantidad se quita uno.
- Si quita TODOS los de algo («quita los capuchinos», «ya no van los mokas»), llama a cambiar_cantidad con cantidad 0.
- Si pide vaciar el carrito entero («vacía el carrito», «elimina todo lo del carrito», «borra todo»), llama a vaciar_carrito.
- Si cambia cuántos quiere («que sean tres», «nada más uno»), llama a cambiar_cantidad con la cantidad final.
- No converses: no saludes, no confirmes, no preguntes, no respondas con texto. Solo llamadas a herramientas.
- Si no dijo el tamaño o un extra obligatorio, llama igual a agregar_producto sin ese dato: el cajero lo completa en pantalla.
- Si dicta un producto que no está en el menú, llama a no_entendi solo con el nombre de ese producto. No adivines uno parecido y no la uses para explicar nada.
- Si lo que oyes no es un pedido (plática, ruido, alguien más hablando), no hagas nada.
- Los tamaños son los que lista el menú. En algunos productos «Frio» es un tamaño.
- No pongas en «nota» extras del menú: van en «extras».

Menú (código, nombre, precios, grupos de extras que aplican):
${menu}`
}

/* ------------------------------------------------------------------ */
/*  Modo ayudante: lo dictado va al carrito del POS                    */
/* ------------------------------------------------------------------ */

/** Lo que el cajero dictó sin un dato: queda a la vista para completarlo con un toque. */
export interface PendienteDictado {
  id: string
  args: ArgsAgregar
  product: Product
  cantidad: number
  falta: Falta
  size?: SizeOption
}

/** «2 × Latte (Grande) con Leche de avena — sin azúcar», para la tarjeta del dictado. */
export function describirResuelto(r: Extract<Resolucion, { ok: true }>): string {
  return describirRenglon({ lineId: "", product: r.product, size: r.size, modifiers: r.modifiers, quantity: r.cantidad, notes: r.nota })
}

/**
 * El dictado se resuelve con el menú que mandó el servidor al abrir la sesión,
 * pero el carrito tiene que recibir los MISMOS objetos que la rejilla del POS:
 * así una línea dictada y una tocada del mismo latte se juntan en un renglón.
 * null si el POS ya no tiene ese producto, tamaño o extra (su menú quedó viejo).
 */
export function enMenuDelPos(
  r: Extract<Resolucion, { ok: true }>,
  productosPos: Product[],
): { product: Product; size?: SizeOption; modifiers: ModifierOption[] } | null {
  const product = productosPos.find((p) => p.id === r.product.id)
  if (!product) return null
  let size: SizeOption | undefined
  if (r.size) {
    size = product.sizes?.find((s) => s.variantId === r.size!.variantId)
    if (!size) return null
  }
  const opciones = new Map<string, ModifierOption>()
  for (const g of product.modifierGroups ?? []) for (const o of g.options) opciones.set(o.id, o)
  const modifiers: ModifierOption[] = []
  for (const m of r.modifiers) {
    const o = opciones.get(m.id)
    if (!o) return null
    modifiers.push(o)
  }
  return { product, size, modifiers }
}

/** Cómo describe el cajero un renglón del carrito para quitarlo o cambiarlo. */
export interface ArgsRenglonDictado {
  producto: string
  nombre?: string | null
  tamano?: string | null
  /** El renglón TIENE estos extras («el deslactosado»). */
  extras?: string[] | null
  /** El renglón NO tiene estos extras («el que no es deslactosado»). */
  sin_extras?: string[] | null
  /** quitar: cuántas piezas (sin dato, todas); cambiar: la cantidad final. */
  cantidad?: number | null
}

/**
 * Encuentra en el carrito del POS el renglón que describe el cajero: producto
 * (verificado con su nombre), tamaño, y con o sin ciertos extras. Así «quita
 * el capuchino grande que no es deslactosado» se resuelve sin números de
 * renglón, que el cajero no ve ni tendría por qué decir. Si quedan varios
 * («quita uno de los capuchinos»), toca el ÚLTIMO agregado — lo que una
 * persona entendería — y lo dice, para que el cajero vea cuál fue.
 */
export function buscarEnCarrito(
  lines: CartLine[],
  args: ArgsRenglonDictado,
  cat: Catalogo,
): { ok: true; indice: number; indices: number[]; varios: boolean } | { ok: false; mensaje: string } {
  const v = verificarProducto(cat.porCodigo.get(String(args.producto ?? "").trim().toLowerCase()), args.nombre, cat)
  if ("ambiguo" in v) return { ok: false, mensaje: `No supe cuál de los ${args.nombre ?? "productos"}.` }
  const product = v.product
  if (!product) return { ok: false, mensaje: `No existe el código «${args.producto}».` }

  const ids = (codigos: string[] | null | undefined) =>
    (codigos ?? []).map((c) => cat.extraPorCodigo.get(String(c).trim().toLowerCase())?.id).filter((x): x is string => !!x)
  const con = ids(args.extras)
  const sin = ids(args.sin_extras)

  let candidatos = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.product.id === product.id)
  if (candidatos.length === 0) return { ok: false, mensaje: `No hay ${product.name} en el carrito.` }
  if (args.tamano && args.tamano.trim()) {
    const t = elegirTamano(product, args.tamano)
    if (typeof t === "object" && t) candidatos = candidatos.filter(({ l }) => l.size?.variantId === t.variantId)
  }
  candidatos = candidatos.filter(
    ({ l }) => con.every((id) => l.modifiers.some((m) => m.id === id)) && sin.every((id) => !l.modifiers.some((m) => m.id === id)),
  )
  if (candidatos.length === 0) return { ok: false, mensaje: `No hay ${product.name} así en el carrito.` }
  return { ok: true, indice: candidatos[candidatos.length - 1].i, indices: candidatos.map((c) => c.i), varios: candidatos.length > 1 }
}
