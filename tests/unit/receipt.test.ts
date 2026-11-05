import { describe, expect, it } from "vitest"
import { escapeHtml } from "@/lib/receipt"

describe("texto ajeno en una ventana de impresión", () => {
  it("el nombre del café no puede meter código en el cartel QR", () => {
    // Un administrador podía poner esto de nombre y se ejecutaba en la sesión de quien imprimía.
    const nombre = escapeHtml('<img src=x onerror="fetch(1)">Café & Pan')
    expect(nombre).not.toContain("<")
    expect(nombre).not.toContain('"')
    expect(nombre).toBe("&lt;img src=x onerror=&quot;fetch(1)&quot;&gt;Café &amp; Pan")
  })
})
