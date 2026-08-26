import Link from "next/link"
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
} from "lucide-react"

/**
 * Página pública de cafecitopos.com para quien todavía no tiene cuenta.
 * Solo se promete lo que el sistema hace hoy: nada de inventario, lealtad ni
 * facturación, que aún no existen.
 */

const CONTACTO = "soporte@cafecitopos.com"

function Seccion({
  icon: Icon,
  titulo,
  entrada,
  puntos,
}: {
  icon: typeof Zap
  titulo: string
  entrada: string
  puntos: string[]
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
          <Icon className="h-5 w-5 text-amber-700" />
        </div>
        <h2 className="text-xl font-bold text-stone-800">{titulo}</h2>
      </div>
      <p className="mt-3 text-stone-600">{entrada}</p>
      <ul className="mt-4 space-y-2">
        {puntos.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-stone-600">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
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
      {/* Barra */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700">
              <Coffee className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-stone-800">Cafecito POS</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        {/* Portada */}
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-700">
            Punto de venta para cafeterías
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-bold leading-tight text-stone-900 sm:text-5xl">
            Cobra rápido, cuadra tu caja y entérate de cuánto <em className="not-italic text-amber-700">ganas</em>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600">
            No solo de cuánto vendes. Cafecito POS lleva tu mostrador, tu corte de caja y tus números en el mismo
            lugar, desde la tablet que ya tienes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-6 py-3 font-semibold text-white hover:bg-amber-800"
            >
              Entrar al sistema
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={`mailto:${CONTACTO}?subject=Quiero%20probar%20Cafecito%20POS`}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 font-semibold text-stone-700 hover:bg-stone-50"
            >
              <Mail className="h-4 w-4" />
              Quiero probarlo
            </a>
          </div>
          <p className="mt-4 text-sm text-stone-500">
            Ahorita estamos en pruebas con cafeterías reales, sin costo.
          </p>
        </div>

        {/* Lo que hace */}
        <div className="mt-16 space-y-5">
          <Seccion
            icon={Zap}
            titulo="En el mostrador"
            entrada="Pensado para cobrar con fila enfrente, no para llenar formularios."
            puntos={[
              "Productos con tamaños y extras (tipo de leche, shot adicional) en dos toques.",
              "Lo más vendido del mes aparece arriba, y cada categoría con su color para ubicarla de un vistazo.",
              "Efectivo sin calculadora: teclado en pantalla, botones de $50/$100/$200 y el cambio calculado solo.",
              "Propinas de 5, 10, 15 % o el monto que sea. Se cobran aparte y nunca se confunden con tu venta.",
              "Descuentos que siempre piden motivo, para que después sepas por qué se dio.",
              "Si se va el internet no pierdes la venta: se queda guardada y la cobras cuando vuelve, sin duplicarla.",
            ]}
          />

          <Seccion
            icon={Wallet}
            titulo="La caja cuadrada al cerrar"
            entrada="El momento que más pleitos causa en una cafetería, resuelto paso a paso."
            puntos={[
              "Abres el turno con tu fondo y registras entradas y salidas de efectivo con su motivo.",
              "Al cerrar ves el efectivo esperado contra el contado, y la diferencia marcada como cuadró, sobrante o faltante.",
              "Las propinas cobradas en efectivo cuentan en el cajón, porque ahí están.",
              "El corte se imprime y queda guardado; puedes reimprimir cualquiera después.",
              "Un cajero solo cancela sus propias ventas mientras su caja siga abierta.",
            ]}
          />

          <Seccion
            icon={TrendingUp}
            titulo="Saber cómo va el negocio"
            entrada="La diferencia entre vender mucho y ganar dinero se ve aquí."
            puntos={[
              "Costo por producto y margen real: cuáles te dejan más y cuáles estás casi regalando.",
              "Metas de venta diaria y mensual, con el avance y cuánto falta.",
              "Hoy contra ayer y contra el mismo día de la semana pasada, a la misma hora.",
              "Qué días y a qué horas vendes más, con mapa de calor por hora y día.",
              "Desempeño por cajero, descuentos, cancelaciones y productos que nadie pide.",
              "Cada lunes te llega por correo el resumen de la semana anterior.",
              "Todo se exporta a Excel cuando lo necesitas.",
            ]}
          />

          <Seccion
            icon={Users}
            titulo="Tu equipo, con los permisos justos"
            entrada="Cada quien ve lo suyo, y tú ves quién hizo qué."
            puntos={[
              "Tus cajeros entran con usuario y contraseña. No necesitan correo ni instalar nada.",
              "Tres roles: dueño, administrador y cajero. Un cajero no entra a tus reportes.",
              "PIN de caja y bloqueo por inactividad, para que nadie cobre con la sesión de otro.",
              "Bitácora de cambios de precio, descuentos, cancelaciones y accesos.",
            ]}
          />

          <Seccion
            icon={QrCode}
            titulo="Tu menú en el celular del cliente"
            entrada="Un código QR en la mesa y listo."
            puntos={[
              "Publicas tu carta con un clic y el sistema te da el QR listo para imprimir.",
              "Cambias un precio y el menú se actualiza solo: el QR impreso nunca se reemplaza.",
              "Muestra lo que verían en una carta; tus costos y tus ventas nunca salen de ahí.",
            ]}
          />

          <Seccion
            icon={Store}
            titulo="¿Más de una sucursal?"
            entrada="Cada cafetería con su menú, sus precios, su caja y su equipo."
            puntos={[
              "Los números de una nunca se mezclan con los de otra.",
              "Si administras varias, cambias entre ellas desde el mismo usuario.",
              "Cada sucursal con su zona horaria, para que el corte del día cierre a la hora correcta.",
            ]}
          />
        </div>

        {/* Requisitos */}
        <section className="mt-12 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
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
              <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" />
              <p className="text-sm text-stone-600">
                <strong className="text-stone-800">Tus datos, respaldados.</strong> Copia de seguridad diaria y cifrada,
                sin que tengas que hacer nada.
              </p>
            </div>
          </div>
        </section>

        {/* Cierre */}
        <section className="mt-12 rounded-2xl bg-amber-700 px-6 py-10 text-center sm:px-8">
          <h2 className="text-2xl font-bold text-white">¿Tienes una cafetería y quieres probarlo?</h2>
          <p className="mx-auto mt-3 max-w-xl text-amber-50">
            Estamos trabajando de la mano con unas cuantas cafeterías para afinarlo. Si te interesa entrar, escríbenos
            y lo dejamos listo con tu menú y tus precios.
          </p>
          <a
            href={`mailto:${CONTACTO}?subject=Quiero%20probar%20Cafecito%20POS`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-amber-800 hover:bg-amber-50"
          >
            <Mail className="h-4 w-4" />
            {CONTACTO}
          </a>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-stone-500 sm:flex-row">
          <p>Cafecito POS · Hecho en México para cafeterías</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-amber-700">
              Entrar
            </Link>
            <Link href="/ayuda" className="hover:text-amber-700">
              Guía de uso
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
