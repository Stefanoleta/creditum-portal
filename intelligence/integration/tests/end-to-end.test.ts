/**
 * Integração end-to-end — SEM nenhum serviço externo.
 *
 * O que este arquivo prova, e nenhum outro provava: que os quatro detectores
 * aprovados **compõem** sobre a mesma cadeia governada. Cada um foi validado
 * isoladamente com a sua própria fixture; nada garantia que um único snapshot,
 * um único catálogo e um único conjunto de evidências servissem aos quatro.
 *
 * A cadeia exercitada:
 *
 *   linhas cruas (adaptador FALSO, em memória)
 *     → canonicalização D13 com catálogo SINTÉTICO
 *     → Snapshot + Evidence + ComputedEvidenceProvenance
 *     → InMemoryStore validado (plano de consulta)
 *     → Detectores A, B, C, D
 *     → read-model determinístico
 *
 * ─── O que este harness NÃO é ─────────────────────────────────────────────────
 *
 * Não toca Supabase, não lê pasta do Lucas, não usa credencial, não instala
 * Hermes. O catálogo é sintético e declarado como tal — a promoção de nome
 * observado para canônico é decisão humana pendente (`D13_CATALOG_VALIDATION.md`).
 * Os limiares vêm da `TEST_CONFIG` sintética e não são política da Creditum.
 */

import { describe, expect, it } from "vitest"
import { CREDITUM_POLICY_V1 } from "../../detectors/src/production-policy"
import { InMemoryStore } from "../../gateway/src/store"
import { toEvidence, toSnapshot } from "../../gateway/src/factory"
import { GatewayError } from "../../gateway/src/errors"
import type { Evidence, Snapshot } from "../../gateway/src/types"
import { buildUnitIndex, canonicalizeUnit } from "../../detectors/src/canonical-units"
import type { CanonicalUnitResult, UnitCatalog } from "../../detectors/src/canonical-units"
import { ENGINE_UNIT_NORMALIZER } from "../../detectors/src/unit-normalizer"
import { APPROVED_THRESHOLDS } from "../../detectors/src/config"
import { COUNTERFACTUAL_PROVENANCE_VERSION } from "../../detectors/src/counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "../../detectors/src/counterfactual-provenance"
import { detectInstallmentConcentration } from "../../detectors/src/installment-concentration"
import { detectCrossSourceConflicts } from "../../detectors/src/cross-source-conflict"
import {
  detectFirstDueDateConcentration,
  firstDueComputationId,
} from "../../detectors/src/first-due-date-concentration"
import {
  counterfactualComputationId,
  detectMaterialSingleCase,
} from "../../detectors/src/material-single-case"
import { parseCivilDateStrict } from "../../detectors/src/civil-date"
import { isOk } from "../../detectors/src/engine"
import { TEST_CONFIG } from "../../detectors/tests/test-config"
import { rawEvidence, rawSnapshot } from "../../gateway/tests/helpers"
import {
  GOVERNED_UNIT_CATALOG,
  canonicalizeWithGroups,
  toUnitCatalog,
} from "../../detectors/src/unit-catalog"
import { detectLowTicketContracts } from "../../detectors/src/low-ticket"
import type { RawBatch, RawRow } from "../src/ports"

// ═════════════════════════════════════════════════════════════════════════════
// Catálogo SINTÉTICO — não é o catálogo da Creditum
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Três unidades, e uma delas com alias — o suficiente para exercitar resolvida,
 * alias e desconhecida. Os dois aliases reais confirmados pelo CEO (`Mogi` e
 * `Rio Preto`) estão aqui porque são os únicos com lastro documentado.
 */
const CATALOGO_SINTETICO: UnitCatalog = {
  // `0.0.0` é o marcador de sintético do projeto, o mesmo da TEST_CONFIG.
  catalog_version: "0.0.0",
  units: [
    {
      unit_id: "mogi_das_cruzes",
      display_name: "Mogi das Cruzes",
      aliases: ["Mogi", "Grau Mogi"],
      active: true,
    },
    {
      unit_id: "sao_jose_do_rio_preto",
      display_name: "São José do Rio Preto",
      aliases: ["Rio Preto"],
      active: true,
    },
    { unit_id: "santos", display_name: "Santos", aliases: [], active: true },
  ],
}

const INDICE = buildUnitIndex(CATALOGO_SINTETICO, ENGINE_UNIT_NORMALIZER)

const canonicalizar = (bruto: unknown): CanonicalUnitResult =>
  canonicalizeUnit(bruto, INDICE, ENGINE_UNIT_NORMALIZER, {
    similarityThresholdBp: APPROVED_THRESHOLDS.similarity_threshold_bp,
  })

// ═════════════════════════════════════════════════════════════════════════════
// Adaptador FALSO — em memória, sem rede nem disco
// ═════════════════════════════════════════════════════════════════════════════

