import { describe, expect, it } from "vitest"
import {
  LOGO_MAX_BYTES,
  extensionDe,
  rutaDesdeUrl,
  rutaLogo,
  revisarLogo,
} from "@/lib/logo"

describe("revisarLogo", () => {
  it("acepta los tres tipos que admite el bucket", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(revisarLogo({ type, size: 1000 })).toBeNull()
    }
  })

  it("rechaza un archivo vacío antes que nada", () => {
    // Un input sin archivo llega como File de 0 bytes: primero eso, porque
    // «pesa 0 kB» no le explica nada a quien sube el logo.
    expect(revisarLogo({ type: "image/png", size: 0 })?.motivo).toBe("vacio")
  })

  it("rechaza un formato que la térmica no sabe imprimir", () => {
    const problema = revisarLogo({ type: "image/svg+xml", size: 500 })
    expect(problema?.motivo).toBe("tipo")
    expect(problema?.mensaje).toContain("PNG")
  })

  it("rechaza lo que pasa del límite y dice cuánto pesa", () => {
    const problema = revisarLogo({ type: "image/png", size: LOGO_MAX_BYTES + 1 })
    expect(problema?.motivo).toBe("tamano")
    expect(problema?.mensaje).toContain("1024 kB")
  })

  it("deja pasar el archivo que pesa exactamente el límite", () => {
    expect(revisarLogo({ type: "image/png", size: LOGO_MAX_BYTES })).toBeNull()
  })
})

describe("extensionDe", () => {
  it("traduce el tipo a la extensión que se guarda", () => {
    expect(extensionDe("image/png")).toBe("png")
    expect(extensionDe("image/jpeg")).toBe("jpg")
    expect(extensionDe("image/webp")).toBe("webp")
  })

  it("devuelve null para lo que no se acepta", () => {
    expect(extensionDe("image/gif")).toBeNull()
  })
})

describe("rutaLogo", () => {
  const cafe = "f39e9c13-0c0f-451f-a54e-5cc32e84e941"

  it("cuelga el archivo de la carpeta del negocio", () => {
    // La carpeta es lo que mira `delete_business` para llevarse los logos.
    expect(rutaLogo(cafe, "menu", "png", 1)).toMatch(new RegExp(`^${cafe}/`))
  })

  it("cambia de nombre en cada subida, para que el CDN no sirva el viejo", () => {
    const antes = rutaLogo(cafe, "menu", "png", 1_700_000_000_000)
    const despues = rutaLogo(cafe, "menu", "png", 1_700_000_001_000)
    expect(antes).not.toBe(despues)
  })

  it("separa las dos ranuras", () => {
    expect(rutaLogo(cafe, "menu", "png", 7)).not.toBe(rutaLogo(cafe, "ticket", "png", 7))
    expect(rutaLogo(cafe, "ticket", "png", 7)).toContain("ticket-")
  })
})

describe("rutaDesdeUrl", () => {
  const url =
    "https://pavcbvkwypdiwaaishjt.supabase.co/storage/v1/object/public/logos/f39e9c13/menu-17.png"

  it("saca la ruta de una URL nuestra, para poder borrar el archivo anterior", () => {
    expect(rutaDesdeUrl(url)).toBe("f39e9c13/menu-17.png")
  })

  it("ignora la cadena de consulta", () => {
    expect(rutaDesdeUrl(`${url}?v=2`)).toBe("f39e9c13/menu-17.png")
  })

  it("devuelve null si la URL no es del bucket: no hay nada nuestro que borrar", () => {
    expect(rutaDesdeUrl("https://example.com/logo.png")).toBeNull()
    expect(rutaDesdeUrl(null)).toBeNull()
    expect(rutaDesdeUrl("")).toBeNull()
  })

  it("da la vuelta completa: lo que arma rutaLogo se recupera de la URL pública", () => {
    const ruta = rutaLogo("abc", "ticket", "webp", 99)
    expect(rutaDesdeUrl(`https://x.supabase.co/storage/v1/object/public/logos/${ruta}`)).toBe(ruta)
  })
})
