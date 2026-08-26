"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Coffee, Delete, LockKeyhole, Loader2 } from "lucide-react"
import { setMyPin, verifyMyPin } from "@/app/actions/security"
import { logout } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"

const CHECK_EVERY_MS = 10_000
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const
/** Evento global para bloquear manualmente (botón de candado del POS). */
export const POS_LOCK_EVENT = "pos-lock"

type Mode = "verify" | "setup" | "confirm"

/**
 * Candado por inactividad del POS. Con `lockMinutes` > 0, tras ese tiempo sin
 * actividad cubre la pantalla y pide el PIN del usuario en turno. Si aún no
 * tiene PIN, el desbloqueo lo crea (la sesión ya está autenticada).
 */
export function PosLockScreen({
  lockMinutes,
  initialHasPin,
  businessName,
  userName,
}: {
  lockMinutes: number
  initialHasPin: boolean
  businessName: string
  userName: string
}) {
  const [locked, setLocked] = useState(false)
  const [mode, setMode] = useState<Mode>(initialHasPin ? "verify" : "setup")
  const [pin, setPin] = useState("")
  const [firstPin, setFirstPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lastActivity = useRef(Date.now())

  const enabled = lockMinutes > 0

  useEffect(() => {
    if (!enabled) return
    const touch = () => {
      lastActivity.current = Date.now()
    }
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, touch, { passive: true })
    const lockNow = () => setLocked(true)
    window.addEventListener(POS_LOCK_EVENT, lockNow)
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= lockMinutes * 60_000) {
        setLocked(true)
      }
    }, CHECK_EVERY_MS)
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, touch)
      window.removeEventListener(POS_LOCK_EVENT, lockNow)
      window.clearInterval(interval)
    }
  }, [enabled, lockMinutes])

  const reset = useCallback(
    (nextMode: Mode) => {
      setPin("")
      setError(null)
      setMode(nextMode)
    },
    [],
  )

  // Recibe el modo siguiente explícito: setMode y unlock() ocurren en el mismo
  // tick y el closure vería el modo viejo.
  const unlock = useCallback(
    (nextMode: Mode) => {
      lastActivity.current = Date.now()
      setLocked(false)
      setFirstPin("")
      reset(nextMode)
    },
    [reset],
  )

  async function submit() {
    if (busy || pin.length < 4) return
    setBusy(true)
    setError(null)
    try {
      if (mode === "verify") {
        const result = await verifyMyPin(pin)
        if (!result.success) {
          setError(result.error)
        } else if (result.valid) {
          unlock("verify")
        } else {
          setError("PIN incorrecto.")
          setPin("")
        }
      } else if (mode === "setup") {
        setFirstPin(pin)
        reset("confirm")
      } else {
        if (pin !== firstPin) {
          setFirstPin("")
          setError("No coincidió. Empecemos de nuevo.")
          setPin("")
          setMode("setup")
        } else {
          const fd = new FormData()
          fd.set("pin", pin)
          fd.set("confirm_pin", pin)
          const result = await setMyPin(fd)
          if (result?.error) {
            setError(result.error)
          } else {
            toast.success("PIN guardado.")
            unlock("verify")
          }
        }
      }
    } finally {
      setBusy(false)
    }
  }

  if (!enabled || !locked) return null

  const title = mode === "verify" ? "Pantalla bloqueada" : mode === "setup" ? "Crea tu PIN de caja" : "Confirma tu PIN"
  const hint =
    mode === "verify"
      ? `PIN de ${userName}`
      : mode === "setup"
        ? "De 4 a 6 dígitos. Lo usarás para desbloquear la caja."
        : "Escríbelo otra vez para confirmarlo."

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-900/95 p-6">
      <div className="w-full max-w-xs text-center space-y-5">
        <div className="space-y-1.5">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-amber-700 flex items-center justify-center">
            <Coffee className="h-7 w-7 text-white" />
          </div>
          <p className="text-stone-300 text-sm">{businessName}</p>
          <h2 className="text-white text-xl font-bold flex items-center justify-center gap-2">
            <LockKeyhole className="h-5 w-5" />
            {title}
          </h2>
          <p className="text-stone-400 text-xs">{hint}</p>
        </div>

        {/* Puntos del PIN */}
        <div className="flex justify-center gap-2" aria-label="PIN">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border ${
                i < pin.length ? "bg-amber-400 border-amber-400" : "border-stone-500"
              } ${i >= 4 && pin.length < 5 && i >= pin.length ? "opacity-40" : ""}`}
            />
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Teclado */}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "ok"].map((key) => {
            if (key === "borrar") {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPin((p) => p.slice(0, -1))}
                  className="h-14 rounded-xl bg-stone-700 text-stone-200 text-lg font-semibold active:bg-stone-600 flex items-center justify-center"
                  aria-label="Borrar"
                >
                  <Delete className="h-5 w-5" />
                </button>
              )
            }
            if (key === "ok") {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={submit}
                  disabled={busy || pin.length < 4}
                  className="h-14 rounded-xl bg-amber-600 text-white text-lg font-semibold active:bg-amber-700 disabled:opacity-40 flex items-center justify-center"
                  aria-label="Aceptar"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "OK"}
                </button>
              )
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPin((p) => (p.length < 6 ? p + key : p))}
                className="h-14 rounded-xl bg-stone-800 text-white text-xl font-semibold active:bg-stone-700"
              >
                {key}
              </button>
            )
          })}
        </div>

        <form action={logout}>
          <Button type="submit" variant="ghost" className="text-stone-400 hover:text-white hover:bg-stone-800">
            Cambiar de usuario (cerrar sesión)
          </Button>
        </form>
      </div>
    </div>
  )
}

/** Aviso persistente cuando el dispositivo pierde internet. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)
    const goOffline = () => setOffline(true)
    const goOnline = () => {
      setOffline(false)
      toast.success("Volvió el internet. Si tenías una venta pendiente, pulsa Cobrar de nuevo.")
    }
    window.addEventListener("offline", goOffline)
    window.addEventListener("online", goOnline)
    return () => {
      window.removeEventListener("offline", goOffline)
      window.removeEventListener("online", goOnline)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[150] bg-red-600 text-white text-sm font-medium text-center px-4 py-2 shadow">
      Sin conexión a internet. Puedes seguir armando el pedido; el cobro se hará cuando vuelva la conexión.
    </div>
  )
}
