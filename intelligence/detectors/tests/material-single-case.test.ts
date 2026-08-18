/**
 * Detector D — caso único material.
 *
 * TODOS os limiares destes testes vêm da `TEST_CONFIG` sintética e **não são
 * política da Creditum**. O Detector D não tem nenhum threshold aprovado: ao
 * contrário do Detector A, que tem o `installment_threshold = 19` do briefing,
 * aqui toda materialidade e toda severidade dependem de decisão pendente do CEO.
 *
 * A análise é contrafactual ARITMÉTICA. Nenhum teste afirma causalidade, e há
 * testes que provam que o vocabulário publicado também não afirma.
 */

import { describe, expect, it } from "vitest"
import {
  DETECTOR_ID,
  DETECTOR_VERSION,
  ESPECIFICACOES,
  FORMULA_DELTA,
  counterfactualComputationId,
  detectMaterialSingleCase,
} from "../src/material-single-case"
import type {
  CaseRecord,
  CounterfactualBinding,
  GovernedScope,
  MaterialSingleCaseInput,
  SingleCaseAggregator,
} from "../src/material-single-case"
import type { DetectorConfig, SingleCaseMetric } from "../src/config"
import { isOk, meanCents, sumCents } from "../src/engine"
import { assertValid } from "../../gateway/src/contracts"
import { GatewayError } from "../../gateway/src/errors"
import type { CanonicalUnitResult } from "../src/canonical-units"
import type { Evidence, Snapshot } from "../../gateway/src/types"
import { COUNTERFACTUAL_PROVENANCE_VERSION } from "../src/counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "../src/counterfactual-provenance"
import { TEST_CONFIG } from "./test-config"
import { CREDITUM_POLICY_V1 } from "../src/production-policy"
import { rawEvidence, rawSnapshot } from "../../gateway/tests/helpers"

const DETECTED_AT = "2026-08-16T09:05:00.000Z"

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
    kind: "aggregate",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", column: "Valor" },
  }),
]  as unknown as Evidence[]

const ESCOPO: GovernedScope[] = [{ source_system: "google_sheets", dataset_id: "ds_vendas" }]

/** Evidência `computed` dedicada a UM candidato. */
function evContrafactual(subjectRefDoCaso: string, sufixo = ""): Evidence {
  return rawEvidence({
    evidence_id: `ev_cf_${subjectRefDoCaso.slice(5)}${sufixo}`,
    snapshot_id: "snap_vendas",
    kind: "computed",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", column: "Valor" },
    formula: "aggregate of all eligible cases except the subject case",
  }) as unknown as Evidence
}

const AGREGADOR: Readonly<Record<SingleCaseMetric, SingleCaseAggregator>> = {
  amount_sum_cents: "sum",
  amount_mean_cents: "mean",
  case_count: "count",
}

/** Âncora governada para um binding: o que a ingestão teria gravado. */
function provenanceDe(b: CounterfactualBinding): ComputedEvidenceProvenance {
  return {
    evidence_ref: b.evidence_ref,
    computation_id: counterfactualComputationId(b),
    provenance_version: COUNTERFACTUAL_PROVENANCE_VERSION,
  }
}

function binding(
  c: CaseRecord,
  metric: SingleCaseMetric = "amount_sum_cents",
  extra: Partial<CounterfactualBinding> = {},
): CounterfactualBinding {
  return {
    evidence_ref: `ev_cf_${c.subject_ref.slice(5)}`,
    subject_ref: c.subject_ref,
    metric,
    aggregator: AGREGADOR[metric],
    operation: "exclude_subject",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    scope: ESCOPO,
    ...extra,
  }
}

const MATCHED: CanonicalUnitResult = {
  status: "matched",
  unit_id: "mogi_das_cruzes",
  display_name: "Mogi das Cruzes",
}
const UNKNOWN: CanonicalUnitResult = { status: "unknown", raw_fingerprint: "u".repeat(16) }

let seq = 0
function subjectRef(): string {
  seq += 1
  return `subj_${seq.toString(16).padStart(16, "0")}`
}

function caso(amount_cents: number | null, unit: CanonicalUnitResult = MATCHED): CaseRecord {
  return {
    subject_ref: subjectRef(),
    unit,
    amount_cents,
    evidence_refs: ["ev_linha"],
    snapshot_id: "snap_vendas",
  }
}

function entrada(
  cases: readonly CaseRecord[],
  extra: Partial<MaterialSingleCaseInput> = {},
): MaterialSingleCaseInput {
  const metric = extra.metric ?? "amount_sum_cents"
  return {
    detected_at: DETECTED_AT,
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    metric,
    cases,
    snapshots,
    evidence: [...evidence, ...cases.map((c) => evContrafactual(c.subject_ref))],
    aggregate_evidence_ref: "ev_agregado",
    counterfactual_bindings: cases.map((c) => binding(c, metric)),
    counterfactual_provenance: cases.map((c) => provenanceDe(binding(c, metric))),
    ...extra,
  }
}

const detectar = (
  cases: readonly CaseRecord[],
  extra: Partial<MaterialSingleCaseInput> = {},
  config: DetectorConfig = TEST_CONFIG,
): ReturnType<typeof detectMaterialSingleCase> =>
  detectMaterialSingleCase(entrada(cases, extra), config)

const comMetrica = (metric: SingleCaseMetric): Partial<MaterialSingleCaseInput> => ({ metric })

/**
 * População genuinamente NÃO material sob a TEST_CONFIG sintética.
 *
 * 20 casos iguais: participação 500 bp (< 1000), mudança relativa 526 bp
 * (< 2000), delta absoluto 100.000 (< 200.000). Três casos de 1 centavo NÃO
 * servem: a participação de cada um seria 3333 bp, bem acima do limiar — valor
 * pequeno não implica participação pequena.
 */
const naoMaterial = (): CaseRecord[] => Array.from({ length: 20 }, () => caso(100_000))

/** Impacto do caso de valor `v`. */
const impactoDe = (r: ReturnType<typeof detectar>, v: number) =>
  r.evaluated.find((i) => isOk(i.delta) && i.delta.value === v)

// ═════════════════════════════════════════════════════════════════════════════

