/**
 * Detector A — concentração de parcelamento.
 *
 * THRESHOLD APROVADO: `installment_threshold = 19`, do briefing do Bloco 1 §14
 * Caso A. Comparação estritamente maior.
 *
 * TODOS os demais números destes testes vêm da `TEST_CONFIG` sintética e **não
 * são política da Creditum**. O baseline `2800 bp` que a fixture da Fase 1
 * trazia também não tem lastro — aqui ele nunca é default.
 *
 * O Detector A não produz inferência nem previsão: só `observed`, `calculated`
 * e `gap`.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DETECTOR_ID,
  DETECTOR_VERSION,
  FORMULA_AMOUNT_ABOVE,
  FORMULA_SHARE_AMOUNT,
  FORMULA_SHARE_COUNT,
  acimaDoLimiar,
  detectInstallmentConcentration,
} from "../src/installment-concentration"
import type {
  Baseline,
  ContractRecord,
  InstallmentDetectorInput,
} from "../src/installment-concentration"
import { APPROVED_THRESHOLDS } from "../src/config"
import type { DetectorConfig, Severity } from "../src/config"
import { isOk } from "../src/engine"
import { assertValid } from "../../gateway/src/contracts"
import { GatewayError } from "../../gateway/src/errors"
import type { CanonicalUnitResult } from "../src/canonical-units"
import type { Evidence, Snapshot } from "../../gateway/src/types"
import { TEST_CONFIG } from "./test-config"
import { buildProductionDetectorConfig } from "../src/production-policy"
import { rawEvidence, rawSnapshot } from "../../gateway/tests/helpers"

const DETECTED_AT = "2026-08-16T09:05:00.000Z"
const LIMIAR = APPROVED_THRESHOLDS.installment_threshold

const snapshots = [
  rawSnapshot({ snapshot_id: "snap_vendas", source_system: "google_sheets", dataset_id: "ds_vendas" }),
] as unknown as Snapshot[]

const evidence = [
  rawEvidence({
    evidence_id: "ev_linha",
    snapshot_id: "snap_vendas",
    kind: "row",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "a".repeat(64) },
  }),
  rawEvidence({
    evidence_id: "ev_agregado",
    snapshot_id: "snap_vendas",
    kind: "computed",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", column: "Total de parcelas" },
    formula: "count(elegiveis where installments > 19) / count(elegiveis)",
  }),
  rawEvidence({
    evidence_id: "ev_baseline",
    snapshot_id: "snap_vendas",
    kind: "aggregate",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas" },
  }),
] as unknown as Evidence[]

const MATCHED: CanonicalUnitResult = {
  status: "matched",
  unit_id: "mogi_das_cruzes",
  display_name: "Mogi das Cruzes",
}

let seq = 0
function subjectRef(): string {
  seq += 1
  return `subj_${seq.toString(16).padStart(16, "0")}`
}

function contrato(
  installment_count: number | null,
  amount_cents: number | null = 100_000,
  unit: CanonicalUnitResult = MATCHED,
): ContractRecord {
  return {
    subject_ref: subjectRef(),
    unit,
    installment_count,
    amount_cents,
    evidence_refs: ["ev_linha"],
    snapshot_id: "snap_vendas",
  }
}

function entrada(
  contracts: readonly ContractRecord[],
  extra: Partial<InstallmentDetectorInput> = {},
): InstallmentDetectorInput {
  return {
    detected_at: DETECTED_AT,
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    contracts,
    snapshots,
    evidence,
    aggregate_evidence_ref: "ev_agregado",
    ...extra,
  }
}

const detectar = (
  contracts: readonly ContractRecord[],
  extra: Partial<InstallmentDetectorInput> = {},
  config: DetectorConfig = TEST_CONFIG,
): ReturnType<typeof detectInstallmentConcentration> =>
  detectInstallmentConcentration(entrada(contracts, extra), config)

/** Suficiente para passar do `minimum_sample_size` sintético. */
const preencher = (n: number, parcelas = 5, valor = 100_000): ContractRecord[] =>
  Array.from({ length: n }, () => contrato(parcelas, valor))

// ═════════════════════════════════════════════════════════════════════════════

describe("A/B/C — o limiar é ESTRITAMENTE maior que 19", () => {
  it("o threshold aprovado é 19", () => {
    expect(LIMIAR).toBe(19)
  })

  it("exatamente 19 parcelas NÃO entra na faixa", () => {
    const r = detectar([contrato(19), ...preencher(4)])
    expect(r.summary.population.contracts_above_threshold).toBe(0)
  })

  it("20 parcelas entra", () => {
    const r = detectar([contrato(20), ...preencher(4)])
    expect(r.summary.population.contracts_above_threshold).toBe(1)
  })

  it("boundary 18 / 19 / 20", () => {
    for (const [parcelas, esperado] of [[18, 0], [19, 0], [20, 1]] as const) {
      const r = detectar([contrato(parcelas), ...preencher(4)])
      expect(r.summary.population.contracts_above_threshold, `${parcelas} parcelas`).toBe(esperado)
    }
  })
})

describe("D/E/F — denominador e extremos", () => {
  it("nenhum contrato elegível: EMPTY_DENOMINATOR, nunca 0%", () => {
    const r = detectar([contrato(null), contrato(0)])
    expect(r.summary.population.eligible_contracts).toBe(0)
    expect(isOk(r.summary.metrics.share_count_bp)).toBe(false)
    if (!isOk(r.summary.metrics.share_count_bp)) {
      expect(r.summary.metrics.share_count_bp.gap).toBe("EMPTY_DENOMINATOR")
    }
    expect(r.event).toBeNull()
  })

  it("todos acima do limiar: 10000 bp", () => {
    const r = detectar(preencher(5, 24))
    expect(isOk(r.summary.metrics.share_count_bp) && r.summary.metrics.share_count_bp.value).toBe(10000)
  })

  it("nenhum acima, mas com denominador: 0 bp — e é um fato, não lacuna", () => {
    const r = detectar(preencher(5, 12))
    const s = r.summary.metrics.share_count_bp
    expect(isOk(s)).toBe(true)
    expect(isOk(s) && s.value).toBe(0)
    expect(r.event).toBeNull()
  })
})

describe("G — installment_count ausente não vira zero parcelas", () => {
  const r = detectar([contrato(null), contrato(null), ...preencher(4, 24)])

  it("sai do denominador em vez de contar como 0 parcelas", () => {
    expect(r.summary.population.total_records).toBe(6)
    expect(r.summary.population.eligible_contracts).toBe(4)
    expect(r.summary.population.excluded.MISSING_INSTALLMENT_COUNT).toBe(2)
  })

  it("a exclusão é contada, não escondida", () => {
    expect(r.summary.population.eligibility_ratio_bp).toBeDefined()
    const e = r.summary.population.eligibility_ratio_bp
    expect(isOk(e) && e.value).toBe(6667)
  })

  it("contamina a qualidade", () => {
    expect(r.summary.quality_status).not.toBe("ok")
  })
})

describe("15 — zero e negativo são inválidos no domínio", () => {
  // Lastro: `check (installments_grau is null or installments_grau > 0)` no
  // schema `ceo`, e `classifyRow` tratando `total > 0` como dado material.
  it("zero parcelas é excluído como inválido, não como faixa baixa", () => {
    const r = detectar([contrato(0), ...preencher(4, 24)])
    expect(r.summary.population.excluded.NON_POSITIVE_INSTALLMENT_COUNT).toBe(1)
    expect(r.summary.population.eligible_contracts).toBe(4)
  })

  it("negativo também", () => {
    const r = detectar([contrato(-5), ...preencher(4, 24)])
    expect(r.summary.population.excluded.NON_POSITIVE_INSTALLMENT_COUNT).toBe(1)
  })

  it("as duas exclusões são contadas separadamente", () => {
    const r = detectar([contrato(null), contrato(0), ...preencher(4, 24)])
    expect(r.summary.population.excluded).toEqual({
      MISSING_INSTALLMENT_COUNT: 1,
      NON_POSITIVE_INSTALLMENT_COUNT: 1,
    })
  })
})

describe("H — valor ausente: contagem sim, volume não", () => {
  const r = detectar([contrato(24, null), ...preencher(4, 24)])

  it("share em quantidade continua calculável", () => {
    expect(isOk(r.summary.metrics.share_count_bp)).toBe(true)
  })

  it("volume da faixa vira lacuna, nunca zero", () => {
    expect(isOk(r.summary.metrics.amount_above_cents)).toBe(false)
  })

  it("share financeiro vira lacuna", () => {
    expect(isOk(r.summary.metrics.share_amount_bp)).toBe(false)
  })

  it("a materialidade cai para base `count`, sem declarar valor que não existe", () => {
    expect(r.event?.materiality.basis).toBe("count")
    expect(r.event?.materiality.amount_cents).toBeUndefined()
  })
})

