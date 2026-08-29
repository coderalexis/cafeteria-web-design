/**
 * Las capacidades de animación del POS, en su propio archivo para que viajen
 * APARTE del primer cargado.
 *
 * `framer-motion` pesa 47 KB comprimidos y hasta ahora bajaba entero antes de
 * que la pantalla apareciera. Con `LazyMotion` el POS arranca solo con el
 * motor mínimo (los componentes `m.*`) y esto llega enseguida, ya con la
 * rejilla en pantalla. En el wifi del gym esa diferencia se siente.
 *
 * Es `domMax` y no `domAnimation` porque las líneas del carrito se ARRASTRAN
 * —derecha para duplicar, izquierda para quitar—, y el arrastre solo viene en
 * el paquete completo. Cambiarlo a `domAnimation` para ahorrar unos KB dejaría
 * los gestos muertos sin ningún error visible.
 */
export default async function cargarAnimaciones() {
  const { domMax } = await import("framer-motion")
  return domMax
}