describe("identidade do detector", () => {
  it("id e versão são estáveis e semver", () => {
    expect(DETECTOR_ID).toBe("det.material_single_case")
    expect(DETECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("o Detector D não tem nenhum threshold aprovado", () => {
    // Contraste deliberado com o Detector A. Se algum dia houver um aprovado,
    // ele aparece em APPROVED_THRESHOLDS e este teste muda com justificativa.
    expect(TEST_CONFIG.config_version).toBe("0.0.0")
  })
})

describe("A — um item numa população de 1", () => {
  const r = detectar([caso(500_000)])

  it("o agregado COM o item existe", () => {
    const com = r.evaluated[0]?.aggregate_with_item
    expect(com !== undefined && isOk(com)).toBe(true)
  })

  it("o agregado SEM o item é EMPTY_DENOMINATOR, não zero", () => {
    const sem = r.evaluated[0]?.aggregate_without_item
    expect(sem && isOk(sem)).toBe(false)
    if (sem && !isOk(sem)) expect(sem.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("o delta não é afirmado", () => {
    expect(r.evaluated[0]?.delta && isOk(r.evaluated[0].delta)).toBe(false)
  })

  it("o caso é not_comparable, não not_material", () => {
    expect(r.evaluated[0]?.outcome).toBe("not_comparable")
    expect(r.summary.not_comparable).toBe(1)
  })

  it("nenhum evento", () => {
    expect(r.events).toHaveLength(0)
  })
})

describe("B — participação legítima: 100 num total de 1000", () => {
  const r = detectar([caso(100_000), caso(300_000), caso(600_000)])

  it("share do caso menor é 1000 bp", () => {
    const i = impactoDe(r, 100_000)
    expect(i && isOk(i.share_of_total_bp) && i.share_of_total_bp.value).toBe(1000)
  })

  it("delta é exatamente o valor do item", () => {
    const i = impactoDe(r, 100_000)
    expect(i && isOk(i.delta) && i.delta.value).toBe(100_000)
  })

  it("mudança relativa usa o agregado SEM o item como base", () => {
    // 100.000 / 900.000 = 1111 bp — diferente da participação de 1000 bp.
    const i = impactoDe(r, 100_000)
    expect(i && isOk(i.relative_delta_bp) && i.relative_delta_bp.value).toBe(1111)
  })

  it("as duas grandezas NÃO são iguais — são perguntas diferentes", () => {
    const i = impactoDe(r, 100_000)
    const rel = i && isOk(i.relative_delta_bp) ? i.relative_delta_bp.value : -1
    const parte = i && isOk(i.share_of_total_bp) ? i.share_of_total_bp.value : -1
    expect(rel).not.toBe(parte)
  })
})

describe("C — item dominante: 900 num total de 1000", () => {
  const r = detectar([caso(900_000), caso(50_000), caso(50_000)])
  const i = impactoDe(r, 900_000)

  it("participação de 9000 bp", () => {
    expect(i && isOk(i.share_of_total_bp) && i.share_of_total_bp.value).toBe(9000)
  })

  it("mudança relativa passa de 10000 bp e NÃO é clampada", () => {
    // 900.000 / 100.000 = 90000 bp. Não cabe em basis_points do contrato, e por
    // isso é publicada como métrica, não como participação.
    expect(i && isOk(i.relative_delta_bp) && i.relative_delta_bp.value).toBe(90000)
  })

  it("é material e emite evento", () => {
    expect(i?.outcome).toBe("material")
    expect(r.events).toHaveLength(1)
  })
})

describe("D — caso acima de 100% do total líquido não recebe share falso", () => {
  // 150 dentro de um total líquido de 100: 150.000 − 50.000 = 100.000.
  const r = detectar([caso(150_000), caso(-50_000)], {}, comConfig({ min_population_after_removal: 1 }))
  const i = impactoDe(r, 150_000)

  it("o delta absoluto continua exato", () => {
    expect(i && isOk(i.delta) && i.delta.value).toBe(150_000)
  })

  it("a participação é LACUNA, não 15000 nem 10000", () => {
    const s = i?.share_of_total_bp
    expect(s && isOk(s)).toBe(false)
    if (s && !isOk(s)) expect(s.gap).toBe("BUSINESS_RULE_PENDING")
  })

  it("nenhuma participação publicada passa de 10000 bp", () => {
    for (const x of r.evaluated) {
      if (isOk(x.share_of_total_bp)) expect(x.share_of_total_bp.value).toBeLessThanOrEqual(10000)
    }
  })
})

describe("E — caso negativo: o delta preserva sinal e magnitude", () => {
  const r = detectar([caso(-200_000), caso(500_000), caso(400_000)])
  const i = impactoDe(r, -200_000)

  it("delta é negativo e exato", () => {
    expect(i && isOk(i.delta) && i.delta.value).toBe(-200_000)
  })

  it("remover o estorno LEVANTA o agregado", () => {
    expect(i && isOk(i.aggregate_with_item) && i.aggregate_with_item.value).toBe(700_000)
    expect(i && isOk(i.aggregate_without_item) && i.aggregate_without_item.value).toBe(900_000)
  })

  it("a participação não existe para contribuição negativa", () => {
    expect(i && isOk(i.share_of_total_bp)).toBe(false)
  })

  it("mas a mudança relativa existe e é negativa", () => {
    expect(i && isOk(i.relative_delta_bp) && i.relative_delta_bp.value).toBeLessThan(0)
  })
})

describe("F/G/H — total zero, total negativo, sinais mistos", () => {
  it("F — total zero: participação é EMPTY_DENOMINATOR", () => {
    const r = detectar([caso(300_000), caso(-300_000), caso(0)])
    for (const i of r.evaluated) {
      if (!isOk(i.share_of_total_bp)) {
        expect(["EMPTY_DENOMINATOR", "BUSINESS_RULE_PENDING"]).toContain(i.share_of_total_bp.gap)
      }
    }
    const zeroTotal = r.evaluated[0]
    expect(zeroTotal && isOk(zeroTotal.aggregate_with_item) && zeroTotal.aggregate_with_item.value).toBe(0)
  })

  it("G — total negativo: mudança relativa vira regra pendente", () => {
    const r = detectar([caso(-500_000), caso(-300_000), caso(100_000)])
    const i = impactoDe(r, -500_000)
    const rel = i?.relative_delta_bp
    expect(rel && isOk(rel)).toBe(false)
    if (rel && !isOk(rel)) expect(rel.gap).toBe("BUSINESS_RULE_PENDING")
  })

  it("G — mas o delta absoluto segue calculável", () => {
    const r = detectar([caso(-500_000), caso(-300_000), caso(100_000)])
    const i = impactoDe(r, -500_000)
    expect(i && isOk(i.delta) && i.delta.value).toBe(-500_000)
  })

  it("H — sinais mistos: nenhum número financeiro é inventado", () => {
    const r = detectar([caso(900_000), caso(-400_000), caso(100_000)])
    for (const i of r.evaluated) {
      expect(isOk(i.delta)).toBe(true)
      if (isOk(i.share_of_total_bp)) {
        expect(i.share_of_total_bp.value).toBeGreaterThanOrEqual(0)
        expect(i.share_of_total_bp.value).toBeLessThanOrEqual(10000)
      }
    }
  })
})

describe("I — remover item muda a MÉDIA", () => {
  const casos = [caso(100_000), caso(200_000), caso(900_000)]
  const r = detectar(casos, comMetrica("amount_mean_cents"))

  it("a média com o item é a média das três", () => {
    const i = r.evaluated[2]
    expect(i && isOk(i.aggregate_with_item) && i.aggregate_with_item.value).toBe(400_000)
  })

  it("a média sem o item bate com recomputação independente", () => {
    const i = r.evaluated[2]
    const esperado = meanCents([100_000, 200_000], "SUM(valores) / COUNT(valores)")
    expect(i && isOk(i.aggregate_without_item) && i.aggregate_without_item.value).toBe(
      isOk(esperado) ? esperado.value : -1,
    )
  })

  it("participação NÃO é definida para média — erro dimensional evitado", () => {
    for (const i of r.evaluated) {
      expect(isOk(i.share_of_total_bp)).toBe(false)
      if (!isOk(i.share_of_total_bp)) {
        expect(i.share_of_total_bp.gap).toBe("BUSINESS_RULE_PENDING")
      }
    }
  })

  it("mas a mudança relativa da média é publicada", () => {
    const i = r.evaluated[2]
    expect(i && isOk(i.relative_delta_bp)).toBe(true)
  })
})

describe("J — remover item muda a CONTAGEM", () => {
  const r = detectar([caso(100_000), caso(200_000), caso(300_000)], comMetrica("case_count"))

  it("delta de contagem é exatamente 1", () => {
    for (const i of r.evaluated) {
      expect(isOk(i.delta) && i.delta.value).toBe(1)
    }
  })

  it("a contagem sem o item é N−1", () => {
    const i = r.evaluated[0]
    expect(i && isOk(i.aggregate_with_item) && i.aggregate_with_item.value).toBe(3)
    expect(i && isOk(i.aggregate_without_item) && i.aggregate_without_item.value).toBe(2)
  })

  it("participação de contagem é 1/N e é legítima", () => {
    const i = r.evaluated[0]
    expect(i && isOk(i.share_of_total_bp) && i.share_of_total_bp.value).toBe(3333)
  })

  it("valor ausente não afeta a métrica de contagem", () => {
    const r2 = detectar([caso(null), caso(200_000), caso(300_000)], comMetrica("case_count"))
    const d = r2.evaluated[0]?.delta
    expect(d !== undefined && isOk(d)).toBe(true)
  })
})

describe("K — overflow falha fechado", () => {
  it("soma fora da faixa exata vira lacuna, não número aproximado", () => {
    const r = detectar([
      caso(Number.MAX_SAFE_INTEGER),
      caso(Number.MAX_SAFE_INTEGER),
      caso(Number.MAX_SAFE_INTEGER),
    ])
    const com = r.evaluated[0]?.aggregate_with_item
    expect(com !== undefined && isOk(com)).toBe(false)
    expect(r.events).toHaveLength(0)
  })
})

describe("L — valor ausente não vira zero", () => {
  const r = detectar([caso(null), caso(500_000), caso(400_000)])

  it("o agregado é lacuna, não a soma dos presentes", () => {
    const i = r.evaluated[1]
    expect(i && isOk(i.aggregate_with_item)).toBe(false)
    if (i && !isOk(i.aggregate_with_item)) {
      expect(i.aggregate_with_item.gap).toBe("DATA_NOT_AVAILABLE")
    }
  })

  it("a ausência é CONTADA, não escondida", () => {
    expect(r.summary.missing_amount).toBe(1)
  })

  it("a qualidade cai para insufficient", () => {
    expect(r.summary.quality_status).toBe("insufficient")
  })

  it("nenhum evento e todos not_comparable", () => {
    expect(r.events).toHaveLength(0)
    expect(r.summary.not_comparable).toBe(3)
  })

  it("o motivo distingue dado ausente de incomparável", () => {
    expect(r.evaluated[0]?.not_emitted_reason).toBe("DATA_NOT_AVAILABLE")
  })
})

describe("M/N/O/P — lastro falha fechado", () => {
  const base = [caso(500_000), caso(300_000), caso(200_000)]

  it("M — evidência pendurada", () => {
    const orfao: CaseRecord = { ...caso(100_000), evidence_refs: ["ev_inexistente"] }
    expect(() => detectar([orfao, ...base])).toThrowError(/evidência inexistente/)
  })

  it("M — caso sem nenhuma evidência", () => {
    const semLastro: CaseRecord = { ...caso(100_000), evidence_refs: [] }
    expect(() => detectar([semLastro, ...base])).toThrowError(/sem evidência/)
  })

  const outroSnap = rawSnapshot({
    snapshot_id: "snap_outro",
    source_system: "bitrix24",
    dataset_id: "ds_outro",
  }) as unknown as Snapshot

  it("N — evidência agregada de snapshot errado", () => {
    const ev = rawEvidence({
      evidence_id: "ev_agg_outro",
      snapshot_id: "snap_outro",
      kind: "aggregate",
      locator: { dataset_id: "ds_outro", sheet: "Vendas" },
    }) as unknown as Evidence
    expect(() =>
      detectar(base, {
        snapshots: [...snapshots, outroSnap],
        evidence: [...evidence, ev],
        aggregate_evidence_ref: "ev_agg_outro",
      }),
    ).toThrowError(/snapshot/)
  })

  it("O — snapshot certo, dataset errado no localizador", () => {
    const ev = rawEvidence({
      evidence_id: "ev_agg_ds_errado",
      snapshot_id: "snap_vendas",
      kind: "aggregate",
      locator: { dataset_id: "ds_nao_usado", sheet: "Vendas" },
    }) as unknown as Evidence
    expect(() =>
      detectar(base, { evidence: [...evidence, ev], aggregate_evidence_ref: "ev_agg_ds_errado" }),
    ).toThrowError(/dataset/)
  })

  it("P — agregado multi-dataset sem evidência composta falha fechado", () => {
    const evLinha = rawEvidence({
      evidence_id: "ev_linha_outro",
      snapshot_id: "snap_outro",
      kind: "row",
      locator: { dataset_id: "ds_outro", sheet: "Vendas", row_key: "b".repeat(64) },
    }) as unknown as Evidence
    const doOutro: CaseRecord = {
      subject_ref: subjectRef(),
      unit: MATCHED,
      amount_cents: 100_000,
      evidence_refs: ["ev_linha_outro"],
      snapshot_id: "snap_outro",
    }
    expect(() =>
      detectar([...base, doOutro], {
        snapshots: [...snapshots, outroSnap],
        evidence: [...evidence, evLinha],
      }),
    ).toThrowError(/escopos governados/)
  })

  it("o agregado SEM o item não pode reusar a evidência do agregado COM o item", () => {
    expect(() =>
      detectar(base, {
        counterfactual_bindings: base.map((c) => binding(c, "amount_sum_cents", { evidence_ref: "ev_agregado" })),
      }),
    ).toThrowError(/não pode ser a mesma/)
  })

  it("evidência computed sem fórmula é recusada — a fórmula é a procedência", () => {
    const c0 = base[0]
    if (c0 === undefined) throw new Error("fixture")
    const ev = rawEvidence({
      evidence_id: "ev_cf_sem_formula",
      snapshot_id: "snap_vendas",
      kind: "computed",
      locator: { dataset_id: "ds_vendas", sheet: "Vendas" },
    }) as unknown as Evidence
    expect(() =>
      detectar(base, {
        evidence: [...evidence, ev, ...base.map((c) => evContrafactual(c.subject_ref))],
        counterfactual_bindings: [
          binding(c0, "amount_sum_cents", { evidence_ref: "ev_cf_sem_formula" }),
          ...base.slice(1).map((c) => binding(c)),
        ],
      }),
    ).toThrowError(/sem fórmula/)
  })

  it("o agregado sem o item não aceita evidência de tipo row", () => {
    const c0 = base[0]
    if (c0 === undefined) throw new Error("fixture")
    expect(() =>
      detectar(base, {
        counterfactual_bindings: [
          binding(c0, "amount_sum_cents", { evidence_ref: "ev_linha" }),
          ...base.slice(1).map((c) => binding(c)),
        ],
      }),
    ).toThrowError(/exige computed/)
  })
})

describe("Q/R — D13 e privacidade", () => {
  it("Q — unidade ambígua não recebe identidade inventada", () => {
    const ambigua: CanonicalUnitResult = {
      status: "ambiguous",
      candidates: ["santo_amaro", "santos"],
      raw_fingerprint: "a".repeat(16),
    }
    const r = detectar([caso(900_000, ambigua), caso(50_000), caso(50_000)])
    expect(r.evaluated[0]?.unit).toBeUndefined()
  })

  it("Q — unidade unknown também é omitida", () => {
    const r = detectar([caso(900_000, UNKNOWN), caso(50_000), caso(50_000)])
    expect(r.evaluated[0]?.unit).toBeUndefined()
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("Q — unidade resolvida traz o display_name do CATÁLOGO", () => {
    const r = detectar([caso(900_000), caso(50_000), caso(50_000)])
    expect(r.evaluated[0]?.unit).toBe("Mogi das Cruzes")
  })

  it("R — nome de pessoa não atravessa: o tipo só aceita identidade canônica", () => {
    // `CaseRecord.unit` é `CanonicalUnitResult`. Um nome livre como "Maria
    // Silva" não tem como entrar por aqui, e o output só publica display_name de
    // unidade resolvida. A varredura confirma que nada parecido sai.
    const r = detectar([caso(900_000, UNKNOWN), caso(50_000), caso(50_000)])
    const serializado = JSON.stringify(r)
    expect(serializado).not.toContain("Maria")
    expect(serializado).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
    for (const i of r.evaluated) {
      expect(i.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
    }
  })
})

describe("S — boundary de materialidade (TEST_CONFIG sintética)", () => {
  // material_share_of_total_bp = 1000. Com total 1.000.000, o caso precisa de
  // 100.000 para atingir 1000 bp. Os outros dois limiares ficam altos de
  // propósito, para isolar a dimensão de participação.
  const cfg = comConfig({
    material_absolute_delta_cents: 999_999_999,
    material_relative_delta_bp: 999_999,
    material_share_of_total_bp: 1000,
  })

  const comParticipacao = (valorCaso: number, resto: number): boolean => {
    const r = detectar([caso(valorCaso), caso(resto)], {}, comConfig({
      material_absolute_delta_cents: 999_999_999,
      material_relative_delta_bp: 999_999,
      material_share_of_total_bp: 1000,
      min_population_after_removal: 1,
    }))
    return r.evaluated[0]?.outcome === "material"
  }

  it("abaixo do limiar não é material", () => {
    // 99.000 de 1.000.000 = 990 bp
    expect(comParticipacao(99_000, 901_000)).toBe(false)
  })

  it("exatamente no limiar É material", () => {
    // 100.000 de 1.000.000 = 1000 bp
    expect(comParticipacao(100_000, 900_000)).toBe(true)
  })

  it("acima do limiar é material", () => {
    expect(comParticipacao(101_000, 899_000)).toBe(true)
  })

  it("a dimensão ABSOLUTA é independente da participação", () => {
    // Participação minúscula, delta absoluto grande.
    const r = detectar(
      [caso(300_000), ...Array.from({ length: 40 }, () => caso(300_000))],
      {},
      comConfig({
        material_absolute_delta_cents: 200_000,
        material_relative_delta_bp: 999_999,
        material_share_of_total_bp: 9999,
      }),
    )
    expect(r.evaluated[0]?.outcome).toBe("material")
    const parte = r.evaluated[0]?.share_of_total_bp
    expect(parte !== undefined && isOk(parte) && parte.value).toBeLessThan(9999)
  })

  it("um limiar nomeado para participação não classifica centavos", () => {
    expect(cfg.materialSingleCase.material_share_of_total_bp).toBe(1000)
    expect(cfg.materialSingleCase.material_absolute_delta_cents).not.toBe(1000)
  })
})

describe("T — boundary de severidade (TEST_CONFIG sintética)", () => {
  // severity_dimension = share_of_total_bp na TEST_CONFIG.
  const grauPara = (valorCaso: number, resto: number): string | null => {
    const r = detectar([caso(valorCaso), caso(resto)], {}, comConfig({ min_population_after_removal: 1 }))
    return r.evaluated[0]?.severity ?? null
  }

  it("0 bp → info", () => {
    expect(grauPara(0, 1_000_000)).toBe("info")
  })

  it("1000 bp → low", () => {
    expect(grauPara(100_000, 900_000)).toBe("low")
  })

  it("2500 bp → medium", () => {
    expect(grauPara(250_000, 750_000)).toBe("medium")
  })

  it("5000 bp → high", () => {
    expect(grauPara(500_000, 500_000)).toBe("high")
  })

  it("7500 bp → critical", () => {
    expect(grauPara(750_000, 250_000)).toBe("critical")
  })
})

describe("U — dimensão de severidade indisponível: sem Event, com auditoria", () => {
  // severity_dimension = share_of_total_bp, métrica = média: a participação NÃO
  // é definida para média. Fato pode ser material pela dimensão absoluta.
  const r = detectar(
    [caso(9_000_000), caso(100_000), caso(100_000)],
    comMetrica("amount_mean_cents"),
    comConfig({ material_absolute_delta_cents: 100_000, severity_dimension: "share_of_total_bp" }),
  )
  const i = r.evaluated[0]

  it("o fato É material", () => {
    expect(i?.outcome).toBe("material")
  })

  it("severity é null — não fabricada", () => {
    expect(i?.severity).toBeNull()
  })

  it("nenhum Event é emitido", () => {
    expect(r.events).toHaveLength(0)
    expect(r.summary.emitted).toBe(0)
  })

  it("o motivo é tipado e específico", () => {
    expect(i?.not_emitted_reason).toBe("SEVERITY_DIMENSION_UNAVAILABLE")
  })

  it("a lacuna exata fica registrada", () => {
    expect(i?.severity_gap).toContain("share_of_total_bp")
    expect(i?.severity_gap).toContain("BUSINESS_RULE_PENDING")
  })

  it("o resultado auditável preserva os números calculáveis", () => {
    expect(i && isOk(i.aggregate_with_item)).toBe(true)
    expect(i && isOk(i.aggregate_without_item)).toBe(true)
    expect(i && isOk(i.delta)).toBe(true)
    expect(i && isOk(i.relative_delta_bp)).toBe(true)
    expect(i?.evidence_refs).toEqual(["ev_linha"])
  })

  it("trocar a dimensão para a que existe libera a emissão", () => {
    const r2 = detectar(
      [caso(9_000_000), caso(100_000), caso(100_000)],
      comMetrica("amount_mean_cents"),
      comConfig({
        material_absolute_delta_cents: 100_000,
        severity_dimension: "relative_delta_bp",
      }),
    )
    expect(r2.evaluated[0]?.severity).not.toBeNull()
    expect(r2.events.length).toBeGreaterThan(0)
  })

  it("dimensão FORA do domínio da escala também bloqueia — e não lança", () => {
    // Remover um caso pequeno de uma média puxada por um caso grande LEVANTA a
    // média: a mudança relativa fica negativa. A escala sintética começa em 0,
    // então esse valor não é graduável. Antes desta correção `classifySeverity`
    // lançava e abortava a análise dos OUTROS casos.
    const r2 = detectar(
      [caso(9_000_000), caso(100_000), caso(100_000)],
      comMetrica("amount_mean_cents"),
      comConfig({ severity_dimension: "relative_delta_bp", material_absolute_delta_cents: 100_000 }),
    )
    const rel = r2.evaluated[1]?.relative_delta_bp
    expect(rel !== undefined && isOk(rel)).toBe(true)
    expect(rel !== undefined && isOk(rel) && rel.value).toBeLessThan(0)
    const pequeno = r2.evaluated[1]
    expect(pequeno?.severity).toBeNull()
    expect(pequeno?.severity_gap).toContain("fora do domínio da escala")
    expect(pequeno?.not_emitted_reason).toBe("SEVERITY_DIMENSION_UNAVAILABLE")
  })

  it("um caso não graduável não impede a análise dos outros", () => {
    const r2 = detectar(
      [caso(9_000_000), caso(100_000), caso(100_000)],
      comMetrica("amount_mean_cents"),
      comConfig({ severity_dimension: "relative_delta_bp", material_absolute_delta_cents: 100_000 }),
    )
    expect(r2.summary.candidates_evaluated).toBe(3)
    expect(r2.evaluated[0]?.severity).not.toBeNull()
    expect(r2.events.length).toBeGreaterThan(0)
  })

  it("os quatro motivos de não-emissão são distinguíveis", () => {
    const vistos = new Set<string>()
    vistos.add(r.evaluated[0]?.not_emitted_reason ?? "")
    vistos.add(detectar(naoMaterial()).evaluated[0]?.not_emitted_reason ?? "")
    vistos.add(detectar([caso(null), caso(1), caso(1)]).evaluated[0]?.not_emitted_reason ?? "")
    vistos.add(detectar([caso(500_000)]).evaluated[0]?.not_emitted_reason ?? "")
    expect(vistos).toContain("SEVERITY_DIMENSION_UNAVAILABLE")
    expect(vistos).toContain("NOT_MATERIAL")
    expect(vistos).toContain("DATA_NOT_AVAILABLE")
    expect(vistos).toContain("NOT_COMPARABLE")
  })
})

describe("V/W — determinismo e ordem", () => {
  it("V — mesma entrada, config e detected_at: deep-equal", () => {
    const casos = [caso(900_000), caso(50_000), caso(50_000)]
    const a = detectar(casos)
    const b = detectar(casos)
    expect(structuredClone(a)).toEqual(structuredClone(b))
  })

  it("W — ordem da entrada não altera o agregado", () => {
    const casos = [caso(900_000), caso(50_000), caso(50_000)]
    const a = detectar(casos)
    const b = detectar([...casos].reverse())
    const somaA = a.evaluated[0]?.aggregate_with_item
    const somaB = b.evaluated[0]?.aggregate_with_item
    expect(somaA !== undefined && isOk(somaA) && somaA.value).toBe(1_000_000)
    expect(somaB !== undefined && isOk(somaB) && somaB.value).toBe(1_000_000)
  })

  it("W — ordem não altera a identidade lógica de cada caso", () => {
    const casos = [caso(900_000), caso(50_000), caso(50_000)]
    const ids = (r: ReturnType<typeof detectar>) => r.events.map((e) => e.event_id).sort()
    expect(ids(detectar(casos))).toEqual(ids(detectar([...casos].reverse())))
  })
})

describe("X/Y — identidade lógica", () => {
  const casos = [caso(900_000), caso(50_000), caso(50_000)]

  it("X — reingestão com outro snapshot_id mantém a identidade", () => {
    const outro = rawSnapshot({
      snapshot_id: "snap_vendas_reingerido",
      source_system: "google_sheets",
      dataset_id: "ds_vendas",
    }) as unknown as Snapshot
    const reingerido = casos.map((c) => ({ ...c, snapshot_id: "snap_vendas_reingerido" }))
    const evs = [
      ...evidence.map((e) => ({ ...e, snapshot_id: "snap_vendas_reingerido" })),
      ...reingerido.map((c) => ({
        ...evContrafactual(c.subject_ref),
        snapshot_id: "snap_vendas_reingerido",
      })),
    ] as Evidence[]

    const a = detectar(casos)
    const b = detectar(reingerido, {
      snapshots: [outro],
      evidence: evs,
      counterfactual_bindings: reingerido.map((c) => binding(c)),
    })
    expect(b.events[0]?.event_id).toBe(a.events[0]?.event_id)
  })

  it("Y — dataset diferente com os mesmos valores muda a identidade", () => {
    const outro = rawSnapshot({
      snapshot_id: "snap_outro_ds",
      source_system: "google_sheets",
      dataset_id: "ds_outro",
    }) as unknown as Snapshot
    const noOutro = casos.map((c) => ({ ...c, snapshot_id: "snap_outro_ds" }))
    const remapear = (e: Evidence): Evidence => ({
      ...e,
      snapshot_id: "snap_outro_ds",
      locator: { ...e.locator, dataset_id: "ds_outro" },
    })
    const evs = [
      ...evidence.map(remapear),
      ...noOutro.map((c) => remapear(evContrafactual(c.subject_ref))),
    ] as Evidence[]

    const a = detectar(casos)
    const bindingsOutro = noOutro.map((c) =>
      binding(c, "amount_sum_cents", {
        scope: [{ source_system: "google_sheets", dataset_id: "ds_outro" }],
      }),
    )
    const b = detectar(noOutro, {
      snapshots: [outro],
      evidence: evs,
      counterfactual_bindings: bindingsOutro,
      counterfactual_provenance: bindingsOutro.map(provenanceDe),
    })
    expect(b.events[0]?.event_id).not.toBe(a.events[0]?.event_id)
  })

  it("métrica diferente é fato diferente", () => {
    const a = detectar(casos)
    const b = detectar(casos, comMetrica("case_count"))
    expect(b.events[0]?.event_id).not.toBe(a.events[0]?.event_id)
  })

  it("a política de severidade NÃO entra na identidade", () => {
    const a = detectar(casos)
    const b = detectar(casos, {}, comConfig({ severity_dimension: "relative_delta_bp" }))
    expect(b.events[0]?.event_id).toBe(a.events[0]?.event_id)
  })

  it("o id casa com o padrão de identificador do contrato", () => {
    expect(detectar(casos).events[0]?.event_id).toMatch(/^evt_[a-f0-9]{16}$/)
  })
})

describe("propriedades matemáticas do contrafactual", () => {
  const conjuntos: readonly (readonly number[])[] = [
    [100_000, 200_000, 300_000],
    [1, 2, 3, 4, 5],
    [500_000, 500_000, 500_000, 500_000],
    [-100_000, 400_000, 700_000],
    [999_999, 1, 500_000, 250_000],
  ]

  it("SOMA: com − sem === valor do item, para todo item", () => {
    for (const valores of conjuntos) {
      const r = detectar(valores.map((v) => caso(v)))
      for (const [i, esperado] of valores.entries()) {
        const x = r.evaluated[i]
        expect(x && isOk(x.delta) && x.delta.value, `conjunto ${valores.join(",")} item ${i}`).toBe(
          esperado,
        )
      }
    }
  })

  it("SOMA: agregado sem o item === soma independente do resto", () => {
    for (const valores of conjuntos) {
      const r = detectar(valores.map((v) => caso(v)))
      for (const i of valores.keys()) {
        const resto = valores.filter((_, j) => j !== i)
        const x = r.evaluated[i]
        expect(x && isOk(x.aggregate_without_item) && x.aggregate_without_item.value).toBe(
          sumCents(resto),
        )
      }
    }
  })

  it("CONTAGEM: com − sem === 1, sempre", () => {
    for (const valores of conjuntos) {
      const r = detectar(valores.map((v) => caso(v)), comMetrica("case_count"))
      for (const x of r.evaluated) {
        expect(isOk(x.delta) && x.delta.value).toBe(1)
      }
    }
  })

  it("MÉDIA: sem o item === recomputação independente da coleção sem o item", () => {
    for (const valores of conjuntos) {
      const r = detectar(valores.map((v) => caso(v)), comMetrica("amount_mean_cents"))
      for (const i of valores.keys()) {
        const resto = valores.filter((_, j) => j !== i)
        const esperado = meanCents(resto, "SUM(valores) / COUNT(valores)")
        const x = r.evaluated[i]
        expect(x && isOk(x.aggregate_without_item) && x.aggregate_without_item.value).toBe(
          isOk(esperado) ? esperado.value : null,
        )
      }
    }
  })

  it("a soma dos deltas de todos os itens === o agregado total (soma)", () => {
    for (const valores of conjuntos) {
      const r = detectar(valores.map((v) => caso(v)))
      const deltas = r.evaluated.map((x) => (isOk(x.delta) ? x.delta.value : NaN))
      expect(sumCents(deltas)).toBe(sumCents(valores))
    }
  })
})

describe("evento válido contra o contrato", () => {
  const r = detectar([caso(900_000), caso(50_000), caso(50_000)])

  it("o evento passa schema + semântica", () => {
    expect(r.events).toHaveLength(1)
    expect(() => assertValid("event", r.events[0])).not.toThrow()
  })

  it("event_type é material_single_case", () => {
    expect(r.events[0]?.event_type).toBe("material_single_case")
  })

  it("a métrica principal traz fórmula e valor", () => {
    const m = r.events[0]?.observed_metric as { formula?: string; value?: number; name?: string }
    expect(m.name).toBe("delta_if_case_excluded")
    expect(m.formula).toBe(FORMULA_DELTA)
    expect(m.value).toBe(900_000)
  })

  it("a métrica de referência é o agregado SEM o item, com sua fórmula", () => {
    const m = r.events[0]?.reference_metric as { name?: string; value?: number; formula?: string }
    expect(m.name).toBe("aggregate_without_item")
    expect(m.value).toBe(100_000)
    expect(m.formula).toContain("except the subject case")
  })

  it("a evidência do agregado E a contrafactual DO CANDIDATO estão nos refs", () => {
    const alvo = r.evaluated.find((i) => i.emitted)
    expect(r.events[0]?.evidence_refs).toContain("ev_agregado")
    expect(alvo?.counterfactual_evidence_ref).toBeDefined()
    expect(r.events[0]?.evidence_refs).toContain(alvo?.counterfactual_evidence_ref)
  })

  it("cada candidato carrega a identidade da SUA computação contrafactual", () => {
    const ids = r.evaluated.map((i) => i.counterfactual_computation_id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^cfc_[a-f0-9]{16}$/)
  })

  it("nenhuma fórmula publicada usa linguagem causal", () => {
    const texto = JSON.stringify(r.events)
    for (const proibido of ["caused", "responsible", "would have", "would_produce", "prevented"]) {
      expect(texto.toLowerCase()).not.toContain(proibido)
    }
  })

  it("todas as fórmulas das especificações são descritivas, não causais", () => {
    for (const spec of Object.values(ESPECIFICACOES)) {
      for (const f of [spec.formula_with, spec.formula_without]) {
        expect(f.toLowerCase()).not.toMatch(/caus|responsib|would/)
      }
    }
  })
})

describe("métrica fora da lista habilitada é recusada", () => {
  it("pedir métrica não suportada falha fechado", () => {
    const cfg = comConfig({ supported_metrics: ["amount_sum_cents"] })
    expect(() => detectar([caso(1), caso(2), caso(3)], comMetrica("case_count"), cfg)).toThrowError(
      GatewayError,
    )
  })

  it("e a recusa nomeia o que estava habilitado", () => {
    const cfg = comConfig({ supported_metrics: ["amount_sum_cents"] })
    try {
      detectar([caso(1), caso(2), caso(3)], comMetrica("amount_mean_cents"), cfg)
      expect.unreachable("deveria ter recusado")
    } catch (e) {
      expect((e as GatewayError).message).toContain("amount_sum_cents")
    }
  })
})

describe("Z/AA — imutabilidade profunda e isolamento do input", () => {
  /** Arrays MUTÁVEIS de propósito — é o que um chamador real entrega. */
  const inputMutavel = (): MaterialSingleCaseInput => {
    const cases: CaseRecord[] = [900_000, 50_000, 50_000].map((v) => ({
      subject_ref: subjectRef(),
      unit: MATCHED,
      amount_cents: v,
      evidence_refs: ["ev_linha"],
      snapshot_id: "snap_vendas",
    }))
    return {
      detected_at: DETECTED_AT,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      metric: "amount_sum_cents",
      cases,
      snapshots,
      evidence: [...evidence, ...cases.map((c) => evContrafactual(c.subject_ref))],
      aggregate_evidence_ref: "ev_agregado",
      counterfactual_bindings: cases.map((c) => binding(c)),
      counterfactual_provenance: cases.map((c) => provenanceDe(binding(c))),
    }
  }

  it("AA — evidence_refs do output não é a referência do input", () => {
    const input = inputMutavel()
    const r = detectMaterialSingleCase(input, TEST_CONFIG)
    for (const i of r.evaluated) {
      for (const c of input.cases) {
        expect(i.evidence_refs).not.toBe(c.evidence_refs)
      }
    }
    for (const caso of r.events[0]?.contributing_cases ?? []) {
      for (const c of input.cases) {
        expect(caso.evidence_refs).not.toBe(c.evidence_refs)
      }
    }
  })

  it("AA — nenhum objeto do input é alcançável a partir do output", () => {
    const input = inputMutavel()
    const r = detectMaterialSingleCase(input, TEST_CONFIG)
    const doInput = new Set<unknown>([
      input.cases,
      ...input.cases,
      ...input.cases.map((c) => c.evidence_refs),
      ...input.cases.map((c) => c.unit),
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

  describe("AA — mutar o input depois não altera o resultado", () => {
    const input = inputMutavel()
    const r1 = detectMaterialSingleCase(input, TEST_CONFIG)
    const antes = structuredClone(r1) as unknown

    it("o input É mutável e recebe a forja", () => {
      ;(input.cases[0]?.evidence_refs as string[]).push("forged")
      expect(input.cases[0]?.evidence_refs).toContain("forged")
    })

    it("e o resultado anterior segue idêntico", () => {
      expect(structuredClone(r1)).toEqual(antes)
    })

    it("nada no evento contém a forja", () => {
      expect(JSON.stringify(r1)).not.toContain("forged")
    })
  })

  it("AA — o input não é congelado como efeito colateral", () => {
    const input = inputMutavel()
    detectMaterialSingleCase(input, TEST_CONFIG)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.cases)).toBe(false)
    expect(Object.isFrozen(input.cases[0])).toBe(false)
    expect(Object.isFrozen(input.cases[0]?.evidence_refs)).toBe(false)
    expect(() => (input.cases[0]?.evidence_refs as string[]).push("ok")).not.toThrow()
  })

  const r = detectar([caso(900_000), caso(50_000), caso(50_000)])

  it("Z — Object.isFrozen em cada nível do grafo", () => {
    const ev = r.events[0]
    const cc = ev?.contributing_cases?.[0]
    const alvos: readonly [string, unknown][] = [
      ["result", r],
      ["events", r.events],
      ["evaluated", r.evaluated],
      ["evaluated[0]", r.evaluated[0]],
      ["evaluated[0].delta", r.evaluated[0]?.delta],
      ["evaluated[0].evidence_refs", r.evaluated[0]?.evidence_refs],
      ["summary", r.summary],
      ["event", ev],
      ["event.materiality", ev?.materiality],
      ["event.observed_metric", ev?.observed_metric],
      ["event.reference_metric", ev?.reference_metric],
      ["event.snapshot_ids", ev?.snapshot_ids],
      ["event.evidence_refs", ev?.evidence_refs],
      ["event.data_quality", ev?.data_quality],
      ["event.contributing_cases", ev?.contributing_cases],
      ["case", cc],
      ["case.contribution", cc?.contribution],
      ["case.evidence_refs", cc?.evidence_refs],
    ]
    for (const [nome, alvo] of alvos) {
      expect(alvo, `${nome} deveria existir`).toBeDefined()
      expect(Object.isFrozen(alvo), `${nome} deveria estar congelado`).toBe(true)
    }
  })

  it("Z — cada mutação aninhada lança e o estado não muda", () => {
    const tentativas: readonly [string, () => void][] = [
      ["summary.material", () => ((r.summary as { material: number }).material = 999)],
      ["delta.value", () => ((r.evaluated[0]?.delta as { value: number }).value = 0)],
      ["materiality", () => ((r.events[0]?.materiality as { amount_cents: number }).amount_cents = 0)],
      ["contribution", () => ((r.events[0]?.contributing_cases?.[0]?.contribution as { amount_cents: number }).amount_cents = 0)],
      ["events.push", () => (r.events as unknown[]).push({ forged: true })],
      ["evaluated.push", () => (r.evaluated as unknown[]).push({ forged: true })],
      ["evidence_refs.push", () => (r.events[0]?.evidence_refs as string[]).push("forged")],
      ["snapshot_ids.push", () => (r.events[0]?.snapshot_ids as string[]).push("forged")],
      ["case evidence_refs.push", () => (r.events[0]?.contributing_cases?.[0]?.evidence_refs as string[]).push("forged")],
      ["root", () => ((r as unknown as { events: null }).events = null)],
    ]
    const antes = structuredClone(r) as unknown
    for (const [nome, mutar] of tentativas) {
      expect(mutar, nome).toThrowError(TypeError)
    }
    expect(structuredClone(r)).toEqual(antes)
  })

  it("Z — resultado sem evento também é congelado por inteiro", () => {
    const r0 = detectar(naoMaterial())
    expect(r0.events).toHaveLength(0)
    expect(Object.isFrozen(r0)).toBe(true)
    expect(Object.isFrozen(r0.events)).toBe(true)
    expect(Object.isFrozen(r0.evaluated[0])).toBe(true)
    expect(() => ((r0.summary as { material: number }).material = 1)).toThrowError(TypeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/** Sobrescreve campos da seção sintética do Detector D. Nunca política real. */
function comConfig(campos: Record<string, unknown>): DetectorConfig {
  const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
  c["materialSingleCase"] = { ...c["materialSingleCase"], ...campos }
  return c as unknown as DetectorConfig
}

// ═════════════════════════════════════════════════════════════════════════════
// Correções do gate adversarial da Fase 2.4
// ═════════════════════════════════════════════════════════════════════════════

describe("HIGH-1 — evidência contrafactual vinculada ao candidato EXATO", () => {
  const trio = (): CaseRecord[] => [caso(900_000), caso(50_000), caso(50_000)]

  const comBindings = (
    cases: readonly CaseRecord[],
    bindings: readonly CounterfactualBinding[],
  ): ReturnType<typeof detectar> =>
    detectar(cases, { counterfactual_bindings: bindings })

  // ── A ──
  it("A — X usa a evidência de X: aceita", () => {
    const cases = trio()
    expect(() => comBindings(cases, cases.map((c) => binding(c)))).not.toThrow()
  })

  // ── B ──
  it("B — Y tentando usar a evidência/binding de X: falha fechada", () => {
    // O furo que o gate encontrou: uma evidência que calcula "sem X" sustentava
    // também o evento de Y. Agora o binding de Y aponta para a evidência de X.
    const cases = trio()
    const x = cases[0]
    const y = cases[1]
    if (x === undefined || y === undefined) throw new Error("fixture")
    expect(() =>
      comBindings(cases, [
        binding(x),
        binding(y, "amount_sum_cents", { evidence_ref: `ev_cf_${x.subject_ref.slice(5)}` }),
        binding(cases[2] as CaseRecord),
      ]),
    ).toThrowError(/computações distintas/)
  })

  it("B — e a mensagem nomeia a evidência disputada", () => {
    const cases = trio()
    const x = cases[0]
    const y = cases[1]
    if (x === undefined || y === undefined) throw new Error("fixture")
    try {
      comBindings(cases, [
        binding(x),
        binding(y, "amount_sum_cents", { evidence_ref: `ev_cf_${x.subject_ref.slice(5)}` }),
        binding(cases[2] as CaseRecord),
      ])
      expect.unreachable("deveria ter recusado")
    } catch (e) {
      expect((e as GatewayError).message).toContain(`ev_cf_${x.subject_ref.slice(5)}`)
    }
  })

  // ── C ──
  it("C — dois candidatos com duas evidências corretas: ambos avaliados", () => {
    const cases = [caso(500_000), caso(500_000), caso(100_000)]
    const r = comBindings(cases, cases.map((c) => binding(c)))
    expect(r.summary.candidates_evaluated).toBe(3)
    const refs = r.evaluated.map((i) => i.counterfactual_evidence_ref)
    expect(new Set(refs).size).toBe(3)
  })

  // ── D ──
  it("D — mesmo evidence_ref para dois bindings distintos: rejeitado", () => {
    const cases = trio()
    const compartilhada = `ev_cf_${(cases[0] as CaseRecord).subject_ref.slice(5)}`
    expect(() =>
      comBindings(
        cases,
        cases.map((c) => binding(c, "amount_sum_cents", { evidence_ref: compartilhada })),
      ),
    ).toThrowError(/prova UM número/)
  })

  // ── E/F/G/H ──
  const errado = (campos: Partial<CounterfactualBinding>, padrao: RegExp): void => {
    const cases = trio()
    const x = cases[0]
    if (x === undefined) throw new Error("fixture")
    expect(() =>
      comBindings(cases, [
        binding(x, "amount_sum_cents", campos),
        ...cases.slice(1).map((c) => binding(c)),
      ]),
    ).toThrowError(padrao)
  }

  it("E — subject correto, métrica errada: rejeita", () => {
    errado({ metric: "case_count", aggregator: "count" }, /métrica/)
  })

  it("F — subject correto, agregador errado: rejeita", () => {
    errado({ aggregator: "mean" }, /agregador/)
  })

  it("G — subject correto, período errado: rejeita", () => {
    errado({ period_start: "2026-07-01" }, /período/)
  })

  it("H — subject correto, escopo errado: rejeita", () => {
    errado({ scope: [{ source_system: "bitrix24", dataset_id: "ds_outro" }] }, /escopo/)
  })

  it("operação fora do conjunto fechado: rejeita", () => {
    errado({ operation: "include_subject" as "exclude_subject" }, /não é suportada/)
  })

  // ── I ──
  it("I — evidência pendurada no binding: rejeita", () => {
    errado({ evidence_ref: "ev_nao_existe" }, /evidência inexistente/)
  })

  it("candidato SEM binding: rejeita — nenhum agregado sem lastro", () => {
    const cases = trio()
    expect(() => comBindings(cases, cases.slice(1).map((c) => binding(c)))).toThrowError(
      /sem binding contrafactual/,
    )
  })

  it("dois bindings para o MESMO candidato: rejeita", () => {
    const cases = trio()
    const x = cases[0]
    if (x === undefined) throw new Error("fixture")
    expect(() =>
      comBindings(cases, [
        binding(x),
        binding(x, "amount_sum_cents", { evidence_ref: `ev_cf_${x.subject_ref.slice(5)}b` }),
        ...cases.slice(1).map((c) => binding(c)),
      ]),
    ).toThrowError(/a associação precisa ser única/)
  })

  // ── J ──
  it("J — inverter a ordem de X e Y não muda bindings nem resultado lógico", () => {
    const cases = trio()
    const a = comBindings(cases, cases.map((c) => binding(c)))
    const invertidos = [...cases].reverse()
    const b = comBindings(invertidos, invertidos.map((c) => binding(c)))

    const porSujeito = (r: ReturnType<typeof detectar>) =>
      [...r.evaluated]
        .map((i) => ({
          subject_ref: i.subject_ref,
          cf: i.counterfactual_evidence_ref,
          id: i.counterfactual_computation_id,
        }))
        .sort((x, y) => (x.subject_ref < y.subject_ref ? -1 : 1))

    expect(porSujeito(b)).toEqual(porSujeito(a))
    expect(b.events.map((e) => e.event_id).sort()).toEqual(a.events.map((e) => e.event_id).sort())
  })

  it("a identidade da computação NÃO inclui evidence_ref", () => {
    // Reingestão troca a evidência mas não o fato lógico.
    const cases = trio()
    const x = cases[0]
    if (x === undefined) throw new Error("fixture")
    const a = counterfactualComputationId(binding(x))
    const b = counterfactualComputationId(
      binding(x, "amount_sum_cents", { evidence_ref: "ev_cf_outra_qualquer" }),
    )
    expect(b).toBe(a)
  })

  it("a identidade da computação distingue sujeito, métrica, período e escopo", () => {
    const cases = trio()
    const x = cases[0]
    const y = cases[1]
    if (x === undefined || y === undefined) throw new Error("fixture")
    const base = counterfactualComputationId(binding(x))
    expect(counterfactualComputationId(binding(y))).not.toBe(base)
    expect(counterfactualComputationId(binding(x, "case_count"))).not.toBe(base)
    expect(
      counterfactualComputationId(binding(x, "amount_sum_cents", { period_end: "2026-09-30" })),
    ).not.toBe(base)
    expect(
      counterfactualComputationId(
        binding(x, "amount_sum_cents", { scope: [{ source_system: "omie", dataset_id: "ds_x" }] }),
      ),
    ).not.toBe(base)
  })

  it("a ordem do escopo não muda a identidade da computação", () => {
    const cases = trio()
    const x = cases[0]
    if (x === undefined) throw new Error("fixture")
    const dois: GovernedScope[] = [
      { source_system: "google_sheets", dataset_id: "ds_a" },
      { source_system: "bitrix24", dataset_id: "ds_b" },
    ]
    expect(
      counterfactualComputationId(binding(x, "amount_sum_cents", { scope: dois })),
    ).toBe(counterfactualComputationId(binding(x, "amount_sum_cents", { scope: [...dois].reverse() })))
  })
})

describe("HIGH-2 — CONTAGEM não é classificada por limiar de centavos", () => {
  const dois = (): CaseRecord[] => [caso(500_000), caso(500_000)]

  const contagem = (campos: Record<string, unknown>): ReturnType<typeof detectar> =>
    detectar(dois(), comMetrica("case_count"), comConfig({ min_population_after_removal: 1, ...campos }))

  const semOutrasDimensoes = {
    material_relative_delta_bp: 999_999,
    material_share_of_total_bp: 9999,
  }

  it("limiar de contagem 2: delta de 1 caso NÃO é material", () => {
    const r = contagem({ ...semOutrasDimensoes, material_count_delta: 2 })
    expect(r.evaluated[0]?.outcome).toBe("not_material")
  })

  it("limiar de contagem 1: delta de 1 caso É material", () => {
    const r = contagem({ ...semOutrasDimensoes, material_count_delta: 1 })
    expect(r.evaluated[0]?.outcome).toBe("material")
  })

  it("o limiar MONETÁRIO não pode tornar contagem material", () => {
    // Era o defeito: 1 caso comparado contra 1 centavo virava material.
    const r = contagem({
      ...semOutrasDimensoes,
      material_absolute_delta_cents: 1,
      material_count_delta: 2,
    })
    expect(r.evaluated[0]?.outcome).toBe("not_material")
    expect(r.events).toHaveLength(0)
  })

  it("e o inverso: limiar de contagem manda, ainda que o monetário seja enorme", () => {
    const r = contagem({
      ...semOutrasDimensoes,
      material_absolute_delta_cents: Number.MAX_SAFE_INTEGER,
      material_count_delta: 1,
    })
    expect(r.evaluated[0]?.outcome).toBe("material")
  })

  it("simetricamente, o limiar de CONTAGEM não classifica métrica monetária", () => {
    // Soma com delta de 500.000 centavos; limiar de contagem 1 não deve valer aqui.
    const r = detectar(
      dois(),
      {},
      comConfig({
        min_population_after_removal: 1,
        ...semOutrasDimensoes,
        material_absolute_delta_cents: 900_000,
        material_count_delta: 1,
      }),
    )
    expect(r.evaluated[0]?.outcome).toBe("not_material")
  })

  it("participação de contagem continua sendo 1/N e não vira limiar absoluto", () => {
    const r = contagem({ material_count_delta: 999, material_relative_delta_bp: 999_999, material_share_of_total_bp: 5000 })
    // N=2 → 5000 bp, exatamente no limiar de participação: material por PARTE.
    expect(r.evaluated[0]?.share_of_total_bp && isOk(r.evaluated[0].share_of_total_bp) && r.evaluated[0].share_of_total_bp.value).toBe(5000)
    expect(r.evaluated[0]?.outcome).toBe("material")
  })

  it("N=1 daria 10000 bp, mas a população fica vazia após remoção", () => {
    const r = detectar([caso(500_000)], comMetrica("case_count"))
    const s = r.evaluated[0]?.share_of_total_bp
    expect(s !== undefined && isOk(s)).toBe(false)
    if (s !== undefined && !isOk(s)) expect(s.gap).toBe("EMPTY_DENOMINATOR")
  })

  it("boundary de contagem: 1 / 2 / 3 com delta fixo de 1", () => {
    for (const [limiar, esperado] of [[1, "material"], [2, "not_material"], [3, "not_material"]] as const) {
      const r = contagem({ ...semOutrasDimensoes, material_count_delta: limiar })
      expect(r.evaluated[0]?.outcome, `limiar ${limiar}`).toBe(esperado)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Provenance governada — o singleton misbinding
// ═════════════════════════════════════════════════════════════════════════════

describe("provenance: a âncora governada é o que prova a associação", () => {
  const trio = (): CaseRecord[] => [caso(900_000), caso(50_000), caso(50_000)]

  const rodar = (
    cases: readonly CaseRecord[],
    bindings: readonly CounterfactualBinding[],
    provenance: readonly ComputedEvidenceProvenance[],
    evidenciasExtra: readonly Evidence[] = [],
  ): ReturnType<typeof detectar> =>
    detectar(cases, {
      evidence: [...evidence, ...cases.map((c) => evContrafactual(c.subject_ref)), ...evidenciasExtra],
      counterfactual_bindings: bindings,
      counterfactual_provenance: provenance,
    })

  // ── A ──
  it("A — Y com a evidência e a provenance de Y: aceita", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    expect(() => rodar(cases, bs, bs.map(provenanceDe))).not.toThrow()
  })

  // ── B — O ATAQUE CRÍTICO ──
  describe("B — singleton: só Y na execução, evidência ancorada em X", () => {
    /**
     * X existe no mundo e sua evidência foi governadamente ancorada à computação
     * de X. Mas X NÃO está nesta invocação — então nenhuma checagem de unicidade
     * entre candidatos consegue ver o problema. O binding de Y é perfeitamente
     * coerente: sujeito, métrica, agregador, período e escopo todos corretos.
     * Só a âncora sabe que aquela evidência documenta outro número.
     */
    const montar = (): {
      cases: CaseRecord[]
      bindings: CounterfactualBinding[]
      provenance: ComputedEvidenceProvenance[]
      evidenciaDeX: Evidence
    } => {
      const x = caso(777_000)
      const bindingX = binding(x)
      const evidenciaDeX = evContrafactual(x.subject_ref)

      // A execução tem SOMENTE Y (e o resto da população, sem X).
      const cases = [caso(500_000), caso(300_000), caso(200_000)]
      const y = cases[0]
      if (y === undefined) throw new Error("fixture")

      const bindings = [
        // Binding de Y impecável — apontando para a evidência de X.
        binding(y, "amount_sum_cents", { evidence_ref: evidenciaDeX.evidence_id }),
        ...cases.slice(1).map((c) => binding(c)),
      ]
      const provenance = [
        provenanceDe(bindingX), // a âncora VERDADEIRA de X
        ...cases.slice(1).map((c) => provenanceDe(binding(c))),
      ]
      return { cases, bindings, provenance, evidenciaDeX }
    }

    it("X não está na invocação — as checagens de unicidade não o veem", () => {
      const { cases, bindings } = montar()
      expect(cases).toHaveLength(3)
      expect(new Set(bindings.map((b) => b.evidence_ref)).size).toBe(3)
      expect(new Set(bindings.map((b) => b.subject_ref)).size).toBe(3)
    })

    it("a identidade da computação de Y difere da ancorada em X", () => {
      const { bindings, provenance } = montar()
      const bY = bindings[0]
      if (bY === undefined) throw new Error("fixture")
      const ancoradaEmX = provenance[0]?.computation_id
      expect(counterfactualComputationId(bY)).not.toBe(ancoradaEmX)
    })

    it("FALHA FECHADA — nenhum evento de Y sustentado pela evidência de X", () => {
      const { cases, bindings, provenance, evidenciaDeX } = montar()
      expect(() => rodar(cases, bindings, provenance, [evidenciaDeX])).toThrowError(
        /documenta a computação/,
      )
    })

    it("a recusa nomeia as duas computações, para ser diagnosticável", () => {
      const { cases, bindings, provenance, evidenciaDeX } = montar()
      const bY = bindings[0]
      if (bY === undefined) throw new Error("fixture")
      try {
        rodar(cases, bindings, provenance, [evidenciaDeX])
        expect.unreachable("deveria ter recusado")
      } catch (e) {
        const msg = (e as GatewayError).message
        expect(msg).toContain(counterfactualComputationId(bY))
        expect(msg).toContain(provenance[0]?.computation_id ?? "?")
      }
    })

    it("e nenhum Event chega a ser construído", () => {
      const { cases, bindings, provenance, evidenciaDeX } = montar()
      let resultado: unknown = "não executou"
      try {
        resultado = rodar(cases, bindings, provenance, [evidenciaDeX])
      } catch {
        resultado = "recusado"
      }
      expect(resultado).toBe("recusado")
    })
  })

  // ── C ──
  it("C — X e Y presentes com suas respectivas âncoras: ambos aceitos", () => {
    const cases = [caso(500_000), caso(500_000), caso(100_000)]
    const bs = cases.map((c) => binding(c))
    const r = rodar(cases, bs, bs.map(provenanceDe))
    expect(r.summary.candidates_evaluated).toBe(3)
  })

  // ── D ──
  it("D — evidência existente SEM provenance: rejeita", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    expect(() => rodar(cases, bs, bs.slice(1).map(provenanceDe))).toThrowError(
      /sem provenance governada/,
    )
  })

  it("D — coleção de provenance vazia rejeita tudo", () => {
    const cases = trio()
    expect(() => rodar(cases, cases.map((c) => binding(c)), [])).toThrowError(
      /sem provenance governada/,
    )
  })

  // ── E ──
  it("E — provenance com computation_id fora do formato: rejeita", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const corrompida = bs.map(provenanceDe).map((p, i) =>
      i === 0 ? { ...p, computation_id: "nao_e_um_cfc" } : p,
    )
    expect(() => rodar(cases, bs, corrompida)).toThrowError(/fora do formato/)
  })

  it("E — versão de provenance desconhecida: rejeita", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const outraVersao = bs.map(provenanceDe).map((p) => ({ ...p, provenance_version: "9.9.9" }))
    expect(() => rodar(cases, bs, outraVersao)).toThrowError(/desconhecida/)
  })

  // ── F ──
  it("F — evidência de X ancorada na computação de Y: rejeita", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const b0 = bs[0]
    const b1 = bs[1]
    if (b0 === undefined || b1 === undefined) throw new Error("fixture")
    // A âncora de b0 aponta para a computação de b1: cruzada.
    const cruzada = [
      { ...provenanceDe(b0), computation_id: counterfactualComputationId(b1) },
      ...bs.slice(1).map(provenanceDe),
    ]
    expect(() => rodar(cases, bs, cruzada)).toThrowError(/documenta a computação/)
  })

  // ── G ──
  it("G — mesma evidence_ref com duas computation_ids: falha fechada", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const b0 = bs[0]
    const b1 = bs[1]
    if (b0 === undefined || b1 === undefined) throw new Error("fixture")
    const conflitante = [
      ...bs.map(provenanceDe),
      { ...provenanceDe(b0), computation_id: counterfactualComputationId(b1) },
    ]
    expect(() => rodar(cases, bs, conflitante)).toThrowError(/conflito com/)
  })

  it("registro idêntico repetido é inofensivo — é a mesma afirmação duas vezes", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const duplicada = [...bs.map(provenanceDe), ...bs.map(provenanceDe)]
    expect(() => rodar(cases, bs, duplicada)).not.toThrow()
  })

  // ── H ──
  it("H — reingestão: nova evidence_ref para a MESMA computação é aceita", () => {
    // Recalcular o mesmo número no mesmo dataset lógico produz a mesma
    // computação e um registro novo. Não é uma evidência provando duas
    // computações — é a mesma computação documentada duas vezes.
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const b0 = bs[0]
    if (b0 === undefined) throw new Error("fixture")

    const novaEvidencia = evContrafactual(b0.subject_ref, "_v2")
    const bindingNovo = { ...b0, evidence_ref: novaEvidencia.evidence_id }

    const provenance = [
      provenanceDe(b0), // histórico
      provenanceDe(bindingNovo), // reingestão: mesma computation_id, outra evidência
      ...bs.slice(1).map(provenanceDe),
    ]
    // A mesma computation_id em dois evidence_refs distintos.
    expect(provenance[0]?.computation_id).toBe(provenance[1]?.computation_id)
    expect(provenance[0]?.evidence_ref).not.toBe(provenance[1]?.evidence_ref)

    expect(() =>
      rodar(cases, [bindingNovo, ...bs.slice(1)], provenance, [novaEvidencia]),
    ).not.toThrow()
  })

  // ── I / J ──
  it("I — ordem dos candidatos não altera o resultado", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const a = rodar(cases, bs, bs.map(provenanceDe))
    const invertidos = [...cases].reverse()
    const bsInv = invertidos.map((c) => binding(c))
    const b = rodar(invertidos, bsInv, bsInv.map(provenanceDe))
    expect(b.events.map((e) => e.event_id).sort()).toEqual(a.events.map((e) => e.event_id).sort())
  })

  it("J — ordem da coleção de provenance não altera o lookup", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const provenance = bs.map(provenanceDe)
    const a = rodar(cases, bs, provenance)
    const b = rodar(cases, bs, [...provenance].reverse())
    expect(structuredClone(b)).toEqual(structuredClone(a))
  })

  it("a fórmula textual NÃO é autoridade: âncora errada rejeita mesmo com fórmula perfeita", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const b0 = bs[0]
    const b1 = bs[1]
    if (b0 === undefined || b1 === undefined) throw new Error("fixture")
    // Fórmula impecável na evidência; âncora aponta para outra computação.
    const cruzada = [
      { ...provenanceDe(b0), computation_id: counterfactualComputationId(b1) },
      ...bs.slice(1).map(provenanceDe),
    ]
    expect(() => rodar(cases, bs, cruzada)).toThrowError(/documenta a computação/)
  })

  it("a provenance não sobrevive por referência no resultado congelado", () => {
    const cases = trio()
    const bs = cases.map((c) => binding(c))
    const provenance = bs.map(provenanceDe)
    const r = rodar(cases, bs, provenance)
    const visto = new WeakSet<object>()
    const doInput = new Set<unknown>([provenance, ...provenance, bs, ...bs])
    const percorrer = (v: unknown): void => {
      if (v === null || typeof v !== "object") return
      if (visto.has(v)) return
      visto.add(v)
      expect(doInput.has(v)).toBe(false)
      for (const filho of Object.values(v)) percorrer(filho)
    }
    percorrer(r)
    expect(Object.isFrozen(provenance)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.7c §8/§10/§20 — materialidade relativa em MAGNITUDE
//
// `material_relative_delta_bp = 1000` foi aprovado na Política Creditum v1: uma
// mudança contrafactual relativa de 10% ou mais **em magnitude** é material por
// esta dimensão. Antes desta decisão a comparação era `valor >= limiar` sobre o
// número assinado, e `-1500 >= 1000` é falso: uma queda de 15% no agregado
// desaparecia da materialidade sem deixar rastro.
//
// O sinal continua no resultado. A magnitude é usada para DECIDIR, não para
// publicar — e a autorização vale só para esta dimensão: a severidade de D segue
// em `share_of_total_bp` (2.7b), nunca em `classify(abs(relative_delta_bp))`.
// ═════════════════════════════════════════════════════════════════════════════

describe("§20 — boundary assinado da materialidade relativa", () => {
  /** Só a dimensão relativa pode disparar: as outras duas ficam inalcançáveis. */
  const soRelativa = (limiar: number): DetectorConfig =>
    comConfig({
      material_absolute_delta_cents: 999_999_999_999,
      material_count_delta: 999_999,
      material_relative_delta_bp: limiar,
      material_share_of_total_bp: 10_000,
      min_population_after_removal: 1,
    })

  /**
   * Constrói uma população cujo primeiro caso tem `relative_delta_bp` conhecido.
   *
   * `relative_delta_bp = delta ÷ agregado_sem_o_caso`, e `delta` é a CONTRIBUIÇÃO
   * do caso ao agregado — positiva para um caso positivo. Um estorno
   * (`valor < 0`) contribui negativamente e produz delta relativo negativo. É
   * assim que os dois lados do zero são alcançados sem inventar dado.
   */
  const populacao = (valorCaso: number, resto: number): CaseRecord[] => [
    caso(valorCaso),
    caso(resto),
  ]

  const avaliar = (
    valorCaso: number,
    resto: number,
    limiar = 1000,
  ): { readonly deltaBp: number | undefined; readonly material: boolean } => {
    const r = detectar(populacao(valorCaso, resto), {}, soRelativa(limiar))
    const primeiro = r.evaluated[0]
    const m = primeiro?.relative_delta_bp
    return {
      deltaBp: m !== undefined && isOk(m) ? m.value : undefined,
      material: primeiro?.outcome === "material",
    }
  }

  it("o limiar aprovado é 1000 bp", () => {
    expect(CREDITUM_POLICY_V1.single_case_material_relative_delta_bp).toBe(1000)
    expect(CREDITUM_POLICY_V1.single_case_relative_delta_uses_magnitude).toBe(true)
  })

  // ── Lado positivo: contribuição de um caso positivo ──

  it("+999 bp NÃO é material por delta relativo", () => {
    const { deltaBp, material } = avaliar(999, 10_000)
    expect(deltaBp).toBe(999)
    expect(material).toBe(false)
  })

  it("+1000 bp É material", () => {
    const { deltaBp, material } = avaliar(100_000, 1_000_000)
    expect(deltaBp).toBe(1000)
    expect(material).toBe(true)
  })

  it("+1500 bp É material", () => {
    const { deltaBp, material } = avaliar(150_000, 1_000_000)
    expect(deltaBp).toBe(1500)
    expect(material).toBe(true)
  })

  // ── Lado negativo: um estorno contribui para baixo ──
  //
  // É este lado que a comparação assinada perdia. Sem magnitude, um estorno que
  // move o agregado em 15% não era material por esta dimensão.

  it("-999 bp NÃO é material por delta relativo", () => {
    const { deltaBp, material } = avaliar(-999, 10_000)
    expect(deltaBp).toBe(-999)
    expect(material).toBe(false)
  })

  it("-1000 bp É material", () => {
    const { deltaBp, material } = avaliar(-100_000, 1_000_000)
    expect(deltaBp).toBe(-1000)
    expect(material).toBe(true)
  })

  it("-1500 bp É material, e o resultado preserva o sinal", () => {
    const { deltaBp, material } = avaliar(-150_000, 1_000_000)
    expect(deltaBp).toBe(-1500)
    expect(material).toBe(true)
  })

  it("a simetria é exata: mesma magnitude, mesmo veredito", () => {
    expect(avaliar(150_000, 1_000_000).material).toBe(avaliar(-150_000, 1_000_000).material)
    expect(avaliar(999, 10_000).material).toBe(avaliar(-999, 10_000).material)
  })

  it("o valor ASSINADO é o que sai no resultado — nunca a magnitude", () => {
    const r = detectar(populacao(-150_000, 1_000_000), {}, soRelativa(1000))
    const m = r.evaluated[0]?.relative_delta_bp
    expect(m !== undefined && isOk(m) && m.value).toBe(-1500)
    // A magnitude que a materialidade usou não aparece em nenhum campo público.
    expect(JSON.stringify(r)).not.toContain('"relative_delta_magnitude_bp"')
  })

  it("magnitude decide materialidade, NUNCA severidade", () => {
    // MÉDIA: um caso não é "parte" de uma média, então `share_of_total_bp` não
    // existe — é o caso exato do §11 do briefing. O fato fica material pelo delta
    // relativo, e o Event executivo continua bloqueado por falta de base de
    // severidade. Se `abs(relative_delta_bp)` virasse base, sairia gravidade de
    // uma grandeza que não é participação.
    const r = detectar(
      [caso(1_000_000), caso(100_000), caso(100_000)],
      comMetrica("amount_mean_cents"),
      soRelativa(1000),
    )
    const primeiro = r.evaluated[0]
    expect(primeiro?.outcome).toBe("material")
    expect(primeiro?.severity ?? null).toBeNull()
    const parte = primeiro?.share_of_total_bp
    expect(parte !== undefined && isOk(parte)).toBe(false)
  })
})
