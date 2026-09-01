import { describe, expect, it } from "vitest"
import {
  QUEUE_MAX,
  canEnqueue,
  clearDiffs,
  dropSale,
  enqueue,
  isNetworkError,
  markNeedsReview,
  markRetry,
  markUploaded,
  nextProvisional,
  pendingCount,
  queueKey,
  readQueue,
  reviewCount,
  type QueueState,
  type QueuedSale,
} from "@/app/pos/queue"

// La cola es lo que hay entre «se fue el internet» y «perdí seis ventas».
// Todo aquí es puro y sin red: se prueba la contabilidad de la cola, que es
// donde un error se vuelve dinero.

const vacia = (): QueueState => readQueue(null)

function venta(ref: string, total = 100): Omit<QueuedSale, "provisional" | "status" | "attempts"> {
  return {
    clientRef: ref,
    capturedAt: 1_000_000,
    items: [{ variant_id: "v1", quantity: 1 }],
    paymentMethod: "efectivo",
    chargedTotal: total,
    lines: [{ name: "Latte", quantity: 1, unitPrice: total, modifiers: [] }],
  }
}

describe("readQueue", () => {
  it("con nada, o con basura, arranca vacía en vez de tronar", () => {
    expect(readQueue(null).sales).toEqual([])
    expect(readQueue("texto").sales).toEqual([])
    expect(readQueue({ v: 99, sales: [] }).sales).toEqual([]) // versión desconocida
    expect(readQueue({ v: 1, sales: "no es lista" }).sales).toEqual([])
  })

  it("tira ventas malformadas pero conserva las buenas", () => {
    const q = readQueue({ v: 1, sales: [{ clientRef: "a", items: [] }, { sinRef: true }, null] })
    expect(q.sales).toHaveLength(1)
    expect(q.folios).toEqual({})
    expect(q.diffs).toEqual([])
  })

  it("la llave es por cafetería: dos cafés en un aparato no se mezclan", () => {
    expect(queueKey("abc")).not.toBe(queueKey("xyz"))
  })
})

describe("folios provisionales", () => {
  it("son consecutivos y no se reutilizan aunque la venta ya haya subido", () => {
    let q = enqueue(vacia(), venta("a"))
    q = enqueue(q, venta("b"))
    expect(q.sales.map((s) => s.provisional)).toEqual(["P-1", "P-2"])
    q = markUploaded(q, "a", 501, 100) // P-1 ya tiene folio real
    expect(nextProvisional(q)).toBe("P-3") // no vuelve a dar P-1
  })
})

describe("tope de la cola", () => {
  it(`admite ${QUEUE_MAX} y ni una más`, () => {
    let q = vacia()
    for (let i = 0; i < QUEUE_MAX; i++) q = enqueue(q, venta(`r${i}`))
    expect(canEnqueue(q)).toBe(false)
    q = dropSale(q, "r0")
    expect(canEnqueue(q)).toBe(true)
  })
})

describe("subir una venta", () => {
  it("la saca de la cola y recuerda a qué folio real correspondió", () => {
    let q = enqueue(vacia(), venta("a", 100))
    q = markUploaded(q, "a", 777, 100)
    expect(q.sales).toHaveLength(0)
    expect(q.folios["P-1"]).toBe(777)
    expect(q.diffs).toEqual([])
  })

  it("si el servidor cobró distinto a lo que se le dijo al cliente, lo apunta en vez de callarlo", () => {
    // p. ej. una promoción que venció mientras la venta esperaba en la cola
    let q = enqueue(vacia(), venta("a", 100))
    q = markUploaded(q, "a", 778, 92)
    expect(q.diffs).toEqual([{ provisional: "P-1", folio: 778, charged: 100, registered: 92 }])
    expect(clearDiffs(q).diffs).toEqual([])
  })

  it("un centavo de redondeo no cuenta como diferencia", () => {
    let q = enqueue(vacia(), venta("a", 100))
    q = markUploaded(q, "a", 779, 100.004)
    expect(q.diffs).toEqual([])
  })

  it("subir una venta que no está en la cola no cambia nada", () => {
    const q = enqueue(vacia(), venta("a"))
    expect(markUploaded(q, "no-existe", 1, 1)).toEqual(q)
  })
})

describe("reintentos y revisión", () => {
  it("cuenta intentos y pasa a «revisar» con el motivo cuando el servidor rechaza", () => {
    let q = enqueue(vacia(), venta("a"))
    q = markRetry(q, "a")
    expect(q.sales[0].attempts).toBe(1)
    expect(pendingCount(q)).toBe(1)
    q = markNeedsReview(q, "a", "La caja está cerrada.")
    expect(q.sales[0].status).toBe("revisar")
    expect(q.sales[0].error).toBe("La caja está cerrada.")
    expect(q.sales[0].attempts).toBe(2)
    expect(pendingCount(q)).toBe(0)
    expect(reviewCount(q)).toBe(1)
  })
})

describe("isNetworkError", () => {
  it("distingue «no hay internet» de «el servidor dijo que no»", () => {
    expect(isNetworkError("TypeError: Failed to fetch")).toBe(true)
    expect(isNetworkError("Load failed")).toBe(true)
    expect(isNetworkError("Sin conexión")).toBe(true)
    expect(isNetworkError("La caja está cerrada. Abre la caja antes de cobrar.")).toBe(false)
  })
})
