"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ImageUp, Loader2, Trash2 } from "lucide-react"
import { quitarLogo, subirLogo } from "@/app/actions/business"
import { LOGO_MAX_BYTES, TICKET_ANCHO_PUNTOS, revisarLogo, type RanuraLogo } from "@/lib/logo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

/**
 * Dos logos y no uno, a propósito: el menú es una pantalla a color y el ticket
 * sale de una térmica que imprime UN BIT por punto. Un logo de color pasado a
 * monocromo sale como una mancha gris. Pedir dos archivos es más honesto que
 * prometer una conversión que decepciona.
 */
interface Ranura {
  id: RanuraLogo
  titulo: string
  ayuda: string
  /** El fondo con el que se verá de verdad, para que la vista previa no mienta. */
  fondo: string
}

const RANURAS: Ranura[] = [
  {
    id: "menu",
    titulo: "Para el menú y las pantallas",
    ayuda: "A color. Con fondo transparente (PNG) se ve mejor: el menú no es negro.",
    fondo: "bg-stone-50",
  },
  {
    id: "ticket",
    titulo: "Para la impresora de tickets",
    ayuda: `Negro sobre blanco, sin sombras ni degradados. Lo ideal: ${TICKET_ANCHO_PUNTOS} px de ancho.`,
    fondo: "bg-white",
  },
]

export function LogoCard({ logoMenu, logoTicket }: { logoMenu: string | null; logoTicket: string | null }) {
  const router = useRouter()
  const [subiendo, setSubiendo] = useState<RanuraLogo | null>(null)
  const [isPending, startTransition] = useTransition()
  // Un input por ranura: uno solo obligaría a recordar para cuál se abrió.
  const inputs = {
    menu: useRef<HTMLInputElement>(null),
    ticket: useRef<HTMLInputElement>(null),
  }

  const actual = (r: RanuraLogo) => (r === "menu" ? logoMenu : logoTicket)

  function elegir(ranura: RanuraLogo, archivo: File | undefined) {
    if (!archivo) return
    // Se revisa aquí ANTES de subir: quien elige un archivo de 4 MB se entera
    // al instante y no después de esperar la subida entera.
    const problema = revisarLogo(archivo)
    if (problema) {
      toast.error(problema.mensaje)
      return
    }

    const datos = new FormData()
    datos.set("ranura", ranura)
    datos.set("archivo", archivo)

    setSubiendo(ranura)
    startTransition(async () => {
      const resultado = await subirLogo(datos)
      setSubiendo(null)
      if (resultado?.error) {
        toast.error(resultado.error)
        return
      }
      toast.success("Logo guardado")
      router.refresh()
    })
  }

  function quitar(ranura: RanuraLogo) {
    setSubiendo(ranura)
    startTransition(async () => {
      const resultado = await quitarLogo(ranura)
      setSubiendo(null)
      if (resultado?.error) {
        toast.error(resultado.error)
        return
      }
      toast.success("Logo quitado")
      router.refresh()
    })
  }

  return (
    <Card id="logo" className="admin-ancla scroll-mt-20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageUp className="h-4 w-4 text-amber-700" />
          Logo de la cafetería
        </CardTitle>
        <CardDescription>
          Sale en el menú público y arriba del ticket impreso. PNG, JPG o WebP de hasta{" "}
          {LOGO_MAX_BYTES / 1024} kB.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {RANURAS.map((ranura) => {
          const url = actual(ranura.id)
          const ocupado = subiendo === ranura.id && isPending
          return (
            <div key={ranura.id} className="space-y-2 rounded-xl border border-stone-200 p-3">
              <p className="text-sm font-medium text-stone-700">{ranura.titulo}</p>
              <div
                className={`flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-stone-300 ${ranura.fondo}`}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`Logo · ${ranura.titulo}`} className="max-h-20 max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-stone-400">Sin logo</span>
                )}
              </div>
              <p className="text-xs text-stone-400">{ranura.ayuda}</p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={inputs[ranura.id]}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    elegir(ranura.id, e.target.files?.[0])
                    // Se limpia para poder volver a elegir el MISMO archivo
                    // (corregido con otro programa) y que sí dispare el cambio.
                    e.target.value = ""
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="blanco-comodo"
                  disabled={ocupado}
                  onClick={() => inputs[ranura.id].current?.click()}
                >
                  {ocupado ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {url ? "Cambiar" : "Subir logo"}
                </Button>
                {url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="blanco-comodo text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={ocupado}
                    onClick={() => quitar(ranura.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
