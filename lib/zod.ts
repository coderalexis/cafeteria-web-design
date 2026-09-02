import { z } from "zod"

/**
 * zod con los mensajes por defecto en español.
 *
 * Diez acciones del servidor devuelven al usuario el primer
 * `issues[0].message` tal cual, y varios esquemas usan `.min(1)` o
 * `.max(80)` sin mensaje propio: hasta hoy esos avisos salían en inglés
 * («String must contain at least 1 character(s)»). zod 4 trae los idiomas
 * incorporados; con esto se configuran UNA vez y todo esquema que se importe
 * de aquí los hereda. Por eso las acciones importan `z` de este módulo y no
 * de "zod" directamente.
 */
z.config(z.locales.es())

export { z }
