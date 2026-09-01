import { defineConfig } from "vitest/config"
import path from "node:path"

// Solo lo puro: funciones sin base, sin red y sin React. Lo que toca la base
// se prueba en tests/sql contra un Postgres real, no con mocks.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
