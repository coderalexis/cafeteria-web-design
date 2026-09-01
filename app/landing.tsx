import Link from "next/link"
import Image from "next/image"
import {
  Coffee,
  ArrowRight,
  Zap,
  Wallet,
  TrendingUp,
  Users,
  QrCode,
  Store,
  Printer,
  ShieldCheck,
  Mail,
  Smartphone,
  Boxes,
  Stamp,
  Hammer,
  Check,
  HandCoins,
} from "lucide-react"
import { buildTicketLines } from "@/lib/receipt"
import { TRIAL_DAYS } from "@/lib/signup"

/**
 * Página pública de cafecitopos.com para quien todavía no tiene cuenta.
 * Solo se promete lo que el sistema hace HOY; lo que está en camino va en su
 * propia sección y marcado como tal.
 */

const CONTACTO = "soporte@cafecitopos.com"

/** Clases completas: Tailwind no resuelve nombres armados al vuelo. */
const TONOS = {
  amber: { chip: "bg-amber-100 text-amber-700", borde: "hover:border-amber-300", punto: "bg-amber-500" },
  emerald: { chip: "bg-emerald-100 text-emerald-700", borde: "hover:border-emerald-300", punto: "bg-emerald-500" },
  blue: { chip: "bg-blue-100 text-blue-700", borde: "hover:border-blue-300", punto: "bg-blue-500" },
  indigo: { chip: "bg-indigo-100 text-indigo-700", borde: "hover:border-indigo-300", punto: "bg-indigo-500" },
  rose: { chip: "bg-rose-100 text-rose-700", borde: "hover:border-rose-300", punto: "bg-rose-500" },
  teal: { chip: "bg-teal-100 text-teal-700", borde: "hover:border-teal-300", punto: "bg-teal-500" },
  orange: { chip: "bg-orange-100 text-orange-700", borde: "hover:border-orange-300", punto: "bg-orange-500" },
  violet: { chip: "bg-violet-100 text-violet-700", borde: "hover:border-violet-300", punto: "bg-violet-500" },
} as const

type Tono = keyof typeof TONOS

/** El mismo ticket que imprime el sistema, con datos de muestra. */
const TICKET_MUESTRA = buildTicketLines(
  {
    folio: 128,
    date: new Date("2026-03-14T17:42:00Z"),
    paymentMethod: "efectivo",
    items: [
      { label: "Latte (Grande)", quantity: 2, unitPrice: 60, lineTotal: 120, modifiers: [{ name: "Leche de avena", price: 12 }] },
      { label: "Croissant", quantity: 1, unitPrice: 38, lineTotal: 38 },
    ],
    subtotal: 158,
    total: 158,
    tip: 16,
    cashReceived: 200,
    changeDue: 26,
  },
  {
    name: "Café de ejemplo",
    timezone: "America/Mexico_City",
    address: "Av. Juárez 123, Centro",
    receiptFooter: "¡Gracias por tu visita!",
  },
)

