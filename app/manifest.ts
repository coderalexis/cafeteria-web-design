import type { MetadataRoute } from "next"

/**
 * Manifest PWA: permite "Agregar a pantalla de inicio" en tablet/celular y
 * abrir el POS a pantalla completa (sin barra del navegador). El service
 * worker (`public/sw-pos.js`) existe para que el POS ARRANQUE al instante con
 * la última página guardada, no para prometer funcionamiento sin internet:
 * sin red se abre con el último menú conocido y la cola de ventas hace el
 * resto (docs/cola-sin-internet.md).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cafecito POS",
    short_name: "Cafecito POS",
    description: "Punto de venta para cafeterías",
    lang: "es-MX",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fafaf9",
    theme_color: "#b45309",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