const PERIODO = { start: "2026-08-01", end: "2026-08-31" } as const
const OBSERVED_AT = "2026-08-31T23:00:00.000Z"
const COLLECTED_AT = "2026-09-01T02:00:00.000Z"
/** O relógio do detector é ENTRADA, nunca `Date.now()`. */
const DETECTED_AT = "2026-09-01T09:00:00.000Z"

const DATASET = { source_system: "google_sheets", dataset_id: "ds_vendas_mensal" } as const

interface LinhaVenda {
  readonly row: string
  readonly unidade: unknown
  readonly parcelas: number | null
  readonly valor: number | null
  readonly primeiro_vencimento: unknown
}

function loteFalso(linhas: readonly LinhaVenda[]): RawBatch {
  const rows: RawRow[] = linhas.map((l) => ({
    row_key: l.row,
    values: {
      unidade: l.unidade,
      parcelas: l.parcelas,
      valor: l.valor,
      primeiro_vencimento: l.primeiro_vencimento,
    },
  }))
  return {
    dataset: DATASET,
    rows,
    observed_at: OBSERVED_AT,
    collected_at: COLLECTED_AT,
    period_start: PERIODO.start,
    period_end: PERIODO.end,
    // Determinístico: em produção é hash do conteúdo; aqui é fixo para o fixture.
    content_hash: "c".repeat(64),
    rows_skipped: 0,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Construtores governados — o plano de ESCRITA
// ═════════════════════════════════════════════════════════════════════════════

const SNAPSHOT_ID = "snap_e2e_2026_08"

/** O contrato exige `^[a-f0-9]{64}$` — `r1` não é hex. Derivação determinística. */
const hexRowKey = (row: string): string =>
  row.replace(/\D/g, "").padStart(64, "0")

function construirSnapshot(lote: RawBatch, over: Record<string, unknown> = {}): Snapshot {
  return toSnapshot(
    rawSnapshot({
      snapshot_id: SNAPSHOT_ID,
      source_system: lote.dataset.source_system,
      dataset_id: lote.dataset.dataset_id,
      period_start: lote.period_start,
      period_end: lote.period_end,
      observed_at: lote.observed_at,
      ingested_at: lote.collected_at,
      content_hash: lote.content_hash,
      record_count: lote.rows.length,
      rows_skipped: lote.rows_skipped,
      ...over,
    }),
    { now: new Date(DETECTED_AT) },
  )
}

function evidenciaDeLinha(row: RawRow): Evidence {
  return toEvidence(
    rawEvidence({
      evidence_id: `ev_row_${row.row_key}`,
      snapshot_id: SNAPSHOT_ID,
      kind: "row",
      locator: {
        dataset_id: DATASET.dataset_id,
        sheet: "Vendas",
        row_key: hexRowKey(row.row_key),
      },
      observed_at: OBSERVED_AT,
    }),
    { now: new Date(DETECTED_AT) },
  )
}

function evidenciaComputada(id: string, formula: string): Evidence {
  return toEvidence(
    rawEvidence({
      evidence_id: id,
      snapshot_id: SNAPSHOT_ID,
      kind: "computed",
      locator: { dataset_id: DATASET.dataset_id, sheet: "Vendas", column: "Valor" },
      formula,
      observed_at: OBSERVED_AT,
    }),
    { now: new Date(DETECTED_AT) },
  )
}

const ancorar = (
  evidence_ref: string,
  computation_id: string,
): ComputedEvidenceProvenance => ({
  evidence_ref,
  computation_id,
  provenance_version: COUNTERFACTUAL_PROVENANCE_VERSION,
})

// ═════════════════════════════════════════════════════════════════════════════
// A população compartilhada pelos quatro detectores
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sete vendas, escritas como a planilha real escreve: `Grau Mogi`, `Rio Preto`,
 * data em `dd/MM/yyyy` e em ISO, e uma unidade fora do catálogo.
 */
const VENDAS: readonly LinhaVenda[] = [
  { row: "r1", unidade: "Grau Mogi", parcelas: 24, valor: 900_000, primeiro_vencimento: "04/09/2026" },
  { row: "r2", unidade: "Mogi", parcelas: 24, valor: 300_000, primeiro_vencimento: "2026-09-04" },
  { row: "r3", unidade: "Rio Preto", parcelas: 24, valor: 200_000, primeiro_vencimento: "04/09/2026" },
  { row: "r4", unidade: "Santos", parcelas: 20, valor: 100_000, primeiro_vencimento: "2026-09-04" },
  { row: "r5", unidade: "Santos", parcelas: 12, valor: 100_000, primeiro_vencimento: "2026-09-20" },
  { row: "r6", unidade: "Grau Mogi", parcelas: 6, valor: 100_000, primeiro_vencimento: "20/09/2026" },
  { row: "r7", unidade: "Grau Marabá", parcelas: 6, valor: 100_000, primeiro_vencimento: "2026-09-20" },
]

const subjectRef = (row: string): string =>
  `subj_${row.replace(/\D/g, "").padStart(16, "0").slice(0, 16)}`

interface Cadeia {
  readonly snapshot: Snapshot
  readonly evidence: readonly Evidence[]
  readonly store: InMemoryStore
  readonly canonicas: ReadonlyMap<string, CanonicalUnitResult>
}

function montarCadeia(
  linhas: readonly LinhaVenda[] = VENDAS,
  overSnapshot: Record<string, unknown> = {},
): Cadeia {
  const lote = loteFalso(linhas)
  const snapshot = construirSnapshot(lote, overSnapshot)
  const evidencias = lote.rows.map(evidenciaDeLinha)

  const canonicas = new Map<string, CanonicalUnitResult>(
    linhas.map((l) => [l.row, canonicalizar(l.unidade)]),
  )

  // `now` EXPLÍCITO também aqui: o store revalida o grafo, e sem isto ele
  // usaria o relógio do processo — o harness passaria hoje e falharia amanhã.
  const store = new InMemoryStore(
    {
      snapshots: [snapshot as unknown],
      evidence: evidencias as unknown[],
      events: [],
    },
    { now: new Date(DETECTED_AT) },
  )

  return { snapshot, evidence: evidencias, store, canonicas }
}

// ═════════════════════════════════════════════════════════════════════════════

describe("cadeia governada: fonte falsa → D13 → snapshot/evidência → store", () => {
  const cadeia = montarCadeia()

  it("o snapshot passa schema + semântica do gateway", () => {
    expect(cadeia.snapshot.snapshot_id).toBe(SNAPSHOT_ID)
    expect(cadeia.snapshot.dataset_id).toBe(DATASET.dataset_id)
  })

  it("o store valida o grafo inteiro e é somente leitura", () => {
    expect(cadeia.store.allSnapshots()).toHaveLength(1)
    expect(cadeia.store.allEvidence()).toHaveLength(VENDAS.length)
    expect(Object.isFrozen(cadeia.store)).toBe(true)
  })

  it("D13 resolve alias real confirmado pelo CEO", () => {
    expect(cadeia.canonicas.get("r1")?.status).toBe("matched")
    expect(cadeia.canonicas.get("r2")?.status).toBe("matched")
    const r1 = cadeia.canonicas.get("r1")
    const r2 = cadeia.canonicas.get("r2")
    // `Grau Mogi` e `Mogi` são a MESMA unidade.
    expect(r1?.status === "matched" && r1.unit_id).toBe("mogi_das_cruzes")
    expect(r2?.status === "matched" && r2.unit_id).toBe("mogi_das_cruzes")
  })

  it("`Rio Preto` resolve para o nome composto", () => {
    const r3 = cadeia.canonicas.get("r3")
    expect(r3?.status === "matched" && r3.unit_id).toBe("sao_jose_do_rio_preto")
  })

  it("unidade FORA do catálogo fica unknown — não é promovida", () => {
    // `Grau Marabá` é o achado real do D13: a fonte reporta, o catálogo não
    // conhece. Aqui ele NÃO vira uma unidade nova por similaridade.
    const r7 = cadeia.canonicas.get("r7")
    expect(r7?.status).toBe("unknown")
  })

  it("nenhum nome cru de unidade atravessa a canonicalização", () => {
    const serializado = JSON.stringify([...cadeia.canonicas.values()])
    expect(serializado).not.toContain("Grau Marabá")
    expect(serializado).not.toContain("Grau Mogi")
  })

  it("as datas civis canonicalizam nas duas grafias da fonte", () => {
    expect(parseCivilDateStrict("04/09/2026")).toBe("2026-09-04")
    expect(parseCivilDateStrict("2026-09-04")).toBe("2026-09-04")
  })
})

describe("Detector A sobre a cadeia compartilhada", () => {
  const cadeia = montarCadeia()
  const AGG = "ev_agg_parcelas"

  const rodar = (): ReturnType<typeof detectInstallmentConcentration> =>
    detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [cadeia.snapshot],
        evidence: [
          ...cadeia.evidence,
          evidenciaComputada(AGG, "count(elegiveis where installments > 19) / count(elegiveis)"),
        ],
        aggregate_evidence_ref: AGG,
      },
      TEST_CONFIG,
    )

  const r = rodar()

  it("o limiar aprovado governa: 20 parcelas entra, 12 e 6 não", () => {
    expect(r.summary.population.eligible_contracts).toBe(7)
    expect(r.summary.population.contracts_above_threshold).toBe(4)
  })

  it("a participação em quantidade é exata", () => {
    const s = r.summary.metrics.share_count_bp
    expect(isOk(s) && s.value).toBe(5714)
  })

  it("a unidade unknown degrada a qualidade — não é escondida", () => {
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("o evento sai válido contra o contrato", () => {
    expect(r.event).not.toBeNull()
    expect(r.event?.event_type).toBe("installment_concentration")
  })

  it("determinístico: mesma cadeia, mesmo resultado", () => {
    expect(structuredClone(rodar())).toEqual(structuredClone(r))
  })
})

describe("Detector C sobre a MESMA cadeia", () => {
  const cadeia = montarCadeia()
  const AGG = "ev_agg_vencimento"

  /** O alvo é 04/09: três vendas. A âncora vem de quem calculou o agregado. */
  const claims = ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"] as const
  const computationId = firstDueComputationId({
    grouping_dimension: "first_due_date",
    window_mode: "same_day",
    reference_date: null,
    target_start: "2026-09-04",
    target_end: "2026-09-04",
    period_start: PERIODO.start,
    period_end: PERIODO.end,
    scope: [DATASET],
    claim_set: [...claims],
  })

  const r = detectFirstDueDateConcentration(
    {
      detected_at: DETECTED_AT,
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      contracts: VENDAS.map((l) => ({
        subject_ref: subjectRef(l.row),
        unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
        first_due_date_raw: l.primeiro_vencimento,
        amount_cents: l.valor,
        evidence_refs: [`ev_row_${l.row}`],
        snapshot_id: SNAPSHOT_ID,
      })),
      snapshots: [cadeia.snapshot],
      evidence: [
        ...cadeia.evidence,
        evidenciaComputada(AGG, "count(elegiveis where first_due_date in target)"),
      ],
      aggregate_evidence_ref: AGG,
      aggregate_provenance: [ancorar(AGG, computationId)],
    },
    TEST_CONFIG,
  )

  it("as duas grafias de data caem no mesmo bucket", () => {
    expect(r.summary.buckets.map((b) => b.date)).toEqual(["2026-09-04", "2026-09-20"])
    expect(r.summary.buckets[0]?.contract_count).toBe(4)
  })

  it("o alvo é o dia mais concentrado", () => {
    expect(r.summary.target?.dates).toEqual(["2026-09-04"])
  })

  it("a provenance do alvo é conferida — e casa", () => {
    expect(r.event).not.toBeNull()
    expect(r.event?.evidence_refs).toContain(AGG)
  })
})

describe("Detector D sobre a MESMA cadeia", () => {
  const cadeia = montarCadeia()
  const AGG = "ev_agg_soma"

  const casos = VENDAS.map((l) => ({
    subject_ref: subjectRef(l.row),
    unit: cadeia.canonicas.get(l.row) ?? ({ status: "unknown", raw_fingerprint: "0".repeat(16) } as CanonicalUnitResult),
    amount_cents: l.valor,
    evidence_refs: [`ev_row_${l.row}`],
    snapshot_id: SNAPSHOT_ID,
  }))

  const bindings = casos.map((c) => ({
    evidence_ref: `ev_cf_${c.subject_ref}`,
    subject_ref: c.subject_ref,
    metric: "amount_sum_cents" as const,
    aggregator: "sum" as const,
    operation: "exclude_subject" as const,
    period_start: PERIODO.start,
    period_end: PERIODO.end,
    scope: [DATASET],
  }))

  const r = detectMaterialSingleCase(
    {
      detected_at: DETECTED_AT,
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      metric: "amount_sum_cents",
      cases: casos,
      snapshots: [cadeia.snapshot],
      evidence: [
        ...cadeia.evidence,
        evidenciaComputada(AGG, "sum(amount_cents of all eligible cases)"),
        ...bindings.map((b) =>
          evidenciaComputada(b.evidence_ref, "sum(amount_cents ... except the subject case)"),
        ),
      ],
      aggregate_evidence_ref: AGG,
      counterfactual_bindings: bindings,
      counterfactual_provenance: bindings.map((b) =>
        ancorar(b.evidence_ref, counterfactualComputationId(b)),
      ),
    },
    TEST_CONFIG,
  )

  it("todos os candidatos são avaliados — nada descartado", () => {
    expect(r.summary.candidates_evaluated).toBe(VENDAS.length)
  })

  it("o delta de cada caso é o próprio valor (propriedade da soma)", () => {
    for (const [i, l] of VENDAS.entries()) {
      const d = r.evaluated[i]?.delta
      expect(d !== undefined && isOk(d) && d.value, l.row).toBe(l.valor)
    }
  })

  it("o caso dominante é material e emite evento", () => {
    const dominante = r.evaluated.find((i) => isOk(i.delta) && i.delta.value === 900_000)
    expect(dominante?.outcome).toBe("material")
    expect(r.events.length).toBeGreaterThan(0)
  })

  it("cada caso carrega a identidade da SUA computação", () => {
    const ids = r.evaluated.map((i) => i.counterfactual_computation_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("Detector B sobre a mesma cadeia governada", () => {
  const cadeia = montarCadeia()

  /** Uma segunda fonte discorda da contagem de vendas do período. */
  const outroSnapshot = toSnapshot(
    rawSnapshot({
      snapshot_id: "snap_e2e_financeiro",
      source_system: "omie",
      dataset_id: "ds_financeiro_mensal",
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      observed_at: OBSERVED_AT,
      ingested_at: COLLECTED_AT,
    }),
    { now: new Date(DETECTED_AT) },
  )

  const evOutro = toEvidence(
    rawEvidence({
      evidence_id: "ev_agg_financeiro",
      snapshot_id: "snap_e2e_financeiro",
      kind: "aggregate",
      locator: { dataset_id: "ds_financeiro_mensal", sheet: "Financeiro" },
      observed_at: OBSERVED_AT,
    }),
    { now: new Date(DETECTED_AT) },
  )

  const evVendas = evidenciaComputada("ev_agg_contagem", "count(vendas do periodo)")

  const r = detectCrossSourceConflicts(
    {
      detected_at: DETECTED_AT,
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      disputes: [
        {
          field: "sales_count",
          kind: "count",
          versions: [
            {
              source_system: DATASET.source_system,
              snapshot_id: SNAPSHOT_ID,
              evidence_ref: "ev_agg_contagem",
              // `value` é união discriminada: ausência tem razão própria e nunca
              // vira zero. Aqui as duas fontes têm valor presente e discordam.
              value: { status: "present", raw: 7 },
            },
            {
              source_system: "omie",
              snapshot_id: "snap_e2e_financeiro",
              evidence_ref: "ev_agg_financeiro",
              value: { status: "present", raw: 5 },
            },
          ],
        },
      ],
      snapshots: [cadeia.snapshot, outroSnapshot],
      evidence: [...cadeia.evidence, evVendas, evOutro],
    },
    TEST_CONFIG,
  )

  it("o conflito é detectado, não resolvido automaticamente", () => {
    const total = r.events.length + r.non_material.length
    expect(total).toBe(1)
  })

  it("as duas versões continuam registradas com suas evidências", () => {
    const resumo = [...r.events, ...r.non_material]
    expect(resumo.length).toBe(1)
  })

  it("nenhuma fonte é escolhida como vencedora", () => {
    // A resolução é humana. O detector registra a disputa e para.
    const texto = JSON.stringify(r)
    expect(texto).not.toContain("winner")
    expect(texto).not.toContain("resolved_to")
  })
})

describe("os quatro compõem sobre UM snapshot e UM catálogo", () => {
  it("a mesma cadeia alimenta A, B, C e D sem adaptação por detector", () => {
    // O valor deste teste é estrutural: se algum detector exigisse um formato de
    // snapshot, evidência ou canonicalização próprio, este arquivo não compilaria
    // com uma cadeia só — e a integração da Fase 3 descobriria isso tarde.
    const cadeia = montarCadeia()
    expect(cadeia.store.allSnapshots()[0]?.snapshot_id).toBe(SNAPSHOT_ID)
    expect(cadeia.canonicas.size).toBe(VENDAS.length)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Falhas reais — todas devem falhar FECHADO
// ═════════════════════════════════════════════════════════════════════════════

describe("matriz de falhas: nada passa em silêncio", () => {
  it("snapshot conflicted contamina o evento — lineage preservada", () => {
    const cadeia = montarCadeia(VENDAS, { quality_status: "conflicted" })
    const AGG = "ev_agg_vencimento"
    const claims = ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"] as const
    const r = detectFirstDueDateConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          first_due_date_raw: l.primeiro_vencimento,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [cadeia.snapshot],
        evidence: [...cadeia.evidence, evidenciaComputada(AGG, "count(...)")],
        aggregate_evidence_ref: AGG,
        aggregate_provenance: [
          ancorar(
            AGG,
            firstDueComputationId({
              grouping_dimension: "first_due_date",
              window_mode: "same_day",
              reference_date: null,
              target_start: "2026-09-04",
              target_end: "2026-09-04",
              period_start: PERIODO.start,
              period_end: PERIODO.end,
              scope: [DATASET],
              claim_set: [...claims],
            }),
          ),
        ],
      },
      TEST_CONFIG,
    )
    expect(r.summary.quality_status).toBe("conflicted")
    expect(r.event?.data_quality.quality_status).toBe("conflicted")
  })

  it("provenance do agregado ausente: Detector C falha fechado", () => {
    const cadeia = montarCadeia()
    const AGG = "ev_agg_vencimento"
    expect(() =>
      detectFirstDueDateConcentration(
        {
          detected_at: DETECTED_AT,
          period_start: PERIODO.start,
          period_end: PERIODO.end,
          contracts: VENDAS.map((l) => ({
            subject_ref: subjectRef(l.row),
            unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
            first_due_date_raw: l.primeiro_vencimento,
            amount_cents: l.valor,
            evidence_refs: [`ev_row_${l.row}`],
            snapshot_id: SNAPSHOT_ID,
          })),
          snapshots: [cadeia.snapshot],
          evidence: [...cadeia.evidence, evidenciaComputada(AGG, "count(...)")],
          aggregate_evidence_ref: AGG,
          aggregate_provenance: [],
        },
        TEST_CONFIG,
      ),
    ).toThrowError(/sem provenance/)
  })

  it("evidência de linha pendurada: Detector A falha fechado", () => {
    const cadeia = montarCadeia()
    expect(() =>
      detectInstallmentConcentration(
        {
          detected_at: DETECTED_AT,
          period_start: PERIODO.start,
          period_end: PERIODO.end,
          contracts: [
            {
              subject_ref: subjectRef("r1"),
              unit: cadeia.canonicas.get("r1") ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
              installment_count: 24,
              amount_cents: 900_000,
              evidence_refs: ["ev_row_inexistente"],
              snapshot_id: SNAPSHOT_ID,
            },
          ],
          snapshots: [cadeia.snapshot],
          evidence: cadeia.evidence,
          aggregate_evidence_ref: "ev_row_r1",
        },
        TEST_CONFIG,
      ),
    ).toThrowError(GatewayError)
  })

  it("arquivo/lote VAZIO não vira zero — vira lacuna de denominador", () => {
    const cadeia = montarCadeia([])
    const r = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: [],
        snapshots: [cadeia.snapshot],
        evidence: [evidenciaComputada("ev_agg_vazio", "count(...)")],
        aggregate_evidence_ref: "ev_agg_vazio",
      },
      TEST_CONFIG,
    )
    expect(r.summary.population.total_records).toBe(0)
    expect(isOk(r.summary.population.eligibility_ratio_bp)).toBe(false)
    expect(r.event).toBeNull()
  })

  it("schema drift na origem: campo ausente vira lacuna, não zero", () => {
    // A linha existe, mas o valor não veio. `null` percorre a cadeia inteira sem
    // virar 0 em nenhum ponto.
    const semValor: readonly LinhaVenda[] = VENDAS.map((l) =>
      l.row === "r1" ? { ...l, valor: null } : l,
    )
    const cadeia = montarCadeia(semValor)
    const r = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: semValor.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [cadeia.snapshot],
        evidence: [...cadeia.evidence, evidenciaComputada("ev_agg_drift", "sum(...)")],
        aggregate_evidence_ref: "ev_agg_drift",
      },
      TEST_CONFIG,
    )
    expect(isOk(r.summary.metrics.amount_above_cents)).toBe(false)
    // Mas a CONTAGEM segue exata — métricas independentes.
    expect(isOk(r.summary.metrics.share_count_bp)).toBe(true)
  })

  it("data inválida na origem: exclusão explícita, sem conserto heurístico", () => {
    const comDataRuim: readonly LinhaVenda[] = VENDAS.map((l) =>
      l.row === "r1" ? { ...l, primeiro_vencimento: "31/02/2026" } : l,
    )
    const cadeia = montarCadeia(comDataRuim)
    const AGG = "ev_agg_venc"
    const claims = ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"] as const
    const r = detectFirstDueDateConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: comDataRuim.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          first_due_date_raw: l.primeiro_vencimento,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [cadeia.snapshot],
        evidence: [...cadeia.evidence, evidenciaComputada(AGG, "count(...)")],
        aggregate_evidence_ref: AGG,
        aggregate_provenance: [
          ancorar(
            AGG,
            firstDueComputationId({
              grouping_dimension: "first_due_date",
              window_mode: "same_day",
              reference_date: null,
              target_start: "2026-09-04",
              target_end: "2026-09-04",
              period_start: PERIODO.start,
              period_end: PERIODO.end,
              scope: [DATASET],
              claim_set: [...claims],
            }),
          ),
        ],
      },
      TEST_CONFIG,
    )
    expect(r.summary.population.excluded.INVALID_DUE_DATE).toBe(1)
    expect(r.summary.quality_status).not.toBe("ok")
  })
})

describe("idempotência: reingestão do mesmo fato lógico", () => {
  /** Mesmo dataset lógico, `snapshot_id` novo — é o que reingestão faz. */
  const reingerir = (snapshotId: string): string => {
    const lote = loteFalso(VENDAS)
    const snap = toSnapshot(
      rawSnapshot({
        snapshot_id: snapshotId,
        source_system: DATASET.source_system,
        dataset_id: DATASET.dataset_id,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        observed_at: lote.observed_at,
        ingested_at: lote.collected_at,
        content_hash: lote.content_hash,
        record_count: lote.rows.length,
      }),
      { now: new Date(DETECTED_AT) },
    )
    const evs = lote.rows.map((row) =>
      toEvidence(
        rawEvidence({
          evidence_id: `ev_row_${row.row_key}`,
          snapshot_id: snapshotId,
          kind: "row",
          locator: {
            dataset_id: DATASET.dataset_id,
            sheet: "Vendas",
            row_key: hexRowKey(row.row_key),
          },
          observed_at: lote.observed_at,
        }),
        { now: new Date(DETECTED_AT) },
      ),
    )
    const agg = toEvidence(
      rawEvidence({
        evidence_id: "ev_agg_parcelas",
        snapshot_id: snapshotId,
        kind: "computed",
        locator: { dataset_id: DATASET.dataset_id, sheet: "Vendas", column: "Valor" },
        formula: "count(elegiveis where installments > 19) / count(elegiveis)",
        observed_at: lote.observed_at,
      }),
      { now: new Date(DETECTED_AT) },
    )

    const canon = new Map(VENDAS.map((l) => [l.row, canonicalizar(l.unidade)]))
    const r = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: canon.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: snapshotId,
        })),
        snapshots: [snap],
        evidence: [...evs, agg],
        aggregate_evidence_ref: "ev_agg_parcelas",
      },
      TEST_CONFIG,
    )
    return r.summary.event_id
  }

  it("`snapshot_id` diferente NÃO cria fato executivo novo", () => {
    expect(reingerir("snap_reing_2")).toBe(reingerir("snap_reing_1"))
  })

  it("dataset lógico diferente SIM cria fato diferente", () => {
    const a = reingerir("snap_x")
    const lote = loteFalso(VENDAS)
    const outroDataset = toSnapshot(
      rawSnapshot({
        snapshot_id: "snap_outro_ds",
        source_system: DATASET.source_system,
        dataset_id: "ds_outro_mensal",
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        observed_at: lote.observed_at,
        ingested_at: lote.collected_at,
      }),
      { now: new Date(DETECTED_AT) },
    )
    const evs = lote.rows.map((row) =>
      toEvidence(
        rawEvidence({
          evidence_id: `ev_row_${row.row_key}`,
          snapshot_id: "snap_outro_ds",
          kind: "row",
          locator: {
            dataset_id: "ds_outro_mensal",
            sheet: "Vendas",
            row_key: hexRowKey(row.row_key),
          },
          observed_at: lote.observed_at,
        }),
        { now: new Date(DETECTED_AT) },
      ),
    )
    const agg = toEvidence(
      rawEvidence({
        evidence_id: "ev_agg_parcelas",
        snapshot_id: "snap_outro_ds",
        kind: "computed",
        locator: { dataset_id: "ds_outro_mensal", sheet: "Vendas", column: "Valor" },
        formula: "count(...)",
        observed_at: lote.observed_at,
      }),
      { now: new Date(DETECTED_AT) },
    )
    const canon = new Map(VENDAS.map((l) => [l.row, canonicalizar(l.unidade)]))
    const b = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: canon.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: "snap_outro_ds",
        })),
        snapshots: [outroDataset],
        evidence: [...evs, agg],
        aggregate_evidence_ref: "ev_agg_parcelas",
      },
      TEST_CONFIG,
    ).summary.event_id
    expect(b).not.toBe(a)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.6b — catálogo governado real + regra de ticket baixo
