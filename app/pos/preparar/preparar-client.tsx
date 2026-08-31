"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Check, ChefHat, RefreshCw, ShoppingBag, Undo2, PauseCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPendingOrders, setAccountPrepared, setOrderPrepared, type KitchenOrder } from "@/app/actions/kitchen"
import { formatTime } from "@/lib/format"
import { useBusiness } from "@/components/business-provider"

/** Cada cuánto se pregunta con la pantalla a la vista. */
const REFRESCO_MS = 4_000
/**
 * Y cada cuánto cuando el navegador dice que está oculta.
 *
 * Se sigue preguntando —más lento— en vez de callar del todo. Parece un
 * detalle y no lo es: al probar en producción, el navegador reportó la
 * pestaña como «oculta» aunque estuviera al frente, y con la versión que
 * paraba por completo la pantalla se quedó muda. Confiar en que ese dato
 * siempre es correcto reintroduce justo el fallo silencioso que se quiso
 * evitar al no usar websockets.
 */
const REFRESCO_OCULTA_MS = 30_000
/** Después de este rato sin respuesta, la pantalla admite que está ciega. */
const SIN_NOTICIAS_MS = 20_000

/**
 * «Por preparar»: la comanda, pero en pantalla.
 *
 * Para quien atiende solo y no tiene impresora térmica. Muestra los pedidos
 * cobrados que faltan por hacer, del más viejo al más nuevo —en una barra se
 * atiende por orden de llegada—, y con «Listo» desaparecen.
 *
 * SE ACTUALIZA PREGUNTANDO, NO POR WEBSOCKET, y es una decisión, no una
 * simplificación: un socket caído deja la pantalla congelada SIN AVISAR, y
 * aquí eso significa pedidos que nunca se preparan. Preguntar cada pocos
 * segundos se recupera solo de un bache de señal —el mismo que motivó la cola
 * de ventas sin internet— y permite decir en pantalla cuándo fue la última
 * vez que se supo algo. Si esos segundos alguna vez estorban, se cambia; lo
 * que no se vale es fingir que está al día cuando no lo está.
 *
 * Con la pestaña oculta pregunta más espaciado, pero NO deja de preguntar:
 * ahorrar batería no vale quedarse mudo si el navegador se equivoca al decir
 * qué está a la vista —cosa que pasó al probar esto—.
 */
