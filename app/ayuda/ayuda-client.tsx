"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  BookOpen,
  ChefHat,
  Coffee,
  Keyboard,
  Lock,
  Percent,
  Printer,
  Receipt,
  Search,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Store,
  Unlock,
  Users,
  Wallet,
  X,
} from "lucide-react"
import { POS_SHORTCUTS } from "@/app/pos/shortcuts"
import { DemoDiferencia, DemoEfectivo, DemoPOS, DemoPropina, DemoQR, TicketImpreso } from "./demos"

/**
 * Guía de uso. La misma página sirve en pantalla (con navegación fija,
 * buscador y demos para practicar) y en papel (Ctrl+P: se ocultan la
 * navegación y las demos; el texto se basta solo).
 */

interface Props {
  /** Ticket de muestra, generado con la MISMA función que imprime el POS. */
  ticket: string[]
  /** Corte de muestra, ídem. */
  corte: string[]
}

type Grupo = "cajero" | "admin"

const GRUPOS: Record<Grupo, { titulo: string; chip: string }> = {
  cajero: { titulo: "Para el cajero", chip: "bg-amber-100 text-amber-700" },
  admin: { titulo: "Para el dueño o administrador", chip: "bg-indigo-100 text-indigo-700" },
}

interface SeccionDef {
  id: string
  grupo: Grupo
  icon: React.ComponentType<{ className?: string }>
  titulo: string
  /** Sinónimos para el buscador (además del título). */
  palabras: string
  /** Pantalla a la que se refiere esta sección. */
  href?: string
  nodo: React.ReactNode
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white print:border print:border-stone-400 print:bg-white print:text-stone-800">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-stone-800">{title}</p>
        <div className="text-sm leading-relaxed text-stone-600">{children}</div>
      </div>
    </li>
  )
}

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-stone-300 bg-stone-50 px-1.5 font-mono text-xs font-semibold text-stone-700">
      {children}
    </kbd>
  )
}

