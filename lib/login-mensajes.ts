/**
 * Mensajes del login que necesitan servidor Y cliente.
 *
 * Vive aparte de `lib/accounts.ts` a propósito: aquel lee
 * `process.env.SYNTHETIC_EMAIL_DOMAIN` al cargar, y no tiene por qué acabar
 * en el paquete del navegador solo para comparar un texto.
 */

/**
 * El usuario está repetido en varios cafés y hace falta saber cuál.
 *
 * La página lo compara para enseñar el campo del café, así que es una
 * CONSTANTE compartida y no un texto suelto: cambiar la redacción en un solo
 * lado rompería la comparación sin que nada avise.
 */
export const LOGIN_FALTA_CAFE = "Ese usuario existe en más de un café. Escribe cuál es el tuyo."