describe("I/J — negativos e overflow", () => {
  it("valor negativo é somado corretamente (estorno é dado legítimo)", () => {
    const r = detectar([contrato(24, -50_000), contrato(24, 150_000), ...preencher(3, 5)])
    expect(isOk(r.summary.metrics.amount_above_cents) && r.summary.metrics.amount_above_cents.value).toBe(100_000)
  })

  it("com estorno na faixa, a participação do caso é OMITIDA — não clampada", () => {
    // Faixa = -50.000 + 150.000 = 100.000. O caso de 150.000 vale 150% do total
    // e o estorno vale -50%. Nenhum dos dois é "parte de um todo". Clampar para
    // 10000 bp e 0 bp seria inventar dois números que o consumidor não teria
    // como distinguir de participações reais.
    const r = detectar([contrato(24, -50_000), contrato(24, 150_000), ...preencher(3, 5)])
    const casos = r.event?.contributing_cases ?? []
    expect(casos.length).toBeGreaterThan(0)
    for (const c of casos) {
      expect(c.contribution.share_of_event_bp).toBeUndefined()
    }
  })

  it("mas o valor exato de cada caso continua lá, com sinal", () => {
    const r = detectar([contrato(24, -50_000), contrato(24, 150_000), ...preencher(3, 5)])
    const valores = (r.event?.contributing_cases ?? []).map((c) => c.contribution.amount_cents)
    expect(valores).toContain(150_000)
    expect(valores).toContain(-50_000)
  })

  it("sem estorno, a participação volta a existir normalmente", () => {
    const r = detectar([contrato(24, 300_000), contrato(24, 100_000), ...preencher(3, 5)])
    expect(r.event?.contributing_cases?.[0]?.contribution.share_of_event_bp).toBe(7500)
  })

  it("volume com sinal misto: share em VALOR vira lacuna de regra pendente", () => {
    // O numerador fica negativo. A divisão existe, a leitura não: "a faixa
    // representa -X% do volume" não é participação. Quem decide como tratar
    // volume líquido negativo é o CEO — até lá, lacuna nomeada.
    const r = detectar([contrato(24, -100_000), contrato(24, -20_000), ...preencher(3, 5, 200_000)])
    const s = r.summary.metrics.share_amount_bp
    expect(isOk(s)).toBe(false)
    if (!isOk(s)) expect(s.gap).toBe("BUSINESS_RULE_PENDING")
  })

  it("mas os dois volumes continuam publicados, exatos e com sinal", () => {
    const r = detectar([contrato(24, -100_000), contrato(24, -20_000), ...preencher(3, 5, 200_000)])
    const acima = r.summary.metrics.amount_above_cents
    const elegivel = r.summary.metrics.amount_eligible_cents
    expect(isOk(acima) && acima.value).toBe(-120_000)
    expect(isOk(elegivel) && elegivel.value).toBe(480_000)
  })

  it("share em QUANTIDADE não é afetado — contagem não tem sinal", () => {
    const r = detectar([contrato(24, -100_000), contrato(24, -20_000), ...preencher(3, 5, 200_000)])
    expect(isOk(r.summary.metrics.share_count_bp) && r.summary.metrics.share_count_bp.value).toBe(4000)
  })

  it("overflow vira lacuna via guarda do motor, não número aproximado", () => {
    const r = detectar([
      contrato(24, Number.MAX_SAFE_INTEGER),
      contrato(24, Number.MAX_SAFE_INTEGER),
      ...preencher(3, 5),
    ])
    expect(isOk(r.summary.metrics.amount_above_cents)).toBe(false)
  })
})

describe("K — share em QUANTIDADE e share em VALOR são distintos", () => {
  it("poucos contratos grandes: share de valor alto, share de contagem baixo", () => {
    const r = detectar([
      contrato(24, 9_000_000),
      ...Array.from({ length: 9 }, () => contrato(6, 100_000)),
    ])
    const count = r.summary.metrics.share_count_bp
    const amount = r.summary.metrics.share_amount_bp
    expect(isOk(count) && count.value).toBe(1000) // 1 de 10
    expect(isOk(amount) && amount.value).toBe(9091) // 9M de 9,9M
  })

  it("muitos contratos pequenos: o inverso", () => {
    const r = detectar([
      ...Array.from({ length: 9 }, () => contrato(24, 100_000)),
      contrato(6, 9_000_000),
    ])
    const count = r.summary.metrics.share_count_bp
    const amount = r.summary.metrics.share_amount_bp
    expect(isOk(count) && count.value).toBe(9000)
    expect(isOk(amount) && amount.value).toBe(909)
  })

  it("as duas nunca são a mesma métrica", () => {
    const r = detectar([contrato(24, 9_000_000), ...Array.from({ length: 9 }, () => contrato(6, 100_000))])
    expect(r.summary.metrics.share_count_bp).not.toEqual(r.summary.metrics.share_amount_bp)
  })
})

