import type { MetadataRoute } from "next"

/**
 * Manifest PWA: permite "Agregar a pantalla de inicio" en tablet/celular y
 * abrir el POS a pantalla completa (sin barra del navegador). No hay
 * service worker a propósito: no prometemos funcionamiento sin internet.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "El Cafecito POS",
    short_name: "Cafecito",
    description: "Punto de venta de El Cafecito",
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
