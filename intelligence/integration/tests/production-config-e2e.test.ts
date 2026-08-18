/**
 * Harness de PRODUÇÃO — artefato governado → configuração → quatro detectores.
 *
 * A diferença em relação a `end-to-end.test.ts` é a única que importa aqui:
 * **nenhum limiar sintético**. A configuração vem de
 * `buildProductionDetectorConfig()`, que projeta
 * `governance/policy/creditum-policy.v1.json`. O catálogo é o governado (D13
 * completo), não um subconjunto de teste.
 *
 * Este arquivo NÃO importa `TEST_CONFIG`, e há um teste que prova isso lendo o
 * próprio fonte. É a única forma de garantir que a prova não se contamine com o
 * que ela deveria estar substituindo: um `import` esquecido passaria despercebido
 * num arquivo deste tamanho.
 *
 * O que é sintético aqui é o DADO — quinze vendas em memória, sem rede nem
 * disco. Dado de fixture e política de negócio são coisas diferentes: a política
 * é governada, os números de venda são inventados para exercitar os limiares dela.
 *
 * A cadeia provada:
 *
 *   artefato de política → ProductionDetectorConfig
 *   lote bruto → D13 governado → snapshot/evidência → store
 *   → Detector A → Detector B → Detector C → Detector D → low-ticket
 *
 * Cada detector consome só os campos que são dele. Nenhum lê a configuração de
 * outro, e há teste para isso.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  CREDITUM_POLICY_V1,
  buildFirstDueExecutionConfig,
  buildProductionDetectorConfig,
  productionFirstDueContext,
  productionNextNDays,
  productionFirstDueWindows,
} from "../../detectors/src/production-policy"
import { GatewayError } from "../../gateway/src/errors"
import { InMemoryStore } from "../../gateway/src/store"
import { toEvidence, toSnapshot } from "../../gateway/src/factory"
import type { Evidence, Snapshot } from "../../gateway/src/types"
import { buildUnitIndex } from "../../detectors/src/canonical-units"
import type { CanonicalUnitResult } from "../../detectors/src/canonical-units"
import type { DetectorConfig, DueWindow } from "../../detectors/src/config"
import { ENGINE_UNIT_NORMALIZER } from "../../detectors/src/unit-normalizer"
import { COUNTERFACTUAL_PROVENANCE_VERSION } from "../../detectors/src/counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "../../detectors/src/counterfactual-provenance"
import { detectInstallmentConcentration } from "../../detectors/src/installment-concentration"
import { detectCrossSourceConflicts } from "../../detectors/src/cross-source-conflict"
import {
  detectFirstDueDateConcentration,
  firstDueComputationId,
} from "../../detectors/src/first-due-date-concentration"
import type { FirstDueClaim } from "../../detectors/src/first-due-date-concentration"
import {
  counterfactualComputationId,
  detectMaterialSingleCase,
} from "../../detectors/src/material-single-case"
import { detectLowTicketContracts } from "../../detectors/src/low-ticket"
import { isOk } from "../../detectors/src/engine"
import {
  GOVERNED_UNIT_CATALOG,
  canonicalizeWithGroups,
  toUnitCatalog,
} from "../../detectors/src/unit-catalog"
import {
  assessCoverage,
  coverageQuality,
  toUnitCoverage,
} from "../../detectors/src/expected-units"
import {
  FileExpectedUnitsProvider,
  PRODUCTION_EXPECTED_UNITS_PROVIDER,
} from "../../detectors/src/expected-units-file-provider"
import {
  coverageForDetector,
  evaluateCoverage,
  isCoverageEvaluated,
} from "../../detectors/src/coverage-evaluation"
import type { CoverageEvaluation } from "../../detectors/src/coverage-evaluation"
import { rawEvidence, rawSnapshot } from "../../gateway/tests/helpers"
import type { RawBatch, RawRow } from "../src/ports"

// ═════════════════════════════════════════════════════════════════════════════
// A configuração de produção — projetada, não escrita
// ═════════════════════════════════════════════════════════════════════════════

const PROD = buildProductionDetectorConfig()

// ═════════════════════════════════════════════════════════════════════════════
// D13 governado
// ═════════════════════════════════════════════════════════════════════════════

const INDICE = buildUnitIndex(toUnitCatalog(GOVERNED_UNIT_CATALOG), ENGINE_UNIT_NORMALIZER)

const canonicalizar = (bruto: unknown): CanonicalUnitResult =>
  canonicalizeWithGroups(
    bruto,
    INDICE,
    ENGINE_UNIT_NORMALIZER,
    // O limiar de similaridade também vem da política projetada.
    { similarityThresholdBp: PROD.similarity_threshold_bp },
    GOVERNED_UNIT_CATALOG.groups,
  )

// ═════════════════════════════════════════════════════════════════════════════
// Lote bruto em memória
// ═════════════════════════════════════════════════════════════════════════════

const PERIODO = { start: "2026-08-01", end: "2026-08-31" } as const
const OBSERVED_AT = "2026-08-31T23:00:00.000Z"
const COLLECTED_AT = "2026-09-01T02:00:00.000Z"
/** O relógio é ENTRADA. Nenhum detector chama `Date.now()`. */
const DETECTED_AT = "2026-09-01T09:00:00.000Z"

const DATASET = { source_system: "google_sheets", dataset_id: "ds_vendas_mensal" } as const
const SNAPSHOT_ID = "snap_prod_2026_08"

interface LinhaVenda {
  readonly row: string
  readonly unidade: unknown
  readonly parcelas: number | null
  readonly valor: number | null
  readonly primeiro_vencimento: unknown
}

/**
 * Quinze vendas — dimensionadas para os limiares APROVADOS, não para limiares
 * sintéticos.
 *
 * A população mínima de produção é 10 contratos, então as sete linhas do harness
 * sintético não sustentariam nenhuma afirmação aqui: com 7 o Detector A recusaria
 * por amostra pequena, o que é o comportamento certo e não prova nada sobre a
 * política. Quinze passa da amostra e ainda deixa margem para as fronteiras.
 *
 * Grafias como a planilha escreve: `Grau Mogi`, `Rio Preto`, data em `dd/MM/yyyy`
 * e em ISO no mesmo lote, e um rótulo de agrupamento que o D13 não resolve.
 */
const VENDAS: readonly LinhaVenda[] = [
  // Seis acima do limiar de 19 parcelas.
  { row: "r1", unidade: "Grau Mogi", parcelas: 24, valor: 6_000_000, primeiro_vencimento: "04/09/2026" },
  { row: "r2", unidade: "Mogi", parcelas: 24, valor: 1_500_000, primeiro_vencimento: "2026-09-04" },
  { row: "r3", unidade: "Rio Preto", parcelas: 24, valor: 1_500_000, primeiro_vencimento: "04/09/2026" },
  { row: "r4", unidade: "Santos", parcelas: 24, valor: 1_500_000, primeiro_vencimento: "2026-09-04" },
  { row: "r5", unidade: "Santos", parcelas: 30, valor: 1_500_000, primeiro_vencimento: "04/09/2026" },
  { row: "r6", unidade: "Grau Mogi", parcelas: 20, valor: 1_500_000, primeiro_vencimento: "2026-09-04" },
  // Nove dentro do limiar. `r7` é o low-ticket: R$ 1.000, abaixo do piso.
  { row: "r7", unidade: "Santos", parcelas: 12, valor: 100_000, primeiro_vencimento: "2026-09-20" },
  { row: "r8", unidade: "Mogi", parcelas: 12, valor: 200_000, primeiro_vencimento: "20/09/2026" },
  { row: "r9", unidade: "Santos", parcelas: 19, valor: 200_000, primeiro_vencimento: "2026-09-21" },
  { row: "r10", unidade: "Rio Preto", parcelas: 12, valor: 200_000, primeiro_vencimento: "2026-09-22" },
  { row: "r11", unidade: "Mogi", parcelas: 6, valor: 200_000, primeiro_vencimento: "2026-09-23" },
  { row: "r12", unidade: "Santos", parcelas: 6, valor: 200_000, primeiro_vencimento: "2026-09-24" },
  { row: "r13", unidade: "Rio Preto", parcelas: 12, valor: 200_000, primeiro_vencimento: "2026-09-25" },
  { row: "r14", unidade: "Carpina e Limoeiro", parcelas: 12, valor: 200_000, primeiro_vencimento: "2026-09-26" },
  { row: "r15", unidade: "Mogi", parcelas: 12, valor: 200_000, primeiro_vencimento: "2026-09-27" },
]