export default function PrepararClient({ inicial }: { inicial: KitchenOrder[] }) {
  const { timezone } = useBusiness()
  const [orders, setOrders] = useState<KitchenOrder[]>(inicial)
  const [ultimoOk, setUltimoOk] = useState<number>(() => Date.now())
  const [marcando, setMarcando] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  // El último pedido recién hecho, para poder deshacer sin ir a buscarlo.
  const [ultimoListo, setUltimoListo] = useState<KitchenOrder | null>(null)
  const cargando = useRef(false)

  const refrescar = useCallback(async () => {
    if (cargando.current) return
    cargando.current = true
    try {
      const r = await getPendingOrders()
      if (r.success) {
        setOrders(r.orders)
        setUltimoOk(Date.now())
      }
    } catch {
      /* sin señal: lo dirá el aviso de «sin noticias» */
    } finally {
      cargando.current = false
    }
  }, [])

  useEffect(() => {
    let ultimaConsulta = 0
    const tic = setInterval(() => {
      setAhora(Date.now())
      const cada = document.visibilityState === "visible" ? REFRESCO_MS : REFRESCO_OCULTA_MS
      if (Date.now() - ultimaConsulta >= cada) {
        ultimaConsulta = Date.now()
        void refrescar()
      }
    }, REFRESCO_MS)

    // Al volver a la pestaña no se espera al siguiente turno: se pregunta ya.
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar()
    }
    document.addEventListener("visibilitychange", alVolver)
    window.addEventListener("focus", alVolver)
    window.addEventListener("online", alVolver)

    return () => {
      clearInterval(tic)
      document.removeEventListener("visibilitychange", alVolver)
      window.removeEventListener("focus", alVolver)
      window.removeEventListener("online", alVolver)
    }
  }, [refrescar])

  const marcar = async (order: KitchenOrder, listo: boolean) => {
    setMarcando(order.id)
    // Se quita de la lista al instante: quien cocina ya lo dio por hecho y
    // esperar a que el servidor conteste se siente lento.
    if (listo) setOrders((prev) => prev.filter((o) => o.id !== order.id))
    // Una cuenta abierta no tiene ticket que marcar: se guarda la foto de lo
    // servido, para que la ronda siguiente salga sola y sin repetir.
    const r = order.accountName
      ? await setAccountPrepared({ id: order.id })
      : await setOrderPrepared({ ticketId: order.id, prepared: listo })
    setMarcando(null)
    if (r?.error) {
      toast.error(r.error)
      void refrescar() // se deshace solo: la verdad la tiene el servidor
      return
    }
    setUltimoListo(listo ? order : null)
    void refrescar()
  }

  const sinNoticias = ahora - ultimoOk > SIN_NOTICIAS_MS
  const segundos = Math.round((ahora - ultimoOk) / 1000)

  return (
    <div className="flex h-[100dvh] flex-col bg-stone-100">
      {/* Barra superior */}
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <Link href="/pos" className="shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            POS
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-lg font-bold text-stone-800">
            <ChefHat className="h-5 w-5 shrink-0 text-amber-700" />
            Por preparar
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-800">
              {orders.length}
            </span>
          </h1>
        </div>
        {ultimoListo && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => {
              void marcar(ultimoListo, false)
              setUltimoListo(null)
            }}
          >
            <Undo2 className="h-4 w-4" />
            Deshacer #{ultimoListo.folio}
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => void refrescar()} title="Buscar pedidos nuevos ahora">
          <RefreshCw className="h-4 w-4 text-stone-500" />
        </Button>
      </header>

      {/* Aviso honesto: si no sabemos nada hace rato, se dice. */}
      {sinNoticias && (
        <div className="shrink-0 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950">
          Sin contacto desde hace {segundos}s. Puede haber pedidos nuevos que no ves — revisa tu internet.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {orders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="mt-4 text-lg font-semibold text-stone-700">Todo al día</p>
            <p className="mt-1 text-sm text-stone-500">
              Aquí van saliendo los pedidos en cuanto los cobras.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {orders.map((o, i) => (
              <article
                key={o.id}
                className={`flex flex-col rounded-xl border-2 bg-white p-4 ${
                  i === 0 ? "border-amber-400 shadow-md" : "border-stone-200"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  {/* Una cuenta se conoce por su mesa, no por folio: todavía
                      no existe la venta. Con nombre a la vista, quien prepara
                      sabe a dónde llevarlo sin preguntar. */}
                  <span className="min-w-0 truncate text-xl font-bold text-stone-800">
                    {o.accountName ?? `#${o.folio}`}
                  </span>
                  <span className="shrink-0 text-sm text-stone-500">{formatTime(o.createdAt, timezone)}</span>
                </div>

                {o.accountName && (
                  <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    <PauseCircle className="h-3 w-3" />
                    Cuenta abierta · sin cobrar
                  </span>
                )}

                {o.takeout && (
                  <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-stone-800 px-2 py-0.5 text-xs font-semibold text-white">
                    <ShoppingBag className="h-3 w-3" />
                    Para llevar
                  </span>
                )}

                {o.notes && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm font-medium text-amber-900">
                    📝 {o.notes}
                  </p>
                )}

                <ul className="mt-3 flex-1 space-y-2.5">
                  {o.items.map((it, j) => (
                    <li key={j}>
                      <p className="text-base font-semibold leading-snug text-stone-800">
                        <span className="text-amber-700">{it.quantity}×</span> {it.label}
                      </p>
                      {it.modifiers.map((m, k) => (
                        <p key={k} className="pl-5 text-sm text-stone-600">
                          + {m}
                        </p>
                      ))}
                      {it.notes && (
                        <p className="pl-5 text-sm font-semibold uppercase text-amber-800">* {it.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => void marcar(o, true)}
                  disabled={marcando === o.id}
                  className="mt-4 h-12 w-full gap-2 bg-emerald-600 text-base hover:bg-emerald-700"
                >
                  <Check className="h-5 w-5" />
                  Listo
                </Button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
