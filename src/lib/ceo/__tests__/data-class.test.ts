import { describe, it, expect } from "vitest"
import {
  observed,
  calculated,
  inferred,
  notAvailable,
  conflict,
  rulePending,
  forecast,
  isOk,
  mapMetric,
  unwrapOr,
  combine2,
  combine3,
  sumMetrics,
  ratio,
  meanCents,
  type Metric,
  type Forecast,
} from "../data-class"
import { formatBpsPercent } from "../parse"

// ─── Construtores e classificação ─────────────────────────────────────────────

describe("classificação de dado (§3)", () => {
  it("separa observado, calculado, inferido e previsão", () => {
    expect(observed(17).dataClass).toBe("observed")
    expect(calculated(17, "a + b").dataClass).toBe("calculated")
    expect(inferred("COMMERCIAL", 0.82).dataClass).toBe("inferred")
    const f = forecast({
      expectedValue: 492,
      lowerBound: 475,
      upperBound: 509,
      confidence: 0.8,
      modelVersion: "v0",
    })
    expect(f.dataClass).toBe("forecast")
  })

  it("exige fórmula em métrica calculada", () => {
    const m = calculated(140, "sales / leads")
    expect(m.ok && m.formula).toBe("sales / leads")
  })

  it("recusa inferência sem confiança válida", () => {
    const m = inferred("COMMERCIAL", 1.5)
    expect(m.ok).toBe(false)
    expect(!m.ok && m.gap).toBe("LOW_CONFIDENCE")
  })
})

describe("lacunas nunca são zero", () => {
  it("ausência é DATA_NOT_AVAILABLE", () => {
    const m = notAvailable("curso não fornecido pela fonte")
    expect(m.ok).toBe(false)
    expect(!m.ok && m.gap).toBe("DATA_NOT_AVAILABLE")
  })

  it("divergência entre fontes é DATA_CONFLICT com as fontes nomeadas", () => {
    const m = conflict("pipeline diz 8 vendas, financeiro diz 14", [
      "google_sheets:pipeline",
      "google_sheets:sales",
    ])
    expect(!m.ok && m.gap).toBe("DATA_CONFLICT")
    expect(m.sources).toEqual(["google_sheets:pipeline", "google_sheets:sales"])
  })

  it("regra de negócio não definida é BUSINESS_RULE_PENDING (§46)", () => {
    const m = rulePending("regra oficial de churn não fornecida")
    expect(!m.ok && m.gap).toBe("BUSINESS_RULE_PENDING")
  })

  it("o fallback só existe se for nomeado explicitamente", () => {
    expect(unwrapOr(notAvailable(), 0)).toBe(0)
    expect(unwrapOr(observed(17), 0)).toBe(17)
  })
})

// ─── Propagação ───────────────────────────────────────────────────────────────

describe("combinadores propagam lacuna em vez de somar zero", () => {
  it("uma lacuna em qualquer entrada torna o total indisponível", () => {
    const total = combine3(
      observed(10),
      notAvailable("aba financeira fora do ar"),
      observed(3),
      (a, b, c) => a + b + c,
      "a + b + c",
    )
    expect(total.ok).toBe(false)
    expect(!total.ok && total.gap).toBe("DATA_NOT_AVAILABLE")
    expect(!total.ok && total.detail).toBe("aba financeira fora do ar")
  })

  it("soma normal quando tudo está disponível", () => {
    const total = combine2(observed(10), observed(4), (a, b) => a + b, "a + b")
    expect(total.ok && total.value).toBe(14)
  })

  it("sumMetrics soma uma lista e invalida o total se faltar uma parcela", () => {
    const ok = sumMetrics([observed(8), observed(6)], "SUM(vendas)")
    expect(ok.ok && ok.value).toBe(14)

    const furado = sumMetrics([observed(8), notAvailable("unidade sem reporte")], "SUM(vendas)")
    expect(furado.ok).toBe(false)
    expect(!furado.ok && furado.gap).toBe("DATA_NOT_AVAILABLE")
  })

  it("um total que depende de previsão é previsão, não fato", () => {
    const f: Metric<Forecast> = forecast({
      expectedValue: 100,
      lowerBound: 90,
      upperBound: 110,
      confidence: 0.7,
      modelVersion: "v0",
    })
    const projecao = mapMetric(f, (x) => x.expectedValue)
    const total = combine2(observed(14), projecao, (a, b) => a + b, "vendas + projeção")
    expect(total.dataClass).toBe("forecast")
    expect(total.ok && total.value).toBe(114)
  })

  it("une as fontes e usa o dado mais velho como frescor", () => {
    const total = combine2(
      observed(10, { sources: ["sheets:sales"], asOf: "2026-08-13T14:42:00Z" }),
      observed(4, { sources: ["bitrix"], asOf: "2026-08-13T11:00:00Z" }),
      (a, b) => a + b,
      "a + b",
    )
    expect(total.sources).toEqual(["bitrix", "sheets:sales"])
    expect(total.asOf).toBe("2026-08-13T11:00:00Z")
  })
})

// ─── Razão / conversão ────────────────────────────────────────────────────────

