import * as React from 'react'

const MOBILE_BREAKPOINT = 768
// Un celular ACOSTADO mide ~844×390: por ancho pasaría por escritorio, pero el
// layout de escritorio mete un panel de carrito fijo de 304px en una pantalla
// de 390px de alto. Móvil = angosto O bajito; una tablet acostada (≥768 de
// alto) no entra aquí.
const SHORT_BREAKPOINT = 500

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px), (max-height: ${SHORT_BREAKPOINT - 1}px)`,
    )
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    // También en resize: al rotar, algunos navegadores avisan el resize antes
    // (o en vez) del cambio de media query; leer mql.matches es idempotente.
    window.addEventListener('resize', onChange)
    setIsMobile(mql.matches)
    return () => {
      mql.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  return !!isMobile
}
