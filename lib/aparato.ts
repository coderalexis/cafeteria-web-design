/**
 * Con qué aparato está leyendo la guía quien la lee.
 *
 * La guía se escribió desde el celular —43 «toca» y ni un «haz clic»— y todos
 * leían lo mismo, incluidas las partes de un aparato que no tienen delante.
 * Esto le da a `/ayuda` una lente: se detecta sola, pero se puede cambiar a
 * mano, que es el caso de verdad —la dueña lee en su computadora para
 * entender lo que hará su cajera en el celular—.
 *
 * Vive en `lib/` y no en la guía porque es puro y tiene pruebas: la tabla de
 * verbos decide cómo se lee CADA instrucción del sistema.
 */

export type Aparato = "celular" | "tablet" | "computadora"

export const APARATOS: readonly Aparato[] = ["celular", "tablet", "computadora"] as const

export const NOMBRE_APARATO: Record<Aparato, string> = {
  celular: "Celular",
  tablet: "Tablet",
  computadora: "Computadora",
}

/** Los dos que se manejan con el dedo: mismos gestos, distinta pantalla. */
export function esTactil(aparato: Aparato): boolean {
  return aparato !== "computadora"
}

/**
 * Qué está usando quien lee.
 *
 * El puntero manda sobre el ancho: una tablet acostada mide 1000 px y por
 * ancho pasaría por computadora, pero se toca con el dedo. Es la misma señal
 * con la que el POS decide el tamaño de sus blancos.
 */
export function detectarAparato(entorno: { ancho: number; punteroGrueso: boolean }): Aparato {
  if (!entorno.punteroGrueso) return "computadora"
  return entorno.ancho < 768 ? "celular" : "tablet"
}

/**
 * El verbo de la guía según el aparato.
 *
 * Se listan todas las formas que aparecen en el texto en vez de conjugar al
 * vuelo: son trece y no cambian, y una conjugación automática se equivocaría
 * justo donde duele. OJO: «tocar» también significa ALTERAR («sin tocar lo
 * que ya llevas»); esos usos NO pasan por aquí.
 */
export interface Verbos {
  toca: string
  Toca: string
  tocar: string
  /** Sin la preposición: la frase ya trae su «en», o no lleva objeto. */
  tocarSolo: string
  Tocar: string
  tocas: string
  /** Sin preposición: «tocas encima de» ya trae la suya. */
  tocasSolo: string
  TocaSolo: string
  tocando: string
  /** Sin preposición: «aprender tocando,» no lleva objeto. */
  tocandoSolo: string
  Tocando: string
  tocala: string
  tocalo: string
  Tocala: string
  Tocalo: string
  tocalas: string
  tocandola: string
  tocarlo: string
  /** Sustantivo: «de un toque», «tres toques». */
  toque: string
  toques: string
}

const TACTIL: Verbos = {
  toca: "toca",
  Toca: "Toca",
  tocar: "tocar",
  tocarSolo: "tocar",
  Tocar: "Tocar",
  tocas: "tocas",
  tocasSolo: "tocas",
  TocaSolo: "Toca",
  tocando: "tocando",
  tocandoSolo: "tocando",
  Tocando: "Tocando",
  tocala: "tócala",
  tocalo: "tócalo",
  Tocala: "Tócala",
  Tocalo: "Tócalo",
  tocalas: "tócalas",
  tocandola: "tocándola",
  tocarlo: "tocarlo",
  toque: "toque",
  toques: "toques",
}

const RATON: Verbos = {
  toca: "haz clic en",
  Toca: "Haz clic en",
  tocar: "hacer clic en",
  tocarSolo: "hacer clic",
  Tocar: "Hacer clic en",
  tocas: "haces clic en",
  tocasSolo: "haces clic",
  TocaSolo: "Haz clic",
  tocando: "haciendo clic en",
  tocandoSolo: "haciendo clic",
  Tocando: "Haciendo clic en",
  tocala: "haz clic en ella",
  tocalo: "haz clic en él",
  Tocala: "Haz clic en ella",
  Tocalo: "Haz clic en él",
  tocalas: "haz clic en ellas",
  tocandola: "haciendo clic en ella",
  tocarlo: "hacer clic en él",
  toque: "clic",
  toques: "clics",
}

export function verbos(aparato: Aparato): Verbos {
  return aparato === "computadora" ? RATON : TACTIL
}