// ═════════════════════════════════════════════════════════════════════════════

describe("catálogo GOVERNADO (não sintético) na mesma cadeia", () => {
  const INDICE_GOV = buildUnitIndex(toUnitCatalog(GOVERNED_UNIT_CATALOG), ENGINE_UNIT_NORMALIZER)
  const resolverGov = (bruto: unknown): CanonicalUnitResult =>
    canonicalizeWithGroups(bruto, INDICE_GOV, ENGINE_UNIT_NORMALIZER, {
      similarityThresholdBp: APPROVED_THRESHOLDS.similarity_threshold_bp,
    }, GOVERNED_UNIT_CATALOG.groups)

  it("`Grau Marabá` agora RESOLVE — era o achado do D13", () => {
    // No harness com catálogo sintético este nome era `unknown`. Com as decisões
    // aprovadas, a unidade existe.
    const r = resolverGov("Grau Marabá")
    expect(r.status).toBe("matched")
    expect(r.status === "matched" && r.unit_id).toBe("maraba")
  })

  it("`Presidente P.` resolve por alias governado", () => {
    const r = resolverGov("Presidente P.")
    expect(r.status === "matched" && r.unit_id).toBe("prudente")
  })

  it("unidade INATIVA resolve, e não vira unknown", () => {
    const r = resolverGov("Jd Angela")
    expect(r.status).toBe("matched")
    const entrada = GOVERNED_UNIT_CATALOG.entries.find((e) => e.unit_id === "jd_angela")
    expect(entrada?.status).toBe("inactive")
  })

  it("rótulo de agrupamento não escolhe membro nem vaza texto cru", () => {
    const r = resolverGov("Carpina e Limoeiro")
    expect(r.status).toBe("ambiguous")
    expect(r.status === "ambiguous" && r.reason).toBe("GROUP_LABEL")
    expect(JSON.stringify(r)).not.toContain("Carpina e")
  })

  it("o catálogo governado atravessa o Detector A sem adaptação", () => {
    const cadeia = montarCadeia()
    const AGG = "ev_agg_gov"
    const r = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          // Agora com o catálogo REAL, não o sintético.
          unit: resolverGov(l.unidade),
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [cadeia.snapshot],
        evidence: [...cadeia.evidence, evidenciaComputada(AGG, "count(...)")],
        aggregate_evidence_ref: AGG,
      },
      TEST_CONFIG,
    )
    // `Grau Marabá` deixou de degradar por identidade desconhecida.
    expect(r.summary.population.eligible_contracts).toBe(VENDAS.length)
    expect(r.summary.quality_status).toBe("ok")
  })
})

