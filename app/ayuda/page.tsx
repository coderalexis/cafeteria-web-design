import Link from "next/link"
import type { Metadata } from "next"
import {
  ArrowLeft,
  Ban,
  BookOpen,
  ChefHat,
  Coffee,
  Keyboard,
  Lock,
  Percent,
  Printer,
  Receipt,
  Settings,
  SlidersHorizontal,
  Unlock,
  Users,
  Wallet,
} from "lucide-react"
import { POS_SHORTCUTS } from "@/app/pos/shortcuts"

export const metadata: Metadata = {
  title: "Guía de uso — Cafecito POS",
}

/* ------------------------------------------------------------------ */
/*  Guía de uso: cajero, administrador y atajos. Es una página normal  */
/*  de la app (no un PDF aparte) para que no se desactualice; se       */
/*  imprime limpia con Ctrl+P.                                         */
/* ------------------------------------------------------------------ */

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center print:border print:border-stone-400">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-stone-800">{title}</p>
        <div className="text-sm text-stone-600 leading-relaxed">{children}</div>
      </div>
    </li>
  )
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 break-inside-avoid">
      <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5 text-amber-700" />
        {title}
      </h3>
      {children}
    </section>
  )
}

export default function AyudaPage() {
  return (
    <div className="min-h-screen bg-stone-50 print:bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center justify-between print:hidden">
            <Link href="/pos" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-amber-700">
              <ArrowLeft className="h-4 w-4" />
              Volver al POS
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-amber-700">
              <Settings className="h-4 w-4" />
              Panel admin
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-stone-800 flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-amber-700" />
            Guía de uso — Cafecito POS
          </h1>
          <p className="text-stone-500">
            Cómo se opera la caja día a día y cómo se administra el menú. Imprime esta página (Ctrl+P) si la quieres junto
            a la caja.
          </p>
          <nav className="flex flex-wrap gap-2 text-sm print:hidden">
            {[
              ["#entrar", "Entrar"],
              ["#cajero", "Cajero"],
              ["#efectivo", "Efectivo y cambio"],
              ["#cancelar", "Cancelar / reimprimir"],
              ["#corte", "Corte de caja"],
              ["#atajos", "Atajos"],
              ["#admin", "Administrador"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-stone-600 hover:border-amber-300">
                {label}
              </a>
            ))}
          </nav>
        </header>

        {/* ── CAJERO ─────────────────────────────────────────────── */}
        <div className="space-y-8">
          <h2 className="text-xl font-bold text-stone-900 border-b border-stone-200 pb-2">Para el cajero</h2>

          <Section id="entrar" icon={Users} title="Entrar al sistema">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                <strong>Cajeros</strong>: escribe tu <strong>usuario</strong>, el <strong>café</strong> (el identificador corto de tu
                cafetería, p. ej. <em>el-cafecito</em>) y tu contraseña. El café se recuerda en ese dispositivo.
              </li>
              <li>
                <strong>Dueños y administradores</strong> pueden entrar con su <strong>correo</strong> y contraseña; el campo Café
                se oculta solo.
              </li>
              <li>
                Si perteneces a varias cafeterías, arriba verás un <strong>selector</strong> para cambiar de una a otra. Tu
                contraseña se cambia en <strong>Mi cuenta</strong>.
              </li>
            </ul>
          </Section>

          <Section id="cajero" icon={Coffee} title="Abrir el turno y vender">
            <ol className="space-y-3">
              <Step n={1} title="Abre la caja">
                Al entrar verás el botón rojo <strong>Caja cerrada</strong>. Tócalo, escribe el <strong>fondo inicial</strong>{" "}
                (el efectivo con el que empiezas) y confirma. Sin caja abierta no se puede cobrar.
              </Step>
              <Step n={2} title="Arma el pedido">
                Toca un producto para agregarlo. Si tiene tamaños, elige uno. Si el producto tiene el icono{" "}
                <SlidersHorizontal className="inline h-3.5 w-3.5 align-text-bottom" /> se abrirá una ventana para elegir opciones
                (tipo de leche, extras). Puedes buscar escribiendo el nombre en la barra de búsqueda.
              </Step>
              <Step n={3} title="Ajusta cantidades y notas">
                Con <strong>+ / −</strong> cambias la cantidad. El icono de nota en cada línea permite escribir instrucciones
                de ese artículo («sin azúcar»). La <strong>nota del ticket</strong> (mesa, nombre, para llevar) va abajo, sobre
                los métodos de pago.
              </Step>
              <Step n={4} title="Elige método de pago y cobra">
                Efectivo, Transferencia o Tarjeta. Pulsa <strong>Cobrar</strong>. Aparece el ticket registrado con su{" "}
                <strong>folio</strong>; desde ahí imprimes el <strong>Ticket</strong> para el cliente y la <strong>Comanda</strong>{" "}
                (sin precios) para quien prepara.
              </Step>
              <Step n={5} title="Si te equivocaste antes de cobrar">
                Quita la línea con el bote de basura o usa <strong>Vaciar</strong> para empezar de cero. Si recargas la página
                por accidente, la venta en curso se restaura sola.
              </Step>
            </ol>
          </Section>

          <Section id="efectivo" icon={Wallet} title="Efectivo, cambio y descuentos">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                Con <strong>Efectivo</strong> aparece el campo <strong>Recibido</strong>: escribe lo que te dio el cliente (o usa
                los botones $50/$100/$200/$500) y el sistema muestra el <strong>cambio</strong>. Si es menor que el total,
                no deja cobrar.
              </li>
              <li>
                <strong>Descuento</strong> (<Percent className="inline h-3.5 w-3.5 align-text-bottom" /> junto al total): puede
                ser porcentaje o monto fijo y <strong>siempre pide un motivo</strong>; queda registrado en el ticket y en los
                reportes.
              </li>
            </ul>
          </Section>

          <Section id="cancelar" icon={Ban} title="Cancelar una venta o reimprimir">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                Botón <strong>Tickets</strong> (arriba a la derecha): lista las ventas del día. Cada una tiene{" "}
                <Printer className="inline h-3.5 w-3.5 align-text-bottom" /> reimprimir ticket,{" "}
                <ChefHat className="inline h-3.5 w-3.5 align-text-bottom" /> comanda y{" "}
                <Ban className="inline h-3.5 w-3.5 align-text-bottom" /> cancelar.
              </li>
              <li>
                Cancelar <strong>pide motivo</strong> y deja la venta marcada como cancelada (no se borra). Deja de contar en
                el total del día y en el corte. Un cajero solo puede cancelar sus propias ventas <strong>mientras la caja siga
                abierta</strong>; después lo hace un administrador desde el panel.
              </li>
            </ul>
          </Section>

          <Section id="corte" icon={Lock} title="Cerrar el turno (corte de caja)">
            <ol className="space-y-3">
              <Step n={1} title="Toca el botón verde «Caja abierta»">
                Verás las ventas del turno por método de pago y el <strong>efectivo esperado</strong> = fondo inicial +
                ventas en efectivo + entradas − salidas (las canceladas no cuentan).
              </Step>
              <Step n={2} title="Registra entradas y salidas de efectivo (si las hubo)">
                En esa misma ventana, <strong>Entrada</strong> (metiste efectivo, ej. cambio en monedas) o{" "}
                <strong>Salida</strong> (sacaste efectivo, ej. compra de leche), con monto y motivo. Hazlo en el momento, no al
                final: así el corte cuadra y queda quién y cuándo. Un movimiento no se borra; si te equivocas, registra el
                contrario.
              </Step>
              <Step n={3} title="Cuenta el efectivo y escríbelo">
                El sistema calcula la diferencia al momento: <em>cuadra</em>, <em>sobrante</em> o <em>faltante</em>. Puedes
                agregar una nota de cierre.
              </Step>
              <Step n={4} title="Cerrar e imprimir">
                Imprime el corte para el archivo. Los cortes quedan guardados en el panel (Cortes de caja) y se pueden reimprimir.
              </Step>
            </ol>
          </Section>

          <Section id="movil" icon={Coffee} title="En tablet o celular">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                En pantallas chicas el carrito vive en la <strong>barra inferior</strong>: muestra artículos y total; tócala
                para abrirlo, cobrar o editar. Las acciones (Tickets, Caja, Guía, Cerrar sesión) están en el menú{" "}
                <strong>⋮</strong> arriba a la derecha.
              </li>
              <li>
                <strong>Instalar como app</strong>: en Chrome/Android o Safari/iPad abre el sitio y elige{" "}
                <em>Agregar a pantalla de inicio</em>. Se abre a pantalla completa con su propio ícono. Sigue necesitando
                internet.
              </li>
            </ul>
          </Section>

          <Section id="atajos" icon={Keyboard} title="Atajos de teclado (con teclado físico)">
            <p className="text-sm text-stone-600 mb-3">
              Los atajos con letras funcionan cuando no estás escribiendo en un campo. En el POS, el botón{" "}
              <Keyboard className="inline h-3.5 w-3.5 align-text-bottom" /> o la tecla <kbd className="rounded border border-stone-300 bg-white px-1 font-mono text-xs">?</kbd>{" "}
              muestran esta lista.
            </p>
            <div className="rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
              {POS_SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <p className="text-stone-700">{s.label}</p>
                    {s.hint && <p className="text-xs text-stone-400">{s.hint}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-stone-300 bg-stone-50 px-1.5 font-mono text-xs font-semibold text-stone-700"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-400 mt-2">
              Flujo rápido: <kbd className="rounded border border-stone-300 bg-white px-1 font-mono">/</kbd> escribe «lat» →{" "}
              <kbd className="rounded border border-stone-300 bg-white px-1 font-mono">Enter</kbd> →{" "}
              <kbd className="rounded border border-stone-300 bg-white px-1 font-mono">2</kbd> (Grande) →{" "}
              <kbd className="rounded border border-stone-300 bg-white px-1 font-mono">F2</kbd> cobrar.
            </p>
          </Section>
        </div>

        {/* ── ADMIN ──────────────────────────────────────────────── */}
        <div className="space-y-8 break-before-page">
          <h2 id="admin" className="text-xl font-bold text-stone-900 border-b border-stone-200 pb-2 scroll-mt-20">
            Para el administrador
          </h2>

          <Section id="admin-menu" icon={Coffee} title="Menú: categorías, productos y variantes">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                <strong>Categorías</strong>: son las pestañas del POS. El <em>slug</em> es el identificador (minúsculas y
                guiones, ej. <code>crepas-dulces</code>).
              </li>
              <li>
                <strong>Productos</strong>: cada uno tiene una o más <strong>variantes</strong> (tamaños con precio). Un producto
                con una sola variante llamada <code>Único</code> se vende con un toque, sin preguntar tamaño. Desde el editor de un
                producto puedes ocultarlo del POS (<em>Desactivar</em>), y lo mismo con cada variante (icono de ojo).
              </li>
              <li>
                Un producto o variante que <strong>ya tiene ventas no se puede borrar</strong> (para no perder el historial);
                desactívalo.
              </li>
            </ul>
          </Section>

          <Section id="admin-modificadores" icon={SlidersHorizontal} title="Modificadores (opciones al vender)">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                En <strong>Modificadores</strong> creas grupos (ej. «Tipo de leche») con sus opciones y precio extra (ej. «Leche de avena +$12»). Mínimo/máximo controlan cuántas se pueden elegir; máximo 1 = elige solo una.
              </li>
              <li>
                Luego, en el editor de cada <strong>producto</strong>, marca qué grupos aplican. En el POS aparecerán al vender ese
                producto y el precio se calcula automáticamente.
              </li>
            </ul>
          </Section>

          <Section id="admin-analisis" icon={Receipt} title="Análisis (comparativos y patrones)">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                <strong>Comparativo</strong>: cada indicador del periodo elegido se compara con el periodo anterior de la
                misma duración (p. ej. últimos 30 días vs. los 30 previos) y muestra el % de cambio.
              </li>
              <li>
                <strong>Día de la semana</strong>: promedio de ingresos por cada día (¿los martes van flojos?), y{" "}
                <strong>mapa de calor día × hora</strong> para saber cuándo poner más personal o lanzar una promoción en
                horas muertas.
              </li>
              <li>
                <strong>Por cajero</strong>: ventas, ticket promedio, artículos por ticket, descuentos y cancelaciones de cada
                quien. <strong>Descuentos y cancelaciones</strong> por motivo y por quién los aplicó.
              </li>
              <li>
                <strong>Productos sin movimiento</strong> (candidatos a retirar del menú), <strong>modificadores más pedidos</strong>{" "}
                (para compras) y <strong>parejas que se compran juntas</strong> (ideas de combos).
              </li>
            </ul>
          </Section>

          <Section id="admin-negocio" icon={Coffee} title="Datos del negocio">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                En <strong>Negocio</strong> defines el nombre, la <strong>zona horaria</strong> (marca el «día de operación» de
                reportes y cortes: si tu cafetería está en Tijuana o Cancún, elígela), la dirección y el teléfono, y los
                textos de <strong>encabezado y pie del ticket</strong>. Verás una vista previa del ticket al editar.
              </li>
              <li>El identificador corto de tu café (para el login de cajeros) se muestra ahí y no se puede cambiar.</li>
            </ul>
          </Section>

          <Section id="admin-equipo" icon={Users} title="Equipo y accesos">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                En <strong>Equipo</strong> das acceso a tu cafetería. <strong>Usuario de café</strong>: creas una cuenta con
                usuario y contraseña (entra con usuario + café), ideal para cajeros. <strong>Por correo</strong>: das acceso a
                alguien con su correo; si no tiene cuenta, se crea con una contraseña temporal que verás una sola vez.
              </li>
              <li>
                Roles: <em>Cajero</em> (solo POS), <em>Administrador</em> (POS + panel) y <em>Dueño</em> (todo; solo un dueño
                puede nombrar o quitar dueños; siempre debe quedar al menos uno).
              </li>
              <li>
                Contraseñas: mínimo 8 caracteres con letras y números. La de una cuenta de café la restableces desde Equipo;
                quien entra con correo la cambia en Mi cuenta.
              </li>
              <li>
                Si alguien deja de trabajar contigo, <strong>desactívalo</strong> (conserva su historial de ventas); quitarlo
                del equipo solo se permite si no tiene ventas.
              </li>
              <li>Un cajero solo ve sus propias ventas; dueños y administradores ven todo el negocio.</li>
            </ul>
          </Section>

          <Section id="admin-ventas" icon={Receipt} title="Ventas y reportes">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                <strong>Ventas</strong>: elige el periodo (Hoy, Ayer, 7 días, 30 días, Este mes o un rango con el calendario),
                filtra por cajero o método de pago. Los indicadores, la gráfica por día, la hora pico y los productos más vendidos
                corresponden al periodo elegido.
              </li>
              <li>
                Toca un ticket para ver el detalle, <strong>reimprimirlo</strong> o <strong>cancelarlo</strong> con motivo.
              </li>
              <li>
                <strong>CSV</strong> descarga el detalle del periodo (se abre en Excel) con folio, fecha, cajero, método,
                importes, descuento y artículos.
              </li>
            </ul>
          </Section>

          <Section id="admin-cortes" icon={Unlock} title="Cortes de caja">
            <ul className="space-y-2 text-sm text-stone-600">
              <li>
                <strong>Cortes de caja</strong> muestra el estado actual de la caja y el historial de turnos: fondo, efectivo
                vendido, esperado, contado y <strong>diferencia</strong> (verde cuadró, azul sobrante, rojo faltante). Cada corte se
                puede reimprimir; con la caja abierta puedes imprimir un corte parcial.
              </li>
            </ul>
          </Section>
        </div>

        <footer className="text-xs text-stone-400 border-t border-stone-200 pt-4 print:hidden">
          ¿Algo no está claro? Esta guía vive en la app: se actualiza con cada cambio del sistema.
        </footer>
      </div>
    </div>
  )
}
