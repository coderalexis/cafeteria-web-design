"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowUpRight,
  AArrowUp,
  Ban,
  BookOpen,
  CalendarClock,
  ChefHat,
  Cloud,
  Coffee,
  Hand,
  GraduationCap,
  Keyboard,
  Lock,
  PauseCircle,
  PackagePlus,
  Percent,
  Printer,
  Receipt,
  Search,
  Settings,
  SlidersHorizontal,
  Stamp,
  Smartphone,
  Store,
  Unlock,
  Users,
  Wallet,
  X,
  HandCoins,
} from "lucide-react"
import { POS_SHORTCUTS } from "@/app/pos/shortcuts"
import { TRIAL_DAYS } from "@/lib/signup"
import { GRACIA_HORAS, HORAS_SIN_HORARIO } from "@/lib/cash-session"
import { DemoDiferencia, DemoEfectivo, DemoGestos, DemoPOS, DemoPropina, DemoQR, TicketImpreso, DemoCuenta } from "./demos"

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

/**
 * Palabras que el buscador ignora: artículos, preposiciones y el verbo «ser /
 * estar». No dicen nada de lo que la persona busca, pero si se exigen tumban
 * la búsqueda entera —«dónde están las categorías» no encontraba nada por el
 * «están» y el «las»—. Los interrogativos NO están aquí a propósito: «dónde»
 * y «cómo» sí dicen algo, y las secciones los usan como pistas.
 */
