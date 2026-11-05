"use client"

import dynamic from "next/dynamic"
import type { QRCodeProps } from "react-qr-code"

/**
 * El dibujo del QR, bajado solo cuando se muestra uno.
 *
 * `react-qr-code` (con su generador) viajaba en el arranque del POS de todos
 * los cafés, y el QR solo aparece cuando el cliente pide su nota. Ahora es un
 * trozo aparte que se baja al mostrarlo, o en reposo con `precargarQr()` donde
 * el café tiene la nota pública encendida: así el service worker del POS lo
 * guarda junto con lo demás (lo guarda la primera vez que se pide) y está a
 * mano aunque luego se vaya la señal.
 *
 * Si el trozo no llega (sin señal y nunca bajado, o un deploy que ya lo
 * quitó), se dibuja un aviso en su lugar: un QR que falta no puede tumbar la
 * pantalla de cobro.
 */
const cargar = () => import("react-qr-code")

function QrNoDisponible({ size = 128 }: QRCodeProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-md border border-dashed border-stone-300 p-2 text-center text-xs text-stone-500"
    >
      El código no cargó. Revisa la señal y vuelve a abrirlo.
    </div>
  )
}

export const QrDiferido = dynamic<QRCodeProps>(
  () => cargar().then((m) => m.default).catch(() => QrNoDisponible),
  {
    ssr: false,
    loading: () => <div aria-hidden className="h-[148px] w-[148px] animate-pulse rounded-md bg-stone-100" />,
  },
)

/** Bajarlo en reposo para que esté listo (y guardado) antes de que se pida. */
export function precargarQr(): void {
  void cargar().catch(() => {})
}
