#!/usr/bin/env node
/**
 * ¿Los tipos de lib/supabase/database.types.ts corresponden al esquema real?
 *
 * Genera los tipos con el CLI de Supabase contra la base que apunte
 * DATABASE_URL —en el CI, la que acaba de nacer de las 38 migraciones— y los
 * compara con el archivo del repo. Si difieren, sale con error y deja el
 * archivo generado al lado, para bajarlo del CI y confirmarlo tal cual.
 *
 * Existe porque el archivo se venía parchando A MANO después de cada
 * migración: dos veces en una semana, y una de ellas con el orden alfabético
 * mal. Un tipo desfasado no truena al compilar —`as never` se lo traga— y
 * aparece como error en producción.
 *
 * Uso:
 *   DATABASE_URL=postgres://… node scripts/verificar-tipos.mjs            # compara
 *   DATABASE_URL=postgres://… node scripts/verificar-tipos.mjs --escribir  # regenera el archivo
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const ARCHIVO = resolve("lib/supabase/database.types.ts")
const GENERADO = resolve("lib/supabase/database.types.generated.ts")
const url = process.env.DATABASE_URL
if (!url) {
  console.error("Falta DATABASE_URL.")
  process.exit(2)
}

// El binario del CLI vive en node_modules; `pnpm exec` lo resuelve igual que
// en los scripts de package.json.
const salida = execFileSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "supabase", "gen", "types", "--lang", "typescript", "--schema", "public", "--db-url", url],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
)

/**
 * Lo que NO es esquema no cuenta: la versión de PostgREST (`__InternalSupabase`)
 * la pone la plataforma y un Postgres pelón no la conoce; los finales de línea
 * dependen de la máquina.
 */
function normalizar(texto) {
  return texto
    .replace(/\r\n/g, "\n")
    // …y los dos comentarios que la plataforma pone justo encima del bloque.
    .replace(/  \/\/ Allows to automatically instantiate createClient[^\n]*\n  \/\/ instead of createClient[^\n]*\n/, "")
    .replace(/  __InternalSupabase: \{\n[\s\S]*?\n  \}\n/, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim()
}

if (process.argv.includes("--escribir")) {
  writeFileSync(ARCHIVO, salida)
  console.log("Tipos regenerados en", ARCHIVO)
  process.exit(0)
}

const esperado = normalizar(salida)
const actual = normalizar(readFileSync(ARCHIVO, "utf8"))

if (esperado === actual) {
  console.log("Tipos al día con el esquema.")
  process.exit(0)
}

writeFileSync(GENERADO, salida)
const a = actual.split("\n")
const b = esperado.split("\n")
let primera = 0
while (primera < a.length && primera < b.length && a[primera] === b[primera]) primera++
console.error("Los tipos del repo NO corresponden al esquema.")
console.error(`Primera diferencia en la línea ${primera + 1}:`)
console.error("  repo:     " + (a[primera] ?? "<fin>"))
console.error("  esquema:  " + (b[primera] ?? "<fin>"))
console.error(`Archivo generado en ${GENERADO} — confírmalo como database.types.ts si es el correcto.`)
process.exit(1)