const RELLENO = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  "de", "del", "al", "a", "en", "con", "por", "para", "sin",
  "y", "o", "u", "que", "se", "mi", "mis", "tu", "tus", "lo",
  "es", "son", "esta", "estan", "está", "están", "hay", "esto", "eso",
])

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
            El <strong>ojito</strong> del campo de contraseña la muestra para revisar que la escribiste bien antes de
            entrar. Empieza oculta y se vuelve a ocultar cada vez que se carga la pantalla.
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
      palabras:
        "caja fondo abrir pedido carrito tamanos vendidos buscar nota comanda whatsapp compartir folio repetir cantidad para llevar mas opciones descuento extras leche opcion por omision aviso celular",
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
              Toca un producto para agregarlo; si tiene tamaños, elige uno. Si tiene extras (tipo de leche, shots), te
              los pregunta ahí mismo, y siempre puedes cambiarlos después tocando <strong>cambiar</strong> en la línea
              del carrito. El icono <SlidersHorizontal className="inline h-3.5 w-3.5 align-text-bottom" /> marca los
              productos que tienen opciones. En Negocio → Módulos del POS puedes pedir que solo se pregunte lo
              obligatorio, y en Menú → Modificadores dejar una opción por omisión (leche deslactosada, por ejemplo) para
              no contestar siempre lo mismo. Puedes buscar por nombre, y en la pestaña <strong>Todos</strong> aparece{" "}
              <strong>Más vendidos</strong>: lo del último mes, a un toque.
            </Step>
          </ol>
          <DemoPOS />
          <ol className="mt-4 space-y-3">
            <Step n={3} title="Ajusta cantidades y notas">
              Con <strong>+ / −</strong> cambias la cantidad (y tocándola la tecleas: 12 conchas sin doce toques). Cada
              línea tiene su menú <strong>⋯</strong> con duplicar, nota del artículo («sin azúcar») y quitar — o usa
              los <strong>gestos</strong> de la siguiente sección, que es más rápido. Abajo van método de pago,
              efectivo y propina; lo ocasional (<strong>Para llevar / Aquí</strong>, la nota del ticket y el descuento)
              vive plegado en <strong>Más opciones</strong> — al cerrarse, el botón resume lo que trae puesto, y si lo
              dejas abierto se queda así en ese aparato. Si tu café cobra extra por <strong>Para llevar</strong>, el
              chip muestra el monto («Para llevar +$5») y se suma solo al total.
            </Step>
            <Step n={4} title="Elige método de pago y cobra">
              Efectivo, Transferencia o Tarjeta. Si el cliente deja <strong>propina</strong>, tócala antes de cobrar.
              Pulsa <strong>Cobrar</strong>: aparece el ticket registrado con su <strong>folio</strong>; desde ahí
              imprimes el <strong>Ticket</strong> para el cliente y la <strong>Comanda</strong> (sin precios) para quien
              prepara. <strong>Compartir ticket</strong> lo manda por WhatsApp — útil si no hay impresora. En{" "}
              <strong>celular</strong>, si no imprimes en automático ni usas la nota QR, en vez del ticket sale un{" "}
              <strong>aviso</strong> con folio, monto, método y cambio, y sigues vendiendo; <strong>Ver ticket</strong>{" "}
              lo abre si lo necesitas.
            </Step>
            <Step n={5} title="Atajos del carrito">
              Tocando las <strong>opciones</strong> de una línea (el renglón «+ leche de avena») las cambias sin
              rearmarla. Con el carrito vacío aparece <strong>Repetir última venta</strong>, y el detalle completo de
              cualquier línea está a un toque — mira la sección de gestos aquí abajo.
            </Step>
            <Step n={6} title="Si te equivocaste antes de cobrar">
              <strong>−</strong> en una línea de cantidad 1 la quita; también puedes deslizarla a la izquierda, usar su
              menú <strong>⋯</strong>, o <strong>Vaciar</strong> para empezar de cero. Si recargas la página por
              accidente, la venta en curso se restaura sola.
            </Step>
          </ol>
          <TicketImpreso lineas={ticket} titulo="Un ticket de este sistema, tal cual sale de la impresora" />
        </>
      ),
    },
    {
      id: "practica",
      grupo: "cajero",
      icon: GraduationCap,
      titulo: "Practicar sin registrar (modo práctica)",
      palabras: "practica practicar ensayar aprender probar sin registrar sin miedo modo practica franja violeta",
      href: "/pos",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Para aprender el POS tocando, sin miedo a ensuciar las ventas reales: menú <strong>⋮</strong> →{" "}
            <strong>Practicar sin registrar</strong> (en celular, también desde el botón <strong>Practicar</strong> de
            la tarjeta de la primera vez). Solo entra con el carrito vacío y sin una cuenta abierta.
          </li>
          <li>
            Mientras dura, una <strong>franja violeta</strong> arriba dice «Modo práctica. Nada se registra». Puedes
            armar pedidos y <strong>cobrar sin abrir la caja</strong>; cada cobro responde con el mismo aviso que una
            venta real, marcado como práctica.
          </li>
          <li>
            <strong>Nada viaja al servidor</strong>: ni ticket, ni folio, ni cola sin internet, ni sellos de lealtad;
            las cuentas abiertas se ocultan mientras practicas. El total del día no se mueve.
          </li>
          <li>
            Sales con <strong>Salir</strong> en la franja (o desde ⋮). Al salir el carrito se vacía, para que lo que
            armaste practicando no pueda cobrarse de verdad un toque después. Si recargas la página, el modo práctica
            se apaga solo.
          </li>
        </ul>
      ),
    },
    {
      id: "gestos",
      grupo: "cajero",
      icon: Hand,
      titulo: "La línea del carrito: toca, desliza, mantén",
      palabras:
        "gestos deslizar arrastrar duplicar quitar eliminar mantener presionado nota detalle ventana tocar linea articulo tres puntos",
      href: "/pos",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            Cada línea del carrito responde a la mano, para no andar cazando iconos con fila de clientes. Todo esto
            también está en el menú <strong>⋯</strong> de la línea — los gestos son el atajo, no el único camino.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Tócala</strong> y se abre su <strong>ventana de detalle</strong>: nombre completo (sin
              recortes), descripción, opciones con su precio, nota, cantidad y el total de esa línea. Útil cuando el
              nombre es largo y en la fila se lee cortado.
            </li>
            <li>
              <strong>Deslízala a la derecha</strong> → <span className="font-semibold text-emerald-700">duplica</span>{" "}
              («otro igual»). <strong>A la izquierda</strong> →{" "}
              <span className="font-semibold text-red-600">la quita</span>. Es un tirón franco, no un roce: un dedazo a
              medias no hace nada.
            </li>
            <li>
              <strong>Mantenla presionada</strong> medio segundo (vibra como aviso), suelta, y se abre la{" "}
              <strong>nota del artículo</strong> con el teclado listo. Escribes «sin azúcar», tocas cualquier espacio
              libre, y quedó.
            </li>
          </ul>
          <DemoGestos />
          <p className="mt-3 text-xs text-stone-400">
            Ejemplos rápidos: piden «otro latte igual» → desliza a la derecha. «Mejor sin el pan» → desliza esa línea a
            la izquierda. «El mío sin azúcar» → mantén presionado y escribe. «¿Este cuánto era?» → tócala y ves sus
            cuentas.
          </p>
        </>
      ),
    },
    {
      id: "sin-internet",
      grupo: "cajero",
      icon: Cloud,
      titulo: "Si se cae el internet",
      palabras:
        "sin internet offline conexion cola ventas pendientes subir provisional se cayo la senal wifi datos guardadas",
      href: "/pos",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            <strong>Sigue cobrando.</strong> Si se cae la señal a media fila, el POS guarda cada venta en la tablet y
            las sube solas en cuanto vuelve el internet. No hay que apuntar en papel ni pedirle al cliente que espere.
          </p>
          <ol className="mt-3 space-y-3">
            <Step n={1} title="Cobras igual que siempre">
              Arriba aparece una franja roja avisando que no hay internet. Cobras normal y, en vez del folio, la venta
              recibe un <strong>número provisional</strong> (P-1, P-2…). El ticket que imprimas lleva ese número.
            </Step>
            <Step n={2} title="Una franja te dice cuántas faltan">
              «3 ventas sin subir». No se puede quitar a propósito: mientras esté ahí, hay dinero cobrado que el
              sistema todavía no tiene registrado.
            </Step>
            <Step n={3} title="Al volver la señal, se suben solas">
              En orden, una por una, y cada venta queda con la <strong>hora en que la cobraste</strong>, no la de la
              subida — así tus reportes por hora siguen siendo verdad. Ya con su folio real, la puedes reimprimir desde
              Tickets.
            </Step>
          </ol>
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              <strong>No puedes cerrar la caja con ventas sin subir.</strong> El botón se bloquea: si cortaras ahora,
              esas ventas entrarían al turno siguiente y tu corte no cuadraría con el efectivo del cajón.
            </li>
            <li>
              <strong>Si cambiaste un precio</strong> mientras había ventas esperando, el sistema te avisa cuál se
              registró distinta a lo que cobraste («cobraste $85 y se registró $87»). No lo corrige solo: te lo enseña
              para que lo tomes en cuenta al cuadrar.
            </li>
            <li>
              <strong>Si un producto se desactivó</strong> mientras la venta esperaba, esa venta queda marcada
              «necesita tu revisión» —con lo que cobraste, para no perder el dato— y <em>no</em> detiene a las demás.
              La cobras de nuevo desde el POS y la quitas de la lista.
            </li>
            <li>
              <strong>Tope de 30 ventas.</strong> Después de eso el POS se niega a seguir capturando a ciegas: es
              momento de recuperar la señal (mover la tablet, prender el celular como módem).
            </li>
            <li>
              <strong>Lo que NO se puede sin internet</strong>: abrir o cerrar la caja, cancelar una venta, canjear un
              premio de lealtad, ni entrar al panel de administración. Y si <em>cierras la app</em> sin señal, no se
              podrá abrir de nuevo hasta que vuelva (las ventas ya guardadas no se pierden: siguen ahí esperando).
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "espera",
      grupo: "cajero",
      icon: PauseCircle,
      titulo: "Cuentas abiertas",
      palabras:
        "cuenta cuentas abrir mesa mesas guardar pausar retomar bandeja indeciso fila pendiente cobrar al final comer trae la cuenta fiado debe deuda por cobrar sin pagar condonar",
      href: "/pos",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            Para cuando el cliente pide, se sienta, y paga hasta el final. Abres una cuenta a su nombre, le vas
            sumando lo que pida, y la cobras cuando pida la cuenta. Nadie paga nada mientras tanto.
          </p>
          <ol className="mt-3 space-y-3">
            <Step n={1} title="Abre la cuenta">
              Con artículos en el carrito, toca <strong>Cuenta</strong> —en el celular está en la barra de abajo,
              junto a Cobrar; en tablet o computadora, arriba del carrito—. Ponle nombre con los botones
              rápidos (<em>Mesa 1</em>, <em>Barra</em>…) o escríbelo (<em>«Sra. suéter rojo»</em>). Si lo dejas vacío
              se llama con la hora. El carrito queda libre para atender al siguiente. Las mesas que ya tienen cuenta
              <strong> salen primero</strong>, para no buscarlas entre las vacías.
            </Step>
            <Step n={2} title="Súmale las rondas que pidan">
              Cada cuenta abierta aparece como un <strong>chip arriba de los productos</strong>, con su total. Toca{" "}
              <strong>Mesa 1</strong>, agrega lo nuevo y toca <strong>Guardar</strong> — en el celular el botón está
              en la barra de abajo, y <em>el nombre ya no hay que volver a escribirlo</em>. Arriba del carrito verás
              en todo momento de qué mesa es lo que estás anotando.
            </Step>
            <Step n={3} title="«¿Me trae la cuenta?»">
              En <strong>Cuentas</strong>, toca la mesa y luego <strong>Ver la cuenta</strong>: sale el desglose con
              precios y total para enseñárselo, imprimirlo o mandarlo por WhatsApp. Dice{" "}
              <em>«pendiente de pago»</em> porque todavía no es un ticket.
            </Step>
            <Step n={4} title="Cóbrala">
              Ábrela otra vez y cobra como siempre, con su método de pago y su propina. Ahí se genera el ticket con
              folio, se cierra la cuenta y sale de la lista.
            </Step>
          </ol>
          <DemoCuenta />
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Repetir el nombre no duplica: suma.</strong> Si tocas «Abrir cuenta» y eliges una mesa que ya
              tiene cuenta (el chip se marca con <strong>+</strong>), lo del carrito <em>se le agrega</em> a esa
              cuenta en vez de crear otra igual.
            </li>
            <li>
              Las cuentas son <strong>de la cafetería</strong>, no del aparato: puedes tomar el pedido en el celular y
              cobrarlo en la tablet. La venta se registra a nombre de quien cobra.
            </li>
            <li>
              La hora que ves («abierta hace 40 min») cuenta desde que llegó la mesa, no desde la última ronda: sirve
              para saber quién lleva mucho esperando.
            </li>
            <li>
              Si dos personas le agregan a la misma mesa desde aparatos distintos, <strong>no se pierde nada</strong>:
              lo segundo se guarda aparte como <em>«Mesa 1 (2)»</em> y te avisa que las juntes antes de cobrar.
            </li>
            <li>
              <strong>Se puede pagar días después.</strong> Alguien pide un café el viernes en la noche, se va a
              entrenar y regresa el martes: su cuenta sigue ahí. Las que llevan más de 8 horas se marcan en ámbar y
              se te nombran al cerrar la caja, para que no se te pasen. Se borran solas después de una semana.
            </li>
            <li>
              <strong>Si se fue sin pagar</strong>, ábrela y toca <strong>«Se fue sin pagar»</strong>. Anota su
              teléfono si lo tienes. La cuenta pasa a la sección <strong>Por cobrar</strong>: deja de estorbar la
              lista del día, <em>ya no caduca nunca</em>, y aparece en <strong>Tu dinero → Por cobrar</strong> con
              lo que te deben en total. Ahí <strong>no se registra ninguna venta</strong>: eso pasa el día que te
              pague. Cuando vuelva, la abres desde <strong>Cuentas → Por cobrar</strong> y la cobras normal.
            </li>
            <li>
              La venta se registra <strong>el día que cobras</strong>, no el día que serviste. Si el café del viernes
              se paga el martes, entra en las ventas del martes — es cuando entró el dinero a la caja.
            </li>
            <li>
              Si <strong>desactivaste del menú</strong> algo que estaba en una cuenta, no se puede cobrar (el sistema
              nunca cobra precios de productos que ya no existen). Te dice cuántos artículos son; reactívalos en{" "}
              <strong>Menú → Productos</strong> y la cuenta vuelve a cobrarse completa.
            </li>
            <li>
              Cerrar la caja con cuentas abiertas <strong>no</strong> afecta el corte: no son ventas. El sistema te
              avisa que se quedan para el siguiente turno.
            </li>
            <li>
              <strong>Los botones son tuyos.</strong> En <strong>Datos y ajustes → Módulos del POS</strong> dices
              cuántas mesas tienes (salen como <em>Mesa 1…N</em>) y agregas los que quieras —{" "}
              <em>Barra, Terraza, Para llevar</em>—. Si pones <strong>0 mesas</strong> no sale ninguna: es para
              quien anota por nombre de la persona.
            </li>
            <li>
              Viene <strong>encendido</strong> en toda cafetería. ¿No lo usas? El dueño lo apaga en{" "}
              <strong>Datos y ajustes → Módulos del POS</strong> y los botones desaparecen del POS; lo guardado no se
              borra, vuelve a aparecer si lo enciendes otra vez.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "preparar",
      grupo: "cajero",
      icon: ChefHat,
      titulo: "Por preparar: la comanda en pantalla",
      palabras:
        "comanda cocina barra preparar pendientes impresora termica sin impresora pantalla listo marcar ultimos pedidos consultar que pidio",
      href: "/pos/preparar",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            Si atiendes tú solo y no tienes impresora térmica, esta pantalla es tu comanda. Abre el menú{" "}
            <strong>⋮ → Por preparar</strong>: sale en otra pestaña, para dejarla puesta en una tablet, en el
            celular viejo, o en la misma pantalla en otra ventana.
          </p>
          <ol className="mt-3 space-y-3">
            <Step n={1} title="Muestra lo que falta hacer">
              Cada pedido cobrado aparece con su folio, la hora, si es <em>para llevar</em>, y qué lleva:
              cantidades, tamaños, opciones y las notas en mayúsculas. <strong>Cero precios</strong>: aquí no se
              cobra, se prepara.
            </Step>
            <Step n={2} title="Marca «Listo» y desaparece">
              Al marcarlo se va de la lista. Lo importante: eso se guarda <strong>en el servidor</strong>, no en el
              aparato — si marcas desde la tablet, también se quita del celular. Dos personas nunca preparan lo
              mismo.
            </Step>
            <Step n={3} title="Se actualiza sola, al ritmo que tú elijas">
              Pregunta por pedidos nuevos cada pocos segundos: <strong>4</strong> con la pantalla a la vista y{" "}
              <strong>30</strong> cuando queda en segundo plano (para no gastar batería ni datos). Los dos números
              se cambian en <strong>Datos y ajustes → Módulos del POS</strong>: una barra con fila puede querer 2
              segundos, y un café con datos móviles caros, 10. Si se corta el internet te avisa{" "}
              <em>«Sin contacto desde hace N segundos»</em>, para que no te quedes viendo una pantalla congelada
              creyendo que no hay pedidos — y ese aviso se ajusta solo al ritmo que pongas.
            </Step>
          </ol>
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              Salen <strong>las dos cosas</strong>: los pedidos ya cobrados (con su folio) y las{" "}
              <strong>cuentas abiertas</strong> que todavía no se cobran, marcadas como tales y con el nombre de la
              mesa en vez de folio. En una cafetería con mesas se sirve antes de cobrar, así que eso último es
              justamente lo que falta hacer.
            </li>
            <li>
              Cuando una mesa pide <strong>otra ronda</strong>, su tarjeta vuelve a aparecer con{" "}
              <em>solo lo nuevo</em> — nunca con lo que ya serviste. Si pidió otro café igual, verás solo el que
              falta.
            </li>
            <li>
              ¿Solo quieres consultar qué se pidió hace rato? <strong>⋮ → Últimos pedidos</strong> muestra los 10
              más recientes con su detalle. Es <em>de solo lectura</em>: ahí no se marca nada, para que no haya dos
              lugares donde equivocarse.
            </li>
            <li>Se filtra por tu día de operación y las ventas canceladas no aparecen.</li>
          </ul>
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
              Con <strong>Efectivo</strong> aparece el campo <strong>Recibido</strong>. Toca{" "}
              <strong>«Teclado y montos rápidos»</strong> y se abre en grande, con teclas de dedo: los billetes se{" "}
              <strong>calculan según el total</strong> (para una cuenta de $87 ofrece $90, $100 y $200) y{" "}
              <strong>Exacto</strong> pone el importe justo. El sistema calcula el <strong>cambio</strong> mientras
              tecleas; si no alcanza, no deja cobrar. Con teclado físico puedes escribir directo en el campo (atajo{" "}
              <strong>F4</strong>).
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
              reportes. El dueño puede poner un <strong>tope para caja</strong> (por ejemplo, hasta 10 %): si necesitas
              más, lo aplica un administrador.
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
            Menú <strong>⋮</strong> (arriba a la derecha) → <strong>Tickets del día</strong>: lista las ventas del
            turno. Cada una tiene{" "}
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
      id: "sellos",
      grupo: "cajero",
      icon: Stamp,
      titulo: "Tarjeta de sellos (lealtad)",
      palabras: "lealtad sellos tarjeta cliente telefono premio canjear gratis fidelidad puntos",
      href: "/pos",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            La tarjetita de «junta 10 y el siguiente va gratis», sin cartón: el cliente da su{" "}
            <strong>teléfono</strong> y sus sellos se guardan solos. Aparece únicamente si el dueño activó el módulo.
          </p>
          <ol className="mt-3 space-y-3">
            <Step n={1} title="Pide el número">
              En el carrito toca <strong>Tarjeta de sellos</strong>, escribe el teléfono (10 dígitos) y{" "}
              <strong>Buscar</strong>. Si es nuevo, se registra ahí mismo — el nombre es opcional. Queda un gafete en
              la venta: «Lupita · 7/10».
            </Step>
            <Step n={2} title="Cobra normal">
              El sello se registra solo al cobrar, uno por visita. El ticket impreso lleva su avance («Sellos: 8 de
              10») y el sistema te avisa cuando alguien completa.
            </Step>
            <Step n={3} title="Canjea el premio">
              Cuando el gafete diga que hay premio, toca <strong>Canjear premio</strong> y elige{" "}
              <strong>qué artículo sale gratis</strong> (una unidad). Se aplica como descuento con motivo «Premio de
              lealtad» y los sellos vuelven a empezar. La visita del canje no gana sello.
            </Step>
          </ol>
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              El canje <strong>no pasa por tu tope de descuento</strong>: lo autorizan los sellos. Pero el sistema no
              deja que el premio valga más que el artículo más caro del ticket.
            </li>
            <li>
              Si cancelas una venta con sello, el sello se devuelve; si cancelas un canje, los sellos regresan.
            </li>
            <li>
              ¿Sello olvidado o error? Un administrador lo corrige en <strong>Lealtad</strong> (panel), con motivo y
              registro en Actividad.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "corte",
      grupo: "cajero",
      icon: Lock,
      titulo: "Cerrar el turno (corte de caja)",
      palabras:
        "corte cierre cerrar cierro efectivo dinero caja esperado contado diferencia cuadre sobrante faltante entrada salida movimiento propinas olvidar caja abierta automatico sin arqueo hora de cierre",
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">¿Y si un día se me olvida cerrarla?</p>
            <p className="mt-1">
              El sistema la cierra solo. No es un premio: se cierra <strong>sin arqueo</strong> —nadie contó el
              efectivo—, el corte queda marcado como «cierre automático» y esa diferencia ya no se puede recuperar.
              Sirve para que al día siguiente puedas abrir tu caja con su fondo y que el arqueo no arrastre las ventas
              de dos días.
            </p>
            <p className="mt-1">
              Cuándo se cierra: <strong>{GRACIA_HORAS} horas después de tu hora de cierre</strong>, la que hayas puesto
              en Negocio. Si no la has puesto, a las <strong>{HORAS_SIN_HORARIO} horas</strong> de abierta. Configúrala:
              así el corte automático cae cuando de verdad cierras y no a media tarde.
            </p>
            <p className="mt-1">
              Mientras siga abierta de un día anterior, el botón de la caja se pone <strong>ámbar</strong> y te dice
              desde cuándo, en vez de verde.
            </p>
          </div>
          <TicketImpreso lineas={corte} titulo="Un corte de este sistema, tal cual se imprime" />
        </>
      ),
    },
    {
      id: "movil",
      grupo: "cajero",
      icon: Smartphone,
      titulo: "En tablet o celular",
      palabras:
        "instalar app pantalla inicio android ipad iphone barra inferior cobrar directo rendija minimizar celular buscador lupa primera vez tarjeta arranque practicar aviso folio ver ticket",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            <strong>La primera vez en un celular</strong> aparece una tarjeta con los dos pasos de una venta (toca el
            producto, toca Cobrar) y tres botones: <strong>Practicar sin registrar</strong>, <strong>Ver la guía</strong>{" "}
            y <strong>Entendido</strong>. Se va con un toque y no vuelve a salir en ese aparato.
          </li>
          <li>
            En celular el carrito vive en la <strong>barra inferior</strong>, partida en dos: la izquierda muestra los
            artículos (y anuncia lo recién agregado: «+ Latte · Grande $50», con una vibración) y la derecha es{" "}
            <strong>Cobrar directo</strong> — la venta común de «dos cosas y ya» sale sin abrir el carrito. En
            pantallas grandes el carrito va como columna a la derecha.
          </li>
          <li>
            <strong>Ejemplo completo en celular</strong>: toca Espresso → toca Chico → el punto vuela al carrito y la
            barra dice qué entró → toca <strong>Cobrar</strong>. Dos artículos en efectivo exacto son{" "}
            <strong>tres toques</strong>. Al cobrar no se abre el ticket: sale un <strong>aviso</strong> con el folio,
            el monto y el cambio, y ya puedes seguir con el siguiente cliente (<strong>Ver ticket</strong> lo abre si
            hace falta). Si tu café imprime en automático o usa la nota QR, el ticket sí aparece, como en tablet.
          </li>
          <li>
            Al abrir el carrito queda una <strong>rendija</strong> arriba: tócala para minimizarlo (también está la{" "}
            <strong>X</strong> ámbar). Y al bajar por los productos, el encabezado <strong>se encoge</strong> para dar
            espacio — la <strong>lupa</strong> reabre el buscador.
          </li>
          <li>
            En cualquier tamaño, a la vista arriba queda solo el <strong>estado de la caja</strong>; lo demás (Tickets,
            Últimos pedidos, Por preparar, tamaño de letra, atajos, <strong>Practicar sin registrar</strong>, Instalar
            como app, Administrar, Mi cuenta, cerrar sesión) está en el menú <strong>⋮</strong> de la derecha. Así el
            encabezado no le tapa el nombre ni el total del día.
          </li>
          <li>
            <strong>Instalar como app</strong>: abre a pantalla completa con su propio ícono, sin barra de direcciones.
            En Android/Chrome el POS te lo ofrece solo (en la tarjeta de la primera vez y en <strong>⋮ → Instalar como
            app</strong>). En iPhone o iPad: <strong>Compartir → Agregar a pantalla de inicio</strong>. Sigue
            necesitando internet.
          </li>
        </ul>
      ),
    },
    {
      id: "letra",
      grupo: "cajero",
      icon: AArrowUp,
      titulo: "Tamaño de letra",
      palabras: "letra tamano texto grande chico compacto vista ver mejor tablet zoom acercar accesibilidad panel administracion",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            En el punto de venta, menú <strong>⋮</strong> arriba a la derecha → <strong>Tamaño de letra</strong>, con{" "}
            <strong>A−</strong> y <strong>A+</strong>. Van entre cinco tamaños: Muy compacto, Compacto, Normal, Grande
            y Muy grande.
            El menú <strong>no se cierra</strong> mientras ajustas, para que puedas probar uno y otro.
          </li>
          <li>
            <strong>También en la administración</strong>: abajo a la izquierda, toca tu nombre y ahí están los mismos{" "}
            <strong>A−</strong> y <strong>A+</strong>. Es la <strong>misma preferencia</strong> que el punto de venta:
            si agrandas la letra en la tablet del mostrador, el panel de esa tablet también la agranda. La ajustas por
            tus ojos, no por la sección donde estés.
          </li>
          <li>
            Los productos con una <strong>«i»</strong> en la esquina traen descripción: tócala y se abre lo que lleva,
            sus precios por tamaño y las opciones que se le pueden pedir. Sirve para contestar «¿qué trae?» sin buscar
            la carta. <strong>No agrega nada al carrito</strong>; es solo de consulta.
          </li>
          <li>
            El teclado para el efectivo recibido está en <strong>«Teclado y montos rápidos»</strong>, dentro del
            recuadro verde: se abre en grande, con Exacto y los billetes más comunes. Si escribes con teclado, el
            campo Recibido sigue ahí (atajo <strong>F4</strong>).
          </li>
          <li>
            <strong>Compacto</strong> y <strong>Muy compacto</strong> encogen todo —letra, botones y espacios— para
            que quepan más productos y más
            renglones del carrito. Útil en tablets acostadas, que son anchas pero bajitas.
          </li>
          <li>
            <strong>Grande</strong> y <strong>Muy grande</strong> son para quien no alcanza a leer bien de lejos o con
            poca luz.
          </li>
          <li>
            Se recuerda <strong>en ese dispositivo</strong>, no en tu cuenta: la tablet del mostrador puede estar en
            Compacto y la computadora del dueño en Normal.
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
      id: "admin-orientacion",
      grupo: "admin",
      icon: Settings,
      titulo: "Cómo está organizado el panel",
      palabras:
        "menu lateral secciones donde esta como llego navegar perdido no encuentro tu menu tu dinero tu negocio resumen cuenta salir guia",
      href: "/admin",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            El menú de la izquierda está agrupado por lo que quieres hacer, no por el nombre de la pantalla. En el
            teléfono es el mismo menú, detrás del botón ☰ de arriba.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Resumen</strong>: cómo va el día, comparado con ayer y con el mismo día de la semana pasada. Es
              lo primero que ves al entrar.
            </li>
            <li>
              <strong>Tu menú</strong> — lo que vendes: <strong>Categorías</strong> (las pestañas del POS),{" "}
              <strong>Productos</strong> (con sus precios) y <strong>Opciones y extras</strong> (las preguntas que el
              POS le hace al cajero: tipo de leche, extras…).
            </li>
            <li>
              <strong>Tu dinero</strong> — lo que entró: <strong>Ventas</strong> (cada ticket, para reimprimir o
              cancelar), <strong>Cortes de caja</strong> (los turnos, esperado contra contado),{" "}
              <strong>Por cobrar</strong> (quién se fue sin pagar y cuánto debe) y <strong>Análisis</strong>{" "}
              (patrones, márgenes, qué se vende junto).
            </li>
            <li>
              <strong>Tu negocio</strong> — cómo opera: <strong>Equipo</strong>, <strong>Lealtad</strong>,{" "}
              <strong>Actividad</strong> (quién cambió qué) y <strong>Datos y ajustes</strong>.
            </li>
          </ul>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li>
              Esta <strong>guía</strong> está arriba del todo, junto al nombre de tu cafetería. Se abre en otra
              pestaña, para que no pierdas lo que estabas haciendo.
            </li>
            <li>
              Abajo, tu <strong>nombre</strong> abre lo tuyo: el <strong>tamaño de letra</strong>, <em>Mi cuenta</em>{" "}
              (para cambiar tu contraseña) y <em>Cerrar sesión</em>.
            </li>
            <li>
              Si perteneces a <strong>más de una cafetería</strong>, arriba aparece el selector para cambiarte. Lo que
              veas y edites siempre es de la cafetería activa.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "admin-menu",
      grupo: "admin",
      icon: Coffee,
      titulo: "Menú: categorías, productos y precios",
      palabras: "categorias colores variantes tamanos costo margen precios lote orden desactivar sin precio no aparece nota carta publica",
      href: "/admin/productos",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            <strong>Categorías</strong>: son las pestañas del POS. La pantalla es una lista; <strong>toca una</strong>{" "}
            para editarla y <strong>Nueva categoría</strong> para agregar. De cada una puedes cambiar su nombre, su{" "}
            <strong>color</strong> —que pinta su pestaña y una franja en sus productos, para ubicarlos más rápido— y
            una <strong>nota</strong> que sale bajo el título en la carta del QR («Incluyen café del día y fruta»).
          </li>
          <li>
            Solo se borra una categoría <strong>sin productos</strong>; si tiene, la pantalla te dice cuántos hay que
            mover o quitar primero. Las categorías nuevas se agregan <strong>al final</strong> de las pestañas del POS;
            acomódalas con las flechas ↑↓.
          </li>
          <li>
            <strong>Productos</strong>: cada uno tiene una o más <strong>variantes</strong> (tamaños con precio). Un
            producto con una sola variante llamada <code>Único</code> se vende con un toque. Desde el editor puedes
            ocultar del POS un producto o una variante (<em>Desactivar</em>).
          </li>
          <li>
            <strong>Descripción</strong>: hace dos cosas según cuántos productos la compartan. Si es de{" "}
            <strong>un solo producto</strong> (sus ingredientes), sale como subtítulo en su tarjeta y detrás de la{" "}
            <strong>«i»</strong> del POS. Si <strong>varios de la misma categoría</strong> tienen exactamente la misma,
            el POS la usa como <strong>subtítulo de sección</strong> para agruparlos («Frappé a base de leche» contra
            «a base de agua»). Si ves un encabezado raro en el POS, casi siempre es una descripción repetida que
            conviene borrar o corregir.
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
          <li>
            Un producto <strong>sin ningún precio activo</strong> (todas sus variantes borradas o desactivadas){" "}
            <strong>no aparece en el punto de venta</strong> — sin precio no hay nada que cobrar. El editor te lo avisa
            en ese producto; activa o agrega una variante para volver a venderlo.
          </li>
        </ul>
      ),
    },
    {
      id: "admin-paquetes",
      grupo: "admin",
      icon: PackagePlus,
      titulo: "Armar tu carta con paquetes",
      palabras: "paquete plantilla menu inicial arrancar productos ejemplo cafe frappes panaderia crear carta",
      nodo: (
        <>
          <ul className="space-y-2 text-sm text-stone-600">
            <li>
              La primera vez que entras, el panel te pide <strong>elegir qué vendes</strong>: café espresso, bebidas con
              leche, frappés, tés, bebidas frías, panadería, comida, crepas y personalizaciones. Marca los que te sirvan
              y se agregan con precios de referencia.
            </li>
            <li>
              Después puedes agregar más desde <strong>Productos → Agregar paquete</strong>. Sirve cuando el negocio
              crece: metes «Frappés» cuando llega el calor sin tocar lo que ya tenías.
            </li>
            <li>
              <strong>No duplica.</strong> Si un producto con ese nombre ya está en la categoría, se lo salta; si la
              categoría ya existe, mete los productos ahí en vez de crear otra.
            </li>
            <li>
              Los precios son un punto de partida, no una recomendación. Cámbialos en <strong>Productos</strong> (o
              varios de un jalón con <strong>Precios en lote</strong>) y borra lo que no vendas.
            </li>
            <li>
              ¿Quieres una carta completa de golpe? En la pantalla de arranque está{" "}
              <strong>«Copiar el menú de ejemplo completo»</strong>, que solo funciona con la carta vacía para no
              duplicarte todo.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "admin-modificadores",
      grupo: "admin",
      icon: SlidersHorizontal,
      titulo: "Opciones y extras (al vender)",
      palabras:
        "leche extras opciones grupos modificadores minimo maximo precio adicional obligatorio elegir cuantas productos vincular asignar opcion por omision deslactosada preguntar al tocar solo obligatorios en que productos va no aparece en el pos",
      href: "/admin/modificadores",
      nodo: (
        <>
          <ul className="space-y-2 text-sm text-stone-600">
            <li>
              Un <strong>grupo</strong> es una pregunta que el POS le hace al cajero al vender un producto: «¿tipo de
              leche?», «¿con pollo o con huevo?». Cada respuesta es una <strong>opción</strong>, y puede costar extra
              («Leche de avena +$12») o no costar nada («Estrellado»).
            </li>
            <li>
              Se arma en tres pasos: <strong>1)</strong> creas el grupo y dices cuántas puede elegir el cajero,{" "}
              <strong>2)</strong> le agregas sus opciones con su precio, <strong>3)</strong> dices{" "}
              <strong>en qué productos va</strong>. Hasta el paso 3 no aparece en el POS —es el olvido más común, y por
              eso el grupo te avisa con un botón que dice <em>«Elegir en qué productos va»</em> mientras no tenga
              ninguno.
            </li>
            <li>
              El paso 3 se puede hacer <strong>desde los dos lados</strong>, el que te quede más a la mano:
              <ul className="mt-1.5 ml-4 list-disc space-y-1">
                <li>
                  Desde <strong>Opciones y extras</strong>, con ese botón: se abre la lista de todo tu menú por
                  categoría, con buscador, y marcas todos los productos de un jalón. Conviene cuando un mismo extra va
                  en varios («esto va en chilaquiles y en enchiladas»).
                </li>
                <li>
                  Desde <strong>Productos</strong>, entrando a un producto y marcando qué grupos le aplican. Conviene
                  cuando estás armando ese producto en particular.
                </li>
              </ul>
              Es la misma información vista al revés, así que da igual por dónde lo hagas.
            </li>
          </ul>

          <p className="mt-4 text-sm font-medium text-stone-700">Cuál elegir, según lo que quieras</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
                  <th className="py-2 pr-3 font-medium">Lo que quieres</th>
                  <th className="py-2 pr-3 font-medium">Eliges</th>
                  <th className="py-2 font-medium">El cajero ve</th>
                </tr>
              </thead>
              <tbody className="text-stone-600">
                {[
                  ["«¿Con pollo o con huevo?» — hay que decidir sí o sí", "Una, y es obligatoria", "Elige una"],
                  ["«¿Tipo de leche?» — puede saltárselo", "Una, o ninguna", "Elige una (opcional)"],
                  ["Extras que se pueden acumular sin tope", "Las que quiera, o ninguna", "Opcional"],
                  ["Máximo 3 extras por bebida", "Hasta cierto número → 3", "Hasta 3 (opcional)"],
                  ["«2 ingredientes a elegir» del omelette", "Un número exacto → 2", "Elige 2"],
                ].map(([quieres, eliges, ve]) => (
                  <tr key={quieres} className="border-b border-stone-100 align-top">
                    <td className="py-2 pr-3">{quieres}</td>
                    <td className="py-2 pr-3 font-medium text-stone-700">{eliges}</td>
                    <td className="py-2 text-stone-500">{ve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              No tienes que adivinar: debajo de la pregunta está la <strong>vista previa</strong> con el texto tal cual
              lo verá quien cobra. Si dice lo que esperabas, está bien puesto.
            </li>
            <li>
              Si pides más opciones de las que tiene el grupo —«elige 2» cuando solo hay una— te avisa en rojo. Es
              importante: así <strong>nadie podría cerrar la venta</strong> de ese producto.
            </li>
            <li>
              Poner un <strong>tope</strong> más alto que las opciones que tienes no es problema (un «hasta 3» con dos
              opciones simplemente nunca llega a tres). Lo que traba es el <strong>mínimo</strong>.
            </li>
            <li>
              Una opción usada en ventas no se puede borrar, para no romper tickets viejos:{" "}
              <strong>desactívala</strong> y deja de aparecer en el POS.
            </li>
          </ul>

          <p className="mt-4 text-sm font-medium text-stone-700">Cuándo se pregunta, y qué se propone solo</p>
          <ul className="mt-2 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Opción por omisión</strong>: cada grupo puede traer una opción ya marcada. Si casi todos tus
              clientes piden leche deslactosada, márcala como «Opción por omisión» en el grupo «Tipo de leche»: la hoja
              de extras se abre con ella puesta y basta confirmar; el cajero la cambia cuando alguien pida otra. Si la
              opción cuesta extra, se cobra. <strong>Ninguna</strong> vuelve a elegir en cada venta.
            </li>
            <li>
              <strong>Cuándo preguntar</strong>: en <strong>Negocio → Módulos del POS → «Extras al tocar un
              producto»</strong> eliges entre <em>preguntar al tocar el producto</em> (lo normal: la leche se pregunta
              cuando el cliente pide, no al final) y <em>preguntar solo si hay que elegir uno</em>, para el café donde
              casi nadie cambia nada: el producto entra al carrito de un toque, con su opción por omisión si la tiene,
              y los extras opcionales se ponen desde <strong>cambiar</strong> en la línea. Los grupos obligatorios se
              preguntan siempre.
            </li>
            <li>
              <strong>Engancha cada grupo solo donde de verdad aplica.</strong> «Tipo de leche» va en lattes,
              capuchinos, chai o matcha; no en un té, un americano o una soda. Cada producto de más es una pregunta
              inútil en cada venta, y es la razón número uno de que «el celular se sienta más lento que la libreta».
            </li>
          </ul>
        </>
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
            <strong>Productos sin movimiento</strong>, <strong>opciones y extras más pedidos</strong> y{" "}
            <strong>parejas que se compran juntas</strong> (ideas de combos).
          </li>
        </ul>
      ),
    },
    {
      id: "admin-negocio",
      grupo: "admin",
      icon: Store,
      titulo: "Datos y ajustes: negocio, metas y menú con QR",
      palabras:
        "nombre zona horaria ticket encabezado pie metas qr menu publico resumen semanal correo lunes seguridad bloqueo impresion automatica imprimir modulos pedidos espera hora de cierre caja olvidada para llevar cargo comision tarjeta mercado pago neto",
      href: "/admin/negocio",
      nodo: (
        <>
          <ul className="space-y-2 text-sm text-stone-600">
            <li>
              <strong>Metas de venta</strong>: define una meta diaria y/o mensual; el <strong>Resumen</strong> muestra el avance con
              una barra, y <strong>¿Cómo va el día?</strong> compara hoy contra ayer y contra el mismo día de la semana
              pasada, a la misma hora.
            </li>
            <li>
              <strong>Menú público con QR</strong>: activa «Publicar el menú» y el sistema te da el código QR para
              imprimir. Quien lo escanee ve tu carta en su celular, sin instalar nada; se actualiza sola al cambiar
              precios, así que el QR impreso nunca se reemplaza. No muestra costos ni nada interno.
            </li>
            <li>
              <strong>La letra chica de tu carta</strong>: lo que aplica a todo el menú («nuestros jarabes son libres
              de azúcar», «precios con IVA») va en <strong>Nota al pie del menú</strong>, aquí mismo. Lo que aplica
              solo a una sección («incluyen café del día y fruta») va en la <strong>nota de esa categoría</strong>,
              desde <strong>Categorías</strong>. Las dos salen únicamente en el menú público, no en el ticket — para
              el ticket está el pie del recibo.
            </li>
          </ul>
          <DemoQR />
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>
              <strong>Nota de compra en la web</strong>: al cobrar aparece un código QR. El cliente lo escanea con
              su celular y ve su nota ahí mismo — útil si no tienes impresora, y muchos lo prefieren al papel. El
              enlace <strong>caduca a los 7 días</strong>, no muestra tus costos, y la página avisa que es una{" "}
              <em>nota de compra</em> y no un comprobante fiscal. Viene encendido; se apaga en{" "}
              <strong>Datos y ajustes → Impresión</strong>.
            </li>
            <li>
              ¿El cliente dijo que no quería ticket y se arrepintió? No hay que rehacer nada: entra a{" "}
              <strong>⋮ → Tickets del día</strong>, busca su venta y toca el botón del <strong>QR</strong>. Ahí
              también puedes <strong>copiar el enlace</strong> para mandárselo por mensaje si ya se fue.
            </li>
            <li>
              <strong>Si compras impresora térmica</strong>, dile al sistema qué rollo usa en{" "}
              <strong>Datos y ajustes → Impresión → Ancho del papel</strong>. El ticket está armado a la medida del
              rollo de <strong>58 mm</strong>, que es el más común y el más barato; si el tuyo es de 80 mm,
              cámbialo ahí. Si la letra sale muy grande o muy chica, casi siempre es este ajuste.
            </li>
            <li>
              <strong>Módulos del POS</strong>: enciende o apaga funciones de la pantalla de venta, como{" "}
              <strong>Cuentas abiertas</strong>; define cuántas <strong>mesas</strong> tienes y qué otros botones
              salen al abrir una cuenta; decide cuándo se preguntan los <strong>extras</strong> al tocar un producto
              (al tocarlo, o solo si hay que elegir uno); ajusta cada cuánto se actualiza{" "}
              <strong>«Por preparar»</strong>; y pone el <strong>descuento máximo en caja</strong> (dueños y
              administradores no tienen tope). Ese límite se aplica en el servidor, no solo en la pantalla.
            </li>
            <li>
              <strong>Impresión al cobrar</strong>: elige qué imprimir en automático al registrar cada venta (ticket,
              comanda o ambos) y el cajero se ahorra esos toques. Si el navegador bloquea la ventana, el POS avisa y
              quedan los botones manuales.
            </li>
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
              <strong>Para llevar con cargo</strong>: si cobras extra por el empaque (p. ej. $5), ponlo en Negocio y el
              chip <em>Para llevar</em> del POS mostrará el monto y lo sumará solo — el cobro lo aplica el servidor,
              no la pantalla. Sale desglosado en el ticket.
            </li>
            <li>
              <strong>Comisión de tu terminal</strong>: captura el % que te descuenta tu terminal de tarjeta (Mercado
              Pago cobra ≈4%) y Ventas y el corte te mostrarán la comisión estimada y tu <strong>neto</strong>. Al
              cliente no se le cobra de más: es solo para que sepas cuánto te queda.
            </li>
            <li>
              <strong>Hora de cierre</strong>: a qué hora cierras tu café. Con eso, una caja que se quedó abierta se
              cierra sola {GRACIA_HORAS} horas después de esa hora —sin arqueo, y marcada como automática— en lugar de
              esperar al tope de {HORAS_SIN_HORARIO} horas que aplica cuando no la has configurado. Ponla: es la
              diferencia entre un cierre a tu hora y uno a media tarde.
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
      id: "admin-prueba",
      grupo: "admin",
      icon: CalendarClock,
      titulo: "Tu prueba gratis",
      palabras: "prueba gratis dias trial vencimiento suspension banner rojo pagar continuar caja abierta cierre automatico",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Si creaste tu cafetería desde la página principal, tienes <strong>{TRIAL_DAYS} días</strong> para probarla
            con todo incluido. No pedimos tarjeta y no se cobra nada solo.
          </li>
          <li>
            ¿Cuántos días te quedan? En <strong>Negocio</strong>, hasta arriba, siempre está el renglón con los días
            restantes y la fecha en que termina.
          </li>
          <li>
            Te avisamos por correo <strong>dos días antes</strong> y otra vez <strong>el último día</strong>. Ese último
            día verás además una <strong>franja roja</strong> arriba del sistema; puedes cerrarla y vuelve al día
            siguiente.
          </li>
          <li>
            El día que vence puedes <strong>seguir cobrando hasta cerrar tu caja</strong>: la pausa entra después, no a
            media jornada. Verás una franja roja avisándotelo.
          </li>
          <li>
            Cuando termina, la cafetería queda <strong>en pausa</strong>: no se puede vender, pero{" "}
            <strong>no se borra nada</strong> — tus ventas, tu menú y tu equipo siguen ahí.
          </li>
          <li>
            <strong>Con la caja abierta no te pausamos.</strong> Si te vence a media jornada, esperamos a que hagas tu
            corte para que el arqueo te cuadre y no se te quede un turno sin cerrar. Esa espera termina cuando la caja
            se cierra —tú o, si se te olvida, el cierre automático—: dejarla abierta no alarga la prueba.
          </li>
          <li>
            ¿Quieres seguir? Escríbenos a <strong>soporte@cafecitopos.com</strong> y lo reactivamos.
          </li>
        </ul>
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
      palabras: "historial turnos esperado contado diferencia cuadre reimprimir parcial propinas cierre automatico sin arqueo nadie conto",
      href: "/admin/cortes",
      nodo: (
        <ul className="space-y-2 text-sm text-stone-600">
          <li>
            Muestra el estado actual de la caja y el historial de turnos: fondo, efectivo vendido, propinas, esperado,
            contado y <strong>diferencia</strong> (verde cuadró, azul sobrante, rojo faltante — como en la demo del
            corte). Cada corte se puede reimprimir; con la caja abierta puedes imprimir un corte parcial.
          </li>
          <li>
            Un turno marcado <strong>«cierre automático · sin arqueo»</strong> es una caja que se quedó abierta y cerró
            sola: dice el efectivo esperado, pero en Contado dice <strong>«nadie contó»</strong> y no cuenta para la
            diferencia acumulada —no se puede inventar un número que nadie verificó—. Si ves varios, pon tu{" "}
            <strong>hora de cierre</strong> en Negocio y recuérdale al equipo cerrar la caja.
          </li>
        </ul>
      ),
    },
    {
      id: "admin-por-cobrar",
      grupo: "admin",
      icon: HandCoins,
      titulo: "Por cobrar (lo que te deben)",
      palabras:
        "fiado deuda deben por cobrar sin pagar condonar perdonar cliente moroso telefono cuanto me deben",
      href: "/admin/por-cobrar",
      nodo: (
        <>
          <p className="text-sm text-stone-600">
            Cuando alguien se va sin pagar, en el POS se marca la cuenta con <strong>«Se fue sin pagar»</strong>.
            Aquí las ves todas juntas: <strong>quién te debe, cuánto y desde cuándo</strong>.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            <li>
              Arriba, el <strong>total que te deben</strong>. Abajo cada persona con los días que lleva y su
              teléfono, que puedes tocar para marcarle directo.
            </li>
            <li>
              <strong>Esto no son ventas.</strong> No cuentan en tus reportes, ni en Análisis, ni en ningún corte.
              La venta se registra el día que te pagan, porque es cuando entra el dinero a la caja. Si contara el
              día que serviste, tu arqueo de esa noche saldría corto y parecería un faltante.
            </li>
            <li>
              El total se calcula con los <strong>precios de hoy</strong> — los mismos con los que se va a cobrar.
              Si algún producto de esa cuenta ya no está en tu menú, no suma y te lo dice: es justo lo que la caja
              tampoco podrá cobrar hasta que lo reactives.
            </li>
            <li>
              <strong>Para cobrar</strong> no se hace nada desde aquí: se abre en el POS, en{" "}
              <strong>Cuentas → Por cobrar</strong>, y se cobra como cualquier venta, con su método de pago y su
              propina.
            </li>
            <li>
              <strong>Condonar</strong> es perdonar la deuda: la cuenta se borra y ya no se podrá cobrar. Solo
              dueño o administrador, pide motivo obligatorio y queda registrado en <strong>Actividad</strong> —
              igual que cancelar una venta, porque es la única forma de que algo servido desaparezca sin entrar a
              la caja.
            </li>
            <li>
              Una cuenta marcada como fiado <strong>no caduca nunca</strong>. Las cuentas normales sin cobrar sí:
              se borran solas después de una semana.
            </li>
          </ul>
        </>
      ),
    },
  ]

  /* ── Buscador: filtra secciones por título y sinónimos ──────────── */
  /**
   * Se muestra lo que coincide, y primero lo que coincide MÁS.
   *
   * Costó tres intentos llegar aquí, y cada uno enseñó algo:
   *   1. Buscar la frase tal cual: «vincular productos» no encontraba nada
   *      aunque las dos palabras estuvieran, solo por venir en otro orden.
   *   2. Exigir todas las palabras: se caía con «dónde están las categorías»
   *      por el «están» y el «las» — de ahí la lista de relleno.
   *   3. Exigir todas menos el relleno: seguía fallando con preguntas
   *      completas («la letra es muy chica») por una sola palabra que no
   *      estaba en la lista de sinónimos.
   *
   * La lección: quien busca ayuda escribe una PREGUNTA, no palabras clave.
   * Así que basta con que algo coincida, y manda arriba lo que coincide en
   * más palabras. Los interrogativos se conservan a propósito: «dónde» y
   * «cómo» sí dicen algo, y las secciones los usan como pistas.
   */
  const q = normalizar(busqueda.trim())
  const visibles = useMemo(
    () => {
      if (q === "") return SECCIONES
      const terminos = q.split(/\s+/).filter((t) => t.length > 0 && !RELLENO.has(t))
      if (terminos.length === 0) return SECCIONES
      return SECCIONES.map((s) => {
        const texto = normalizar(`${s.titulo} ${s.palabras}`)
        return { s, aciertos: terminos.filter((t) => texto.includes(t)).length }
      })
        .filter((r) => r.aciertos > 0)
        .sort((a, b) => b.aciertos - a.aciertos)
        .map((r) => r.s)
    },
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