export function AyudaClient({ ticket, corte }: Props) {
  const [busqueda, setBusqueda] = useState("")
  const [activo, setActivo] = useState("entrar")

  const SECCIONES: SeccionDef[] = [
    {
      id: "entrar",
      grupo: "cajero",
      icon: Users,
      titulo: "Entrar al sistema",
      palabras: "login sesion contrasena olvide usuario cafe correo selector cuenta",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            <strong>Cajeros</strong>: escribe tu <strong>usuario</strong>, el <strong>café</strong> (el identificador
            corto de tu cafetería, p. ej. <em>el-cafecito</em>) y tu contraseña. El café se recuerda en ese dispositivo.
          </li>
          <li>
            <strong>Dueños y administradores</strong> pueden entrar con su <strong>correo</strong> y contraseña; el
            campo Café se oculta solo.
          </li>
          <li>
            Si perteneces a varias cafeterías, arriba verás un <strong>selector</strong> para cambiar de una a otra. Tu
            contraseña se cambia en <strong>Mi cuenta</strong>.
          </li>
          <li>
            ¿Se te olvidó la contraseña? Si entras con correo, usa <strong>«¿Olvidaste tu contraseña?»</strong> en el
            login y te llega un enlace. Si eres cajero (usuario + café), pídele a tu administrador que la restablezca
            desde <strong>Equipo</strong>.
          </li>
        </ul>
      ),
    },
    {
      id: "cajero",
      grupo: "cajero",
      icon: Coffee,
      titulo: "Abrir el turno y vender",
      palabras: "caja fondo abrir pedido carrito tamanos vendidos buscar nota comanda whatsapp compartir folio",
      href: "/pos",
      nodo: (
        <>
          <ol className="space-y-3">
            <Step n={1} title="Abre la caja">
              Al entrar verás el botón rojo <strong>Caja cerrada</strong>. Tócalo, escribe el{" "}
              <strong>fondo inicial</strong> (el efectivo con el que empiezas) y confirma. Sin caja abierta no se puede
              cobrar.
            </Step>
            <Step n={2} title="Arma el pedido">
              Toca un producto para agregarlo; si tiene tamaños, elige uno. El icono{" "}
              <SlidersHorizontal className="inline h-3.5 w-3.5 align-text-bottom" /> abre las opciones (tipo de leche,
              extras). Puedes buscar por nombre, y en la pestaña <strong>Todos</strong> aparece{" "}
              <strong>Más vendidos</strong>: lo del último mes, a un toque.
            </Step>
          </ol>
          <DemoPOS />
          <ol className="mt-4 space-y-3">
            <Step n={3} title="Ajusta cantidades y notas">
              Con <strong>+ / −</strong> cambias la cantidad. El icono de nota en cada línea permite instrucciones de
              ese artículo («sin azúcar»). La <strong>nota del ticket</strong> (mesa, nombre, para llevar) va abajo,
              sobre los métodos de pago.
            </Step>
            <Step n={4} title="Elige método de pago y cobra">
              Efectivo, Transferencia o Tarjeta. Si el cliente deja <strong>propina</strong>, tócala antes de cobrar.
              Pulsa <strong>Cobrar</strong>: aparece el ticket registrado con su <strong>folio</strong>; desde ahí
              imprimes el <strong>Ticket</strong> para el cliente y la <strong>Comanda</strong> (sin precios) para quien
              prepara. <strong>Compartir ticket</strong> lo manda por WhatsApp — útil si no hay impresora.
            </Step>
            <Step n={5} title="Si te equivocaste antes de cobrar">
              Quita la línea con el bote de basura o usa <strong>Vaciar</strong>. Si recargas la página por accidente,
              la venta en curso se restaura sola.
            </Step>
          </ol>
          <TicketImpreso lineas={ticket} titulo="Un ticket de este sistema, tal cual sale de la impresora" />
        </>
      ),
    },
    {
      id: "efectivo",
      grupo: "cajero",
      icon: Wallet,
      titulo: "Efectivo, propinas y descuentos",
      palabras: "cambio recibido teclado billete propina porcentaje descuento motivo",
      href: "/pos",
      nodo: (
        <>
          <ul className="space-y-2 text-sm text-stone-600">
            <li>
              Con <strong>Efectivo</strong> aparece el campo <strong>Recibido</strong>: escribe lo que te dio el cliente
              con el teclado en pantalla (o usa los botones de billetes) y el sistema calcula el{" "}
              <strong>cambio</strong>. Si no alcanza, no deja cobrar. <strong>C</strong> borra lo escrito.
            </li>
          </ul>
          <DemoEfectivo />
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Propina</strong>: se cobra <strong>encima</strong> del total. Los porcentajes se calculan sobre el
              total ya con descuento, o escribe el monto con <em>Otro</em>. La propina{" "}
              <strong>no cuenta como venta</strong>: no entra en tus ingresos ni en el ticket promedio, se reporta
              aparte. Se elige en cada venta y no se queda guardada para la siguiente.
            </li>
          </ul>
          <DemoPropina />
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Descuento</strong> (<Percent className="inline h-3.5 w-3.5 align-text-bottom" /> junto al total):
              porcentaje o monto fijo, y <strong>siempre pide un motivo</strong>; queda registrado en el ticket y en los
              reportes.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "cancelar",
      grupo: "cajero",
      icon: Ban,
      titulo: "Cancelar una venta o reimprimir",
      palabras: "tickets reimprimir cancelacion motivo error equivocacion",
      href: "/pos",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Botón <strong>Tickets</strong> (arriba a la derecha): lista las ventas del día. Cada una tiene{" "}
            <Printer className="inline h-3.5 w-3.5 align-text-bottom" /> reimprimir ticket,{" "}
            <ChefHat className="inline h-3.5 w-3.5 align-text-bottom" /> comanda y{" "}
            <Ban className="inline h-3.5 w-3.5 align-text-bottom" /> cancelar.
          </li>
          <li>
            Cancelar <strong>pide motivo</strong> y deja la venta marcada como cancelada (no se borra). Deja de contar
            en el total del día y en el corte. Un cajero solo puede cancelar sus propias ventas{" "}
            <strong>mientras la caja siga abierta</strong>; después lo hace un administrador desde el panel.
          </li>
        </ul>
      ),
    },
    {
      id: "corte",
      grupo: "cajero",
      icon: Lock,
      titulo: "Cerrar el turno (corte de caja)",
      palabras: "corte cierre esperado contado diferencia cuadre sobrante faltante entrada salida movimiento propinas",
      href: "/pos",
      nodo: (
        <>
          <ol className="space-y-3">
            <Step n={1} title="Toca el botón verde «Caja abierta»">
              Verás las ventas del turno por método de pago y el <strong>efectivo esperado</strong> = fondo inicial +
              ventas en efectivo + <strong>propinas cobradas en efectivo</strong> + entradas − salidas (las canceladas
              no cuentan).
            </Step>
            <Step n={2} title="Registra entradas y salidas de efectivo (si las hubo)">
              <strong>Entrada</strong> (metiste efectivo, ej. cambio en monedas) o <strong>Salida</strong> (sacaste, ej.
              compra de leche), con monto y motivo. Hazlo en el momento: así el corte cuadra y queda quién y cuándo. Un
              movimiento no se borra; si te equivocas, registra el contrario.
            </Step>
            <Step n={3} title="Cuenta el efectivo y escríbelo">
              El sistema marca la diferencia al momento: <em>cuadró</em>, <em>sobrante</em> o <em>faltante</em>. Puedes
              agregar una nota de cierre.
            </Step>
            <Step n={4} title="Cerrar e imprimir">
              Imprime el corte para tu archivo. Quedan guardados en el panel (Cortes de caja) y se pueden reimprimir.
            </Step>
          </ol>
          <DemoDiferencia />
          <TicketImpreso lineas={corte} titulo="Un corte de este sistema, tal cual se imprime" />
        </>
      ),
    },
    {
      id: "movil",
      grupo: "cajero",
      icon: Smartphone,
      titulo: "En tablet o celular",
      palabras: "instalar app pantalla inicio android ipad iphone barra inferior",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            En pantallas chicas el carrito vive en la <strong>barra inferior</strong>: muestra artículos y total; tócala
            para abrirlo y cobrar. Las acciones (Tickets, Caja, Guía, Cerrar sesión) están en el menú <strong>⋮</strong>{" "}
            arriba a la derecha.
          </li>
          <li>
            <strong>Instalar como app</strong>: en Chrome/Android o Safari/iPad abre el sitio y elige{" "}
            <em>Agregar a pantalla de inicio</em>. Se abre a pantalla completa con su propio ícono. Sigue necesitando
            internet.
          </li>
        </ul>
      ),
    },
    {
      id: "atajos",
      grupo: "cajero",
      icon: Keyboard,
      titulo: "Atajos de teclado",
      palabras: "teclado fisico rapido shortcuts f2 f4 enter",
      nodo: (
        <>
          <p className="mb-3 text-sm text-stone-600">
            Con teclado físico, los atajos con letras funcionan cuando no estás escribiendo en un campo. En el POS, la
            tecla <Tecla>?</Tecla> muestra esta lista.
          </p>
          <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {POS_SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <p className="text-stone-700">{s.label}</p>
                  {s.hint && <p className="text-xs text-stone-400">{s.hint}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {s.keys.map((k, j) => (
                    <Tecla key={j}>{k}</Tecla>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Flujo rápido: <Tecla>/</Tecla> escribe «lat» → <Tecla>Enter</Tecla> → <Tecla>2</Tecla> (Grande) →{" "}
            <Tecla>F2</Tecla> cobrar.
          </p>
        </>
      ),
    },
    {
      id: "admin-menu",
      grupo: "admin",
      icon: Coffee,
      titulo: "Menú: categorías, productos y precios",
      palabras: "categorias colores slug variantes tamanos costo margen precios lote orden desactivar",
      href: "/admin/productos",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            <strong>Categorías</strong>: son las pestañas del POS. Puedes darle un <strong>color</strong> a cada una:
            pinta su pestaña y una franja en sus productos, para ubicarlos más rápido (arriba lo viste en la demo del
            POS).
          </li>
          <li>
            <strong>Productos</strong>: cada uno tiene una o más <strong>variantes</strong> (tamaños con precio). Un
            producto con una sola variante llamada <code>Único</code> se vende con un toque. Desde el editor puedes
            ocultar del POS un producto o una variante (<em>Desactivar</em>).
          </li>
          <li>
            <strong>Orden</strong>: en Categorías, las flechas ↑↓ acomodan las pestañas del POS; en Productos, el botón{" "}
            <em>Ordenar</em> de cada categoría acomoda sus productos.
          </li>
          <li>
            <strong>Costo</strong>: junto al precio captura cuánto te cuesta prepararla (leche, café, vaso). Con eso,{" "}
            <strong>Análisis</strong> te dice cuánto <em>ganas</em>, no solo cuánto vendes. El costo se guarda con cada
            venta: corregirlo hoy no altera los reportes de días pasados.
          </li>
          <li>
            <strong>Precios en lote</strong>: sube o baja los precios de una categoría o de todo el menú de un jalón,
            por porcentaje o por monto, con redondeo al peso o a los 50 centavos y vista previa antes de aplicar.
          </li>
          <li>
            Un producto o variante que <strong>ya tiene ventas no se puede borrar</strong> (para no perder el
            historial); desactívalo.
          </li>
        </ul>
      ),
    },
    {
      id: "admin-modificadores",
      grupo: "admin",
      icon: SlidersHorizontal,
      titulo: "Modificadores (opciones al vender)",
      palabras: "leche extras opciones grupos minimo maximo precio adicional",
      href: "/admin/modificadores",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Creas grupos (ej. «Tipo de leche») con sus opciones y precio extra (ej. «Leche de avena +$12»).
            Mínimo/máximo controlan cuántas se pueden elegir; máximo 1 = elige solo una.
          </li>
          <li>
            Luego, en el editor de cada <strong>producto</strong>, marcas qué grupos aplican. En el POS aparecen al
            vender ese producto y el precio se calcula solo.
          </li>
        </ul>
      ),
    },
    {
      id: "admin-analisis",
      grupo: "admin",
      icon: Receipt,
      titulo: "Análisis (comparativos y patrones)",
      palabras: "margen costo comparativo semana mapa calor horas cajero propinas descuentos cancelaciones combos sin movimiento",
      href: "/admin/analisis",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            <strong>Comparativo</strong>: cada indicador del periodo se compara con el periodo anterior de la misma
            duración (p. ej. últimos 30 días vs. los 30 previos), con el % de cambio.
          </li>
          <li>
            <strong>Costos y margen</strong>: cuánto quedó después de insumos, qué productos dejan más y cuáles se
            venden con margen bajo. Si te faltan costos por capturar, te lo dice en vez de inventar un 100 %.
          </li>
          <li>
            <strong>Día de la semana</strong> y <strong>mapa de calor día × hora</strong>: cuándo vendes más, para
            poner personal o lanzar promociones en horas muertas.
          </li>
          <li>
            <strong>Por cajero</strong>: ventas, ticket promedio, propinas, descuentos y cancelaciones de cada quien,
            con motivos y quién los aplicó.
          </li>
          <li>
            <strong>Productos sin movimiento</strong>, <strong>modificadores más pedidos</strong> y{" "}
            <strong>parejas que se compran juntas</strong> (ideas de combos).
          </li>
        </ul>
      ),
    },
    {
      id: "admin-negocio",
      grupo: "admin",
      icon: Store,
      titulo: "Datos del negocio, metas y menú con QR",
      palabras: "nombre zona horaria ticket encabezado pie metas qr menu publico resumen semanal correo lunes seguridad bloqueo",
      href: "/admin/negocio",
      nodo: (
        <>
          <ul className="space-y-2 text-sm text-stone-600">
            <li>
              <strong>Metas de venta</strong>: define una meta diaria y/o mensual; el Dashboard muestra el avance con
              una barra, y <strong>¿Cómo va el día?</strong> compara hoy contra ayer y contra el mismo día de la semana
              pasada, a la misma hora.
            </li>
            <li>
              <strong>Menú público con QR</strong>: activa «Publicar el menú» y el sistema te da el código QR para
              imprimir. Quien lo escanee ve tu carta en su celular, sin instalar nada; se actualiza sola al cambiar
              precios, así que el QR impreso nunca se reemplaza. No muestra costos ni nada interno.
            </li>
          </ul>
          <DemoQR />
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Resumen semanal por correo</strong>: cada lunes por la mañana llega a dueños y administradores el
              resumen de la semana anterior (ventas, propinas, más vendidos, por cajero). Se puede apagar ahí mismo.
            </li>
            <li>
              También defines nombre, <strong>zona horaria</strong> (marca el «día de operación» de reportes y cortes),
              dirección, teléfono y los textos del <strong>ticket</strong>, con vista previa al editar. El identificador
              corto del café (para el login de cajeros) se muestra ahí y no se puede cambiar.
            </li>
            <li>
              <strong>Seguridad de caja</strong>: activa el bloqueo por inactividad y el POS se bloquea solo; se
              desbloquea con el PIN de quien está en caja.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "admin-equipo",
      grupo: "admin",
      icon: Users,
      titulo: "Equipo y accesos",
      palabras: "cajero usuario correo contrasena restablecer pin roles dueno administrador desactivar actividad bitacora",
      href: "/admin/equipo",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            <strong>Usuario de café</strong>: creas una cuenta con usuario y contraseña (entra con usuario + café),
            ideal para cajeros — no necesita correo. <strong>Por correo</strong>: das acceso con su correo; si no tiene
            cuenta, se crea con una contraseña temporal que verás una sola vez.
          </li>
          <li>
            Roles: <em>Cajero</em> (solo POS), <em>Administrador</em> (POS + panel) y <em>Dueño</em> (todo; solo un
            dueño nombra o quita dueños, y siempre debe quedar al menos uno).
          </li>
          <li>
            <strong>¿Le quedó mal el correo a alguien?</strong> Toca a esa persona y corrige su{" "}
            <strong>correo de acceso</strong>: con el correo equivocado no puede entrar ni recibir el de recuperación,
            así que no puede arreglarlo sola. Solo el dueño puede cambiar el correo de otro dueño.
          </li>
          <li>
            Contraseñas: la de una cuenta de café la restableces desde Equipo; quien entra con correo la cambia en Mi
            cuenta. El <strong>PIN de caja</strong> también se asigna o quita desde aquí.
          </li>
          <li>
            Si alguien deja de trabajar contigo, <strong>desactívalo</strong> (conserva su historial); quitarlo del
            equipo solo se permite si no tiene ventas. Un cajero solo ve sus propias ventas.
          </li>
          <li>
            En <strong>Actividad</strong> queda quién cambió qué (precios, productos, equipo, ajustes) y cuándo.
          </li>
        </ul>
      ),
    },
    {
      id: "admin-ventas",
      grupo: "admin",
      icon: Receipt,
      titulo: "Ventas y reportes",
      palabras: "historial periodo filtro folio buscar csv excel exportar detalle",
      href: "/admin/ventas",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Elige el periodo (Hoy, Ayer, 7 días, 30 días, Este mes o un rango del calendario) y filtra por cajero o
            método de pago. Indicadores, gráfica por día, hora pico y más vendidos corresponden al periodo elegido.
          </li>
          <li>
            <strong>Buscar por folio</strong>: escribe el número del ticket y lo encuentra sin importar la fecha (útil
            cuando un cliente regresa con su ticket).
          </li>
          <li>
            Toca un ticket para ver el detalle, <strong>reimprimirlo</strong> o <strong>cancelarlo</strong> con motivo.
          </li>
          <li>
            <strong>CSV</strong> descarga el detalle del periodo (se abre en Excel) con folio, fecha, cajero, método,
            importes, descuento, costo, margen, propina y artículos.
          </li>
        </ul>
      ),
    },
    {
      id: "admin-cortes",
      grupo: "admin",
      icon: Unlock,
      titulo: "Cortes de caja",
      palabras: "historial turnos esperado contado diferencia cuadre reimprimir parcial propinas",
      href: "/admin/cortes",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Muestra el estado actual de la caja y el historial de turnos: fondo, efectivo vendido, propinas, esperado,
            contado y <strong>diferencia</strong> (verde cuadró, azul sobrante, rojo faltante — como en la demo del
            corte). Cada corte se puede reimprimir; con la caja abierta puedes imprimir un corte parcial.
          </li>
        </ul>
      ),
    },
  ]

  /* ── Buscador: filtra secciones por título y sinónimos ──────────── */
  const q = normalizar(busqueda.trim())
  const visibles = useMemo(
    () => (q === "" ? SECCIONES : SECCIONES.filter((s) => normalizar(`${s.titulo} ${s.palabras}`).includes(q))),
    // El arreglo se rearma cada render pero su contenido es estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q],
  )

  /* ── Scrollspy: la última sección cuyo inicio ya pasó bajo el
     encabezado fijo. Posiciones de layout, no IntersectionObserver: es
     determinista y no depende de que el navegador esté componiendo. ── */
  useEffect(() => {
    const marcar = () => {
      let id = SECCIONES[0]?.id ?? ""
      for (const s of SECCIONES) {
        const el = document.getElementById(s.id)
        if (el && el.offsetTop <= window.scrollY + 170) id = s.id
      }
      setActivo(id)
    }
    marcar()
    window.addEventListener("scroll", marcar, { passive: true })
    window.addEventListener("resize", marcar)
    return () => {
      window.removeEventListener("scroll", marcar)
      window.removeEventListener("resize", marcar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles.length])

  const porGrupo = (g: Grupo) => visibles.filter((s) => s.grupo === g)

  const NavLista = ({ enColumna }: { enColumna: boolean }) => (
    <>
      {(["cajero", "admin"] as const).map((g) => {
        const items = porGrupo(g)
        if (items.length === 0) return null
        return (
          <div key={g} className={enColumna ? "" : "flex items-center gap-1.5"}>
            {enColumna && (
              <p className="mb-1.5 mt-4 px-2 text-[11px] font-bold uppercase tracking-wider text-stone-400 first:mt-0">
                {GRUPOS[g].titulo}
              </p>
            )}
            <div className={enColumna ? "space-y-0.5" : "flex gap-1.5"}>
              {items.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={
                    enColumna
                      ? `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                          activo === s.id && q === ""
                            ? "bg-amber-100 font-medium text-amber-900"
                            : "text-stone-600 hover:bg-stone-100"
                        }`
                      : `shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                          activo === s.id && q === ""
                            ? "border-amber-300 bg-amber-100 font-medium text-amber-900"
                            : "border-stone-200 bg-white text-stone-600"
                        }`
                  }
                >
                  {enColumna && <s.icon className="h-4 w-4 shrink-0 opacity-60" />}
                  <span className="truncate">{s.titulo}</span>
                </a>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )

  return (
    <div className="min-h-screen bg-stone-50 print:bg-white">
      {/* ── Encabezado fijo ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur print:static print:border-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            href="/pos"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-stone-500 hover:text-amber-700 print:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">POS</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-5 w-5 shrink-0 text-amber-700" />
            <h1 className="truncate text-lg font-bold text-stone-800">Guía de uso</h1>
          </div>
          <div className="relative ml-auto w-full max-w-xs print:hidden">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar: propina, folio, QR…"
              className="h-9 w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-8 text-sm outline-none focus:border-amber-400 focus:bg-white"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="hidden shrink-0 items-center gap-1 sm:flex print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 hover:border-amber-300"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:text-amber-700"
            >
              <Settings className="h-4 w-4" />
              Panel
            </Link>
          </div>
        </div>
        {/* Navegación móvil: chips deslizables */}
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto border-t border-stone-100 px-4 py-2 lg:hidden print:hidden">
          <NavLista enColumna={false} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[230px_1fr]">
        {/* ── Navegación lateral (escritorio) ───────────────────── */}
        <aside className="hidden lg:block print:hidden">
          <nav className="sticky top-24">
            <NavLista enColumna />
          </nav>
        </aside>

        {/* ── Contenido ─────────────────────────────────────────── */}
        <main className="min-w-0">
          <p className="mb-6 text-sm text-stone-500 print:mb-4">
            Cómo se opera la caja día a día y cómo se administra el negocio. Las cajas grises son{" "}
            <strong>demos para practicar</strong> — tócalas sin miedo, aquí no se cobra nada. Imprime esta guía si la
            quieres junto a la caja.
          </p>

          {q !== "" && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:hidden">
              {visibles.length === 0
                ? `Nada sobre «${busqueda.trim()}». Intenta con otra palabra (p. ej. propina, corte, QR).`
                : `${visibles.length} sección${visibles.length === 1 ? "" : "es"} sobre «${busqueda.trim()}»:`}
            </p>
          )}

          <div className="space-y-10">
            {(["cajero", "admin"] as const).map((g) => {
              const items = porGrupo(g)
              if (items.length === 0) return null
              return (
                <div key={g} className={g === "admin" ? "break-before-page" : ""}>
                  <div className="mb-4 flex items-center gap-2.5">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${GRUPOS[g].chip}`}>
                      {GRUPOS[g].titulo}
                    </span>
                    <div className="h-px flex-1 bg-stone-200" />
                  </div>
                  <div className="space-y-5">
                    {items.map((s) => (
                      <section
                        key={s.id}
                        id={s.id}
                        className="scroll-mt-32 break-inside-avoid rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 print:border-0 print:p-0"
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${GRUPOS[s.grupo].chip}`}>
                            <s.icon className="h-[18px] w-[18px]" />
                          </span>
                          <h2 className="min-w-0 flex-1 text-lg font-bold text-stone-800">{s.titulo}</h2>
                          {s.href && (
                            <Link
                              href={s.href}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-500 hover:border-amber-300 hover:text-amber-700 print:hidden"
                            >
                              Abrir
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                        {s.nodo}
                      </section>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <footer className="mt-10 border-t border-stone-200 pt-4 text-xs text-stone-400 print:hidden">
            Esta guía vive en la app: se actualiza con cada cambio del sistema. ¿Algo no está claro? Escríbenos a
            soporte@cafecitopos.com.
          </footer>
        </main>
      </div>
    </div>
  )
}
