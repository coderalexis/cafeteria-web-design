import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { redirect } from "next/navigation"
import { sinTumbar } from "@/lib/sin-tumbar"

// Una server action que RECHAZA dentro de startTransition(async …) tumba la
// pantalla entera al error boundary (React 19). sinTumbar lo convierte en un
// aviso; este archivo prueba eso y vigila que nadie vuelva a escribir una
// transición async desprotegida.

describe("sinTumbar", () => {
  it("si la llamada no llegó, avisa en vez de rechazar", async () => {
    const avisos: string[] = []
    await sinTumbar(async () => {
      throw new TypeError("Failed to fetch")
    }, (m) => avisos.push(m))()
    expect(avisos).toEqual(["Sin conexión: no se guardó. Vuelve a intentar cuando regrese la señal."])
  })

  it("si todo sale bien, no dice nada", async () => {
    const avisos: string[] = []
    let corrio = false
    await sinTumbar(async () => {
      corrio = true
    }, (m) => avisos.push(m))()
    expect(corrio).toBe(true)
    expect(avisos).toEqual([])
  })

  it("un redirect() sigue su camino: no se traga como fallo", async () => {
    const avisos: string[] = []
    const envuelta = sinTumbar(async () => {
      redirect("/login")
    }, (m) => avisos.push(m))
    await expect(envuelta()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") })
    expect(avisos).toEqual([])
  })
})

/** Todos los .ts/.tsx de la app (sin node_modules ni .next). */
function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : archivos(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

/**
 * Las `startTransition(async () => …)` que tienen algún `await` fuera de un
 * try/catch. La forma buena es `startTransition(sinTumbar(async () => …))`, o
 * un try/catch propio con `mensajeDeFallo` cuando la pantalla necesita algo
 * más (el POS, el selector de café).
 */
function desprotegidas(archivo: string): string[] {
  const texto = readFileSync(archivo, "utf8")
  if (!texto.includes("startTransition(async")) return []
  const sf = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fuera: string[] = []
  const visitar = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "startTransition" &&
      n.arguments.length === 1 &&
      ts.isArrowFunction(n.arguments[0]) &&
      n.arguments[0].modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      const fn = n.arguments[0]
      let suelto = false
      const buscar = (m: ts.Node, enTry: boolean) => {
        if (m !== fn && ts.isFunctionLike(m)) return
        if (ts.isAwaitExpression(m) && !enTry) suelto = true
        if (ts.isTryStatement(m)) {
          buscar(m.tryBlock, enTry || !!m.catchClause)
          if (m.catchClause) buscar(m.catchClause, enTry)
          if (m.finallyBlock) buscar(m.finallyBlock, enTry)
          return
        }
        ts.forEachChild(m, (h) => buscar(h, enTry))
      }
      buscar(fn.body, false)
      if (suelto) fuera.push(`${path.relative(process.cwd(), archivo)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return fuera
}

describe("ninguna transición async puede tumbar una pantalla", () => {
  it("toda startTransition(async …) con await va envuelta en sinTumbar o con su try/catch", () => {
    const fuera = ["app", "components", "hooks"].flatMap((d) => archivos(path.join(process.cwd(), d))).flatMap(desprotegidas)
    expect(fuera).toEqual([])
  })
})