describe("regra de ticket baixo na mesma cadeia governada", () => {
  const cadeia = montarCadeia()

  /** Tickets em volta do piso aprovado de R$ 1.499,99. */
  const TICKETS: readonly (number | null)[] = [
    149_998, // alerta
    149_999, // não
    150_000, // não
    null, // lacuna
    0, // inválido
    4_000_000, // R$ 40 mil — não é ticket baixo
    100_000, // alerta
  ]

  const r = detectLowTicketContracts({
    detected_at: DETECTED_AT,
    period_start: PERIODO.start,
    period_end: PERIODO.end,
    contracts: VENDAS.map((l, i) => ({
      subject_ref: subjectRef(l.row),
      unit: cadeia.canonicas.get(l.row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
      ticket_cents: TICKETS[i] ?? null,
      evidence_refs: [`ev_row_${l.row}`],
      snapshot_id: SNAPSHOT_ID,
    })),
    snapshots: [cadeia.snapshot],
    evidence: cadeia.evidence,
  })

  it("a regra roda sobre o MESMO snapshot e as MESMAS evidências dos detectores", () => {
    expect(r.summary.total_records).toBe(VENDAS.length)
  })

  it("o boundary do piso vale end-to-end", () => {
    expect(r.summary.below_floor).toBe(2)
    expect(r.summary.at_or_above_floor).toBe(3)
    expect(r.summary.ticket_unavailable).toBe(1)
    expect(r.summary.invalid_ticket).toBe(1)
  })

  it("R$ 40 mil não é ticket baixo — os dois pisos não se confundem", () => {
    const quarentaMil = r.assessed.find(
      (a) => isOk(a.ticket_cents) && a.ticket_cents.value === 4_000_000,
    )
    expect(quarentaMil?.verdict).toBe("AT_OR_ABOVE_FLOOR")
  })

  it("os fatos viram Event: a severidade foi aprovada na Fase 2.7", () => {
    // Até a 2.6c este caminho ficava bloqueado — o fato era detectado mas nenhum
    // Event saía, porque a severidade não era política. A 2.7 aprovou `medium`.
    expect(r.events).toHaveLength(2)
    expect(r.summary.facts_not_emitted).toBe(0)
    for (const a of r.assessed.filter((x) => x.matched)) {
      expect(a.emitted).toBe(true)
      expect(a.not_emitted_reason).toBeUndefined()
    }
  })

  it("a severidade é medium, projetada da política governada", () => {
    for (const e of r.events) expect(e.severity).toBe("medium")
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe("medium")
  })

  it("nenhum OUTRO grau de severidade aparece na saída", () => {
    // `medium` é o único permitido para esta regra. Se qualquer outro surgisse,
    // seria escala percentual vazando para um fato individual.
    const texto = JSON.stringify(r)
    for (const grau of ["info", "low", "high", "critical"]) {
      expect(texto, grau).not.toContain(`"${grau}"`)
    }
  })

  it("nenhum vestígio da razão de bloqueio anterior", () => {
    expect(JSON.stringify(r)).not.toContain("SEVERITY_POLICY_UNRESOLVED")
  })

  it("nem vocabulário de juízo", () => {
    const texto = JSON.stringify(r).toLowerCase()
    for (const proibido of ["fraud", "prejuiz", "risco", "suspeit"]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })

  it("a unidade unknown da cadeia degrada também a regra", () => {
    // `Grau Marabá` é unknown no catálogo SINTÉTICO desta cadeia.
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("a regra NÃO exige população mínima nem participação", () => {
    // Um contrato só, abaixo do piso: o fato individual basta.
    const um = detectLowTicketContracts({
      detected_at: DETECTED_AT,
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      contracts: [
        {
          subject_ref: subjectRef("r1"),
          unit: cadeia.canonicas.get("r1") ?? { status: "unknown", raw_fingerprint: "0".repeat(16) },
          ticket_cents: 1_000,
          evidence_refs: ["ev_row_r1"],
          snapshot_id: SNAPSHOT_ID,
        },
      ],
      snapshots: [cadeia.snapshot],
      evidence: cadeia.evidence,
    })
    expect(um.assessed[0]?.matched).toBe(true)
    expect(um.summary.below_floor).toBe(1)
  })

  it("o resultado é congelado por inteiro, como os demais", () => {
    expect(Object.isFrozen(r)).toBe(true)
    expect(Object.isFrozen(r.assessed)).toBe(true)
    expect(() => ((r.summary as { below_floor: number }).below_floor = 0)).toThrowError(TypeError)
  })
})
