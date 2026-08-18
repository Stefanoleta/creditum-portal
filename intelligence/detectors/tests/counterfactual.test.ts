import { describe, expect, it } from "vitest"
import {
  counterfactual,
  countAggregator,
  meanAggregator,
  sumAggregator,
} from "../src/counterfactual"
import { isOk } from "../src/engine"
import {
  amountMateriality,
  buildMateriality,
  countMateriality,
  ratioBp,
  shareOfTotalBp,
} from "../src/materiality"

const base = { aggregate: meanAggregator, minPopulationAfterRemoval: 1 }

describe("materialidade — só calcula, não decide", () => {
  it("soma exata em centavos", () => {
    const m = amountMateriality([100, 200, 300])
    expect(isOk(m) && m.value).toBe(600)
  })

  it("soma fora da faixa exata vira lacuna, não número aproximado", () => {
    const m = amountMateriality([Number.MAX_SAFE_INTEGER, 1])
    expect(isOk(m)).toBe(false)
  })

  it("contagem de lista vazia é 0, não lacuna — ausência de item é um fato", () => {
    const m = countMateriality([])
    expect(isOk(m) && m.value).toBe(0)
  })

  it("razão com denominador zero é EMPTY_DENOMINATOR", () => {
    const r = ratioBp(5, 0, "x / y")
    expect(isOk(r)).toBe(false)
    if (!isOk(r)) expect(r.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("basis points inteiros, arredondamento determinístico", () => {
    const r = ratioBp(1, 3, "1/3")
    expect(isOk(r) && r.value.bps).toBe(3333)
  })

  it("participação no total, com arredondamento determinístico", () => {
    // 4318920 / 8292057 = 0,52085027… → 5208,5027 bp → 5209.
    // A fixture do Caso A trazia 5208, digitado à mão na Fase 1. Foi corrigida
    // para 5209 na Fase 2.2 — o valor calculado substitui o manual, sem
    // tolerância que preservasse o número antigo.
    const s = shareOfTotalBp(4318920, 8292057, "faixa / total")
    expect(isOk(s) && s.value.bps).toBe(5209)
  })

  it("arredondamento é meio-para-cima e estável", () => {
    expect(isOk(shareOfTotalBp(1, 2, "x")) && shareOfTotalBp(1, 2, "x")).toBeTruthy()
    const meio = shareOfTotalBp(10001, 20000, "x")
    expect(isOk(meio) && meio.value.bps).toBe(5001)
  })

  it("o basis obriga o campo correspondente", () => {
    expect(buildMateriality({ basis: "amount_cents", value: amountMateriality([500]) })).toEqual({
      basis: "amount_cents",
      amount_cents: 500,
    })
    expect(buildMateriality({ basis: "count", value: countMateriality([1, 2]) })).toEqual({
      basis: "count",
      count: 2,
    })
  })

  it("materialidade que não pôde ser calculada devolve null, nunca zero", () => {
    expect(
      buildMateriality({ basis: "ratio_bp", value: ratioBp(5, 0, "x / y") }),
    ).toBeNull()
  })

  it("nenhum threshold da Creditum vive neste módulo", async () => {
    const modulo = (await import("../src/materiality")) as Record<string, unknown>
    const constantes = Object.entries(modulo).filter(([, v]) => typeof v === "number")
    expect(constantes).toEqual([])
  })
})

describe("contrafactual — N elementos", () => {
  it("média com e sem o caso material", () => {
    // Caso D da POC: o ticket médio cai quando o maior contrato sai.
    const tickets = [1184580, 500000, 400000, 300000]
    const r = counterfactual({ items: tickets, removeIndex: 0, ...base, aggregate: meanAggregator })

    expect(isOk(r.aggregate_with_item) && r.aggregate_with_item.value).toBe(596145)
    expect(isOk(r.aggregate_without_item) && r.aggregate_without_item.value).toBe(400000)
    expect(isOk(r.delta) && r.delta.value).toBe(196145)
  })

  it("delta_bp usa o agregado SEM o item como denominador", () => {
    const r = counterfactual({ items: [200, 100], removeIndex: 0, ...base, aggregate: sumAggregator })
    // com = 300, sem = 100, delta = 200 → 200/100 = 20000 bp
    expect(isOk(r.delta_bp) && r.delta_bp.value).toBe(20000)
  })

  it("share_of_total_bp usa o agregado COM o item", () => {
    const r = counterfactual({ items: [200, 100], removeIndex: 0, ...base, aggregate: sumAggregator })
    // delta 200 / total 300 = 6667 bp
    expect(isOk(r.share_of_total_bp) && r.share_of_total_bp.value).toBe(6667)
  })

  it("funciona com contagem", () => {
    const r = counterfactual({
      items: ["a", "b", "c"],
      removeIndex: 1,
      minPopulationAfterRemoval: 1,
      aggregate: countAggregator,
    })
    expect(isOk(r.delta) && r.delta.value).toBe(1)
  })
})

describe("contrafactual — 1 elemento", () => {
  it("remover o único item deixa população vazia — EMPTY_DENOMINATOR, nunca zero", () => {
    const r = counterfactual({ items: [500], removeIndex: 0, ...base })

    expect(isOk(r.aggregate_with_item)).toBe(true)
    expect(isOk(r.aggregate_without_item)).toBe(false)
    if (!isOk(r.aggregate_without_item)) {
      expect(r.aggregate_without_item.gap).toBe("EMPTY_DENOMINATOR")
    }
    // O delta NÃO é 500. Não há "sem item" com que comparar.
    expect(isOk(r.delta)).toBe(false)
  })
})

describe("contrafactual — 0 elementos", () => {
  it("população vazia é índice inválido, não zero", () => {
    const r = counterfactual({ items: [], removeIndex: 0, ...base })
    expect(isOk(r.aggregate_with_item)).toBe(false)
    expect(isOk(r.delta)).toBe(false)
  })
})

describe("contrafactual — população mínima", () => {
  it("respeita o mínimo configurado", () => {
    const r = counterfactual({
      items: [100, 200],
      removeIndex: 0,
      aggregate: meanAggregator,
      minPopulationAfterRemoval: 2,
    })
    expect(isOk(r.aggregate_without_item)).toBe(false)
    if (!isOk(r.aggregate_without_item)) {
      expect(r.aggregate_without_item.detail).toContain("abaixo do mínimo")
    }
  })

  it("boundary: mínimo−1, mínimo, mínimo+1 itens restantes", () => {
    const comRestantes = (n: number): boolean => {
      const items = Array.from({ length: n + 1 }, (_, i) => (i + 1) * 100)
      const r = counterfactual({
        items,
        removeIndex: 0,
        aggregate: meanAggregator,
        minPopulationAfterRemoval: 2,
      })
      return isOk(r.aggregate_without_item)
    }
    expect(comRestantes(1)).toBe(false)
    expect(comRestantes(2)).toBe(true)
    expect(comRestantes(3)).toBe(true)
  })
})

describe("contrafactual — índice inválido", () => {
  it("fora da faixa é lacuna explícita, não silêncio", () => {
    for (const idx of [-1, 5, 1.5, NaN]) {
      const r = counterfactual({ items: [100, 200], removeIndex: idx, ...base })
      expect(isOk(r.delta), `índice ${idx}`).toBe(false)
    }
  })

  it("a lacuna diz qual índice e qual população", () => {
    const r = counterfactual({ items: [100, 200], removeIndex: 9, ...base })
    if (!isOk(r.delta)) expect(r.delta.detail).toContain("índice 9")
  })
})

describe("contrafactual — valores negativos e overflow", () => {
  it("aceita negativo (estorno é dado legítimo)", () => {
    const r = counterfactual({
      items: [-10000, 50000, 30000],
      removeIndex: 0,
      ...base,
      aggregate: sumAggregator,
    })
    expect(isOk(r.aggregate_with_item) && r.aggregate_with_item.value).toBe(70000)
    expect(isOk(r.delta) && r.delta.value).toBe(-10000)
  })

  it("overflow vira lacuna, não número aproximado", () => {
    const r = counterfactual({
      items: [Number.MAX_SAFE_INTEGER, 1],
      removeIndex: 1,
      ...base,
      aggregate: sumAggregator,
    })
    expect(isOk(r.aggregate_with_item)).toBe(false)
    expect(isOk(r.delta)).toBe(false)
  })
})

describe("contrafactual — determinismo", () => {
  it("mesma entrada, mesma saída", () => {
    const entrada = { items: [100, 200, 300], removeIndex: 1, ...base }
    expect(counterfactual(entrada)).toEqual(counterfactual(entrada))
  })

  it("não muta a lista de entrada", () => {
    const items = [100, 200, 300]
    counterfactual({ items, removeIndex: 1, ...base })
    expect(items).toEqual([100, 200, 300])
  })
})
