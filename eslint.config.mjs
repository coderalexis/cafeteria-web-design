import { FlatCompat } from "@eslint/eslintrc"

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      // Generados; no se lintean
      "lib/supabase/database.types.ts",
      "next-env.d.ts",
    ],
  },
]

export default eslintConfig