describe("L — casos contribuintes determinísticos e sem PII", () => {
  const grandes = [
    contrato(24, 500_000),
    contrato(24, 300_000),
    contrato(24, 200_000),
    contrato(24, 100_000),
    ...preencher(4, 5),
  ]
  const r = detectar(grandes)

  it("respeita a regra top_n da config sintética", () => {
    expect(r.event?.contributing_cases).toHaveLength(3)
  })

  it("ordena por valor decrescente", () => {
    const valores = r.event?.contributing_cases?.map((c) => c.contribution.amount_cents)
    expect(valores).toEqual([500_000, 300_000, 200_000])
  })

  it("share individual é sobre o volume da FAIXA", () => {
    // 500000 / 1100000 = 4545 bp
    expect(r.event?.contributing_cases?.[0]?.contribution.share_of_event_bp).toBe(4545)
  })

  it("usa pseudônimo, nunca identidade", () => {
    for (const c of r.event?.contributing_cases ?? []) {
      expect(c.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
    }
  })

  it("desempate por subject_ref torna a ordem estável", () => {
    const iguais = [contrato(24, 100_000), contrato(24, 100_000), contrato(24, 100_000), ...preencher(4, 5)]
    const a = detectar(iguais)
    const b = detectar([...iguais].reverse())
    expect(a.event?.contributing_cases?.map((c) => c.subject_ref)).toEqual(
      b.event?.contributing_cases?.map((c) => c.subject_ref),
    )
  })
})

describe("Q/R — D13: identidade não resolvida nunca vira nome livre", () => {
  const desconhecida: CanonicalUnitResult = { status: "unknown", raw_fingerprint: "a".repeat(16) }
  const ambigua: CanonicalUnitResult = {
    status: "ambiguous",
    candidates: ["alecrim"],
    raw_fingerprint: "b".repeat(16),
  }

  it("unidade unknown: `unit_id` é OMITIDO do caso contribuinte", () => {
    const r = detectar([contrato(24, 500_000, desconhecida), ...preencher(4, 5)])
    expect(r.event?.contributing_cases?.[0]?.unit).toBeUndefined()
  })

  it("unidade ambígua não vira UnitId inventado", () => {
    const r = detectar([contrato(24, 500_000, ambigua), ...preencher(4, 5)])
    expect(r.event?.contributing_cases?.[0]?.unit).toBeUndefined()
    expect(r.summary.quality_status).toBe("conflicted")
  })

  it("nenhum texto cru de unidade atravessa o evento", () => {
    const r = detectar([contrato(24, 500_000, desconhecida), ...preencher(4, 5)])
    const serializado = JSON.stringify(r.event)
    expect(serializado).not.toContain("Maria Silva")
    expect(serializado).not.toContain("Presidente P.")
    expect(serializado).not.toContain("raw_fingerprint")
  })

  it("unidade resolvida entra com o display_name do CATÁLOGO, não da fonte", () => {
    const r = detectar([contrato(24, 500_000), ...preencher(4, 5)])
    expect(r.event?.contributing_cases?.[0]?.unit).toBe("Mogi das Cruzes")
  })
})

describe("S/T — baseline", () => {
  const baseline: Baseline = {
    share_count_bp: 2800,
    source: "periodo_anterior:2026-07",
    evidence_ref: "ev_baseline",
  }

  it("com baseline governado: reference é `observed`", () => {
    const r = detectar(preencher(5, 24), { baseline })
    expect(r.event?.reference_metric?.data_class).toBe("observed")
    expect(r.event?.reference_metric?.value).toBe(2800)
  })

  it("sem baseline: reference é gap, NUNCA zero", () => {
    const r = detectar(preencher(5, 24))
    expect(r.event?.reference_metric?.data_class).toBe("gap")
    expect(r.event?.reference_metric?.value).toBeUndefined()
    expect(r.event?.reference_metric?.gap_reason).toBe("DATA_NOT_AVAILABLE")
  })

  it("2800 não é default — o detector não o produz sozinho", () => {
    const r = detectar(preencher(5, 24))
    expect(JSON.stringify(r.event)).not.toContain("2800")
  })

  it("baseline sem origem identificável falha fechado", () => {
    expect(() => detectar(preencher(5, 24), { baseline: { ...baseline, source: "  " } })).toThrowError(
      /origem precisa ser identificável/,
    )
  })
})

describe("U/V — qualidade não pode virar ok", () => {
  it("cobertura abaixo do mínimo configurado: insufficient", () => {
    const r = detectar(preencher(5, 24), {
      unit_coverage: { expected_units: 20, reporting_units: 15, ratio_bp: 7500 },
    })
    expect(r.summary.quality_status).toBe("insufficient")
  })

  it("snapshot conflitado contamina o evento", () => {
    const conflitado = [
      rawSnapshot({
        snapshot_id: "snap_vendas",
        source_system: "google_sheets",
        dataset_id: "ds_vendas",
        quality_status: "conflicted",
      }),
    ] as unknown as Snapshot[]
    const r = detectar(preencher(5, 24), { snapshots: conflitado })
    expect(r.summary.quality_status).toBe("conflicted")
    expect(r.event?.data_quality.quality_status).toBe("conflicted")
  })

  it("a qualidade é a MAIS FRACA das dependências", () => {
    const r = detectar([contrato(null), contrato(24, null), ...preencher(4, 24)], {
      unit_coverage: { expected_units: 20, reporting_units: 15, ratio_bp: 7500 },
    })
    expect(r.summary.quality_status).toBe("insufficient")
  })

  it("cobertura de unidades e elegibilidade de contratos são dimensões separadas", () => {
    const r = detectar([contrato(null), ...preencher(4, 24)], {
      unit_coverage: { expected_units: 20, reporting_units: 19, ratio_bp: 9500 },
    })
    // 9500 bp de unidades; 8000 bp de elegibilidade. Números diferentes.
    expect(r.event?.data_quality.coverage_ratio_bp).toBe(9500)
    const e = r.summary.population.eligibility_ratio_bp
    expect(isOk(e) && e.value).toBe(8000)
  })
})

describe("O/P — lastro falha fechado", () => {
  it("contrato sem evidência é recusado", () => {
    const semLastro: ContractRecord = { ...contrato(24), evidence_refs: [] }
    expect(() => detectar([semLastro, ...preencher(4)])).toThrowError(/sem evidência/)
  })

  it("evidência inexistente é recusada", () => {
    const ruim: ContractRecord = { ...contrato(24), evidence_refs: ["ev_fantasma"] }
    expect(() => detectar([ruim, ...preencher(4)])).toThrowError(/evidência inexistente/)
  })

  it("evidência de outro snapshot é recusada", () => {
    const outro = [
      ...evidence,
      rawEvidence({
        evidence_id: "ev_alheia",
        snapshot_id: "snap_outro",
        kind: "row",
        locator: { dataset_id: "ds_vendas", sheet: "V", row_key: "b".repeat(64) },
      }),
    ] as unknown as Evidence[]
    const ruim: ContractRecord = { ...contrato(24), evidence_refs: ["ev_alheia"] }
    expect(() => detectar([ruim, ...preencher(4)], { evidence: outro })).toThrowError(
      /pertence ao snapshot snap_outro/,
    )
  })

  it("evidência de outro dataset é recusada", () => {
    const outro = [
      ...evidence,
      rawEvidence({
        evidence_id: "ev_dataset_errado",
        snapshot_id: "snap_vendas",
        kind: "row",
        locator: { dataset_id: "ds_outro", sheet: "V", row_key: "c".repeat(64) },
      }),
    ] as unknown as Evidence[]
    const ruim: ContractRecord = { ...contrato(24), evidence_refs: ["ev_dataset_errado"] }
    expect(() => detectar([ruim, ...preencher(4)], { evidence: outro })).toThrowError(
      /localiza o dataset "ds_outro"/,
    )
  })

  it("evidência de agregado do tipo errado é recusada", () => {
    expect(() => detectar(preencher(5, 24), { aggregate_evidence_ref: "ev_linha" })).toThrowError(
      /agregado exige computed ou aggregate/,
    )
  })

  it("subject_ref que não é pseudônimo é recusado", () => {
    const comNome: ContractRecord = { ...contrato(24), subject_ref: "maria_silva" }
    expect(() => detectar([comNome, ...preencher(4)])).toThrowError(/pseudônimo/)
  })

  it("snapshot fora do conjunto governado é recusado", () => {
    const fora: ContractRecord = { ...contrato(24), snapshot_id: "snap_inexistente" }
    expect(() => detectar([fora, ...preencher(4)])).toThrowError(GatewayError)
  })
})

describe("M/N — determinismo e independência de ordem", () => {
  const contratos = [contrato(24, 500_000), contrato(20, 300_000), contrato(6, 100_000), ...preencher(3, 8)]

  it("mesma entrada, mesma config, mesmo detected_at: deepEqual", () => {
    expect(detectar(contratos)).toEqual(detectar(contratos))
  })

  it("ordem dos contratos não altera o agregado", () => {
    const a = detectar(contratos)
    const b = detectar([...contratos].reverse())
    expect(a.summary.metrics).toEqual(b.summary.metrics)
    expect(a.summary.population).toEqual(b.summary.population)
  })

  it("ordem dos contratos não altera a identidade do evento", () => {
    expect(detectar(contratos).summary.event_id).toBe(
      detectar([...contratos].reverse()).summary.event_id,
    )
  })

  it("o resumo é congelado", () => {
    expect(Object.isFrozen(detectar(contratos).summary)).toBe(true)
  })

  it("não muta a entrada", () => {
    const copia = structuredClone(contratos)
    detectar(contratos)
    expect(contratos).toEqual(copia)
  })
})

describe("22 — identidade do evento é estrutural", () => {
  it("o id casa com o padrão de identificador do contrato", () => {
    expect(detectar(preencher(5, 24)).summary.event_id).toMatch(/^evt_[a-f0-9]{16}$/)
  })

  it("período diferente produz id diferente", () => {
    const agosto = detectar(preencher(5, 24)).summary.event_id
    const setembro = detectCrossPeriod()
    expect(agosto).not.toBe(setembro)
  })

  it("reingestão com outro snapshot_id, mesmo dataset: MESMO id", () => {
    const outroSnapshot = [
      rawSnapshot({ snapshot_id: "snap_vendas_v2", source_system: "google_sheets", dataset_id: "ds_vendas" }),
    ] as unknown as Snapshot[]
    const outraEvidencia = [
      rawEvidence({
        evidence_id: "ev_linha",
        snapshot_id: "snap_vendas_v2",
        kind: "row",
        locator: { dataset_id: "ds_vendas", sheet: "Vendas", row_key: "a".repeat(64) },
      }),
      rawEvidence({
        evidence_id: "ev_agregado",
        snapshot_id: "snap_vendas_v2",
        kind: "computed",
        locator: { dataset_id: "ds_vendas", sheet: "Vendas", column: "Total de parcelas" },
        formula: "f",
      }),
    ] as unknown as Evidence[]

    const original = detectar(preencher(5, 24)).summary.event_id
    const reingerido = detectInstallmentConcentration(
      {
        ...entrada(preencher(5, 24).map((c) => ({ ...c, snapshot_id: "snap_vendas_v2" }))),
        snapshots: outroSnapshot,
        evidence: outraEvidencia,
      },
      TEST_CONFIG,
    ).summary.event_id

    expect(reingerido).toBe(original)
  })
})

function detectCrossPeriod(): string {
  return detectInstallmentConcentration(
    { ...entrada(preencher(5, 24)), period_start: "2026-09-01", period_end: "2026-09-30" },
    TEST_CONFIG,
  ).summary.event_id
}

describe("17 — fato verdadeiro vs fato material", () => {
  it("um contrato acima do limiar não basta para emitir evento", () => {
    // 1 de 10 = 1000 bp, abaixo dos 3000 sintéticos; volume 100k abaixo do
    // material_amount_cents; contagem 1 abaixo de material_count_above.
    const r = detectar([contrato(24, 100_000), ...Array.from({ length: 9 }, () => contrato(6, 100_000))])
    expect(r.event).toBeNull()
    expect(r.summary.material).toBe(false)
  })

  it("o não material é registrado com motivo, não descartado", () => {
    const r = detectar(preencher(5, 12))
    expect(r.summary.non_material_reason).toContain("nenhum contrato acima")
    expect(r.summary.population.eligible_contracts).toBe(5)
  })

  it("amostra abaixo do mínimo não emite, e diz por quê", () => {
    const r = detectar(preencher(2, 24))
    expect(r.event).toBeNull()
    expect(r.summary.non_material_reason).toContain("abaixo do mínimo")
  })
})

describe("W — boundary de materialidade (TEST_CONFIG sintética)", () => {
  const limiar = TEST_CONFIG.installmentConcentration.material_count_above // 3

  const comAcima = (n: number): ReturnType<typeof detectar> => {
    // Base grande mantém os shares abaixo dos limiares, isolando a dimensão de
    // CONTAGEM. Volume individual pequeno mantém o volume abaixo do limiar.
    const acima = Array.from({ length: n }, () => contrato(24, 1000))
    const abaixo = Array.from({ length: 200 - n }, () => contrato(6, 1000))
    return detectar([...acima, ...abaixo])
  }

  it(`limiar−1 (${limiar - 1}) não emite`, () => {
    expect(comAcima(limiar - 1).event).toBeNull()
  })

  it(`limiar (${limiar}) emite`, () => {
    expect(comAcima(limiar).event).not.toBeNull()
  })

  it(`limiar+1 (${limiar + 1}) emite`, () => {
    expect(comAcima(limiar + 1).event).not.toBeNull()
  })
})

describe("X — boundary de severidade (TEST_CONFIG sintética)", () => {
  it("a dimensão usada é a declarada na config", () => {
    expect(TEST_CONFIG.installmentConcentration.severity_dimension).toBe("share_count_bp")
  })

  it("share de contagem governa a severidade, não o de valor", () => {
    // 1 de 10 acima (1000 bp de contagem) mas com 90% do volume. Se a
    // severidade viesse do valor, seria muito mais alta.
    const r = detectar([
      contrato(24, 9_000_000),
      ...Array.from({ length: 9 }, () => contrato(6, 100_000)),
    ])
    expect(r.summary.severity).toBe("low") // 1000 bp na escala sintética
  })

  it("boundaries da escala sintética", () => {
    const comShare = (acima: number, total: number): Severity | null => {
      const c = [
        ...Array.from({ length: acima }, () => contrato(24, 1000)),
        ...Array.from({ length: total - acima }, () => contrato(6, 1000)),
      ]
      return detectar(c).summary.severity
    }
    expect(comShare(0, 100)).toBe("info") // 0 bp
    expect(comShare(10, 100)).toBe("low") // 1000 bp
    expect(comShare(25, 100)).toBe("medium") // 2500 bp
    expect(comShare(50, 100)).toBe("high") // 5000 bp
    expect(comShare(75, 100)).toBe("critical") // 7500 bp
  })
})

describe("16 — evento válido contra o contrato", () => {
  const r = detectar(preencher(5, 24))

  it("passa por schema e semântica", () => {
    expect(() => assertValid("event", r.event)).not.toThrow()
  })

  it("carrega proveniência de detector", () => {
    expect(r.event?.detector_id).toBe(DETECTOR_ID)
    expect(r.event?.detector_version).toBe(DETECTOR_VERSION)
    expect(DETECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("o tipo é installment_concentration", () => {
    expect(r.event?.event_type).toBe("installment_concentration")
  })

  it("a evidência agregada acompanha o evento", () => {
    expect(r.event?.evidence_refs).toContain("ev_agregado")
  })

  it("a métrica observada é calculated com fórmula", () => {
    expect(r.event?.observed_metric?.data_class).toBe("calculated")
    expect(r.event?.observed_metric?.formula).toContain("installments > 19")
  })

  it("não produz inferência nem previsão", () => {
    const classes = [r.event?.observed_metric?.data_class, r.event?.reference_metric?.data_class]
    expect(classes).not.toContain("inferred")
    expect(classes).not.toContain("forecast")
  })
})

describe("19 — golden do Caso A, derivado do cálculo", () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const evtA = JSON.parse(
    readFileSync(join(raiz, "fixtures", "synthetic", "events", "evt_a_parcelamento.json"), "utf8"),
  ) as { materiality: { amount_cents: number; share_of_total_bp: number } }
  const salesPayload = JSON.parse(
    readFileSync(join(raiz, "fixtures", "synthetic", "snapshots", "snap_2026_08_sales.json"), "utf8"),
  ) as { payload: { volume_contracted_cents: number; installments_histogram: Record<string, number> } }

  it("share_of_total_bp da fixture é o valor calculado", () => {
    const total = salesPayload.payload.volume_contracted_cents
    const faixa = evtA.materiality.amount_cents
    expect(Math.round((faixa / total) * 10000)).toBe(evtA.materiality.share_of_total_bp)
    expect(evtA.materiality.share_of_total_bp).toBe(5209)
  })

  it("o histograma de vendas sustenta 5000 bp de share em contagem", () => {
    const h = salesPayload.payload.installments_histogram
    const total = Object.values(h).reduce((a, b) => a + b, 0)
    const acima = (h["de_20_a_24"] ?? 0) + (h["acima_de_24"] ?? 0)
    expect(total).toBe(14)
    expect(acima).toBe(7)
    expect(Math.round((acima / total) * 10000)).toBe(5000)
  })
})

describe("21 — pureza", () => {
  it("o módulo não lê relógio, rede, env nem sorteia", () => {
    const fonte = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "src", "installment-concentration.ts"),
      "utf8",
    )
    expect(fonte).not.toMatch(/Date\.now\(\)/)
    expect(fonte).not.toMatch(/new Date\(\)/)
    expect(fonte).not.toMatch(/Math\.random/)
    expect(fonte).not.toMatch(/fetch\(|process\.env|readFileSync/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correções do gate adversarial da Fase 2.3
// ═════════════════════════════════════════════════════════════════════════════

describe("HIGH-1 — cálculo e fórmula compartilham a mesma regra governada", () => {
  it("as três fórmulas descrevem o limiar aprovado", () => {
    for (const f of [FORMULA_SHARE_COUNT, FORMULA_AMOUNT_ABOVE, FORMULA_SHARE_AMOUNT]) {
      expect(f).toContain(`installments > ${LIMIAR}`)
    }
  })

  it("o predicado exportado é estritamente maior", () => {
    expect(acimaDoLimiar(LIMIAR - 1)).toBe(false)
    expect(acimaDoLimiar(LIMIAR)).toBe(false)
    expect(acimaDoLimiar(LIMIAR + 1)).toBe(true)
  })

  /**
   * O teste que trava a divergência.
   *
   * Lê o número que a FÓRMULA publica e exige que o CÁLCULO respeite exatamente
   * esse número no boundary. Se alguém editar o texto sem editar o predicado —
   * ou o contrário — este teste falha. Antes as duas coisas eram literais
   * independentes e podiam divergir sem nenhum teste notar.
   */
  it("o número publicado na fórmula é o número que o cálculo usa", () => {
    const match = /installments > (\d+)/.exec(FORMULA_SHARE_COUNT)
    expect(match).not.toBeNull()
    const publicado = Number(match?.[1])
    expect(Number.isSafeInteger(publicado)).toBe(true)

    // Exatamente o valor publicado fica FORA da faixa.
    expect(detectar([contrato(publicado), ...preencher(4)]).summary.population.contracts_above_threshold).toBe(0)
    // Um a mais entra.
    expect(detectar([contrato(publicado + 1), ...preencher(4)]).summary.population.contracts_above_threshold).toBe(1)
  })

  it("a identidade do evento carrega o limiar governado", () => {
    const r = detectar(preencher(5, 24))
    expect(r.summary.event_id).toMatch(/^evt_[a-f0-9]{16}$/)
  })
})

describe("HIGH-2 — evidência agregada ligada ao escopo real do agregado", () => {
  const outroSnapshot = rawSnapshot({
    snapshot_id: "snap_outro",
    source_system: "bitrix24",
    dataset_id: "ds_outro",
  }) as unknown as Snapshot

  const evOutroSnapshot = rawEvidence({
    evidence_id: "ev_agg_outro_snap",
    snapshot_id: "snap_outro",
    kind: "computed",
    locator: { dataset_id: "ds_outro", sheet: "Vendas", column: "Total de parcelas" },
    formula: "count(x) / count(y)",
  }) as unknown as Evidence

  // Snapshot certo, dataset errado no localizador.
  const evDatasetErrado = rawEvidence({
    evidence_id: "ev_agg_dataset_errado",
    snapshot_id: "snap_vendas",
    kind: "computed",
    locator: { dataset_id: "ds_nao_usado", sheet: "Vendas", column: "Total de parcelas" },
    formula: "count(x) / count(y)",
  }) as unknown as Evidence

  const contratoDoOutro = (): ContractRecord => ({
    subject_ref: subjectRef(),
    unit: MATCHED,
    installment_count: 24,
    amount_cents: 100_000,
    evidence_refs: ["ev_outro_linha"],
    snapshot_id: "snap_outro",
  })

  const evLinhaOutro = rawEvidence({
    evidence_id: "ev_outro_linha",
    snapshot_id: "snap_outro",
    kind: "row",
    locator: { dataset_id: "ds_outro", sheet: "Vendas", row_key: "b".repeat(64) },
  }) as unknown as Evidence

  it("escopo correto é aceito", () => {
    expect(() => detectar(preencher(5, 24))).not.toThrow()
  })

  it("agregado de OUTRO snapshot é recusado", () => {
    expect(() =>
      detectar(preencher(5, 24), {
        snapshots: [...snapshots, outroSnapshot],
        evidence: [...evidence, evOutroSnapshot],
        aggregate_evidence_ref: "ev_agg_outro_snap",
      }),
    ).toThrowError(/snapshot/)
  })

  it("snapshot certo mas dataset errado no localizador é recusado", () => {
    expect(() =>
      detectar(preencher(5, 24), {
        evidence: [...evidence, evDatasetErrado],
        aggregate_evidence_ref: "ev_agg_dataset_errado",
      }),
    ).toThrowError(/dataset/)
  })

  it("a recusa nomeia os dois lados, para o erro ser diagnosticável", () => {
    try {
      detectar(preencher(5, 24), {
        evidence: [...evidence, evDatasetErrado],
        aggregate_evidence_ref: "ev_agg_dataset_errado",
      })
      throw new Error("deveria ter recusado")
    } catch (e) {
      expect(e).toBeInstanceOf(GatewayError)
      expect((e as GatewayError).message).toContain("ds_nao_usado")
      expect((e as GatewayError).message).toContain("ds_vendas")
    }
  })

  it("multi-dataset FALHA FECHADA — uma evidência não sustenta o todo", () => {
    // Contratos de dois datasets governados. `Evidence.locator` expressa um
    // único `dataset_id`, então nenhuma evidência disponível sustenta
    // honestamente o agregado. Não escolher um dos lados arbitrariamente.
    expect(() =>
      detectar([...preencher(3, 24), contratoDoOutro(), contratoDoOutro()], {
        snapshots: [...snapshots, outroSnapshot],
        evidence: [...evidence, evLinhaOutro],
      }),
    ).toThrowError(/escopos governados/)
  })

  it("a falha multi-dataset nomeia os escopos envolvidos", () => {
    try {
      detectar([...preencher(3, 24), contratoDoOutro()], {
        snapshots: [...snapshots, outroSnapshot],
        evidence: [...evidence, evLinhaOutro],
      })
      throw new Error("deveria ter recusado")
    } catch (e) {
      const msg = (e as GatewayError).message
      expect(msg).toContain("ds_vendas")
      expect(msg).toContain("ds_outro")
    }
  })

  it("evidência de caso continua tendo de pertencer ao snapshot do caso", () => {
    const forasteiro: ContractRecord = {
      subject_ref: subjectRef(),
      unit: MATCHED,
      installment_count: 24,
      amount_cents: 100_000,
      evidence_refs: ["ev_outro_linha"],
      snapshot_id: "snap_vendas",
    }
    expect(() =>
      detectar([forasteiro, ...preencher(4, 24)], {
        snapshots: [...snapshots, outroSnapshot],
        evidence: [...evidence, evLinhaOutro],
      }),
    ).toThrowError(/pertence ao snapshot/)
  })
})

describe("HIGH-3 — dimensão de severidade indisponível não vira zero", () => {
  const porValor = (): DetectorConfig => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["installmentConcentration"]!["severity_dimension"] = "share_amount_bp"
    return c as unknown as DetectorConfig
  }

  /**
   * §4 do briefing — o cenário obrigatório.
   *
   * Material por CONTAGEM, severidade configurada em VALOR, valores com sinais
   * mistos. `share_amount_bp` é lacuna BUSINESS_RULE_PENDING. Antes desta
   * correção o detector passava 0 para a escala e emitia um evento executivo
   * graduado como se existisse uma participação financeira medida em zero.
   */
  describe("material por contagem + severity em valor + sinal misto", () => {
    const r = detectar(
      [contrato(24, -900_000), ...preencher(4, 24, 100_000)],
      {},
      porValor(),
    )

    it("o fato É material — por contagem", () => {
      expect(r.summary.material).toBe(true)
      expect(r.summary.population.contracts_above_threshold).toBe(5)
    })

    it("a participação em valor é lacuna de regra pendente", () => {
      const s = r.summary.metrics.share_amount_bp
      expect(isOk(s)).toBe(false)
      if (!isOk(s)) expect(s.gap).toBe("BUSINESS_RULE_PENDING")
    })

    it("severity é null — não fabricada", () => {
      expect(r.summary.severity).toBeNull()
    })

    it("nenhum Event executivo é emitido", () => {
      expect(r.event).toBeNull()
      expect(r.summary.emitted).toBe(false)
    })

    it("o motivo da não-emissão é tipado e específico", () => {
      expect(r.summary.not_emitted_reason).toBe("SEVERITY_DIMENSION_UNAVAILABLE")
      expect(r.summary.not_emitted_reason).not.toBe("NOT_MATERIAL")
    })

    it("o resultado registra qual dimensão faltou e por quê", () => {
      expect(r.summary.severity_dimension).toBe("share_amount_bp")
      expect(r.summary.severity_gap).toContain("share_amount_bp")
      expect(r.summary.severity_gap).toContain("BUSINESS_RULE_PENDING")
    })

    it("as métricas calculáveis continuam lá — nada financeiro inventado", () => {
      expect(isOk(r.summary.metrics.share_count_bp) && r.summary.metrics.share_count_bp.value).toBe(10000)
      const acima = r.summary.metrics.amount_above_cents
      expect(isOk(acima) && acima.value).toBe(-500_000)
    })
  })

  it("EMPTY_DENOMINATOR na dimensão escolhida também bloqueia", () => {
    // Volume elegível zero: a participação em valor não existe.
    const r = detectar(preencher(5, 24, 0), {}, porValor())
    expect(r.summary.severity).toBeNull()
    expect(r.event).toBeNull()
    const s = r.summary.metrics.share_amount_bp
    expect(!isOk(s) && s.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("DATA_NOT_AVAILABLE na dimensão escolhida também bloqueia", () => {
    const r = detectar([contrato(24, null), ...preencher(4, 24)], {}, porValor())
    expect(r.summary.severity).toBeNull()
    expect(r.event).toBeNull()
    expect(r.summary.not_emitted_reason).toBe("SEVERITY_DIMENSION_UNAVAILABLE")
  })

  it("com a dimensão disponível, o evento sai normalmente", () => {
    const r = detectar(preencher(5, 24, 100_000), {}, porValor())
    expect(r.summary.severity).not.toBeNull()
    expect(r.summary.emitted).toBe(true)
    expect(r.event).not.toBeNull()
  })

  it("as dependências são independentes: severity por CONTAGEM não cai por causa de valor", () => {
    // `severity_dimension = share_count_bp` (TEST_CONFIG) com share_amount lacuna.
    const r = detectar([contrato(24, -900_000), ...preencher(4, 24, 100_000)])
    expect(isOk(r.summary.metrics.share_amount_bp)).toBe(false)
    expect(r.summary.severity).not.toBeNull()
    expect(r.summary.emitted).toBe(true)
    expect(r.event).not.toBeNull()
  })

  it("não material continua reportando NOT_MATERIAL, não a dimensão", () => {
    const r = detectar(preencher(5, 12), {}, porValor())
    expect(r.summary.material).toBe(false)
    expect(r.summary.not_emitted_reason).toBe("NOT_MATERIAL")
  })

  it("nenhum grau de conveniência aparece quando a dimensão falta", () => {
    const r = detectar([contrato(24, -900_000), ...preencher(4, 24, 100_000)], {}, porValor())
    for (const grau of ["info", "low", "medium", "high", "critical"]) {
      expect(r.summary.severity).not.toBe(grau)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Seleção cumulativa de casos contribuintes — fail-closed semântico
// ═════════════════════════════════════════════════════════════════════════════

describe("seleção de casos: indisponibilidade é explícita, não `?? 0`", () => {
  const comRegra = (regra: unknown): DetectorConfig => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    c["installmentConcentration"]!["contributing_case_rule"] = regra
    return c as unknown as DetectorConfig
  }

  const CUMULATIVA = comRegra({ mode: "until_share_bp", share_bp: 5000 })
  const INDIVIDUAL = comRegra({ mode: "min_individual_share_bp", share_bp: 1000 })
  const TOP_N = comRegra({ mode: "top_n", n: 2 })

  /** Faixa toda positiva: participação existe para todos. */
  const positivos = (): ContractRecord[] => [
    contrato(24, 500_000),
    contrato(24, 300_000),
    contrato(24, 150_000),
    contrato(24, 50_000),
    ...preencher(1, 5, 100_000),
  ]

  /**
   * Estorno na faixa. Total = 600.000, mas o caso de 900.000 vale 150% do total
   * e o de -400.000 é negativo: nenhum dos dois tem participação.
   */
  const sinaisMistos = (): ContractRecord[] => [
    contrato(24, 900_000),
    contrato(24, -400_000),
    contrato(24, 100_000),
    ...preencher(2, 5, 100_000),
  ]

  // ── A ──
  describe("A — sinais positivos: cumulative_share funciona como antes", () => {
    const r = detectar(positivos(), {}, CUMULATIVA)

    it("a seleção está disponível", () => {
      expect(r.summary.contributing_cases_selection?.status).toBe("selected")
    })

    it("para ao cobrir a participação pedida, sem levar a faixa inteira", () => {
      const casos = r.event?.contributing_cases ?? []
      expect(casos.length).toBeGreaterThan(0)
      expect(casos.length).toBeLessThan(4)
    })

    it("o primeiro caso é o de maior valor", () => {
      expect(r.event?.contributing_cases?.[0]?.contribution.amount_cents).toBe(500_000)
    })
  })

  // ── B ──
  describe("B — sinais mistos: seleção cumulativa INDISPONÍVEL", () => {
    const r = detectar(sinaisMistos(), {}, CUMULATIVA)

    it("o status é unavailable, não uma lista", () => {
      expect(r.summary.contributing_cases_selection?.status).toBe("unavailable")
    })

    it("o motivo nomeia a estratégia que ficou sem base", () => {
      const s = r.summary.contributing_cases_selection
      expect(s?.status === "unavailable" && s.reason).toBe("CUMULATIVE_SHARE_UNAVAILABLE")
    })

    it("a lacuna subjacente é regra de negócio pendente", () => {
      const s = r.summary.contributing_cases_selection
      expect(s?.status === "unavailable" && s.gap_reason).toBe("BUSINESS_RULE_PENDING")
    })

    it("NÃO seleciona todos — era exatamente o que o `?? 0` fazia", () => {
      const casos = r.event?.contributing_cases ?? []
      expect(casos.length).not.toBe(5)
      expect(casos.length).not.toBe(3)
      expect(casos.length).toBe(0)
    })

    it("nenhum caso incorreto entra para completar a apresentação", () => {
      expect(r.event?.contributing_cases).toBeUndefined()
    })

    it("o detalhe diz quantos casos ficaram sem participação", () => {
      const s = r.summary.contributing_cases_selection
      expect(s?.status === "unavailable" && s.detail).toMatch(/de 3 contratos da faixa/)
    })
  })

  // ── C ──
  describe("C — total zero: indisponível", () => {
    const r = detectar(
      [contrato(24, 300_000), contrato(24, -300_000), ...preencher(3, 5, 100_000)],
      {},
      CUMULATIVA,
    )

    it("status unavailable", () => {
      expect(r.summary.contributing_cases_selection?.status).toBe("unavailable")
    })

    it("a lacuna é de denominador, não de regra pendente", () => {
      const s = r.summary.contributing_cases_selection
      expect(s?.status === "unavailable" && s.gap_reason).toBe("EMPTY_DENOMINATOR")
    })

    it("nenhum caso emitido", () => {
      expect(r.event?.contributing_cases).toBeUndefined()
    })
  })

  it("total negativo também é indisponível, e não confundido com zero", () => {
    const r = detectar(
      [contrato(24, -300_000), contrato(24, 100_000), ...preencher(3, 5, 100_000)],
      {},
      CUMULATIVA,
    )
    const s = r.summary.contributing_cases_selection
    expect(s?.status === "unavailable" && s.gap_reason).toBe("BUSINESS_RULE_PENDING")
    expect(s?.status === "unavailable" && s.detail).toContain("negativo")
  })

  it("volume indisponível (valor ausente) propaga a lacuna do motor", () => {
    const r = detectar([contrato(24, null), ...preencher(4, 24, 100_000)], {}, CUMULATIVA)
    const s = r.summary.contributing_cases_selection
    expect(s?.status === "unavailable" && s.gap_reason).toBe("DATA_NOT_AVAILABLE")
  })

  // ── D ──
  describe("D — top_n depende de grandeza absoluta e não é bloqueada", () => {
    const r = detectar(sinaisMistos(), {}, TOP_N)

    it("continua disponível com sinais mistos", () => {
      expect(r.summary.contributing_cases_selection?.status).toBe("selected")
    })

    it("seleciona exatamente n casos", () => {
      expect(r.event?.contributing_cases?.length).toBe(2)
    })

    it("ordenada por valor decrescente", () => {
      const vals = (r.event?.contributing_cases ?? []).map((c) => c.contribution.amount_cents)
      expect(vals).toEqual([900_000, 100_000])
    })

    it("participação por caso segue a regra de parte-do-todo, caso a caso", () => {
      // Total da faixa = 900.000 − 400.000 + 100.000 = 600.000.
      const casos = r.event?.contributing_cases ?? []
      const grande = casos.find((c) => c.contribution.amount_cents === 900_000)
      const pequeno = casos.find((c) => c.contribution.amount_cents === 100_000)

      // 900.000 vale 150% do total: não é parte de um todo. Participação OMITIDA.
      expect(grande?.contribution.share_of_event_bp).toBeUndefined()
      // 100.000 é positivo e cabe no total: 1667 bp é uma participação real.
      expect(pequeno?.contribution.share_of_event_bp).toBe(1667)
    })

    it("nenhuma participação emitida ultrapassa 100%", () => {
      for (const c of r.event?.contributing_cases ?? []) {
        const s = c.contribution.share_of_event_bp
        if (s !== undefined) expect(s).toBeLessThanOrEqual(10000)
      }
    })

    // Os casos que separam de verdade uma estratégia de grandeza absoluta de uma
    // de participação: aqui o TOTAL é inutilizável, então qualquer implementação
    // que consultasse participação teria de desistir. `top_n` não consulta.
    it("total ZERO não bloqueia top_n", () => {
      const z = detectar(
        [contrato(24, 300_000), contrato(24, -300_000), ...preencher(3, 5, 100_000)],
        {},
        TOP_N,
      )
      expect(z.summary.contributing_cases_selection?.status).toBe("selected")
      expect(z.event?.contributing_cases?.length).toBe(2)
      const vals = (z.event?.contributing_cases ?? []).map((c) => c.contribution.amount_cents)
      expect(vals).toEqual([300_000, -300_000])
    })

    it("total NEGATIVO não bloqueia top_n", () => {
      const n = detectar(
        [contrato(24, -900_000), contrato(24, 100_000), ...preencher(3, 5, 100_000)],
        {},
        TOP_N,
      )
      expect(n.summary.contributing_cases_selection?.status).toBe("selected")
      expect(n.event?.contributing_cases?.length).toBe(2)
    })

    it("volume ausente não bloqueia top_n — a ordenação é por grandeza", () => {
      const a = detectar([contrato(24, null), ...preencher(4, 24, 100_000)], {}, TOP_N)
      expect(a.summary.contributing_cases_selection?.status).toBe("selected")
      expect(a.event?.contributing_cases?.length).toBe(2)
    })

    it("com total inutilizável, top_n emite valor e NUNCA participação", () => {
      const z = detectar(
        [contrato(24, 300_000), contrato(24, -300_000), ...preencher(3, 5, 100_000)],
        {},
        TOP_N,
      )
      for (const c of z.event?.contributing_cases ?? []) {
        expect(c.contribution.share_of_event_bp).toBeUndefined()
      }
      expect((z.event?.contributing_cases ?? []).length).toBeGreaterThan(0)
    })
  })

  it("min_individual_share_bp também não seleciona NENHUM silenciosamente", () => {
    // O `?? 0` antigo fazia `0 >= 1000` ser falso para todos: a seleção vinha
    // vazia como se nenhum caso qualificasse. Vazio-por-lacuna e
    // vazio-por-fato precisam ser distinguíveis.
    const r = detectar(sinaisMistos(), {}, INDIVIDUAL)
    const s = r.summary.contributing_cases_selection
    expect(s?.status).toBe("unavailable")
    expect(s?.status === "unavailable" && s.reason).toBe("INDIVIDUAL_SHARE_UNAVAILABLE")
  })

  it("com participação válida, a individual volta a filtrar de verdade", () => {
    const r = detectar(positivos(), {}, INDIVIDUAL)
    expect(r.summary.contributing_cases_selection?.status).toBe("selected")
    // 50.000 de 1.000.000 = 500 bp, abaixo do piso de 1000 bp: fica fora.
    const vals = (r.event?.contributing_cases ?? []).map((c) => c.contribution.amount_cents)
    expect(vals).not.toContain(50_000)
  })

  it("`selected` vazio continua possível e é distinto de `unavailable`", () => {
    // Piso alto demais: todos qualificam para fora. É um FATO, não lacuna.
    const r = detectar(positivos(), {}, comRegra({ mode: "min_individual_share_bp", share_bp: 9999 }))
    const s = r.summary.contributing_cases_selection
    expect(s?.status).toBe("selected")
    expect(s?.status === "selected" && s.count).toBe(0)
    expect(r.event?.contributing_cases).toBeUndefined()
  })

  // ── E ──
  describe("E — só a seleção indisponível: o evento continua válido", () => {
    const r = detectar(sinaisMistos(), {}, CUMULATIVA)

    it("o Event É emitido", () => {
      expect(r.event).not.toBeNull()
      expect(r.summary.emitted).toBe(true)
      expect(r.summary.not_emitted_reason).toBeUndefined()
    })

    it("e passa a validação do contrato sem contributing_cases", () => {
      expect(() => assertValid("event", r.event)).not.toThrow()
    })

    it("o fato principal, a materialidade e a severidade seguem válidos", () => {
      expect(r.summary.material).toBe(true)
      expect(r.summary.severity).not.toBeNull()
      expect(isOk(r.summary.metrics.share_count_bp)).toBe(true)
      expect(r.event?.materiality).toBeDefined()
    })

    it("a indisponibilidade fica registrada no resultado auditável", () => {
      const s = r.summary.contributing_cases_selection
      expect(s?.status).toBe("unavailable")
      if (s?.status !== "unavailable") throw new Error("esperado unavailable")
      expect(s.reason).toBe("CUMULATIVE_SHARE_UNAVAILABLE")
      expect(s.gap_reason).toBe("BUSINESS_RULE_PENDING")
      expect(s.detail).toContain("sinal misto")
      expect(Object.keys(s).sort()).toEqual(["detail", "gap_reason", "reason", "status"])
    })
  })

  // ── F ──
  describe("F — a ordem da entrada não altera o resultado", () => {
    const base = sinaisMistos()
    const invertido = [...base].reverse()

    it("indisponibilidade é a mesma em qualquer ordem", () => {
      const a = detectar(base, {}, CUMULATIVA).summary.contributing_cases_selection
      const b = detectar(invertido, {}, CUMULATIVA).summary.contributing_cases_selection
      expect(a).toEqual(b)
    })

    it("e a seleção disponível também", () => {
      const p = positivos()
      const a = detectar(p, {}, CUMULATIVA).event?.contributing_cases
      const b = detectar([...p].reverse(), {}, CUMULATIVA).event?.contributing_cases
      expect(a).toEqual(b)
    })

    it("top_n em sinais mistos é estável nas duas ordens", () => {
      const a = detectar(base, {}, TOP_N).event?.contributing_cases
      const b = detectar(invertido, {}, TOP_N).event?.contributing_cases
      expect(a).toEqual(b)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Ownership do input e imutabilidade profunda em runtime
// ═════════════════════════════════════════════════════════════════════════════

describe("ownership: nenhuma referência mutável do input sobrevive no output", () => {
  /** Input com arrays MUTÁVEIS de propósito — é o que um chamador real entrega. */
  const inputMutavel = (): InstallmentDetectorInput => ({
    detected_at: DETECTED_AT,
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    contracts: [
      { subject_ref: subjectRef(), unit: MATCHED, installment_count: 24, amount_cents: 500_000, evidence_refs: ["ev_linha"], snapshot_id: "snap_vendas" },
      { subject_ref: subjectRef(), unit: MATCHED, installment_count: 24, amount_cents: 300_000, evidence_refs: ["ev_linha"], snapshot_id: "snap_vendas" },
      { subject_ref: subjectRef(), unit: MATCHED, installment_count: 24, amount_cents: 100_000, evidence_refs: ["ev_linha"], snapshot_id: "snap_vendas" },
      { subject_ref: subjectRef(), unit: MATCHED, installment_count: 6, amount_cents: 100_000, evidence_refs: ["ev_linha"], snapshot_id: "snap_vendas" },
      { subject_ref: subjectRef(), unit: MATCHED, installment_count: 6, amount_cents: 100_000, evidence_refs: ["ev_linha"], snapshot_id: "snap_vendas" },
    ],
    snapshots,
    evidence,
    aggregate_evidence_ref: "ev_agregado",
  })

  it("evidence_refs do caso NÃO é a mesma referência do contrato", () => {
    const input = inputMutavel()
    const r = detectInstallmentConcentration(input, TEST_CONFIG)
    const casos = r.event?.contributing_cases ?? []
    expect(casos.length).toBeGreaterThan(0)
    for (const caso of casos) {
      for (const c of input.contracts) {
        expect(caso.evidence_refs).not.toBe(c.evidence_refs)
      }
    }
  })

  it("o conteúdo é igual — a cópia não perde nem inventa refs", () => {
    const input = inputMutavel()
    const r = detectInstallmentConcentration(input, TEST_CONFIG)
    expect(r.event?.contributing_cases?.[0]?.evidence_refs).toEqual(["ev_linha"])
  })

  it("evidence_refs do EVENTO não é a mesma referência de nenhum contrato", () => {
    const input = inputMutavel()
    const r = detectInstallmentConcentration(input, TEST_CONFIG)
    for (const c of input.contracts) {
      expect(r.event?.evidence_refs).not.toBe(c.evidence_refs)
    }
  })

  it("nenhum ContractRecord do input é alcançável a partir do output", () => {
    const input = inputMutavel()
    const r = detectInstallmentConcentration(input, TEST_CONFIG)
    const doInput = new Set<unknown>([
      input.contracts,
      ...input.contracts,
      ...input.contracts.map((c) => c.evidence_refs),
      ...input.contracts.map((c) => c.unit),
      input.snapshots,
      input.evidence,
    ])
    const visto = new WeakSet<object>()
    const percorrer = (v: unknown): void => {
      if (v === null || typeof v !== "object") return
      if (visto.has(v)) return
      visto.add(v)
      expect(doInput.has(v)).toBe(false)
      for (const filho of Object.values(v)) percorrer(filho)
    }
    percorrer(r)
  })

  /** §2 — a prova completa: sem alias, output estável, input não congelado. */
  describe("mutar o input depois da deteção não altera o resultado anterior", () => {
    const input = inputMutavel()
    const r1 = detectInstallmentConcentration(input, TEST_CONFIG)
    const antes = structuredClone(r1) as unknown

    it("o input É mutável e realmente recebe a forja", () => {
      ;(input.contracts[0]?.evidence_refs as string[]).push("forged")
      expect(input.contracts[0]?.evidence_refs).toContain("forged")
    })

    it("e o resultado produzido antes segue idêntico", () => {
      expect(structuredClone(r1)).toEqual(antes)
    })

    it("nenhum caso do evento passou a conter a forja", () => {
      for (const caso of r1.event?.contributing_cases ?? []) {
        expect(caso.evidence_refs).not.toContain("forged")
      }
      expect(r1.event?.evidence_refs).not.toContain("forged")
    })
  })

  // §8 — o detector não congela estado do chamador.
  describe("o input permanece mutável — congelar o chamador seria efeito colateral", () => {
    const input = inputMutavel()
    detectInstallmentConcentration(input, TEST_CONFIG)

    it("nem o input, nem contracts, nem cada contrato, nem seus refs", () => {
      expect(Object.isFrozen(input)).toBe(false)
      expect(Object.isFrozen(input.contracts)).toBe(false)
      expect(Object.isFrozen(input.contracts[0])).toBe(false)
      expect(Object.isFrozen(input.contracts[0]?.evidence_refs)).toBe(false)
    })

    it("o chamador consegue escrever normalmente depois", () => {
      expect(() => (input.contracts[0]?.evidence_refs as string[]).push("depois")).not.toThrow()
    })
  })
})

describe("imutabilidade profunda: o grafo validado não muda mais", () => {
  const material = (): ContractRecord[] => [
    contrato(24, 500_000),
    contrato(24, 300_000),
    contrato(24, 100_000),
    ...preencher(2, 6, 100_000),
  ]

  const r = detectar(material())

  it("o evento existe — sem isso o resto testaria vácuo", () => {
    expect(r.event).not.toBeNull()
    expect((r.event?.contributing_cases ?? []).length).toBeGreaterThan(0)
  })

  // §7 — amostragem profunda, não só a raiz.
  it("Object.isFrozen em cada nível do grafo", () => {
    const caso = r.event?.contributing_cases?.[0]
    const alvos: readonly [string, unknown][] = [
      ["result", r],
      ["summary", r.summary],
      ["summary.population", r.summary.population],
      ["summary.population.excluded", r.summary.population.excluded],
      ["summary.population.eligibility_ratio_bp", r.summary.population.eligibility_ratio_bp],
      ["summary.metrics", r.summary.metrics],
      ["summary.metrics.share_count_bp", r.summary.metrics.share_count_bp],
      ["summary.contributing_cases_selection", r.summary.contributing_cases_selection],
      ["event", r.event],
      ["event.materiality", r.event?.materiality],
      ["event.observed_metric", r.event?.observed_metric],
      ["event.reference_metric", r.event?.reference_metric],
      ["event.data_quality", r.event?.data_quality],
      ["event.snapshot_ids", r.event?.snapshot_ids],
      ["event.evidence_refs", r.event?.evidence_refs],
      ["event.contributing_cases", r.event?.contributing_cases],
      ["case[0]", caso],
      ["case[0].contribution", caso?.contribution],
      ["case[0].evidence_refs", caso?.evidence_refs],
    ]
    for (const [nome, alvo] of alvos) {
      expect(alvo, `${nome} deveria existir`).toBeDefined()
      expect(Object.isFrozen(alvo), `${nome} deveria estar congelado`).toBe(true)
    }
  })

  // §6 — cada caminho concreto de mutação. Em strict mode (módulo ESM), a
  // atribuição em objeto congelado lança TypeError.
  describe("cada tentativa de mutação lança E não altera estado", () => {
    const tentativas: readonly [string, () => void, () => unknown, unknown][] = [
      [
        "A population.excluded",
        () => {
          ;(r.summary.population.excluded as Record<string, number>).MISSING_INSTALLMENT_COUNT = 999
        },
        () => r.summary.population.excluded.MISSING_INSTALLMENT_COUNT,
        0,
      ],
      [
        "B metrics.share_count_bp.value",
        () => {
          ;(r.summary.metrics.share_count_bp as { value: number }).value = 0
        },
        () => isOk(r.summary.metrics.share_count_bp) && r.summary.metrics.share_count_bp.value,
        6000,
      ],
      [
        "C selection.status",
        () => {
          ;(r.summary.contributing_cases_selection as { status: string }).status = "unavailable"
        },
        () => r.summary.contributing_cases_selection?.status,
        "selected",
      ],
      [
        "F event.materiality.amount_cents",
        () => {
          ;(r.event?.materiality as { amount_cents: number }).amount_cents = 0
        },
        () => (r.event?.materiality as { amount_cents?: number }).amount_cents,
        900_000,
      ],
      [
        "H case.contribution.amount_cents",
        () => {
          ;(r.event?.contributing_cases?.[0]?.contribution as { amount_cents: number }).amount_cents = 0
        },
        () => r.event?.contributing_cases?.[0]?.contribution.amount_cents,
        500_000,
      ],
    ]

    for (const [nome, mutar, ler, esperado] of tentativas) {
      it(`${nome} — lança TypeError`, () => {
        expect(mutar).toThrowError(TypeError)
      })
      it(`${nome} — estado preservado`, () => {
        expect(ler()).toBe(esperado)
      })
    }
  })

  describe("push em arrays congelados", () => {
    const empurroes: readonly [string, () => void, () => number][] = [
      [
        "G event.contributing_cases",
        () => {
          ;(r.event?.contributing_cases as unknown[]).push({ forged: true })
        },
        () => (r.event?.contributing_cases ?? []).length,
      ],
      [
        "I case.evidence_refs",
        () => {
          ;(r.event?.contributing_cases?.[0]?.evidence_refs as string[]).push("forged")
        },
        () => (r.event?.contributing_cases?.[0]?.evidence_refs ?? []).length,
      ],
      [
        "J event.evidence_refs",
        () => {
          ;(r.event?.evidence_refs as string[]).push("forged")
        },
        () => (r.event?.evidence_refs ?? []).length,
      ],
      [
        "K event.snapshot_ids",
        () => {
          ;(r.event?.snapshot_ids as string[]).push("forged")
        },
        () => (r.event?.snapshot_ids ?? []).length,
      ],
    ]

    for (const [nome, empurrar, tamanho] of empurroes) {
      it(`${nome} — lança e o tamanho não muda`, () => {
        const antes = tamanho()
        expect(empurrar).toThrowError(TypeError)
        expect(tamanho()).toBe(antes)
      })
    }
  })

  it("não é possível trocar a raiz nem apagar campos", () => {
    expect(() => {
      ;(r as unknown as { event: null }).event = null
    }).toThrowError(TypeError)
    expect(() => {
      // @ts-expect-error — a tentativa é o teste
      delete r.summary.material
    }).toThrowError(TypeError)
    expect(r.event).not.toBeNull()
  })

  // §9 — determinismo temporal: corromper R1 não é possível, e R2 é igual.
  it("R1 sobrevive a todas as tentativas e segue deep-equal a R2", () => {
    const entrada = material()
    const r1 = detectar(entrada)
    const copiaInicial = structuredClone(r1) as unknown

    for (const tentar of [
      () => ((r1.summary.metrics.share_count_bp as { value: number }).value = 0),
      () => ((r1.summary.population as { total_records: number }).total_records = 999),
      () => (r1.event?.evidence_refs as string[]).push("forged"),
      () => ((r1 as unknown as { summary: null }).summary = null),
    ]) {
      expect(tentar).toThrowError(TypeError)
    }

    expect(structuredClone(r1)).toEqual(copiaInicial)

    // Mesma entrada, mesma config, mesmo detected_at — e R1 já sofreu as
    // tentativas de corrupção acima.
    const r2 = detectar(entrada)
    expect(structuredClone(r2)).toEqual(structuredClone(r1))
    expect(r2.summary.event_id).toBe(r1.summary.event_id)
  })

  it("o resultado sem evento também é congelado por inteiro", () => {
    const r0 = detectar(preencher(5, 6, 100_000))
    expect(r0.event).toBeNull()
    expect(Object.isFrozen(r0)).toBe(true)
    expect(Object.isFrozen(r0.summary)).toBe(true)
    expect(Object.isFrozen(r0.summary.population.excluded)).toBe(true)
    expect(() => {
      ;(r0.summary as { material: boolean }).material = true
    }).toThrowError(TypeError)
  })

  it("selection unavailable também vem congelada", () => {
    const cumulativa = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    cumulativa["installmentConcentration"]!["contributing_case_rule"] = { mode: "until_share_bp", share_bp: 5000 }
    const ru = detectar(
      [contrato(24, 900_000), contrato(24, -400_000), contrato(24, 100_000), ...preencher(2, 6, 100_000)],
      {},
      cumulativa as unknown as DetectorConfig,
    )
    const sel = ru.summary.contributing_cases_selection
    expect(sel?.status).toBe("unavailable")
    expect(Object.isFrozen(sel)).toBe(true)
    expect(() => {
      ;(sel as { reason: string }).reason = "outro"
    }).toThrowError(TypeError)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.7c §1/§3/§18 — regra de contribuintes: top_n = 5
//
// Aprovado na Política Creditum v1: quando um Event de concentração apresenta
// casos contribuintes, publica os 5 maiores segundo a ordenação já governada
// deste detector.
//
// Esse 5 é parâmetro de EXPLICAÇÃO do Event. Não é `relevant_case_count = 5`,
// que decide se um fato é material. Os dois valem 5 hoje e continuam campos
// independentes — a prova está em `production-policy.test.ts` (§13).
//
// `until_share_bp = 8000` foi recusado explicitamente: não existe regra
// Pareto/80% aprovada na Creditum.
// ═════════════════════════════════════════════════════════════════════════════

describe("§18 — os 5 maiores contribuintes, sob a política de produção", () => {
  const PROD = buildProductionDetectorConfig()

  /**
   * População com `quantos` contratos acima do limiar, valores decrescentes e
   * distintos, mais preenchimento para passar da amostra mínima de produção (10).
   */
  const comContribuintes = (quantos: number): ContractRecord[] => [
    ...Array.from({ length: quantos }, (_, i) => contrato(20, 1_000_000 - i * 1_000)),
    ...preencher(10),
  ]

  const casos = (contratos: readonly ContractRecord[]): readonly (number | undefined)[] => {
    const r = detectar(contratos, {}, PROD)
    return (r.event?.contributing_cases ?? []).map((c) => c.contribution.amount_cents)
  }

  it("a regra aprovada é top_n com n = 5", () => {
    expect(PROD.installmentConcentration.contributing_case_rule).toEqual({ mode: "top_n", n: 5 })
  })

  it("6 contribuintes elegíveis publicam exatamente 5", () => {
    expect(casos(comContribuintes(6))).toHaveLength(5)
  })

  it("40 contribuintes elegíveis publicam exatamente 5", () => {
    expect(casos(comContribuintes(40))).toHaveLength(5)
  })

  it("os 5 publicados são os 5 MAIORES, em ordem decrescente", () => {
    expect(casos(comContribuintes(9))).toEqual([
      1_000_000, 999_000, 998_000, 997_000, 996_000,
    ])
  })

  it("3 contribuintes elegíveis publicam 3 — sem padding", () => {
    expect(casos(comContribuintes(3))).toEqual([1_000_000, 999_000, 998_000])
  })

  it("nenhum caso inválido completa a lista quando há menos de 5", () => {
    const r = detectar(comContribuintes(2), {}, PROD)
    const publicados = r.event?.contributing_cases ?? []
    expect(publicados).toHaveLength(2)
    // Nada nulo, nada vazio, nada fabricado.
    for (const c of publicados) {
      expect(c.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
      expect(c.evidence_refs?.length ?? 0).toBeGreaterThan(0)
      expect(c.contribution.amount_cents).toBeTypeOf("number")
    }
  })

  it("empate em valor resolve pelo desempate técnico já fechado, não pela entrada", () => {
    // Cinco contratos empatados em 500_000 e um sexto menor. Quais 5 entram não
    // pode depender da ordem em que chegaram.
    const empatados = Array.from({ length: 5 }, () => contrato(20, 500_000))
    const menor = contrato(20, 400_000)
    const base = [...empatados, menor, ...preencher(10)]

    const escolhidos = (cs: readonly ContractRecord[]): readonly string[] =>
      (detectar(cs, {}, PROD).event?.contributing_cases ?? []).map((c) => c.subject_ref)

    const original = escolhidos(base)
    expect(original).toHaveLength(5)
    // O menor nunca entra: o corte é por grandeza, e o desempate só ordena iguais.
    expect(original).not.toContain(menor.subject_ref)

    const invertido = escolhidos([...base].reverse())
    expect(invertido).toEqual(original)

    const embaralhado = escolhidos([base[3]!, base[0]!, menor, base[4]!, base[1]!, base[2]!, ...preencher(10)])
    expect(embaralhado).toEqual(original)
  })

  it("reordenar a entrada não muda o conjunto nem a ordem final", () => {
    const base = comContribuintes(8)
    const direto = casos(base)
    expect(casos([...base].reverse())).toEqual(direto)
    // Ordem aleatória fixa — determinística, sem Math.random.
    const ordem = [5, 0, 7, 2, 9, 1, 12, 3, 6, 11, 4, 10, 8, 13, 15, 14, 16, 17]
    const permutado = ordem.filter((i) => i < base.length).map((i) => base[i]!)
    expect(casos(permutado)).toEqual(direto)
  })

  it("§2 — Pareto/80% não é política: until_share_bp não é montável a partir da policy", () => {
    // A projeção só produz `top_n`. Um artefato que pedisse 8000 bp é recusado —
    // a prova negativa está em `production-policy.test.ts`.
    expect(PROD.installmentConcentration.contributing_case_rule.mode).toBe("top_n")
    expect(JSON.stringify(PROD.installmentConcentration)).not.toContain("until_share_bp")
    expect(JSON.stringify(PROD.installmentConcentration)).not.toContain("8000")
  })
})
