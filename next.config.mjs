/** @type {import('next').NextConfig} */

/**
 * Encabezados de seguridad para TODA respuesta.
 *
 * Los tres que faltaban y que no cuestan nada:
 *   · frame-ancestors 'none' / X-Frame-Options DENY — un punto de venta no
 *     tiene por qué poder embeberse en otro sitio; eso es la base del
 *     clickjacking («haz clic aquí» sobre un botón de cobrar invisible).
 *   · nosniff — el navegador no adivina tipos de contenido.
 *   · Referrer-Policy — la URL de una nota de compra (/t/<id>) no viaja
 *     completa a terceros si el cliente sigue un enlace desde ahí.
 *
 * Lo que NO se pone, y por qué: una CSP completa con script-src. Next mete
 * scripts en línea y hacerlo bien exige nonces por petición; a medias solo
 * rompe la app. Y HSTS lo pone Vercel solo en el dominio de producción.
 * Permissions-Policy cierra lo que la app no usa (cámara, micrófono, GPS).
 */
const encabezadosSeguridad = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
]

const nextConfig = {
  images: {
    // Las capturas de la landing ya van optimizadas a mano (WebP); esto
    // evita el optimizador de Vercel, que cuenta contra la cuota del plan.
    // OJO: cualquier next/image nuevo se sirve tal cual, sin redimensionar.
    unoptimized: true,
  },
  async headers() {
    return [
      { source: "/(.*)", headers: encabezadosSeguridad },
      // El service worker del POS: que el navegador lo re-pregunte en cada
      // visita (así un deploy lo actualiza) en vez de quedarse con uno viejo.
      { source: "/sw-pos.js", headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }] },
    ]
  },
}

export default nextConfig