function Bloque({
  icon: Icon,
  tono,
  titulo,
  entrada,
  puntos,
}: {
  icon: typeof Zap
  tono: Tono
  titulo: string
  entrada: string
  puntos: string[]
}) {
  const t = TONOS[tono]
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-6 transition-colors ${t.borde}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.chip}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-stone-800">{titulo}</h3>
      <p className="mt-1.5 text-sm text-stone-500">{entrada}</p>
      <ul className="mt-4 space-y-2">
        {puntos.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-stone-600">
            <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${t.punto}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Landing() {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <span className="whitespace-nowrap font-bold text-stone-800">Cafecito POS</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/login"
              className="hidden px-3 py-2 text-sm font-semibold text-stone-600 hover:text-amber-700 min-[360px]:block"
            >
              Entrar
            </Link>
            <Link
              href="/registro"
              className="whitespace-nowrap rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 sm:px-4"
            >
              Crear<span className="hidden sm:inline"> mi</span> cafetería
            </Link>
          </div>
        </div>
      </header>

      {/* ── Portada ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-stone-200 bg-gradient-to-b from-amber-50 via-stone-50 to-stone-50">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
              <Coffee className="h-3.5 w-3.5" />
              Punto de venta para cafeterías
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl">
              Cobra rápido, cuadra tu caja
              <br className="hidden sm:block" /> y entérate de cuánto{" "}
              <span className="text-amber-700">ganas</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
              No solo de cuánto vendes. Tu mostrador, tu corte de caja y tus números en un mismo lugar, desde la tablet
              que ya tienes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/registro"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-amber-800"
              >
                Crear mi cafetería gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-700 transition-colors hover:bg-stone-50"
              >
                Ya tengo cuenta
              </Link>
            </div>
            <p className="mt-4 text-sm text-stone-500">
              {TRIAL_DAYS} días de prueba, sin tarjeta. Eliges qué vendes —café, frappés, panadería— y tu carta queda
              armada con precios que puedes ajustar. Empiezas a cobrar en lo que tarda un café. ¿Dudas?{" "}
              <a href={`mailto:${CONTACTO}`} className="text-amber-700 underline underline-offset-2">{CONTACTO}</a>
            </p>
          </div>

          {/* Capturas REALES del sistema, no maquetas: es la pantalla de venta
              tal cual, con el celular encima para que se vea de un golpe que
              sirve en los dos aparatos. */}
          <div className="relative">
            <div className="mx-auto max-w-[15rem] overflow-hidden rounded-[1.75rem] border-[6px] border-stone-800 bg-white shadow-2xl md:hidden">
              <Image
                src="/capturas/pos-movil.webp"
                alt="Pantalla de venta de Cafecito POS en un celular"
                width={480}
                height={1039}
                priority
                className="w-full"
              />
            </div>
            <div className="hidden overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl md:block">
              <div className="flex items-center gap-1.5 border-b border-stone-200 bg-stone-100 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
              </div>
              <Image
                src="/capturas/pos.webp"
                alt="Pantalla de venta de Cafecito POS con el menu y el carrito"
                width={1600}
                height={1000}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-16">
        {/* ── Lo que hace ───────────────────────────────────────── */}
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">Todo lo que pide una cafetería</h2>
          <p className="mx-auto mt-3 max-w-2xl text-stone-600">
            Nada de módulos que nunca vas a abrir. Esto es lo que el sistema hace hoy.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Bloque
            icon={Zap}
            tono="amber"
            titulo="En el mostrador"
            entrada="Pensado para cobrar con fila enfrente."
            puntos={[
              "Tamaños y extras (tipo de leche, shot adicional) en dos toques.",
              "Lo más vendido del mes aparece arriba; cada categoría con su color.",
              "Efectivo sin calculadora: teclado en pantalla y cambio automático.",
              "Propinas de 5, 10, 15 % o monto libre, siempre aparte de tu venta.",
              "Descuentos que piden motivo, para saber después por qué se dieron.",
              "Si se va el internet, la venta en curso se guarda y la cobras al volver.",
              "¿Sin impresora térmica? Una pantalla te dice qué falta preparar y se actualiza sola —también lo de las mesas que aún no pagan, y nunca repite lo que ya serviste.",
              "Y el ticket del cliente en su celular: escanea un QR al pagar y ahí está su nota, sin papel.",
            ]}
          />
          <Bloque
            icon={HandCoins}
            tono="orange"
            titulo="Mesas que pagan al final"
            entrada="Para cuando el cliente pide, se sienta, y paga cuando termina."
            puntos={[
              "Abres una cuenta a nombre de la mesa y le vas sumando cada ronda.",
              "El nombre se escribe una sola vez: después el botón ya dice «Guardar en Mesa 1».",
              "Las cuentas viven en el servidor: tomas el pedido en el celular y cobras en la tablet.",
              "«¿Me trae la cuenta?»: le enseñas el desglose con total, o lo imprimes, o se lo mandas.",
              "Se fue sin pagar: pasa a «Por cobrar» con su teléfono, y ahí sabes quién te debe y cuánto.",
              "Nada cuenta como venta hasta que te pagan — tu corte de esa noche cuadra igual.",
              "Los botones de mesa son tuyos: dices cuántas tienes y agregas «Barra» o «Terraza».",
            ]}
          />
          <Bloque
            icon={Wallet}
            tono="emerald"
            titulo="La caja cuadrada al cerrar"
            entrada="El momento que más pleitos causa, resuelto paso a paso."
            puntos={[
              "Abres turno con tu fondo; entradas y salidas quedan con su motivo.",
              "Al cerrar: efectivo esperado contra contado, y la diferencia a la vista.",
              "Las propinas en efectivo cuentan en el cajón, porque ahí están.",
              "El corte se imprime y queda guardado para reimprimirlo cuando sea.",
              "Un cajero solo cancela sus ventas mientras su caja siga abierta.",
            ]}
          />
          <Bloque
            icon={Users}
            tono="indigo"
            titulo="Tu equipo, con los permisos justos"
            entrada="Cada quien ve lo suyo, y tú ves quién hizo qué."
            puntos={[
              "Tus cajeros entran con usuario y contraseña: no necesitan correo.",
              "Tres roles: dueño, administrador y cajero.",
              "PIN de caja y bloqueo por inactividad, para que nadie cobre con la sesión de otro.",
              "Bitácora de cambios de precio, descuentos, cancelaciones y accesos.",
            ]}
          />
          <Bloque
            icon={QrCode}
            tono="rose"
            titulo="Tu menú en el celular del cliente"
            entrada="Un código QR en la mesa y listo."
            puntos={[
              "Publicas tu carta con un clic y el sistema te da el QR para imprimir.",
              "Cambias un precio y el menú se actualiza solo: el QR nunca se reemplaza.",
              "Muestra lo que verían en una carta impresa; tus costos jamás salen de ahí.",
            ]}
          />
          <Bloque
            icon={Stamp}
            tono="violet"
            titulo="Que vuelvan: tarjeta de sellos"
            entrada="Sin cartoncitos que se pierden en la cartera."
            puntos={[
              "El cliente se identifica con su teléfono y junta un sello por visita.",
              "Al llegar a la meta que tú pongas, el premio se descuenta al cobrar.",
              "El avance sale impreso en su ticket, para que sepa cuánto le falta.",
              "Tú decides cuántos sellos y cuál es el premio; se puede apagar cuando quieras.",
            ]}
          />
          <Bloque
            icon={Store}
            tono="teal"
            titulo="¿Más de una sucursal?"
            entrada="Cada cafetería con su menú, su caja y su equipo."
            puntos={[
              "Los números de una nunca se mezclan con los de otra.",
              "Si administras varias, cambias entre ellas con el mismo usuario.",
              "Cada una con su zona horaria, para que el corte cierre a la hora correcta.",
            ]}
          />
          <Bloque
            icon={ShieldCheck}
            tono="blue"
            titulo="Sin sustos"
            entrada="Lo aburrido que agradeces cuando pasa algo."
            puntos={[
              "Copia de seguridad diaria y cifrada, sin que tengas que acordarte.",
              "Cada venta se registra una sola vez, aunque el internet falle a medias.",
              "Cancelar no borra: deja constancia de quién, cuándo y por qué.",
            ]}
          />
        </div>

        {/* ── Así se ve por dentro ──────────────────────────────── */}
        <section className="mt-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-stone-900">Así se ve por dentro</h2>
            <p className="mx-auto mt-3 max-w-2xl text-stone-600">
              Capturas del sistema funcionando, no ilustraciones. Los números son de una cafetería de ejemplo con un
              mes de ventas.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              {
                src: "/capturas/tablero.webp",
                movil: "/capturas/tablero-movil.webp",
                w: 1600,
                h: 1000,
                titulo: "Sabes cómo va el día sin sacar cuentas",
                texto:
                  "Cuánto llevas hoy, cómo vas contra tu meta, y la comparación con ayer y con el mismo día de la semana pasada a la misma hora.",
              },
              {
                src: "/capturas/analisis.webp",
                movil: "/capturas/analisis-movil.webp",
                w: 1600,
                h: 1089,
                titulo: "A qué hora se llena y qué deja más",
                texto:
                  "Mapa de calor por día y hora para acomodar turnos, comparativo por cajero, y el margen real de cada producto una vez pagados los insumos.",
              },
              {
                src: "/capturas/preparar.webp",
                movil: "/capturas/preparar-movil.webp",
                w: 1400,
                h: 875,
                titulo: "La comanda, sin impresora",
                texto:
                  "Lo que falta preparar en una pantalla que se actualiza sola. Incluye las cuentas de mesas que todavía no pagan, y nunca repite lo ya servido.",
              },
              {
                src: "/capturas/cortes.webp",
                movil: "/capturas/cortes-movil.webp",
                w: 1400,
                h: 875,
                titulo: "El corte, cuadrado y guardado",
                texto:
                  "Cada turno con su fondo, lo esperado contra lo contado y la diferencia a la vista. Queda archivado para consultarlo cuando haga falta.",
              },
            ].map((c) => (
              <figure key={c.src} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                <Image
                  src={c.movil}
                  alt={c.titulo}
                  width={480}
                  height={1039}
                  className="mx-auto w-full max-w-[22rem] border-b border-stone-100 md:hidden"
                />
                <Image
                  src={c.src}
                  alt={c.titulo}
                  width={c.w}
                  height={c.h}
                  className="hidden w-full border-b border-stone-100 md:block"
                />
                <figcaption className="p-5">
                  <h3 className="font-bold text-stone-800">{c.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{c.texto}</p>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* El ticket sigue siendo real: lo genera la MISMA función que
              imprime el sistema, así que no puede quedar desactualizado. */}
          <div className="mt-6 grid items-center gap-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-[auto_1fr]">
            <div className="mx-auto w-[16rem] rotate-1 rounded-lg bg-stone-50 p-4 ring-1 ring-stone-200">
              <pre className="overflow-hidden whitespace-pre font-mono text-[9px] leading-[1.45] text-stone-700">
                {TICKET_MUESTRA.join("\n")}
              </pre>
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-800">Y el ticket del cliente, como debe ser</h3>
              <p className="mt-2 text-stone-600">
                Este de aquí no es una imagen: lo arma la misma función que imprime tu impresora térmica, así que es
                exactamente lo que va a salir en papel. Con tu nombre, tu dirección y el mensaje que tú elijas.
              </p>
              <p className="mt-2 text-sm text-stone-500">
                ¿Todavía sin impresora? Entonces el ticket va por el otro camino, el de aquí abajo.
              </p>
            </div>
          </div>

          {/* Los dos lados de la nota por QR. Se enseña la secuencia completa
              —lo que ve la cajera y lo que le queda al cliente— porque el
              «te mando un QR» no se entiende hasta que se ve el resultado. */}
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-xl font-bold text-stone-800">¿Sin impresora? El cliente se lleva su nota en el celular</h3>
            <p className="mt-2 max-w-3xl text-stone-600">
              Al cerrar la venta aparece un botón para mostrar el código. El cliente lo escanea de esa misma pantalla,
              mientras sigue enfrente, y ahí está su nota. Nada que instalar y nada que pedirle por WhatsApp.
            </p>
            {/* Rotulo arriba de cada captura: las dos imagenes no miden
                exactamente lo mismo y con el pie abajo los numeros quedaban
                a distinta altura, que es justo lo que rompe la secuencia. */}
            <div className="mt-7 grid justify-center gap-8 sm:grid-cols-[auto_auto_auto] sm:items-start sm:gap-6">
              <figure className="max-w-[16rem]">
                <figcaption className="mb-3 text-center text-sm text-stone-600">
                  <strong className="text-stone-800">1. En la caja.</strong> Un toque y sale el código.
                </figcaption>
                <Image
                  src="/capturas/qr-venta.webp"
                  alt="Pantalla de venta registrada con el codigo QR para el cliente"
                  width={760}
                  height={1330}
                  className="w-full rounded-xl border border-stone-200 shadow-md"
                />
              </figure>
              <ArrowRight aria-hidden className="mx-auto h-6 w-6 rotate-90 self-center text-stone-300 sm:rotate-0" />
              <figure className="max-w-[13.5rem]">
                <figcaption className="mb-3 text-center text-sm text-stone-600">
                  <strong className="text-stone-800">2. En su celular.</strong> El mismo ticket, sin papel.
                </figcaption>
                <Image
                  src="/capturas/nota-cliente.webp"
                  alt="La nota de compra abierta en el celular del cliente"
                  width={480}
                  height={853}
                  className="w-full rounded-[1.5rem] border-4 border-stone-800 bg-white shadow-md"
                />
              </figure>
            </div>
            <p className="mt-6 text-sm text-stone-500">
              El enlace vive 7 días y luego deja de funcionar, para que una nota vieja no ande dando vueltas. Viene
              prendido, y si prefieres que no aparezca lo apagas en los ajustes de tu cafetería.
            </p>
          </div>
        </section>

        {/* ── El diferenciador ──────────────────────────────────── */}
        <section className="mt-16 overflow-hidden rounded-2xl border border-stone-800 bg-stone-900">
          <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
                Vender mucho no es ganar dinero
              </h2>
              <p className="mt-3 text-stone-300">
                El frappé de $75 se ve mejor que el espresso de $22 en cualquier reporte. Pero si uno te cuesta $38 de
                insumos y el otro $6, el que sostiene tu negocio es el otro. Cafecito POS te dice cuál es cuál.
              </p>
              <ul className="mt-5 space-y-2.5">
                {[
                  "Margen real por producto, no solo cuánto vendiste.",
                  "Qué se te está yendo con margen bajo, para subirle el precio o bajarle el costo.",
                  "Metas del día y del mes, con cuánto llevas y cuánto falta.",
                  "Hoy contra ayer y contra el mismo día de la semana pasada, a la misma hora.",
                  "Cada lunes, el resumen de la semana en tu correo.",
                ].map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm text-stone-200">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Muestra del panel */}
            <div className="rounded-xl bg-stone-800/60 p-5 ring-1 ring-stone-700">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Meta del mes</p>
              <p className="mt-1 text-2xl font-bold text-white">
                $38,400 <span className="text-base font-medium text-stone-400">/ $50,000</span>
              </p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-700">
                <div className="h-full w-[77%] rounded-full bg-emerald-500" />
              </div>
              <p className="mt-1.5 text-xs text-stone-400">77 % · faltan $11,600</p>

              <div className="mt-6 space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Los que más dejan</p>
                {[
                  { n: "Latte · Grande", v: "$4,180", p: "70 %" },
                  { n: "Espresso · Chico", v: "$2,940", p: "73 %" },
                  { n: "Frappé · Grande", v: "$1,220", p: "38 %" },
                ].map((r) => (
                  <div key={r.n} className="flex items-center justify-between text-sm">
                    <span className="text-stone-300">{r.n}</span>
                    <span className="font-semibold text-white">
                      {r.v} <span className="text-xs font-normal text-emerald-400">{r.p}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── En camino ─────────────────────────────────────────── */}
        <section className="mt-16">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-200">
              <Hammer className="h-5 w-5 text-stone-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900">En qué estamos trabajando</h2>
              <p className="text-sm text-stone-500">
                El sistema se sigue construyendo con las cafeterías que ya lo usan. Esto viene en camino.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            {[
              {
                icon: Boxes,
                titulo: "Inventario",
                texto:
                  "Existencias de lo que se cuenta por pieza —pan, pasteles, botellas—, con descuento automático al vender, alertas de que se está acabando y registro de mermas.",
              },
            ].map(({ icon: Icon, titulo, texto }) => (
              <div key={titulo} className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-6">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-stone-500" />
                  <h3 className="font-bold text-stone-800">{titulo}</h3>
                  <span className="ml-auto rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500">
                    En desarrollo
                  </span>
                </div>
                <p className="mt-3 text-sm text-stone-600">{texto}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm text-stone-500">
            ¿Te falta algo que no está aquí?{" "}
            <a href={`mailto:${CONTACTO}?subject=Sugerencia%20para%20Cafecito%20POS`} className="font-medium text-amber-700 underline underline-offset-2">
              Dinos qué necesitas
            </a>{" "}
            — lo que piden las cafeterías es lo que se construye primero.
          </p>
        </section>

        {/* ── Requisitos ────────────────────────────────────────── */}
        <section className="mt-16 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-stone-800">Funciona con lo que ya tienes</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div className="flex gap-3">
              <Smartphone className="h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm text-stone-600">
                <strong className="text-stone-800">Tablet, celular o computadora.</strong> Se abre en el navegador y se
                instala como aplicación si quieres.
              </p>
            </div>
            <div className="flex gap-3">
              <Printer className="h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm text-stone-600">
                <strong className="text-stone-800">Impresora térmica opcional.</strong> Si no tienes, manda el ticket
                por WhatsApp.
              </p>
            </div>
            <div className="flex gap-3">
              <Wallet className="h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm text-stone-600">
                <strong className="text-stone-800">Tu terminal de siempre.</strong> Cobras la tarjeta con la que ya
                usas; aquí solo se registra la venta.
              </p>
            </div>
          </div>
        </section>

        {/* ── Cierre ────────────────────────────────────────────── */}
        <section className="mt-16 overflow-hidden rounded-2xl bg-amber-700 px-6 py-12 text-center sm:px-10">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            ¿Tienes una cafetería y quieres probarlo?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-amber-50">
            Estamos afinándolo junto a unas cuantas cafeterías. Si te interesa entrar, escríbenos y lo dejamos listo
            con tu menú y tus precios.
          </p>
          <a
            href={`mailto:${CONTACTO}?subject=Quiero%20probar%20Cafecito%20POS`}
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50"
          >
            <Mail className="h-4 w-4" />
            {CONTACTO}
          </a>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-stone-500 sm:flex-row">
          <p>Cafecito POS · Hecho en México para cafeterías</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-amber-700">
              Entrar
            </Link>
            <Link href="/ayuda" className="hover:text-amber-700">
              Guía de uso
            </Link>
            <a href={`mailto:${CONTACTO}`} className="hover:text-amber-700">
              Contacto
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
