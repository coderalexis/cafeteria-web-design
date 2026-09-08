import { describe, it, expect } from "vitest"
import {
  avisoCierreAutomatico,
  staleDeadline,
  GRACIA_HORAS,
  HORAS_SIN_HORARIO,
  TECHO_HORAS,
} from "@/lib/cash-session"

const CDMX = "America/Mexico_City"

/**
 * Cuándo vence una caja. Las constantes se confunden con facilidad —«¿no
 * cerraba a las 11?», «¿no eran 14 horas?»— así que aquí queda escrito el
 * caso real de una cafetería que abre a las 8:30 y cierra a las 22:00.
 */
describe("staleDeadline", () => {
  it("vence a la hora de cierre más la gracia, no a la hora de cierre", () => {
    // Abrió el 7 de septiembre a las 08:32 de la mañana (CDMX).
    const abrio = new Date("2026-09-07T14:32:23Z")
    const vence = staleDeadline(abrio, CDMX, "22:00")
    // 22:00 del mismo día + 3 h = la 01:00 del día siguiente.
    expect(vence.toISOString()).toBe("2026-09-08T07:00:00.000Z")
  })

  it("con el cierre ya pasado al abrir, apunta al del día siguiente", () => {
    // Abrió a las 23:00, una hora DESPUÉS de su cierre de las 22:00.
    const abrio = new Date("2026-09-07T05:00:00Z")
    const vence = staleDeadline(abrio, CDMX, "22:00")
    // El techo de 24 h gana: no puede esperar hasta la 01:00 de pasado mañana.
    expect(vence.getTime()).toBe(abrio.getTime() + TECHO_HORAS * 3_600_000)
  })

  it("sin horario configurado usa el tope de horas, no la gracia", () => {
    const abrio = new Date("2026-09-07T14:32:23Z")
    expect(staleDeadline(abrio, CDMX, null).getTime()).toBe(abrio.getTime() + HORAS_SIN_HORARIO * 3_600_000)
    expect(staleDeadline(abrio, CDMX, "").getTime()).toBe(abrio.getTime() + HORAS_SIN_HORARIO * 3_600_000)
  })
})

/**
 * El aviso es lo único que la dueña llega a leer: el motivo real vive en
 * `closing_notes`, dentro de un corte que nadie abre.
 */
describe("avisoCierreAutomatico", () => {
  // Se cerró a las 04:00 (CDMX) y ella llega a las 08:00 del mismo día.
  const cerro = new Date("2026-09-08T10:00:00Z")
  const base = { closedAt: cerro, timezone: CDMX, closingTime: "22:00", expectedCash: 1259 }

  it("dice «hoy» cuando se cerró el mismo día del negocio", () => {
    const aviso = avisoCierreAutomatico({ ...base, now: new Date("2026-09-08T14:00:00Z") })
    expect(aviso.titulo).toContain("hoy a las")
    expect(aviso.titulo).toContain("se cerró sola")
  })

  it("no dice «hoy» cuando ya pasó a otro día", () => {
    const aviso = avisoCierreAutomatico({ ...base, now: new Date("2026-09-09T14:00:00Z") })
    expect(aviso.titulo).not.toContain("hoy")
  })

  it("explica el motivo con la hora de cierre del negocio y la gracia", () => {
    const aviso = avisoCierreAutomatico({ ...base, now: new Date("2026-09-08T14:00:00Z") })
    expect(aviso.detalle).toContain("22:00")
    expect(aviso.detalle).toContain(`${GRACIA_HORAS} h de gracia`)
  })

  it("dice cuánto efectivo se esperaba y que nadie lo contó", () => {
    const aviso = avisoCierreAutomatico({ ...base, now: new Date("2026-09-08T14:00:00Z") })
    expect(aviso.detalle).toContain("1,259")
    expect(aviso.detalle).toContain("nadie contó")
  })

  it("sin esperado calculado, no inventa una cifra", () => {
    const aviso = avisoCierreAutomatico({ ...base, expectedCash: null, now: new Date("2026-09-08T14:00:00Z") })
    expect(aviso.detalle).not.toContain("$")
    expect(aviso.detalle).not.toContain("nadie contó")
  })

  it("sin horario configurado, habla del tope de horas", () => {
    const aviso = avisoCierreAutomatico({ ...base, closingTime: null, now: new Date("2026-09-08T14:00:00Z") })
    expect(aviso.detalle).toContain(`${HORAS_SIN_HORARIO} h abierta`)
    expect(aviso.detalle).not.toContain("gracia")
  })
})