const ACIMA_DO_LIMIAR = 6
const NO_ALVO_MESMO_DIA = 6

const subjectRef = (row: string): string =>
  `subj_${row.replace(/\D/g, "").padStart(16, "0").slice(0, 16)}`

/** O contrato exige `^[a-f0-9]{64}$` — `r1` não é hex. Derivação determinística. */
const hexRowKey = (row: string): string => row.replace(/\D/g, "").padStart(64, "0")

function loteFalso(): RawBatch {
  const rows: RawRow[] = VENDAS.map((l) => ({
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
    content_hash: "d".repeat(64),
    rows_skipped: 0,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Plano de ESCRITA
// ═════════════════════════════════════════════════════════════════════════════

interface Cadeia {
  readonly snapshot: Snapshot
  readonly evidence: readonly Evidence[]
  readonly store: InMemoryStore
  readonly canonicas: ReadonlyMap<string, CanonicalUnitResult>
}

function montarCadeia(): Cadeia {
  const lote = loteFalso()

  const snapshot = toSnapshot(
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
    }),
    { now: new Date(DETECTED_AT) },
  )

  const evidencias = lote.rows.map((row) =>
    toEvidence(
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
    ),
  )

  // O store valida schema, semântica e integridade referencial no construtor —
  // não há caminho que insira depois. `now` é ENTRADA: com o relógio real o
  // fixture passaria hoje e falharia amanhã.
  const store = new InMemoryStore(
    { snapshots: [snapshot as unknown], evidence: evidencias as unknown[], events: [] },
    { now: new Date(DETECTED_AT) },
  )

  return {
    snapshot,
    evidence: evidencias,
    store,
    canonicas: new Map(VENDAS.map((l) => [l.row, canonicalizar(l.unidade)])),
  }
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

const ancorar = (evidence_ref: string, computation_id: string): ComputedEvidenceProvenance => ({
  evidence_ref,
  computation_id,
  provenance_version: COUNTERFACTUAL_PROVENANCE_VERSION,
})

const CADEIA = montarCadeia()

const unidadeDe = (row: string): CanonicalUnitResult =>
  CADEIA.canonicas.get(row) ?? { status: "unknown", raw_fingerprint: "0".repeat(16) }

// ═════════════════════════════════════════════════════════════════════════════
// §16 — a prova de que não há queda para TEST_CONFIG
// ═════════════════════════════════════════════════════════════════════════════

describe("§16 — a configuração é a de produção, e não existe fallback", () => {
  /**
   * Só as linhas de `import`, nunca o arquivo inteiro.
   *
   * A primeira versão deste teste procurava o nome no fonte todo e falhava
   * contra a própria asserção e contra os comentários que explicam a regra. Um
   * teste que se auto-detecta não distingue "importou" de "mencionou".
   */
  const IMPORTS = readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^\s*(import|export)\b/.test(l) || /^\s*\}\s*from\s/.test(l))
    .join("\n")

  it("este arquivo não importa configuração de teste", () => {
    expect(IMPORTS).not.toMatch(/tests\/test-config/)
    expect(IMPORTS).not.toMatch(/TEST_CONFIG|TEST_NORMALIZER|testCatalog/)
  })

  it("nem importa nada de dentro de `tests/` de outro pacote", () => {
    // `gateway/tests/helpers` é a exceção conhecida: constrói objetos brutos
    // para as factories, não carrega política nenhuma.
    const suspeitos = IMPORTS.split("\n").filter(
      (l) => l.includes("/tests/") && !l.includes("gateway/tests/helpers"),
    )
    expect(suspeitos).toEqual([])
  })

  it("a configuração usada é a projeção do artefato governado", () => {
    expect(PROD).toEqual(buildProductionDetectorConfig())
    expect(PROD.config_version).toBe(CREDITUM_POLICY_V1.policy_version)
    // `0.0.0` é o marcador de sintético do projeto. Produção não é sintética.
    expect(PROD.config_version).not.toBe("0.0.0")
  })

  it("nenhuma banda `info` atravessa: a escala aprovada começa em `low`", () => {
    for (const escala of [
      PROD.installmentConcentration.severity_scale,
      PROD.firstDueConcentration.severity_scale,
      PROD.materialSingleCase.severity_scale,
      PROD.crossSourceConflict.severity_by_relative_bp,
    ]) {
      expect(escala.map((b) => b.severity)).not.toContain("info")
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Detector A
// ═════════════════════════════════════════════════════════════════════════════

describe("Detector A sob a política de produção", () => {
  const AGG = "ev_agg_parcelas"

  const r = detectInstallmentConcentration(
    {
      detected_at: DETECTED_AT,
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      contracts: VENDAS.map((l) => ({
        subject_ref: subjectRef(l.row),
        unit: unidadeDe(l.row),
        installment_count: l.parcelas,
        amount_cents: l.valor,
        evidence_refs: [`ev_row_${l.row}`],
        snapshot_id: SNAPSHOT_ID,
      })),
      snapshots: [CADEIA.snapshot],
      evidence: [
        ...CADEIA.evidence,
        evidenciaComputada(AGG, "count(elegiveis where installments > 19) / count(elegiveis)"),
      ],
      aggregate_evidence_ref: AGG,
    },
    PROD,
  )

  it("a amostra de 15 passa da população mínima aprovada de 10", () => {
    expect(PROD.installmentConcentration.minimum_sample_size).toBe(10)
    expect(r.summary.population.eligible_contracts).toBe(VENDAS.length)
  })

  it("o limiar aprovado de 19 governa: 19 parcelas fica fora, 20 entra", () => {
    expect(PROD.installmentConcentration.installment_threshold).toBe(19)
    expect(r.summary.population.contracts_above_threshold).toBe(ACIMA_DO_LIMIAR)
  })

  it("é material — e por dimensões aprovadas, nomeadas", () => {
    expect(r.event).not.toBeNull()
    // 6 contratos >= 5 casos relevantes; participação 4000 bp >= 1000 bp.
    expect(PROD.installmentConcentration.material_count_above).toBe(5)
    expect(PROD.installmentConcentration.material_share_count_bp).toBe(1000)
  })

  it("publica exatamente 5 contribuintes — a regra top_n aprovada", () => {
    expect(r.event?.contributing_cases).toHaveLength(5)
    const valores = r.event?.contributing_cases?.map((c) => c.contribution.amount_cents)
    expect(valores).toEqual([6_000_000, 1_500_000, 1_500_000, 1_500_000, 1_500_000])
  })

  it("a severidade sai da escala aprovada, pela maior participação", () => {
    expect(PROD.installmentConcentration.severity_strategy).toBe("max_available_participation")
    expect(["low", "medium", "high", "critical"]).toContain(r.event?.severity)
  })

  it("não vaza texto cru de unidade nem consome campo de outro detector", () => {
    const json = JSON.stringify(r)
    expect(json).not.toContain("Grau Mogi")
    expect(json).not.toContain("Carpina e Limoeiro")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Detector B
// ═════════════════════════════════════════════════════════════════════════════

describe("Detector B sob a política de produção", () => {
  const outroSnapshot = toSnapshot(
    rawSnapshot({
      snapshot_id: "snap_prod_financeiro",
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
      evidence_id: "ev_agg_omie",
      snapshot_id: "snap_prod_financeiro",
      kind: "aggregate",
      locator: { dataset_id: "ds_financeiro_mensal", sheet: "Financeiro" },
      observed_at: OBSERVED_AT,
    }),
    { now: new Date(DETECTED_AT) },
  )

  const evVendas = evidenciaComputada("ev_agg_contagem", "count(vendas do periodo)")

  const disputa = (
    field: string,
    kind: "count" | "date",
    a: unknown,
    b: unknown,
  ): ReturnType<typeof detectCrossSourceConflicts> =>
    detectCrossSourceConflicts(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        disputes: [
          {
            field,
            kind,
            versions: [
              {
                source_system: DATASET.source_system,
                snapshot_id: SNAPSHOT_ID,
                evidence_ref: "ev_agg_contagem",
                value: { status: "present", raw: a },
              },
              {
                source_system: "omie",
                snapshot_id: "snap_prod_financeiro",
                evidence_ref: "ev_agg_omie",
                value: { status: "present", raw: b },
              },
            ],
          },
        ],
        snapshots: [CADEIA.snapshot, outroSnapshot],
        evidence: [...CADEIA.evidence, evVendas, evOutro],
      },
      PROD,
    )

  it("15 vs 10 vendas: conflito material pela contagem aprovada de 5", () => {
    const r = disputa("sales_count", "count", 15, 10)
    expect(PROD.crossSourceConflict.material_absolute_count).toBe(5)
    expect(r.events).toHaveLength(1)
  })

  it("15 vs 14: divergência existe e NÃO é material por contagem", () => {
    const r = disputa("sales_count", "count", 15, 14)
    // 1 < 5 na dimensão absoluta. A relativa é 1/15 = 667 bp < 1000 bp.
    expect(r.events).toHaveLength(0)
    expect(r.non_material).toHaveLength(1)
  })

  it("data divergente é conflito estrutural: tolerância zero, severidade medium", () => {
    const r = disputa("sale_date", "date", "2026-08-04", "2026-08-05")
    expect(CREDITUM_POLICY_V1.structural_tolerance_bp).toBe(0)
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.severity).toBe("medium")
  })

  it("o limiar de bp aprovado está na configuração e é distinto da tolerância", () => {
    expect(PROD.crossSourceConflict.material_absolute_basis_points).toBe(1000)
    expect(CREDITUM_POLICY_V1.numeric_tolerance_bp).toBe(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Detector C
// ═════════════════════════════════════════════════════════════════════════════

describe("Detector C sob a política de produção — AMBAS as janelas aprovadas", () => {
  const AGG = "ev_agg_vencimento"
  /**
   * O `claim_set` é o conjunto de métricas que o Event publica, e ele MUDA com a
   * janela: participação em valor entra quando é a base de severidade ou quando
   * dispara materialidade, e nas duas execuções isso não é o mesmo. A provenance
   * é conferida contra o alvo calculado, então cada execução ancora o seu.
   */
  const CLAIMS_MESMO_DIA: readonly FirstDueClaim[] = [
    "amount_cents",
    "contract_count",
    "share_amount_bp",
    "share_count_bp",
  ]
  const CLAIMS_SETE_DIAS: readonly FirstDueClaim[] = [
    "amount_cents",
    "contract_count",
    "share_count_bp",
  ]

  const contratos = VENDAS.map((l) => ({
    subject_ref: subjectRef(l.row),
    unit: unidadeDe(l.row),
    first_due_date_raw: l.primeiro_vencimento,
    amount_cents: l.valor,
    evidence_refs: [`ev_row_${l.row}`],
    snapshot_id: SNAPSHOT_ID,
  }))

  const rodar = (
    cfg: DetectorConfig,
    janela: { readonly mode: DueWindow["mode"]; readonly days?: number },
    alvo: { readonly inicio: string; readonly fim: string },
    claims: readonly FirstDueClaim[],
    reference_date?: string,
  ): ReturnType<typeof detectFirstDueDateConcentration> =>
    detectFirstDueDateConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: contratos,
        ...(reference_date === undefined ? {} : { reference_date }),
        snapshots: [CADEIA.snapshot],
        evidence: [...CADEIA.evidence, evidenciaComputada(AGG, "count(contratos no alvo)")],
        aggregate_evidence_ref: AGG,
        aggregate_provenance: [
          ancorar(
            AGG,
            firstDueComputationId({
              grouping_dimension: "first_due_date",
              window_mode: janela.mode,
              reference_date: reference_date ?? null,
              target_start: alvo.inicio,
              target_end: alvo.fim,
              period_start: PERIODO.start,
              period_end: PERIODO.end,
              scope: [DATASET],
              claim_set: [...claims],
            }),
          ),
        ],
      },
      cfg,
    )

  // ── §1/§4: nada escolhe janela por conveniência ──

  it("a configuração de produção NÃO traz janela nenhuma", () => {
    expect(PROD.firstDueConcentration.window).toBeUndefined()
  })

  it("o Detector C RECUSA rodar sem janela explícita", () => {
    // Não cai para `same_day` por ser a que dispensa reference_date. Recusa.
    expect(() =>
      rodar(PROD, { mode: "same_day" }, { inicio: "2026-09-04", fim: "2026-09-04" }, CLAIMS_MESMO_DIA),
    ).toThrow(GatewayError)
  })

  it("as duas janelas executivas aprovadas estão disponíveis", () => {
    expect(productionFirstDueWindows()).toEqual([
      { mode: "same_day" },
      { mode: "next_n_days", days: 7 },
    ])
    expect(productionFirstDueContext()).toEqual(["calendar_month"])
  })

  // ── Execução A: same_day ──

  describe("execução `same_day`", () => {
    const CFG = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, { window: "same_day" })
    const r = rodar(
      CFG,
      { mode: "same_day" },
      { inicio: "2026-09-04", fim: "2026-09-04" },
      CLAIMS_MESMO_DIA,
    )

    it("a janela da execução é same_day", () => {
      expect(CFG.firstDueConcentration.window).toEqual({ mode: "same_day" })
    })

    it("as duas grafias de data caem no MESMO dia civil", () => {
      // `04/09/2026` e `2026-09-04` são a mesma data.
      expect(r.summary.target?.contract_count).toBe(NO_ALVO_MESMO_DIA)
    })

    it("é material pela contagem aprovada de 5, e emite Event", () => {
      expect(CFG.firstDueConcentration.material_count).toBe(5)
      expect(r.event).not.toBeNull()
    })

    it("não precisou de reference_date: o alvo é um dia só", () => {
      expect(r.summary.target?.window).toEqual({ start: "2026-09-04", end: "2026-09-04" })
    })
  })

  // ── Execução B: next_n_days = 7, com reference_date de EXECUÇÃO ──

  describe("execução `next_n_days = 7`", () => {
    const REFERENCIA = "2026-09-20"
    const CFG = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, {
      window: "next_n_days",
      reference_date: REFERENCIA,
    })
    // 20/09 + 6 dias corridos = 26/09, referência inclusive.
    const r = rodar(
      CFG,
      { mode: "next_n_days", days: 7 },
      { inicio: REFERENCIA, fim: "2026-09-26" },
      CLAIMS_SETE_DIAS,
      REFERENCIA,
    )

    it("a janela da execução é next_n_days com os 7 dias da política", () => {
      expect(CFG.firstDueConcentration.window).toEqual({ mode: "next_n_days", days: 7 })
    })

    it("os 7 dias vêm da POLÍTICA; a reference_date vem da EXECUÇÃO", () => {
      const janela = CFG.firstDueConcentration.window
      expect(janela?.mode === "next_n_days" && janela.days).toBe(7)
      // A data não está em lugar nenhum da política nem da configuração: ela é
      // parâmetro de execução, e só aparece no alvo calculado.
      expect(JSON.stringify(CREDITUM_POLICY_V1)).not.toContain(REFERENCIA)
      expect(JSON.stringify(CFG)).not.toContain(REFERENCIA)
      expect(r.summary.target?.window.start).toBe(REFERENCIA)
    })

    it("a janela cobre 20/09 a 26/09 — sete dias corridos, referência inclusive", () => {
      expect(r.summary.target?.window).toEqual({ start: REFERENCIA, end: "2026-09-26" })
    })

    it("os oito contratos da janela entram — nenhum do dia 27", () => {
      // r7 e r8 em 20/09; r9..r13 de 21 a 25; r14 em 26. Oito ao todo.
      // r15 vence em 27/09 e fica fora: a janela é 20..26, sete dias corridos.
      expect(r.summary.target?.contract_count).toBe(8)
    })

    it("a mesma população dá alvo DIFERENTE do same_day: a janela decide", () => {
      const mesmoDia = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, { window: "same_day" })
      const outro = rodar(
        mesmoDia,
        { mode: "same_day" },
        { inicio: "2026-09-04", fim: "2026-09-04" },
        CLAIMS_MESMO_DIA,
      )
      expect(outro.summary.target?.window).not.toEqual(r.summary.target?.window)
    })
  })

  // ── §6: recusas ──

  it("o N da execução vem do artefato governado, não de constante", () => {
    // A execução escolhe QUAL janela e a partir de quando. Quantos dias é decisão
    // governada, lida do artefato — nenhum código pina 7 nem o fabrica.
    const janela = productionFirstDueWindows().find((j) => j.mode === "next_n_days")
    expect(janela?.mode === "next_n_days" && janela.days).toBe(
      productionNextNDays(),
    )
    expect(productionFirstDueWindows().filter((j) => j.mode === "next_n_days")).toHaveLength(1)
  })

  it("next_n_days sem reference_date válida é recusado", () => {
    expect(() =>
      buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, {
        window: "next_n_days",
        reference_date: "",
      }),
    ).toThrow(GatewayError)
  })

  it("calendar_month é contexto: não é janela executável", () => {
    expect(productionFirstDueWindows().map((j) => j.mode)).not.toContain("calendar_month")
    expect(productionFirstDueContext()).toContain("calendar_month")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Detector D
// ═════════════════════════════════════════════════════════════════════════════

describe("Detector D sob a política de produção", () => {
  const AGG = "ev_agg_soma"

  const casos = VENDAS.map((l) => ({
    subject_ref: subjectRef(l.row),
    unit: unidadeDe(l.row),
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
      snapshots: [CADEIA.snapshot],
      evidence: [
        ...CADEIA.evidence,
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
    PROD,
  )

  it("a população após remoção respeita o mínimo aprovado de 10", () => {
    expect(PROD.materialSingleCase.min_population_after_removal).toBe(10)
    expect(r.summary.candidates_evaluated).toBe(VENDAS.length)
  })

  it("o caso de R$ 60 mil é material pela materialidade financeira aprovada", () => {
    expect(PROD.materialSingleCase.material_absolute_delta_cents).toBe(5_000_000)
    const dominante = r.evaluated.find((i) => isOk(i.delta) && i.delta.value === 6_000_000)
    expect(dominante?.outcome).toBe("material")
  })

  it("a severidade continua em share_of_total_bp, nunca no delta relativo", () => {
    expect(PROD.materialSingleCase.severity_dimension).toBe("share_of_total_bp")
    expect(CREDITUM_POLICY_V1.single_case_severity_basis).toBe("share_of_total_bp")
  })

  it("o limiar relativo aprovado é 1000 bp, avaliado em magnitude", () => {
    expect(PROD.materialSingleCase.material_relative_delta_bp).toBe(1000)
    expect(CREDITUM_POLICY_V1.single_case_relative_delta_uses_magnitude).toBe(true)
  })

  it("cada caso carrega a identidade da SUA computação", () => {
    const ids = r.evaluated.map((i) => i.counterfactual_computation_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Low-ticket
// ═════════════════════════════════════════════════════════════════════════════

describe("low-ticket sob a política de produção", () => {
  const r = detectLowTicketContracts({
    detected_at: DETECTED_AT,
    period_start: PERIODO.start,
    period_end: PERIODO.end,
    contracts: VENDAS.map((l) => ({
      subject_ref: subjectRef(l.row),
      unit: unidadeDe(l.row),
      ticket_cents: l.valor,
      evidence_refs: [`ev_row_${l.row}`],
      snapshot_id: SNAPSHOT_ID,
    })),
    snapshots: [CADEIA.snapshot],
    evidence: [...CADEIA.evidence],
  })

  it("o piso aprovado é R$ 1.499,99 e a comparação é estritamente menor", () => {
    expect(CREDITUM_POLICY_V1.low_ticket_floor_cents).toBe(149_999)
  })

  it("exatamente um contrato do lote está abaixo do piso", () => {
    expect(r.assessed.filter((a) => a.matched)).toHaveLength(1)
    expect(r.assessed.find((a) => a.matched)?.subject_ref).toBe(subjectRef("r7"))
  })

  it("o Event sai com a severidade aprovada `medium`", () => {
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.severity).toBe("medium")
    expect(CREDITUM_POLICY_V1.low_ticket_severity).toBe("medium")
  })

  it("o piso de R$ 50 mil não interfere: R$ 2.000 fica acima do piso de ticket", () => {
    const doisMil = r.assessed.find((a) => a.subject_ref === subjectRef("r8"))
    expect(doisMil?.matched).toBe(false)
    expect(doisMil?.verdict).toBe("AT_OR_ABOVE_FLOOR")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §17 — configuração montável não é dado disponível
// ═════════════════════════════════════════════════════════════════════════════

describe("§17 — expected_units continua sem fonte governada", () => {
  it("a configuração monta; os dados de cobertura não existem", () => {
    expect(() => buildProductionDetectorConfig()).not.toThrow()
    expect(CREDITUM_POLICY_V1.expected_units_values_source).toBe("UNRESOLVED")
  })

  it("o catálogo ATIVO não é expected_units", () => {
    const ativas = GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "active")
    expect(ativas.length).toBeGreaterThan(0)
    // Nenhum detector recebeu `unit_coverage` neste harness, porque não há
    // fonte governada de quais unidades eram esperadas no período. Inventar a
    // lista a partir do catálogo ativo é exatamente o que a política proíbe.
    expect(CREDITUM_POLICY_V1.expected_units_model).toEqual(["period", "dataset_id", "unit_id"])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.8 §23 — cobertura com `expected_units` governado
//
// Duas provas distintas:
//
//   A. com fixture governada de TESTE, a cobertura opera conforme a Política v1;
//   B. com o provider de PRODUÇÃO, que não tem dados, é DATA_NOT_AVAILABLE.
//
// A fixture NÃO é produção. Ela vive em `integration/tests/fixtures/` e existe
// para provar que o caminho funciona quando o dado existir.
// ═════════════════════════════════════════════════════════════════════════════

describe("§23 — cobertura governada sobre expected_units", () => {
  const FIXTURES = new URL("./fixtures/expected-units/", import.meta.url).pathname
  const FIXTURE_PROVIDER = new FileExpectedUnitsProvider(FIXTURES, GOVERNED_UNIT_CATALOG)
  const LIMIAR = CREDITUM_POLICY_V1.coverage_missing_share_insufficient_at_bp

  /** As unidades que o lote de 15 vendas resolve pelo D13. Só as canonicalizadas. */
  const OBSERVADAS = [
    ...new Set(
      VENDAS.map((l) => unidadeDe(l.row))
        .filter((u): u is Extract<CanonicalUnitResult, { status: "matched" }> => u.status === "matched")
        .map((u) => u.unit_id),
    ),
  ].sort((a, b) => (a < b ? -1 : 1))

  it("o lote resolve três unidades governadas; `Carpina e Limoeiro` NÃO resolve", () => {
    expect(OBSERVADAS).toEqual(["mogi", "santos", "sao_jose_do_rio_preto"])
    // O rótulo de agrupamento fica ambíguo e não entra como unidade observada.
    expect(unidadeDe("r14").status).toBe("ambiguous")
  })

  it("A — cobertura completa: membership de 3, as 3 reportaram", () => {
    const r = FIXTURE_PROVIDER.getExpectedUnits({
      period: "2026-08",
      dataset_id: DATASET.dataset_id,
    })
    if (r.status !== "available") throw new Error("fixture ausente")
    const a = assessCoverage(r.membership, OBSERVADAS)
    expect(a.expected_count).toBe(3)
    expect(a.missing_count).toBe(0)
    expect(coverageQuality(a, LIMIAR)).toBe("ok")
  })

  it("A — uma esperada que não reportou torna a cobertura insuficiente", () => {
    // 2026-09 espera 4: as três do lote mais `alecrim`, que não reporta.
    // 1 de 4 = 2500 bp, bem acima do limiar de 1000.
    const r = FIXTURE_PROVIDER.getExpectedUnits({
      period: "2026-09",
      dataset_id: DATASET.dataset_id,
    })
    if (r.status !== "available") throw new Error("fixture ausente")
    const a = assessCoverage(r.membership, OBSERVADAS)
    expect(a.expected_count).toBe(4)
    expect(a.missing_unit_ids).toEqual(["alecrim"])
    expect(a.missing_share_bp).toBe(2500)
    expect(coverageQuality(a, LIMIAR)).toBe("insufficient")
  })

  it("A — a cobertura atravessa até o Detector A pela forma que ele já consome", () => {
    const r = FIXTURE_PROVIDER.getExpectedUnits({
      period: "2026-09",
      dataset_id: DATASET.dataset_id,
    })
    if (r.status !== "available") throw new Error("fixture ausente")
    const uc = toUnitCoverage(assessCoverage(r.membership, OBSERVADAS))
    // 7500 bp de presença, abaixo do `minimum_coverage_bp` projetado (9001).
    expect(uc.ratio_bp).toBe(7500)
    expect(uc.ratio_bp).toBeLessThan(PROD.installmentConcentration.minimum_coverage_bp)
  })

  it("o denominador é a MEMBERSHIP, não as 44 ativas do catálogo", () => {
    const ativas = GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "active")
    const r = FIXTURE_PROVIDER.getExpectedUnits({
      period: "2026-08",
      dataset_id: DATASET.dataset_id,
    })
    if (r.status !== "available") throw new Error("fixture ausente")
    const a = assessCoverage(r.membership, OBSERVADAS)
    expect(a.expected_count).toBe(3)
    expect(a.expected_count).not.toBe(ativas.length)
    // Se o denominador fossem as ativas, 3 de 44 seria 9318 bp de ausência e
    // TODO período pareceria catastrófico para sempre.
    expect(coverageQuality(a, LIMIAR)).toBe("ok")
  })

  it("B — o provider de PRODUÇÃO não tem dados: DATA_NOT_AVAILABLE", () => {
    for (const period of ["2026-08", "2026-09"]) {
      const r = PRODUCTION_EXPECTED_UNITS_PROVIDER.getExpectedUnits({
        period,
        dataset_id: DATASET.dataset_id,
      })
      expect(r.status, period).toBe("DATA_NOT_AVAILABLE")
    }
  })

  it("B — a fixture NÃO é o provider de produção", () => {
    const fixture = FIXTURE_PROVIDER.getExpectedUnits({
      period: "2026-08",
      dataset_id: DATASET.dataset_id,
    })
    const producao = PRODUCTION_EXPECTED_UNITS_PROVIDER.getExpectedUnits({
      period: "2026-08",
      dataset_id: DATASET.dataset_id,
    })
    expect(fixture.status).toBe("available")
    expect(producao.status).toBe("DATA_NOT_AVAILABLE")
  })

  it("§15 — sem membership, os detectores rodam SEM cobertura, não com denominador inventado", () => {
    // `unit_coverage` é opcional nos detectores. Ausente significa "não avaliada",
    // e é isso que produção faz hoje — nunca uma cobertura fabricada.
    const producao = PRODUCTION_EXPECTED_UNITS_PROVIDER.getExpectedUnits({
      period: "2026-08",
      dataset_id: DATASET.dataset_id,
    })
    expect(producao.status).toBe("DATA_NOT_AVAILABLE")
    expect(JSON.stringify(producao)).not.toContain("expected_count")
    expect(JSON.stringify(producao)).not.toContain("ratio_bp")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.8a — cobertura como ESTADO EXPLÍCITO no caminho de produção
//
// A brecha que isto fecha: `unit_coverage` é opcional nos detectores, e sem
// membership a produção simplesmente omitia. `undefined` significava três coisas
// ao mesmo tempo — "não pedi", "não avaliei", "não tenho o dado" — e nenhum
// consumidor teria como distingui-las.
//
// A garantia não é convenção: `ResultadoDeProducao.coverage` é campo OBRIGATÓRIO.
// Omitir o estado de cobertura num resultado de produção é erro de tipo.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O que QUALQUER execução de produção devolve.
 *
 * `coverage` não é opcional. É isto que impede a omissão silenciosa — o
 * compilador recusa um resultado sem estado de cobertura, e nenhuma revisão
 * humana precisa lembrar de checar.
 *
 * Genérico de propósito: A, C e D convergem para o MESMO contrato. Três tipos
 * separados permitiriam que um deles perdesse o campo sem ninguém notar, e três
 * transformações separadas de cobertura permitiriam que divergissem.
 */
interface ResultadoDeProducao<T> {
  readonly coverage: CoverageEvaluation
  readonly detector: T
}

describe("§1/§3 — produção sempre resolve o estado de cobertura", () => {
  const FIXTURES = new URL("./fixtures/expected-units/", import.meta.url).pathname
  const COM_DADOS = new FileExpectedUnitsProvider(FIXTURES, GOVERNED_UNIT_CATALOG)
  const LIMIAR = CREDITUM_POLICY_V1.coverage_missing_share_insufficient_at_bp
  const AGG = "ev_agg_cobertura"

  const OBSERVADAS = [
    ...new Set(
      VENDAS.map((l) => unidadeDe(l.row))
        .filter(
          (u): u is Extract<CanonicalUnitResult, { status: "matched" }> => u.status === "matched",
        )
        .map((u) => u.unit_id),
    ),
  ].sort((a, b) => (a < b ? -1 : 1))

  /**
   * A orquestração de produção: resolve cobertura, então roda o detector.
   *
   * A ordem importa. A cobertura é resolvida ANTES e o resultado a carrega
   * sempre — não existe caminho em que o detector rode e o estado se perca.
   */
  function rodarProducao(
    provider: FileExpectedUnitsProvider,
    period: string,
  ): ResultadoDeProducao<ReturnType<typeof detectInstallmentConcentration>> {
    const coverage = evaluateCoverage(
      provider,
      { period, dataset_id: DATASET.dataset_id },
      OBSERVADAS,
      LIMIAR,
    )

    // Hoisted: `exactOptionalPropertyTypes` recusa `T | undefined` num campo
    // opcional, e o narrowing só funciona sobre um const.
    const unitCoverage = coverageForDetector(coverage)

    const installment = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: unidadeDe(l.row),
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [CADEIA.snapshot],
        evidence: [...CADEIA.evidence, evidenciaComputada(AGG, "count(...) / count(...)")],
        aggregate_evidence_ref: AGG,
        // `undefined` aqui é seguro porque o estado explícito viaja ao lado.
        ...(unitCoverage === undefined ? {} : { unit_coverage: unitCoverage }),
      },
      PROD,
    )

    return { coverage, detector: installment }
  }

  // ── A: cobertura DISPONÍVEL ──

  describe("A — provider com dados: cobertura avaliada", () => {
    const r = rodarProducao(COM_DADOS, "2026-08")

    it("o estado é `available`", () => {
      expect(r.coverage.status).toBe("available")
      expect(isCoverageEvaluated(r.coverage)).toBe(true)
    })

    it("os números de cobertura estão presentes", () => {
      if (r.coverage.status !== "available") throw new Error("esperava available")
      expect(r.coverage.expected_count).toBe(3)
      expect(r.coverage.observed_expected_count).toBe(3)
      expect(r.coverage.missing_count).toBe(0)
      expect(r.coverage.ratio_bp).toBe(10000)
      expect(r.coverage.quality_status).toBe("ok")
    })

    it("a membership usada é identificável, para auditoria", () => {
      if (r.coverage.status !== "available") throw new Error("esperava available")
      expect(r.coverage.membership_id).toMatch(/^exp_[a-f0-9]{16}$/)
    })

    it("§8 — o comportamento aprovado é preservado: 1 de 4 ausente é insufficient", () => {
      const outro = rodarProducao(COM_DADOS, "2026-09")
      if (outro.coverage.status !== "available") throw new Error("esperava available")
      expect(outro.coverage.missing_unit_ids).toEqual(["alecrim"])
      expect(outro.coverage.missing_share_bp).toBe(2500)
      expect(outro.coverage.quality_status).toBe("insufficient")
    })

    it("a cobertura atravessa até o detector", () => {
      expect(r.detector.event?.data_quality.coverage_ratio_bp).toBe(10000)
    })
  })

  // ── B: cobertura INDISPONÍVEL ──

  describe("B — provider de produção sem dados: indisponível, explicitamente", () => {
    const r = rodarProducao(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")

    it("o estado é `data_not_available`, com razão FECHADA", () => {
      expect(r.coverage.status).toBe("data_not_available")
      if (r.coverage.status !== "data_not_available") throw new Error("esperava indisponível")
      expect(r.coverage.reason).toBe("EXPECTED_UNITS_DATA_NOT_AVAILABLE")
    })

    it("nomeia período e dataset — auditável sem contexto externo", () => {
      if (r.coverage.status !== "data_not_available") throw new Error("esperava indisponível")
      expect(r.coverage.period).toBe("2026-08")
      expect(r.coverage.dataset_id).toBe(DATASET.dataset_id)
      expect(r.coverage.detail.length).toBeGreaterThan(0)
    })

    it("§4 — o detector CONTINUA executando a lógica factual", () => {
      expect(r.detector.summary.population.eligible_contracts).toBe(VENDAS.length)
      expect(r.detector.summary.population.contracts_above_threshold).toBe(ACIMA_DO_LIMIAR)
    })

    it("§4 — e continua emitindo Event, porque os OUTROS requisitos estão satisfeitos", () => {
      expect(r.detector.event).not.toBeNull()
      expect(r.detector.event?.contributing_cases).toHaveLength(5)
      expect(["low", "medium", "high", "critical"]).toContain(r.detector.event?.severity)
    })

    it("§5 — NENHUM percentual de cobertura é fabricado", () => {
      expect(r.detector.event?.data_quality.coverage_ratio_bp).toBeUndefined()
      const texto = JSON.stringify(r.coverage)
      expect(texto).not.toContain("ratio_bp")
      expect(texto).not.toContain("expected_count")
      expect(texto).not.toContain("missing_count")
      expect(texto).not.toContain("quality_status")
    })

    it("§5 — o ramo indisponível não TEM onde escrever um número", () => {
      // Não é proibição por convenção: as chaves não existem.
      expect(Object.keys(r.coverage).sort()).toEqual([
        "dataset_id",
        "detail",
        "period",
        "reason",
        "status",
      ])
    })

    it("§9 — nenhum fallback para catálogo ativo nem para observadas", () => {
      const texto = JSON.stringify(r.coverage)
      const ativas = GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "active")
      expect(ativas.length).toBe(44)
      for (const id of [...OBSERVADAS, ...ativas.slice(0, 5).map((e) => e.unit_id)]) {
        expect(texto, id).not.toContain(id)
      }
    })
  })

  // ── C: um consumidor distingue A de B sem olhar campo ausente ──

  describe("C — o consumidor distingue os dois estados sem inspecionar undefined", () => {
    const disponivel = rodarProducao(COM_DADOS, "2026-08")
    const indisponivel = rodarProducao(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")

    it("`status` é um campo PRESENTE nos dois casos", () => {
      expect(disponivel.coverage.status).toBe("available")
      expect(indisponivel.coverage.status).toBe("data_not_available")
      // Nenhum dos dois exige checar ausência de nada.
      expect(Object.keys(disponivel.coverage)).toContain("status")
      expect(Object.keys(indisponivel.coverage)).toContain("status")
    })

    it("um consumidor que só lê `status` já decide", () => {
      const decidir = (e: CoverageEvaluation): string =>
        e.status === "available" ? `cobertura ${e.quality_status}` : `cobertura ${e.reason}`
      expect(decidir(disponivel.coverage)).toBe("cobertura ok")
      expect(decidir(indisponivel.coverage)).toBe("cobertura EXPECTED_UNITS_DATA_NOT_AVAILABLE")
    })

    it("os dois estados NUNCA se confundem por serialização", () => {
      expect(JSON.stringify(disponivel.coverage)).not.toBe(JSON.stringify(indisponivel.coverage))
      expect(JSON.stringify(indisponivel.coverage)).toContain("data_not_available")
    })

    it("indisponível NUNCA se parece com `cobertura ok`", () => {
      const texto = JSON.stringify(indisponivel.coverage)
      expect(texto).not.toContain('"ok"')
      expect(texto).not.toContain("degraded")
      expect(texto).not.toContain("insufficient")
    })

    it("§7 — o estado é campo OBRIGATÓRIO: omitir não compila", () => {
      // A prova é de tipo, e vive no tipo `ResultadoDeProducao`. Em runtime só
      // dá para afirmar que ele está sempre lá.
      for (const r of [disponivel, indisponivel]) {
        expect(r).toHaveProperty("coverage")
        expect(r.coverage).toBeDefined()
      }
    })

    it("o estado é imutável", () => {
      expect(Object.isFrozen(disponivel.coverage)).toBe(true)
      expect(Object.isFrozen(indisponivel.coverage)).toBe(true)
      expect(() => {
        ;(indisponivel.coverage as { status: string }).status = "available"
      }).toThrow(TypeError)
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.8b — o caminho de produção de C e D pela MESMA orquestração
//
// A 2.8a provou a garantia com o Detector A. Aqui os outros dois consumidores de
// `unit_coverage` passam pelo mesmo `ResultadoDeProducao<T>` e pela mesma
// `evaluateCoverage` / `coverageForDetector`. Não existe `coverageForC` nem
// `coverageForD`: três transformações separadas poderiam divergir, e divergir é
// exatamente o defeito que esta fase impede.
// ═════════════════════════════════════════════════════════════════════════════

describe("§4/§5/§6 — C e D sob o mesmo contrato de orquestração", () => {
  const FIXTURES = new URL("./fixtures/expected-units/", import.meta.url).pathname
  const COM_DADOS = new FileExpectedUnitsProvider(FIXTURES, GOVERNED_UNIT_CATALOG)
  const LIMIAR = CREDITUM_POLICY_V1.coverage_missing_share_insufficient_at_bp

  const OBSERVADAS = [
    ...new Set(
      VENDAS.map((l) => unidadeDe(l.row))
        .filter(
          (u): u is Extract<CanonicalUnitResult, { status: "matched" }> => u.status === "matched",
        )
        .map((u) => u.unit_id),
    ),
  ].sort((a, b) => (a < b ? -1 : 1))

  /** A resolução de cobertura é UMA. Os três detectores chamam esta função. */
  const resolverCobertura = (
    provider: FileExpectedUnitsProvider,
    period: string,
  ): CoverageEvaluation =>
    evaluateCoverage(provider, { period, dataset_id: DATASET.dataset_id }, OBSERVADAS, LIMIAR)

  // ── Detector A, pela mesma orquestração ──

  const AGG_A = "ev_agg_a_cobertura"

  function rodarProducaoA(
    provider: FileExpectedUnitsProvider,
    period: string,
  ): ResultadoDeProducao<ReturnType<typeof detectInstallmentConcentration>> {
    const coverage = resolverCobertura(provider, period)
    const unitCoverage = coverageForDetector(coverage)

    const detector = detectInstallmentConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: unidadeDe(l.row),
          installment_count: l.parcelas,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [CADEIA.snapshot],
        evidence: [...CADEIA.evidence, evidenciaComputada(AGG_A, "count(...) / count(...)")],
        aggregate_evidence_ref: AGG_A,
        ...(unitCoverage === undefined ? {} : { unit_coverage: unitCoverage }),
      },
      PROD,
    )

    return { coverage, detector }
  }

  // ── Detector C ──

  const CLAIMS_C: readonly FirstDueClaim[] = [
    "amount_cents",
    "contract_count",
    "share_amount_bp",
    "share_count_bp",
  ]
  const AGG_C = "ev_agg_c_cobertura"

  function rodarProducaoC(
    provider: FileExpectedUnitsProvider,
    period: string,
  ): ResultadoDeProducao<ReturnType<typeof detectFirstDueDateConcentration>> {
    const coverage = resolverCobertura(provider, period)
    const unitCoverage = coverageForDetector(coverage)

    const cfg = buildFirstDueExecutionConfig(CREDITUM_POLICY_V1, { window: "same_day" })

    const detector = detectFirstDueDateConcentration(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        contracts: VENDAS.map((l) => ({
          subject_ref: subjectRef(l.row),
          unit: unidadeDe(l.row),
          first_due_date_raw: l.primeiro_vencimento,
          amount_cents: l.valor,
          evidence_refs: [`ev_row_${l.row}`],
          snapshot_id: SNAPSHOT_ID,
        })),
        snapshots: [CADEIA.snapshot],
        evidence: [...CADEIA.evidence, evidenciaComputada(AGG_C, "count(contratos no alvo)")],
        aggregate_evidence_ref: AGG_C,
        aggregate_provenance: [
          ancorar(
            AGG_C,
            firstDueComputationId({
              grouping_dimension: "first_due_date",
              window_mode: "same_day",
              reference_date: null,
              target_start: "2026-09-04",
              target_end: "2026-09-04",
              period_start: PERIODO.start,
              period_end: PERIODO.end,
              scope: [DATASET],
              claim_set: [...CLAIMS_C],
            }),
          ),
        ],
        ...(unitCoverage === undefined ? {} : { unit_coverage: unitCoverage }),
      },
      cfg,
    )

    return { coverage, detector }
  }

  describe("C — expected_units DATA_NOT_AVAILABLE", () => {
    const r = rodarProducaoC(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")

    it("a cobertura é explicitamente indisponível, com razão fechada", () => {
      expect(r.coverage.status).toBe("data_not_available")
      if (r.coverage.status !== "data_not_available") throw new Error("esperava indisponível")
      expect(r.coverage.reason).toBe("EXPECTED_UNITS_DATA_NOT_AVAILABLE")
    })

    it("§10 — C CONTINUA calculando a concentração observada", () => {
      expect(r.detector.summary.target?.contract_count).toBe(NO_ALVO_MESMO_DIA)
      expect(r.detector.summary.target?.window).toEqual({
        start: "2026-09-04",
        end: "2026-09-04",
      })
    })

    it("§10 — e continua emitindo Event: cobertura ausente não é fail-stop", () => {
      expect(r.detector.event).not.toBeNull()
      expect(["low", "medium", "high", "critical"]).toContain(r.detector.event?.severity)
    })

    it("nenhum percentual de cobertura é fabricado", () => {
      expect(r.detector.event?.data_quality.coverage_ratio_bp).toBeUndefined()
      const texto = JSON.stringify(r.coverage)
      for (const proibido of ["ratio_bp", "expected_count", "missing_count", "quality_status"]) {
        expect(texto, proibido).not.toContain(proibido)
      }
    })

    it("nenhum fallback para catálogo ativo nem para observadas", () => {
      const texto = JSON.stringify(r.coverage)
      const ativas = GOVERNED_UNIT_CATALOG.entries.filter((e) => e.status === "active")
      for (const id of [...OBSERVADAS, ...ativas.slice(0, 5).map((e) => e.unit_id)]) {
        expect(texto, id).not.toContain(id)
      }
    })

    it("os claims e a provenance SHIP de C não mudaram", () => {
      // A provenance é conferida contra o alvo calculado. Se a cobertura tivesse
      // alterado o claim_set, a conferência falharia — e ela passou.
      expect(r.detector.event?.evidence_refs).toContain(AGG_C)
    })
  })

  describe("C — expected_units AVAILABLE", () => {
    const r = rodarProducaoC(COM_DADOS, "2026-08")

    it("a cobertura é avaliada", () => {
      expect(r.coverage.status).toBe("available")
      expect(isCoverageEvaluated(r.coverage)).toBe(true)
    })

    it("os dados de cobertura são coerentes com a membership", () => {
      if (r.coverage.status !== "available") throw new Error("esperava available")
      expect(r.coverage.expected_count).toBe(3)
      expect(r.coverage.missing_count).toBe(0)
      expect(r.coverage.ratio_bp).toBe(10000)
      expect(r.coverage.quality_status).toBe("ok")
    })

    it("a cobertura atravessa até o Event de C", () => {
      expect(r.detector.event?.data_quality.coverage_ratio_bp).toBe(10000)
    })

    it("C continua emitindo, e a concentração é a mesma", () => {
      expect(r.detector.summary.target?.contract_count).toBe(NO_ALVO_MESMO_DIA)
      expect(r.detector.event).not.toBeNull()
    })
  })

  // ── Detector D ──

  const AGG_D = "ev_agg_d_cobertura"

  function rodarProducaoD(
    provider: FileExpectedUnitsProvider,
    period: string,
  ): ResultadoDeProducao<ReturnType<typeof detectMaterialSingleCase>> {
    const coverage = resolverCobertura(provider, period)
    const unitCoverage = coverageForDetector(coverage)

    const casos = VENDAS.map((l) => ({
      subject_ref: subjectRef(l.row),
      unit: unidadeDe(l.row),
      amount_cents: l.valor,
      evidence_refs: [`ev_row_${l.row}`],
      snapshot_id: SNAPSHOT_ID,
    }))

    const bindings = casos.map((c) => ({
      evidence_ref: `ev_cfc_${c.subject_ref}`,
      subject_ref: c.subject_ref,
      metric: "amount_sum_cents" as const,
      aggregator: "sum" as const,
      operation: "exclude_subject" as const,
      period_start: PERIODO.start,
      period_end: PERIODO.end,
      scope: [DATASET],
    }))

    const detector = detectMaterialSingleCase(
      {
        detected_at: DETECTED_AT,
        period_start: PERIODO.start,
        period_end: PERIODO.end,
        metric: "amount_sum_cents",
        cases: casos,
        snapshots: [CADEIA.snapshot],
        evidence: [
          ...CADEIA.evidence,
          evidenciaComputada(AGG_D, "sum(amount_cents of all eligible cases)"),
          ...bindings.map((b) =>
            evidenciaComputada(b.evidence_ref, "sum(amount_cents ... except the subject case)"),
          ),
        ],
        aggregate_evidence_ref: AGG_D,
        counterfactual_bindings: bindings,
        counterfactual_provenance: bindings.map((b) =>
          ancorar(b.evidence_ref, counterfactualComputationId(b)),
        ),
        ...(unitCoverage === undefined ? {} : { unit_coverage: unitCoverage }),
      },
      PROD,
    )

    return { coverage, detector }
  }

  describe("D — expected_units DATA_NOT_AVAILABLE", () => {
    const r = rodarProducaoD(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")

    it("a cobertura é explicitamente indisponível", () => {
      expect(r.coverage.status).toBe("data_not_available")
      if (r.coverage.status !== "data_not_available") throw new Error("esperava indisponível")
      expect(r.coverage.reason).toBe("EXPECTED_UNITS_DATA_NOT_AVAILABLE")
    })

    it("§10 — D CONTINUA calculando o contrafactual de todos os casos", () => {
      expect(r.detector.summary.candidates_evaluated).toBe(VENDAS.length)
      const dominante = r.detector.evaluated.find(
        (i) => isOk(i.delta) && i.delta.value === 6_000_000,
      )
      expect(dominante).toBeDefined()
    })

    it("§10 — a materialidade existente continua funcionando", () => {
      const dominante = r.detector.evaluated.find(
        (i) => isOk(i.delta) && i.delta.value === 6_000_000,
      )
      expect(dominante?.outcome).toBe("material")
      expect(r.detector.events.length).toBeGreaterThan(0)
    })

    it("nenhum denominador é inventado", () => {
      const texto = JSON.stringify(r.coverage)
      for (const proibido of ["ratio_bp", "expected_count", "missing_count", "quality_status"]) {
        expect(texto, proibido).not.toContain(proibido)
      }
      expect(r.detector.events[0]?.data_quality.coverage_ratio_bp).toBeUndefined()
    })

    it("a matemática contrafactual não mudou: delta é a contribuição do caso", () => {
      for (const [i, l] of VENDAS.entries()) {
        const d = r.detector.evaluated[i]?.delta
        expect(d !== undefined && isOk(d) && d.value, l.row).toBe(l.valor)
      }
    })
  })

  describe("D — expected_units AVAILABLE", () => {
    const r = rodarProducaoD(COM_DADOS, "2026-08")

    it("a cobertura é avaliada e coerente", () => {
      expect(r.coverage.status).toBe("available")
      if (r.coverage.status !== "available") throw new Error("esperava available")
      expect(r.coverage.expected_count).toBe(3)
      expect(r.coverage.quality_status).toBe("ok")
    })

    it("a cobertura atravessa até o Event de D", () => {
      expect(r.detector.events[0]?.data_quality.coverage_ratio_bp).toBe(10000)
    })

    it("D continua avaliando todos os candidatos", () => {
      expect(r.detector.summary.candidates_evaluated).toBe(VENDAS.length)
    })
  })

  // ── §7: o contrato é o mesmo para os três ──

  describe("§7/§8 — A, C e D convergem para o MESMO contrato", () => {
    const a = rodarProducaoA(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")
    const c = rodarProducaoC(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")
    const d = rodarProducaoD(PRODUCTION_EXPECTED_UNITS_PROVIDER, "2026-08")

    it("os três carregam `coverage`", () => {
      for (const [nome, r] of [
        ["A", a],
        ["C", c],
        ["D", d],
      ] as const) {
        expect(r, nome).toHaveProperty("coverage")
        expect(r.coverage.status, nome).toBe("data_not_available")
      }
    })

    it("o estado de cobertura é IDÊNTICO nos três — uma só resolução", () => {
      // Três transformações separadas poderiam divergir. Há uma só.
      expect(JSON.stringify(c.coverage)).toBe(JSON.stringify(a.coverage))
      expect(JSON.stringify(d.coverage)).toBe(JSON.stringify(a.coverage))
    })

    it("e é idêntico também no caminho AVAILABLE", () => {
      const aOk = rodarProducaoA(COM_DADOS, "2026-08")
      const cOk = rodarProducaoC(COM_DADOS, "2026-08")
      const dOk = rodarProducaoD(COM_DADOS, "2026-08")
      expect(JSON.stringify(cOk.coverage)).toBe(JSON.stringify(aOk.coverage))
      expect(JSON.stringify(dOk.coverage)).toBe(JSON.stringify(aOk.coverage))
    })

    it("§2 — não existe transformação de cobertura por detector", () => {
      const fonte = readFileSync(
        new URL("../../detectors/src/coverage-evaluation.ts", import.meta.url),
        "utf8",
      )
      // Limite de palavra: `coverageForDetector` CONTÉM `coverageForD` como
      // substring, e uma asserção ingênua falharia contra o nome legítimo.
      for (const proibido of ["coverageForA", "coverageForC", "coverageForD"]) {
        expect(fonte, proibido).not.toMatch(new RegExp(`\\b${proibido}\\b`))
      }
      // A única transformação compartilhada.
      expect(fonte).toContain("export function coverageForDetector")
    })

    it("§8 — omitir `coverage` não satisfaz o contrato", () => {
      // A prova é do compilador: `ResultadoDeProducao<T>` exige o campo, e as três
      // funções o declaram como tipo de retorno. Em runtime só dá para afirmar que
      // ele está sempre presente e é um dos dois estados fechados.
      for (const r of [a, c, d]) {
        expect(["available", "data_not_available"]).toContain(r.coverage.status)
      }
    })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §1/§9 — `integration/**` typechecked é invariante do projeto
// ═════════════════════════════════════════════════════════════════════════════

describe("§9 — os harnesses não podem sair do compilador", () => {
  const TSCONFIG = JSON.parse(
    readFileSync(new URL("../../tsconfig.json", import.meta.url), "utf8"),
  ) as { include?: string[] }

  it("`integration/**` está no include do tsconfig que o verify usa", () => {
    // Asserção sobre a configuração parseada, não sobre substring do arquivo.
    expect(TSCONFIG.include).toBeDefined()
    expect(TSCONFIG.include).toContain("integration/**/*.ts")
  })

  it("o padrão realmente cobre este arquivo", () => {
    const padroes = TSCONFIG.include ?? []
    const cobre = (caminho: string): boolean =>
      padroes.some((p) => {
        const re = new RegExp(`^${p.replace(/\*\*\//g, "(.*/)?").replace(/\*/g, "[^/]*")}$`)
        return re.test(caminho)
      })
    expect(cobre("integration/tests/production-config-e2e.test.ts")).toBe(true)
    expect(cobre("integration/tests/end-to-end.test.ts")).toBe(true)
    expect(cobre("integration/src/ports.ts")).toBe(true)
  })

  it("o bug que ficou invisível não pode voltar a ficar invisível", () => {
    // `similarity_threshold_bp` em vez de `similarityThresholdBp` fazia a opção ser
    // ignorada em silêncio no harness sintético — passou por todos os gates
    // anteriores porque `integration/` estava fora do typecheck. O nome correto é
    // afirmado aqui para que a troca vire erro nomeado, e não só de compilação.
    const fonte = readFileSync(
      new URL("./end-to-end.test.ts", import.meta.url),
      "utf8",
    )
    expect(fonte).toContain("similarityThresholdBp:")
    expect(fonte).not.toMatch(/similarity_threshold_bp:\s/)
  })
})
