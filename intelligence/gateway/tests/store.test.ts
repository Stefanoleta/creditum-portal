/**
 * Imutabilidade em runtime.
 *
 * `readonly` do TypeScript some na compilação. Um store que só promete
 * imutabilidade no tipo não promete nada para o código que roda — e o plano de
 * consulta não pode depender de garantia que não existe em runtime.
 *
 * Duas propriedades distintas, que costumam ser confundidas:
 *   - **cópia profunda**: mutar a origem depois não altera o store
 *   - **congelamento profundo**: mutar o que o store devolve não altera o store
 */

import { describe, expect, it } from "vitest"
import { createValidatedStore, loadSyntheticStore } from "../src/store"
import { FACTORY_OPTS, rawSnapshot, rawTrio } from "./helpers"

/** Tenta mutar sem propagar a exceção — em módulo ESM, frozen lança TypeError. */
function tentarMutar(acao: () => void): "lancou" | "silencioso" {
  try {
    acao()
    return "silencioso"
  } catch {
    return "lancou"
  }
}

describe("cópia profunda — o store não compartilha referência com a origem", () => {
  it("mutar o objeto de origem depois não altera o store", () => {
    const origem = rawTrio()
    const store = createValidatedStore(origem, FACTORY_OPTS)

    const payloadOrigem = origem.snapshots[0]?.["payload"] as Record<string, number>
    payloadOrigem["sales_count"] = 999

    expect(store.allSnapshots()[0]?.payload.sales_count).toBe(14)
  })

  it("mutar array de origem depois não altera o store", () => {
    const origem = rawTrio()
    const store = createValidatedStore(origem, FACTORY_OPTS)

    origem.events.push(rawSnapshot())

    expect(store.allEvents()).toHaveLength(1)
  })
})

describe("congelamento profundo — o que o store devolve não é mutável", () => {
  const store = loadSyntheticStore(FACTORY_OPTS)

  it("o array de topo está congelado", () => {
    expect(Object.isFrozen(store.allSnapshots())).toBe(true)
  })

  it("o objeto snapshot está congelado", () => {
    const snap = store.allSnapshots()[0]
    expect(snap).toBeDefined()
    expect(Object.isFrozen(snap)).toBe(true)
  })

  it("payload aninhado não aceita mutação", () => {
    const snap = store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_pipeline")
    expect(snap).toBeDefined()
    const antes = snap?.payload.sales_count

    const payload = snap?.payload as unknown as Record<string, number>
    tentarMutar(() => {
      payload["sales_count"] = 999
    })

    const depois = store
      .allSnapshots()
      .find((s) => s.snapshot_id === "snap_2026_08_pipeline")?.payload.sales_count
    expect(depois).toBe(antes)
    expect(depois).not.toBe(999)
  })

  it("histograma dentro do payload não aceita mutação", () => {
    const snap = store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_pipeline")
    const hist = snap?.payload.installments_histogram as unknown as Record<string, number>
    const antes = hist["acima_de_24"]

    tentarMutar(() => {
      hist["acima_de_24"] = 999
    })

    expect(
      store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_pipeline")?.payload
        .installments_histogram?.["acima_de_24"],
    ).toBe(antes)
  })

  it("conflicts aninhado não aceita mutação — nem o campo `resolved`", () => {
    const snap = store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_sales")
    const conflito = snap?.conflicts[0] as unknown as Record<string, unknown>

    tentarMutar(() => {
      conflito["resolved"] = true
    })

    expect(
      store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_sales")?.conflicts[0]
        ?.resolved,
    ).toBe(false)
  })

  it("versions dentro de conflicts não aceita mutação", () => {
    const snap = store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_sales")
    const versoes = snap?.conflicts[0]?.versions as unknown as Record<string, string>[]
    const antes = versoes[0]?.["value_repr"]

    tentarMutar(() => {
      const primeira = versoes[0]
      if (primeira !== undefined) primeira["value_repr"] = "999"
    })

    expect(
      store.allSnapshots().find((s) => s.snapshot_id === "snap_2026_08_sales")?.conflicts[0]
        ?.versions[0]?.value_repr,
    ).toBe(antes)
  })

  it("contributing_cases dentro de evento não aceita mutação", () => {
    const evento = store.allEvents().find((e) => e.event_id === "evt_a_parcelamento_agosto")
    const caso = evento?.contributing_cases?.[0]?.contribution as unknown as Record<string, number>
    const antes = caso["amount_cents"]

    tentarMutar(() => {
      caso["amount_cents"] = 1
    })

    expect(
      store.allEvents().find((e) => e.event_id === "evt_a_parcelamento_agosto")
        ?.contributing_cases?.[0]?.contribution.amount_cents,
    ).toBe(antes)
  })

  it("não é possível acrescentar evento ao array devolvido", () => {
    const antes = store.allEvents().length
    tentarMutar(() => {
      ;(store.allEvents() as unknown as unknown[]).push({})
    })
    expect(store.allEvents()).toHaveLength(antes)
  })
})