describe("ratio", () => {
  it("nunca devolve 0% quando não houve lead", () => {
    const r = ratio(observed(0), observed(0), "sales / leads")
    expect(r.ok).toBe(false)
    expect(!r.ok && r.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("distingue zero venda de zero lead", () => {
    const semVenda = ratio(observed(0), observed(50), "sales / leads")
    expect(semVenda.ok && semVenda.value.bps).toBe(0) // 0% é um fato

    const semLead = ratio(observed(0), observed(0), "sales / leads")
    expect(semLead.ok).toBe(false) // "não sei" não é 0%
  })

  it("propaga lacuna do numerador e do denominador", () => {
    expect(ratio(notAvailable(), observed(10), "n/d").ok).toBe(false)
    expect(ratio(observed(10), notAvailable(), "n/d").ok).toBe(false)
  })
})

// A aba 3 da planilha é uma conversão consolidada montada à MÃO pelo time.
// Ela nunca alimenta métrica (role=reference_only), mas serve de verificação
// independente: se minha matemática reproduz os números dela, as duas estão de
// acordo. Se divergir, o auditor tem que apontar.

describe("reconciliação com a aba consolidada manual", () => {
  const casos: Array<{ nome: string; vendas: number; leads: number; esperado: string }> = [
    { nome: "geral", vendas: 14, leads: 132, esperado: "10,61%" },
    { nome: "indicação total", vendas: 8, leads: 22, esperado: "36,36%" },
    { nome: "qualificação total", vendas: 6, leads: 110, esperado: "5,45%" },
    { nome: "vendedor A geral", vendas: 8, leads: 58, esperado: "13,79%" },
    { nome: "vendedor A indicação", vendas: 5, leads: 12, esperado: "41,67%" },
    { nome: "vendedor A qualificação", vendas: 3, leads: 46, esperado: "6,52%" },
    { nome: "vendedor B geral", vendas: 6, leads: 54, esperado: "11,11%" },
    { nome: "vendedor B indicação", vendas: 3, leads: 8, esperado: "37,50%" },
    { nome: "vendedor B qualificação", vendas: 3, leads: 46, esperado: "6,52%" },
  ]

  it.each(casos)("$nome: $vendas/$leads = $esperado", ({ vendas, leads, esperado }) => {
    const r = ratio(observed(vendas), observed(leads), "sales / leads_received")
    expect(r.ok).toBe(true)
    expect(formatBpsPercent(r.ok ? r.value.bps : null)).toBe(esperado)
  })

  it("vendedor sem nenhum lead não vira 0% de conversão", () => {
    // A aba manual escreve 0,00% para um vendedor com 0 indicados.
    // Isso é errado: sem lead não há conversão a medir.
    const r = ratio(observed(0), observed(0), "sales / leads_received")
    expect(r.ok).toBe(false)
    expect(!r.ok && r.gap).toBe("EMPTY_DENOMINATOR")
  })
})

// ─── Previsão ─────────────────────────────────────────────────────────────────

describe("forecast", () => {
  it("aceita faixa coerente", () => {
    const f = forecast({
      expectedValue: 492,
      lowerBound: 475,
      upperBound: 509,
      confidence: 0.8,
      modelVersion: "v0",
    })
    expect(f.ok && f.value.expectedValue).toBe(492)
    expect(f.ok && f.value.lowerBound).toBe(475)
  })

  it("recusa faixa que não contém o valor esperado", () => {
    const f = forecast({
      expectedValue: 492,
      lowerBound: 500,
      upperBound: 520,
      confidence: 0.8,
      modelVersion: "v0",
    })
    expect(f.ok).toBe(false)
  })

  it("recusa confiança fora de 0..1", () => {
    const f = forecast({
      expectedValue: 1,
      lowerBound: 0,
      upperBound: 2,
      confidence: 2,
      modelVersion: "v0",
    })
    expect(f.ok).toBe(false)
  })
})

// ─── Média ────────────────────────────────────────────────────────────────────

describe("meanCents (TKM)", () => {
  it("calcula a média em centavos inteiros", () => {
    // as 14 vendas de agosto: 8.292.057 centavos / 14
    const tickets = [
      815160, 901110, 785140, 217875, 679500, 887040, 430500, 464690, 1020000, 178500, 327570,
      679230, 188750, 716992,
    ]
    const m = meanCents(tickets, "AVG(ticket)")
    expect(m.ok && m.value).toBe(592290) // R$ 5.922,90
  })

  it("sem venda não é ticket zero", () => {
    const m = meanCents([], "AVG(ticket)")
    expect(m.ok).toBe(false)
    expect(!m.ok && m.gap).toBe("EMPTY_DENOMINATOR")
  })
})

// ─── Garantia de tipagem ──────────────────────────────────────────────────────

describe("o tipo impede ler value sem checar ok", () => {
  it("isOk estreita o tipo", () => {
    const m: Metric<number> = observed(17)
    if (isOk(m)) {
      const n: number = m.value
      expect(n).toBe(17)
    } else {
      throw new Error("deveria estar ok")
    }
  })
})
