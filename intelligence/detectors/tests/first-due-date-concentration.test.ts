/**
 * Detector C — concentração de primeira data de vencimento.
 *
 * TODOS os limiares destes testes vêm da `TEST_CONFIG` sintética e **não são
 * política da Creditum**. O Detector C não tem nenhum threshold aprovado.
 *
 * O detector mede DISTRIBUIÇÃO OBSERVADA. Há testes que provam que nenhuma
 * palavra de previsão ou causalidade atravessa a saída.
 */

import { describe, expect, it } from "vitest"
import {
  DETECTOR_ID,
  DETECTOR_VERSION,
  FORMULA_COUNT,
  compararConcentracao,
  detectFirstDueDateConcentration,
  firstDueComputationId,
} from "../src/first-due-date-concentration"
import type {
  DueBucket,
  FirstDueClaim,
  DueContractRecord,
  FirstDueDetectorInput,
} from "../src/first-due-date-concentration"
import { validateDetectorConfig } from "../src/config"
import { parseCivilDateStrict } from "../src/civil-date"
import { piorQualidade, severidadeDaQualidade } from "../src/quality"
import { COUNTERFACTUAL_PROVENANCE_VERSION } from "../src/counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "../src/counterfactual-provenance"
import type { DetectorConfig } from "../src/config"
import { gap, isOk, observed, parseDateISO, sumCents } from "../src/engine"
import { assertValid } from "../../gateway/src/contracts"
import { GatewayError } from "../../gateway/src/errors"
import type { CanonicalUnitResult } from "../src/canonical-units"
import type { Evidence, Snapshot } from "../../gateway/src/types"
import { TEST_CONFIG } from "./test-config"
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
    kind: "computed",
    locator: { dataset_id: "ds_vendas", sheet: "Vendas", column: "Primeiro vencimento" },
    formula: "count(elegiveis where first_due_date in target)",
  }),
] as unknown as Evidence[]

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

function contrato(
  first_due_date_raw: unknown,
  amount_cents: number | null = 100_000,
  unit: CanonicalUnitResult = MATCHED,
): DueContractRecord {
  return {
    subject_ref: subjectRef(),
    unit,
    first_due_date_raw,
    amount_cents,
    evidence_refs: ["ev_linha"],
    snapshot_id: "snap_vendas",
  }
}

const ESCOPO = [{ source_system: "google_sheets", dataset_id: "ds_vendas" }]

/**
 * Recomputa o alvo `same_day` de forma INDEPENDENTE do detector.
 *
 * Existe para montar a âncora de provenance dos fixtures, e de quebra confere o
 * detector contra uma segunda implementação: se as duas discordarem, a provenance
 * não casa e o teste falha.
 */
function alvoSameDayIndependente(
  contracts: readonly DueContractRecord[],
  severityDimension: "share_count_bp" | "share_amount_bp" = "share_count_bp",
  config: DetectorConfig = TEST_CONFIG,
): {
  start: string
  end: string
  claims: readonly FirstDueClaim[]
} | null {
  const porData = new Map<string, DueContractRecord[]>()
  for (const c of contracts) {
    const d = parseCivilDateStrict(c.first_due_date_raw)
    if (d === null) continue
    porData.set(d, [...(porData.get(d) ?? []), c])
  }
  if (porData.size === 0) return null

  const totalTemValor = [...porData.values()].flat().every((c) => c.amount_cents !== null)
  const somaSegura = (xs: readonly DueContractRecord[]): number | null =>
    xs.some((c) => c.amount_cents === null)
      ? null
      : sumCents(xs.map((c) => c.amount_cents ?? 0))

  const ordenado = [...porData.entries()].sort(([da, a], [db, b]) => {
    if (a.length !== b.length) return b.length - a.length
    const va = somaSegura(a)
    const vb = somaSegura(b)
    const na = va === null ? Number.NEGATIVE_INFINITY : va
    const nb = vb === null ? Number.NEGATIVE_INFINITY : vb
    if (na !== nb) return nb - na
    return da < db ? -1 : da > db ? 1 : 0
  })

  const vencedor = ordenado[0]
  if (vencedor === undefined) return null
  const [data, itens] = vencedor
  const valorDoAlvo = somaSegura(itens)
  const temDinheiro = totalTemValor && valorDoAlvo !== null

  /**
   * Espelha a regra do detector — implementação INDEPENDENTE, de propósito.
   *
   * Publicadas: contagem, participação em quantidade, valor quando existe.
   * Usada: a dimensão que gradua. Decisivas: TODA dimensão de materialidade que
   * cruzou o limiar da config recebida.
   */
  const claims = new Set<FirstDueClaim>(["contract_count", "share_count_bp"])
  if (temDinheiro) claims.add("amount_cents")
  claims.add(severityDimension)

  const cfg = config.firstDueConcentration
  const todos = [...porData.values()].flat()
  const totalElegivel = somaSegura(todos)
  const shareCount = Math.round((itens.length / todos.length) * 10000)

  if (itens.length >= cfg.material_count) claims.add("contract_count")
  if (shareCount >= cfg.material_share_count_bp) claims.add("share_count_bp")
  if (temDinheiro && valorDoAlvo >= cfg.material_amount_cents) claims.add("amount_cents")
  if (
    temDinheiro &&
    totalElegivel !== null &&
    totalElegivel > 0 &&
    valorDoAlvo >= 0 &&
    valorDoAlvo <= totalElegivel &&
    Math.round((valorDoAlvo / totalElegivel) * 10000) >= cfg.material_share_amount_bp
  ) {
    claims.add("share_amount_bp")
  }

  return { start: data, end: data, claims: [...claims].sort() }
}

interface AlvoEsperado {
  readonly start: string
  readonly end: string
  readonly claims: readonly FirstDueClaim[]
  readonly window_mode?: "same_day" | "calendar_month" | "next_n_days"
  readonly reference_date?: string | null
}

/** A âncora que a ingestão teria gravado para este alvo. */
function provenanceDoAlvo(
  alvo: AlvoEsperado,
  refEvidencia = "ev_agregado",
  scope: readonly { source_system: string; dataset_id: string }[] = ESCOPO,
): ComputedEvidenceProvenance {
  return {
    evidence_ref: refEvidencia,
    computation_id: firstDueComputationId({
      grouping_dimension: "first_due_date",
      window_mode: alvo.window_mode ?? "same_day",
      reference_date: alvo.reference_date ?? null,
      target_start: alvo.start,
      target_end: alvo.end,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      scope,
      claim_set: alvo.claims,
    }),
    provenance_version: COUNTERFACTUAL_PROVENANCE_VERSION,
  }
}

function entrada(
  contracts: readonly DueContractRecord[],
  extra: Partial<FirstDueDetectorInput> = {},
  config: DetectorConfig = TEST_CONFIG,
): FirstDueDetectorInput {
  const auto = alvoSameDayIndependente(
    contracts,
    config.firstDueConcentration.severity_dimension,
    config,
  )
  return {
    detected_at: DETECTED_AT,
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    contracts,
    snapshots,
    evidence,
    aggregate_evidence_ref: "ev_agregado",
    aggregate_provenance: auto === null ? [] : [provenanceDoAlvo(auto)],
    ...extra,
  }
}

const detectar = (
  contracts: readonly DueContractRecord[],
  extra: Partial<FirstDueDetectorInput> = {},
  config: DetectorConfig = TEST_CONFIG,
): ReturnType<typeof detectFirstDueDateConcentration> =>
  detectFirstDueDateConcentration(entrada(contracts, extra, config), config)

/** Sobrescreve campos da seção sintética do Detector C. Nunca política real. */
function comConfig(campos: Record<string, unknown>): DetectorConfig {
  const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
  c["firstDueConcentration"] = { ...c["firstDueConcentration"], ...campos }
  return c as unknown as DetectorConfig
}

const bucketDe = (r: ReturnType<typeof detectar>, date: string) =>
  r.summary.buckets.find((b) => b.date === date)

// ═════════════════════════════════════════════════════════════════════════════

describe("identidade do detector", () => {
  it("id e versão estáveis", () => {
    expect(DETECTOR_ID).toBe("det.first_due_concentration")
    expect(DETECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("o Detector C não tem nenhum threshold aprovado", () => {
    expect(TEST_CONFIG.config_version).toBe("0.0.0")
  })
})

describe("A/B/C/D — canonicalização de data", () => {
  // ── A ──
  it("A — 04/08/2026 e 2026-08-04 caem no MESMO bucket", () => {
    const r = detectar([contrato("04/08/2026"), contrato("2026-08-04"), contrato("2026-09-10")])
    expect(r.summary.buckets).toHaveLength(2)
    expect(bucketDe(r, "2026-08-04")?.contract_count).toBe(2)
  })

  it("A — variações de separador e dia sem zero também", () => {
    const r = detectar([
      contrato("04/08/2026"),
      contrato("4/8/2026"),
      contrato("04-08-2026"),
      contrato("2026-08-04"),
    ])
    expect(r.summary.buckets).toHaveLength(1)
    expect(bucketDe(r, "2026-08-04")?.contract_count).toBe(4)
  })

  // ── B ──
  it("B — 04/08 e 05/08 são buckets diferentes", () => {
    const r = detectar([contrato("04/08/2026"), contrato("05/08/2026"), contrato("05/08/2026")])
    expect(r.summary.buckets.map((b) => b.date)).toEqual(["2026-08-04", "2026-08-05"])
    expect(bucketDe(r, "2026-08-05")?.contract_count).toBe(2)
  })

  it("os buckets vêm em ordem canônica ascendente", () => {
    const r = detectar([
      contrato("2026-12-01"),
      contrato("2026-01-15"),
      contrato("2026-06-30"),
    ])
    expect(r.summary.buckets.map((b) => b.date)).toEqual([
      "2026-01-15",
      "2026-06-30",
      "2026-12-01",
    ])
  })

  // ── C ──
  describe("C — data inválida nunca passa por parse permissivo", () => {
    it("31/02/2026 é inválida — não vira 03/03", () => {
      const r = detectar([contrato("31/02/2026"), ...preencher(4, "2026-08-04")])
      expect(r.summary.population.excluded.INVALID_DUE_DATE).toBe(1)
      expect(r.summary.buckets.map((b) => b.date)).toEqual(["2026-08-04"])
    })

    it("lixo textual é inválido, não interpretado", () => {
      for (const ruim of ["amanhã", "próximo mês", "N/A", "-", "2026-13-01", "00/00/0000", "abc"]) {
        const r = detectar([contrato(ruim), ...preencher(4, "2026-08-04")])
        expect(r.summary.population.excluded.INVALID_DUE_DATE, ruim).toBe(1)
      }
    })

    it("data inválida e data ausente são exclusões DISTINTAS", () => {
      const r = detectar([contrato("31/02/2026"), contrato(null), ...preencher(4, "2026-08-04")])
      expect(r.summary.population.excluded).toEqual({
        MISSING_DUE_DATE: 1,
        INVALID_DUE_DATE: 1,
      })
    })

    it("contamina a qualidade", () => {
      const r = detectar([contrato("31/02/2026"), ...preencher(4, "2026-08-04")])
      expect(r.summary.quality_status).not.toBe("ok")
    })
  })

  // ── D ──
  describe("D — data ausente não vira hoje, zero nem fim do mês", () => {
    const r = detectar([contrato(null), contrato(undefined), ...preencher(4, "2026-08-04")])

    it("sai do denominador em vez de ganhar uma data", () => {
      expect(r.summary.population.total_records).toBe(6)
      expect(r.summary.population.eligible_contracts).toBe(4)
      expect(r.summary.population.excluded.MISSING_DUE_DATE).toBe(2)
    })

    it("nenhum bucket recebeu contratos sem data", () => {
      const emBuckets = r.summary.buckets.reduce((n, b) => n + b.contract_count, 0)
      expect(emBuckets).toBe(4)
    })

    it("a exclusão é contada, não escondida", () => {
      const e = r.summary.population.eligibility_ratio_bp
      expect(isOk(e) && e.value).toBe(6667)
    })
  })
})

/** Preenche com contratos na mesma data. */
const preencher = (n: number, date: string, valor: number | null = 100_000): DueContractRecord[] =>
  Array.from({ length: n }, () => contrato(date, valor))

/**
 * Preenche com `n` contratos em `n` datas DISTINTAS.
 *
 * Necessário quando o teste quer que uma data específica seja o alvo: empilhar o
 * resto numa única data faria ELA ser a mais concentrada, e o teste mediria o
 * bucket errado — foi o que aconteceu na primeira versão destes testes.
 */
const espalhar = (n: number, valor: number | null = 100_000): DueContractRecord[] =>
  Array.from({ length: n }, (_, i) => {
    const dia = (i % 28) + 1
    const mes = ((Math.floor(i / 28) + 9) % 12) + 1
    const ano = 2027 + Math.floor(i / (28 * 12))
    return contrato(
      `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
      valor,
    )
  })

describe("E/F/G — denominador e distribuição", () => {
  // ── E ──
  it("E — nenhum elegível: EMPTY_DENOMINATOR, nunca 0%", () => {
    const r = detectar([contrato(null), contrato("31/02/2026")])
    expect(r.summary.population.eligible_contracts).toBe(0)
    expect(r.summary.target).toBeNull()
    expect(r.event).toBeNull()
    expect(r.summary.not_emitted_reason).toBe("EMPTY_DENOMINATOR")
    const e = r.summary.population.eligibility_ratio_bp
    expect(isOk(e) && e.value).toBe(0)
  })

  it("E — sem nenhum registro, a própria elegibilidade é lacuna", () => {
    const r = detectar([])
    const e = r.summary.population.eligibility_ratio_bp
    expect(isOk(e)).toBe(false)
    if (!isOk(e)) expect(e.gap).toBe("EMPTY_DENOMINATOR")
  })

  // ── F ──
  it("F — todos na mesma data: share_count = 10000 bp", () => {
    const r = detectar(preencher(7, "2026-09-04"))
    expect(isOk(r.summary.target?.share_count_bp ?? { gap: "x" } as never)).toBe(true)
    const s = r.summary.target?.share_count_bp
    expect(s !== undefined && isOk(s) && s.value).toBe(10000)
    expect(r.summary.target?.contract_count).toBe(7)
  })

  // ── G ──
  describe("G — distribuição 5/3/2", () => {
    const r = detectar([
      ...preencher(5, "2026-09-04"),
      ...preencher(3, "2026-09-10"),
      ...preencher(2, "2026-09-20"),
    ])

    it("os três buckets existem com as contagens certas", () => {
      expect(r.summary.buckets.map((b) => b.contract_count)).toEqual([5, 3, 2])
    })

    it("as participações são 5000 / 3000 / 2000 bp", () => {
      const shares = r.summary.buckets.map((b) =>
        isOk(b.share_count_bp) ? b.share_count_bp.value : -1,
      )
      expect(shares).toEqual([5000, 3000, 2000])
    })

    it("o alvo é o bucket mais concentrado", () => {
      expect(r.summary.target?.dates).toEqual(["2026-09-04"])
      expect(r.summary.target?.contract_count).toBe(5)
    })

    it("as participações somam 10000 bp", () => {
      const soma = r.summary.buckets.reduce(
        (n, b) => n + (isOk(b.share_count_bp) ? b.share_count_bp.value : 0),
        0,
      )
      expect(soma).toBe(10000)
    })
  })
})

describe("H/I — desempate e ordem", () => {
  // ── H ──
  describe("H — empate resolvido deterministicamente", () => {
    const empatado = (): DueContractRecord[] => [
      ...preencher(3, "2026-09-20"),
      ...preencher(3, "2026-09-04"),
      ...preencher(1, "2026-09-30"),
    ]

    it("escolhe a data canônica mais antiga", () => {
      expect(detectar(empatado()).summary.target?.dates).toEqual(["2026-09-04"])
    })

    it("registra que a escolha foi mecânica, não política", () => {
      const t = detectar(empatado()).summary.tie_break
      expect(t).toBeDefined()
      expect(t).toContain("2 datas empatadas")
      expect(t).toContain("não política de materialidade")
    })

    it("sem empate, não há tie_break", () => {
      const r = detectar([...preencher(5, "2026-09-04"), ...preencher(2, "2026-09-10")])
      expect(r.summary.tie_break).toBeUndefined()
    })

    it("valor absoluto desempata antes da data", () => {
      // Mesma contagem; a data mais recente tem valor maior.
      const r = detectar([
        ...preencher(2, "2026-09-04", 100_000),
        ...preencher(2, "2026-09-20", 900_000),
      ])
      expect(r.summary.target?.dates).toEqual(["2026-09-20"])
      expect(r.summary.tie_break).toBeUndefined()
    })
  })

  // ── I ──
  it("I — permutar a entrada não altera nada", () => {
    const base = [
      ...preencher(5, "2026-09-04"),
      ...preencher(3, "2026-09-10"),
      ...preencher(2, "2026-09-20"),
    ]
    const a = detectar(base)
    const b = detectar([...base].reverse())
    expect(structuredClone(b)).toEqual(structuredClone(a))
  })

  it("I — nem em cenário de empate", () => {
    const base = [...preencher(3, "2026-09-20"), ...preencher(3, "2026-09-04")]
    const a = detectar(base)
    const b = detectar([...base].reverse())
    expect(b.summary.target?.dates).toEqual(a.summary.target?.dates)
    expect(b.summary.event_id).toBe(a.summary.event_id)
  })
})

describe("J/K/L/M/N — dinheiro", () => {
  // ── J ──
  describe("J — valor ausente: contagem sim, dinheiro não", () => {
    const r = detectar([
      ...preencher(4, "2026-09-04"),
      contrato("2026-09-04", null),
      ...preencher(2, "2026-09-10"),
    ])

    it("a concentração em quantidade continua exata", () => {
      const s = r.summary.target?.share_count_bp
      expect(s !== undefined && isOk(s) && s.value).toBe(7143)
    })

    it("mas o valor do alvo é lacuna, não zero", () => {
      const v = r.summary.target?.amount_cents
      expect(v !== undefined && isOk(v)).toBe(false)
      if (v !== undefined && !isOk(v)) expect(v.gap).toBe("DATA_NOT_AVAILABLE")
    })

    it("e a participação em valor também", () => {
      const s = r.summary.target?.share_amount_bp
      expect(s !== undefined && isOk(s)).toBe(false)
    })
  })

  // ── K ──
  it("K — dinheiro positivo: participação em valor correta", () => {
    const r = detectar([
      ...preencher(3, "2026-09-04", 300_000),
      ...preencher(3, "2026-09-10", 100_000),
    ])
    // 900.000 de 1.200.000 = 7500 bp
    const s = r.summary.target?.share_amount_bp
    expect(s !== undefined && isOk(s) && s.value).toBe(7500)
  })

  it("K — as duas participações são grandezas distintas", () => {
    const r = detectar([
      ...preencher(3, "2026-09-04", 300_000),
      ...preencher(3, "2026-09-10", 100_000),
    ])
    const qtd = r.summary.target?.share_count_bp
    const val = r.summary.target?.share_amount_bp
    expect(qtd !== undefined && isOk(qtd) && qtd.value).toBe(5000)
    expect(val !== undefined && isOk(val) && val.value).toBe(7500)
  })

  // ── L ──
  it("L — sinal misto: participação em valor vira lacuna, contagem intacta", () => {
    const r = detectar([
      ...preencher(3, "2026-09-04", 900_000),
      contrato("2026-09-10", -2_000_000),
      ...preencher(2, "2026-09-10", 100_000),
    ])
    const val = r.summary.target?.share_amount_bp
    expect(val !== undefined && isOk(val)).toBe(false)
    if (val !== undefined && !isOk(val)) expect(val.gap).toBe("BUSINESS_RULE_PENDING")

    const qtd = r.summary.target?.share_count_bp
    expect(qtd !== undefined && isOk(qtd) && qtd.value).toBe(5000)
  })

  it("L — nenhuma participação em valor publicada passa de 10000 bp", () => {
    const r = detectar([
      ...preencher(3, "2026-09-04", 900_000),
      contrato("2026-09-10", -2_000_000),
      ...preencher(2, "2026-09-10", 100_000),
    ])
    for (const b of r.summary.buckets) {
      if (isOk(b.share_amount_bp)) expect(b.share_amount_bp.value).toBeLessThanOrEqual(10000)
    }
  })

  // ── M ──
  it("M — total elegível zero: participação em valor é EMPTY_DENOMINATOR", () => {
    const r = detectar([...preencher(3, "2026-09-04", 0), ...preencher(2, "2026-09-10", 0)])
    const val = r.summary.target?.share_amount_bp
    expect(val !== undefined && isOk(val)).toBe(false)
    if (val !== undefined && !isOk(val)) expect(val.gap).toBe("EMPTY_DENOMINATOR")
  })

  // ── N ──
  describe("N — overflow falha fechado no DINHEIRO, sem derrubar a contagem", () => {
    const r = detectar([
      ...preencher(3, "2026-09-04", Number.MAX_SAFE_INTEGER),
      ...preencher(2, "2026-09-10", Number.MAX_SAFE_INTEGER),
    ])

    it("o valor do alvo é lacuna, não número aproximado", () => {
      const v = r.summary.target?.amount_cents
      expect(v !== undefined && isOk(v)).toBe(false)
      if (v !== undefined && !isOk(v)) expect(v.gap).toBe("DATA_NOT_AVAILABLE")
    })

    it("a participação em valor também", () => {
      const s2 = r.summary.target?.share_amount_bp
      expect(s2 !== undefined && isOk(s2)).toBe(false)
    })

    it("mas a concentração em QUANTIDADE segue exata — §11", () => {
      const q = r.summary.target?.share_count_bp
      expect(q !== undefined && isOk(q) && q.value).toBe(6000)
    })

    it("e a materialidade cai para base `count`, sem declarar valor inexistente", () => {
      expect(r.event).not.toBeNull()
      const m = r.event?.materiality as { basis?: string; amount_cents?: number }
      expect(m.basis).toBe("count")
      expect(m.amount_cents).toBeUndefined()
    })
  })
})

describe("O/P/Q/R — lastro falha fechado", () => {
  const base = () => preencher(5, "2026-09-04")

  it("O — evidência pendurada", () => {
    const orfao: DueContractRecord = { ...contrato("2026-09-04"), evidence_refs: ["ev_nada"] }
    expect(() => detectar([orfao, ...base()])).toThrowError(/evidência inexistente/)
  })

  it("O — contrato sem nenhuma evidência", () => {
    const semLastro: DueContractRecord = { ...contrato("2026-09-04"), evidence_refs: [] }
    expect(() => detectar([semLastro, ...base()])).toThrowError(/sem evidência/)
  })

  const outroSnap = rawSnapshot({
    snapshot_id: "snap_outro",
    source_system: "bitrix24",
    dataset_id: "ds_outro",
  }) as unknown as Snapshot

  it("P — evidência agregada de snapshot errado", () => {
    const ev = rawEvidence({
      evidence_id: "ev_agg_outro",
      snapshot_id: "snap_outro",
      kind: "aggregate",
      locator: { dataset_id: "ds_outro", sheet: "Vendas" },
    }) as unknown as Evidence
    expect(() =>
      detectar(base(), {
        snapshots: [...snapshots, outroSnap],
        evidence: [...evidence, ev],
        aggregate_evidence_ref: "ev_agg_outro",
      }),
    ).toThrowError(/snapshot/)
  })

  it("Q — snapshot certo, dataset errado no localizador", () => {
    const ev = rawEvidence({
      evidence_id: "ev_agg_ds_errado",
      snapshot_id: "snap_vendas",
      kind: "aggregate",
      locator: { dataset_id: "ds_nao_usado", sheet: "Vendas" },
    }) as unknown as Evidence
    expect(() =>
      detectar(base(), { evidence: [...evidence, ev], aggregate_evidence_ref: "ev_agg_ds_errado" }),
    ).toThrowError(/dataset/)
  })

  it("R — multi-dataset sem evidência composta falha fechado", () => {
    const evLinha = rawEvidence({
      evidence_id: "ev_linha_outro",
      snapshot_id: "snap_outro",
      kind: "row",
      locator: { dataset_id: "ds_outro", sheet: "Vendas", row_key: "b".repeat(64) },
    }) as unknown as Evidence
    const doOutro: DueContractRecord = {
      subject_ref: subjectRef(),
      unit: MATCHED,
      first_due_date_raw: "2026-09-04",
      amount_cents: 100_000,
      evidence_refs: ["ev_linha_outro"],
      snapshot_id: "snap_outro",
    }
    expect(() =>
      detectar([...base(), doOutro], {
        snapshots: [...snapshots, outroSnap],
        evidence: [...evidence, evLinha],
      }),
    ).toThrowError(/escopos governados/)
  })

  it("a evidência agregada não aceita tipo row", () => {
    expect(() => detectar(base(), { aggregate_evidence_ref: "ev_linha" })).toThrowError(
      /computed ou aggregate/,
    )
  })
})

describe("S/T — D13 e privacidade", () => {
  it("S — unidade ambígua não recebe identidade inventada", () => {
    const ambigua: CanonicalUnitResult = {
      status: "ambiguous",
      candidates: ["presidente_prudente", "presidente_venceslau"],
      raw_fingerprint: "a".repeat(16),
    }
    const r = detectar([contrato("2026-09-04", 100_000, ambigua), ...preencher(4, "2026-09-04")])
    // Nenhuma resolução aparece: "Presidente P." não vira "Presidente Prudente".
    const texto = JSON.stringify(r)
    expect(texto).not.toContain("presidente_prudente")
    expect(texto).not.toContain("Presidente")
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("S — unidade unknown também degrada e nada sai", () => {
    const r = detectar([contrato("2026-09-04", 100_000, UNKNOWN), ...preencher(4, "2026-09-04")])
    expect(r.summary.quality_status).not.toBe("ok")
    expect(JSON.stringify(r)).not.toContain("u".repeat(16))
  })

  it("T — o output só carrega pseudônimos", () => {
    const r = detectar(preencher(5, "2026-09-04"))
    const texto = JSON.stringify(r)
    expect(texto).not.toContain("Maria")
    expect(texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
    for (const ref of r.summary.target?.subject_refs ?? []) {
      expect(ref).toMatch(/^subj_[a-f0-9]{16}$/)
    }
  })
})

describe("U — boundary de materialidade por dimensão (TEST_CONFIG sintética)", () => {
  /** Isola uma dimensão pondo as outras fora de alcance. */
  const soDimensao = (campo: string, valor: number): DetectorConfig =>
    comConfig({
      material_count: 999_999,
      material_share_count_bp: 10000,
      material_amount_cents: Number.MAX_SAFE_INTEGER,
      material_share_amount_bp: 10000,
      minimum_sample_size: 1,
      [campo]: valor,
    })

  it("contagem absoluta: 4 / 5 / 6 contra limiar 5", () => {
    for (const [n, esperado] of [[4, false], [5, true], [6, true]] as const) {
      const r = detectar(
        [...preencher(n, "2026-09-04"), ...espalhar(20)],
        {},
        soDimensao("material_count", 5),
      )
      expect(r.summary.target?.dates, `${n} contratos`).toEqual(["2026-09-04"])
      expect(r.summary.material, `${n} contratos`).toBe(esperado)
    }
  })

  it("participação em quantidade: 2999 / 3000 / 3001 bp", () => {
    // 3 de 10 = 3000 bp exato.
    const r = detectar(
      [...preencher(3, "2026-09-04"), ...espalhar(7)],
      {},
      soDimensao("material_share_count_bp", 3000),
    )
    expect(r.summary.target?.dates).toEqual(["2026-09-04"])
    expect(r.summary.material).toBe(true)

    // 2 de 10 = 2000 bp.
    const abaixo = detectar(
      [...preencher(2, "2026-09-04"), ...espalhar(8)],
      {},
      soDimensao("material_share_count_bp", 3000),
    )
    expect(abaixo.summary.material).toBe(false)
  })

  it("valor absoluto é independente da participação", () => {
    const r = detectar(
      [...preencher(2, "2026-09-04", 500_000), ...espalhar(20, 100_000)],
      {},
      soDimensao("material_amount_cents", 1_000_000),
    )
    expect(r.summary.material).toBe(true)
    const s = r.summary.target?.share_count_bp
    expect(s !== undefined && isOk(s) && s.value).toBeLessThan(10000)
  })

  it("um limiar de contagem não classifica centavos, e vice-versa", () => {
    const cfg = TEST_CONFIG.firstDueConcentration
    expect(cfg.material_count).not.toBe(cfg.material_amount_cents)
    expect(cfg.material_share_count_bp).not.toBe(cfg.material_amount_cents)
  })

  it("amostra abaixo do mínimo não é material, e o motivo é próprio", () => {
    const r = detectar(preencher(2, "2026-09-04"), {}, comConfig({ minimum_sample_size: 5 }))
    expect(r.summary.material).toBe(false)
    expect(r.summary.not_emitted_reason).toBe("INSUFFICIENT_SAMPLE")
  })
})

describe("V — boundary de severidade (TEST_CONFIG sintética)", () => {
  // severity_dimension = share_count_bp na TEST_CONFIG.
  const grau = (noAlvo: number, total: number): string | null => {
    const r = detectar([...preencher(noAlvo, "2026-09-04"), ...espalhar(total - noAlvo)])
    // O alvo tem de ser o bucket pretendido, senão o teste mede outra coisa.
    expect(r.summary.target?.dates).toEqual(["2026-09-04"])
    return r.summary.severity
  }

  it("200 bp → info (faixa que começa em 0)", () => {
    expect(grau(2, 100)).toBe("info")
  })

  it("1000 bp → low", () => {
    expect(grau(10, 100)).toBe("low")
  })

  it("2500 bp → medium", () => {
    expect(grau(25, 100)).toBe("medium")
  })

  it("5000 bp → high", () => {
    expect(grau(50, 100)).toBe("high")
  })

  it("7500 bp → critical", () => {
    expect(grau(75, 100)).toBe("critical")
  })
})

describe("W — dimensão de severidade indisponível: sem Event, com auditoria", () => {
  // severity_dimension = share_amount_bp, com sinal misto → participação lacuna.
  const r = detectar(
    [
      ...preencher(4, "2026-09-04", 900_000),
      contrato("2026-10-01", -5_000_000),
      ...preencher(2, "2026-10-01", 100_000),
    ],
    {},
    comConfig({ severity_dimension: "share_amount_bp", material_count: 3 }),
  )

  it("o fato É material por contagem", () => {
    expect(r.summary.material).toBe(true)
    expect(r.summary.target?.contract_count).toBe(4)
  })

  it("severity é null — não fabricada", () => {
    expect(r.summary.severity).toBeNull()
  })

  it("nenhum Event é emitido", () => {
    expect(r.event).toBeNull()
    expect(r.summary.emitted).toBe(false)
  })

  it("o motivo é tipado e específico", () => {
    expect(r.summary.not_emitted_reason).toBe("SEVERITY_DIMENSION_UNAVAILABLE")
  })

  it("a lacuna exata fica registrada", () => {
    expect(r.summary.severity_gap).toContain("share_amount_bp")
    expect(r.summary.severity_gap).toContain("BUSINESS_RULE_PENDING")
  })

  it("o resultado auditável preserva buckets, população e alvo", () => {
    expect(r.summary.buckets.length).toBeGreaterThan(0)
    expect(r.summary.population.eligible_contracts).toBe(7)
    expect(r.summary.target).not.toBeNull()
    expect(isOk(r.summary.target?.share_count_bp ?? ({ gap: "x" } as never))).toBe(true)
  })

  it("trocar para a dimensão que existe libera a emissão", () => {
    const r2 = detectar(
      [
        ...preencher(4, "2026-09-04", 900_000),
        contrato("2026-10-01", -5_000_000),
        ...preencher(2, "2026-10-01", 100_000),
      ],
      {},
      comConfig({ severity_dimension: "share_count_bp", material_count: 3 }),
    )
    expect(r2.summary.severity).not.toBeNull()
    expect(r2.event).not.toBeNull()
  })

  it("participação em quantidade em lacuna também bloqueia", () => {
    const vazio = detectar([contrato(null), contrato("lixo")])
    expect(vazio.summary.severity).toBeNull()
    expect(vazio.event).toBeNull()
  })
})

describe("janelas: só as configuradas, e sempre com referência explícita", () => {
  const distribuido = (): DueContractRecord[] => [
    ...preencher(2, "2026-09-04"),
    ...preencher(3, "2026-09-20"),
    ...preencher(4, "2026-10-05"),
  ]

  it("same_day não precisa de referência", () => {
    expect(() => detectar(distribuido(), {}, comConfig({ window: { mode: "same_day" } }))).not.toThrow()
  })

  it("calendar_month SEM reference_date falha fechado — nunca Date.now", () => {
    expect(() =>
      detectar(distribuido(), {}, comConfig({ window: { mode: "calendar_month", months_ahead: 1 } })),
    ).toThrowError(/reference_date obrigatória/)
  })

  it("next_n_days SEM reference_date falha fechado", () => {
    expect(() =>
      detectar(distribuido(), {}, comConfig({ window: { mode: "next_n_days", days: 30 } })),
    ).toThrowError(/reference_date obrigatória/)
  })

  it("calendar_month agrega o mês inteiro", () => {
    const r = detectar(
      distribuido(),
      {
        reference_date: "2026-08-16",
        aggregate_provenance: [
          provenanceDoAlvo({
            start: "2026-09-01",
            end: "2026-09-30",
            claims: ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"],
            window_mode: "calendar_month",
            reference_date: "2026-08-16",
          }),
        ],
      },
      comConfig({ window: { mode: "calendar_month", months_ahead: 1 }, material_count: 1 }),
    )
    // Setembro: 2 + 3 = 5 contratos, de 9 elegíveis.
    expect(r.summary.target?.contract_count).toBe(5)
    expect(r.summary.target?.window).toEqual({ start: "2026-09-01", end: "2026-09-30" })
    expect(r.summary.target?.dates).toEqual(["2026-09-04", "2026-09-20"])
  })

  it("next_n_days respeita a referência inclusive", () => {
    const r = detectar(
      distribuido(),
      {
        reference_date: "2026-09-04",
        aggregate_provenance: [
          provenanceDoAlvo({
            start: "2026-09-04",
            end: "2026-09-20",
            claims: ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"],
            window_mode: "next_n_days",
            reference_date: "2026-09-04",
          }),
        ],
      },
      comConfig({ window: { mode: "next_n_days", days: 17 }, material_count: 1 }),
    )
    // 04/09 a 20/09 inclusive: 2 + 3 = 5.
    expect(r.summary.target?.window).toEqual({ start: "2026-09-04", end: "2026-09-20" })
    expect(r.summary.target?.contract_count).toBe(5)
  })

  it("janela sem nenhum vencimento produz alvo vazio, não lacuna silenciosa", () => {
    const r = detectar(
      distribuido(),
      { reference_date: "2027-01-01" },
      comConfig({ window: { mode: "next_n_days", days: 5 }, material_count: 1 }),
    )
    expect(r.summary.target?.contract_count).toBe(0)
    expect(r.summary.target?.dates).toEqual([])
    expect(r.summary.material).toBe(false)
    expect(r.event).toBeNull()
  })

  it("os buckets diários continuam completos mesmo com janela agregada", () => {
    const r = detectar(
      distribuido(),
      {
        reference_date: "2026-08-16",
        aggregate_provenance: [
          provenanceDoAlvo({
            start: "2026-09-01",
            end: "2026-09-30",
            claims: ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"],
            window_mode: "calendar_month",
            reference_date: "2026-08-16",
          }),
        ],
      },
      comConfig({ window: { mode: "calendar_month", months_ahead: 1 }, material_count: 1 }),
    )
    expect(r.summary.buckets).toHaveLength(3)
  })

  it("modo de janela inválido é recusado na config", () => {
    expect(() => comConfigValidada({ window: { mode: "semana_critica" } })).toThrowError(/mode/)
  })
})

describe("X/Y/Z — determinismo e identidade", () => {
  const casos = (): DueContractRecord[] => [
    ...preencher(5, "2026-09-04"),
    ...preencher(2, "2026-09-10"),
  ]

  it("X — mesma entrada, config e detected_at: deep-equal", () => {
    const c = casos()
    expect(structuredClone(detectar(c))).toEqual(structuredClone(detectar(c)))
  })

  it("Y — reingestão com outro snapshot_id mantém a identidade", () => {
    const c = casos()
    const outro = rawSnapshot({
      snapshot_id: "snap_reingerido",
      source_system: "google_sheets",
      dataset_id: "ds_vendas",
    }) as unknown as Snapshot
    const evs = evidence.map((e) => ({ ...e, snapshot_id: "snap_reingerido" })) as Evidence[]
    const reingerido = c.map((x) => ({ ...x, snapshot_id: "snap_reingerido" }))

    const a = detectar(c)
    const b = detectar(reingerido, { snapshots: [outro], evidence: evs })
    expect(b.summary.event_id).toBe(a.summary.event_id)
  })

  it("Z — dataset diferente com os mesmos valores muda a identidade", () => {
    const c = casos()
    const outro = rawSnapshot({
      snapshot_id: "snap_outro_ds",
      source_system: "google_sheets",
      dataset_id: "ds_outro",
    }) as unknown as Snapshot
    const evs = evidence.map((e) => ({
      ...e,
      snapshot_id: "snap_outro_ds",
      locator: { ...e.locator, dataset_id: "ds_outro" },
    })) as Evidence[]
    const noOutro = c.map((x) => ({ ...x, snapshot_id: "snap_outro_ds" }))

    const a = detectar(c)
    const alvo = alvoSameDayIndependente(noOutro)
    if (alvo === null) throw new Error("fixture")
    const b = detectar(noOutro, {
      snapshots: [outro],
      evidence: evs,
      aggregate_provenance: [
        provenanceDoAlvo(alvo, "ev_agregado", [
          { source_system: "google_sheets", dataset_id: "ds_outro" },
        ]),
      ],
    })
    expect(b.summary.event_id).not.toBe(a.summary.event_id)
  })

  it("alvo diferente é fato diferente", () => {
    const a = detectar([...preencher(5, "2026-09-04"), ...preencher(2, "2026-09-10")])
    const b = detectar([...preencher(5, "2026-10-04"), ...preencher(2, "2026-10-10")])
    expect(b.summary.event_id).not.toBe(a.summary.event_id)
  })

  it("modo de janela diferente é fato diferente", () => {
    const c = casos()
    const a = detectar(c)
    const b = detectar(
      c,
      {
        reference_date: "2026-09-01",
        aggregate_provenance: [
          provenanceDoAlvo({
            start: "2026-09-01",
            end: "2026-09-30",
            claims: ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"],
            window_mode: "calendar_month",
            reference_date: "2026-09-01",
          }),
        ],
      },
      comConfig({ window: { mode: "calendar_month", months_ahead: 0 } }),
    )
    expect(b.summary.event_id).not.toBe(a.summary.event_id)
  })

  it("a política de severidade NÃO entra na identidade do FATO", () => {
    /**
     * Duas identidades diferentes, e as duas estão certas:
     *
     *   event_id       identifica o FATO — concentração naquele dia, naquele
     *                  dataset, naquele período. Trocar a escala de severidade
     *                  não muda o fato, muda o grau atribuído a ele.
     *
     *   computation_id identifica o que a EVIDÊNCIA precisa sustentar. Aí a
     *                  dimensão de severidade entra, porque o evento passa a
     *                  afirmar uma razão diferente.
     *
     * Por isso este teste precisa de provenance própria: o fato é o mesmo, a
     * prova exigida não é.
     */
    const c = casos()
    const a = detectar(c)
    const alvo = alvoSameDayIndependente(c, "share_amount_bp")
    if (alvo === null) throw new Error("fixture")
    const b = detectar(
      c,
      { aggregate_provenance: [provenanceDoAlvo(alvo)] },
      comConfig({ severity_dimension: "share_amount_bp" }),
    )
    expect(b.summary.event_id).toBe(a.summary.event_id)
  })

  it("mas ENTRA na identidade da computação da evidência", () => {
    const base = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["amount_cents", "contract_count", "share_count_bp"],
    }).computation_id
    const comValor = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"],
    }).computation_id
    expect(comValor).not.toBe(base)
  })

  it("o id casa com o padrão do contrato", () => {
    expect(detectar(casos()).summary.event_id).toMatch(/^evt_[a-f0-9]{16}$/)
  })
})

describe("evento válido contra o contrato", () => {
  const r = detectar([...preencher(5, "2026-09-04"), ...preencher(2, "2026-09-10")])

  it("passa schema + semântica", () => {
    expect(r.event).not.toBeNull()
    expect(() => assertValid("event", r.event)).not.toThrow()
  })

  it("event_type é first_due_date_concentration", () => {
    expect(r.event?.event_type).toBe("first_due_date_concentration")
  })

  it("a métrica principal traz fórmula e contagem", () => {
    const m = r.event?.observed_metric as { name?: string; value?: number; formula?: string }
    expect(m.name).toBe("contratos_com_primeiro_vencimento_no_alvo")
    expect(m.value).toBe(5)
    expect(m.formula).toBe(FORMULA_COUNT)
  })

  it("a evidência agregada está nos refs", () => {
    expect(r.event?.evidence_refs).toContain("ev_agregado")
  })
})

// ── AD ──
describe("AD — nenhuma previsão e nenhuma causalidade na saída", () => {
  const r = detectar([...preencher(5, "2026-09-04"), ...preencher(2, "2026-09-10")])

  it("o payload não contém vocabulário de previsão", () => {
    const texto = JSON.stringify(r).toLowerCase()
    for (const proibido of [
      "forecast",
      "inadimpl",
      "delinquen",
      "projet",
      "expected_default",
      "probabilidade",
      "confidence_bp",
      "range_low",
      "range_high",
    ]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })

  it("nem vocabulário causal", () => {
    const texto = JSON.stringify(r).toLowerCase()
    for (const proibido of ["caused", "causar", "responsible", "would have", "prevented", "risco de"]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })

  it("a classe de dado nunca é inferred nem forecast", () => {
    const texto = JSON.stringify(r)
    expect(texto).not.toContain('"inferred"')
    expect(texto).not.toContain('"forecast"')
  })

  it("a referência é lacuna nomeada por observação, não por projeção", () => {
    const m = r.event?.reference_metric as { name?: string; data_class?: string }
    expect(m.data_class).toBe("gap")
    expect(m.name).toContain("primeiro_vencimento")
    expect(m.name).not.toContain("inadimplencia")
  })

  it("as fórmulas descrevem contagem e soma, não previsão", () => {
    expect(FORMULA_COUNT).toContain("count(")
    expect(FORMULA_COUNT.toLowerCase()).not.toMatch(/forecast|expect|project|caus/)
  })
})

describe("AA/AB/AC — imutabilidade e ownership", () => {
  const inputMutavel = (): FirstDueDetectorInput => {
    const contracts: DueContractRecord[] = ["2026-09-04", "2026-09-04", "2026-09-04", "2026-09-10"].map(
      (d) => ({
        subject_ref: subjectRef(),
        unit: MATCHED,
        first_due_date_raw: d,
        amount_cents: 100_000,
        evidence_refs: ["ev_linha"],
        snapshot_id: "snap_vendas",
      }),
    )
    return {
      detected_at: DETECTED_AT,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      contracts,
      snapshots,
      evidence,
      aggregate_evidence_ref: "ev_agregado",
      aggregate_provenance: (() => {
        const a = alvoSameDayIndependente(contracts)
        return a === null ? [] : [provenanceDoAlvo(a)]
      })(),
    }
  }

  it("AB — nenhum objeto do input é alcançável a partir do output", () => {
    const input = inputMutavel()
    const r = detectFirstDueDateConcentration(input, TEST_CONFIG)
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

  describe("AC — mutar o input depois não altera o resultado", () => {
    const input = inputMutavel()
    const r1 = detectFirstDueDateConcentration(input, TEST_CONFIG)
    const antes = structuredClone(r1) as unknown

    it("o input É mutável e recebe a forja", () => {
      ;(input.contracts[0]?.evidence_refs as string[]).push("forged")
      expect(input.contracts[0]?.evidence_refs).toContain("forged")
    })

    it("e o resultado anterior segue idêntico", () => {
      expect(structuredClone(r1)).toEqual(antes)
      expect(JSON.stringify(r1)).not.toContain("forged")
    })
  })

  it("AB — o input não é congelado como efeito colateral", () => {
    const input = inputMutavel()
    detectFirstDueDateConcentration(input, TEST_CONFIG)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.contracts)).toBe(false)
    expect(Object.isFrozen(input.contracts[0])).toBe(false)
    expect(Object.isFrozen(input.contracts[0]?.evidence_refs)).toBe(false)
  })

  const r = detectar([...preencher(5, "2026-09-04"), ...preencher(2, "2026-09-10")])

  it("AA — Object.isFrozen em cada nível do grafo", () => {
    const alvos: readonly [string, unknown][] = [
      ["result", r],
      ["summary", r.summary],
      ["population", r.summary.population],
      ["population.excluded", r.summary.population.excluded],
      ["buckets", r.summary.buckets],
      ["buckets[0]", r.summary.buckets[0]],
      ["buckets[0].share_count_bp", r.summary.buckets[0]?.share_count_bp],
      ["buckets[0].subject_refs", r.summary.buckets[0]?.subject_refs],
      ["target", r.summary.target],
      ["target.window", r.summary.target?.window],
      ["target.dates", r.summary.target?.dates],
      ["event", r.event],
      ["event.materiality", r.event?.materiality],
      ["event.evidence_refs", r.event?.evidence_refs],
      ["event.snapshot_ids", r.event?.snapshot_ids],
      ["event.data_quality", r.event?.data_quality],
    ]
    for (const [nome, alvo] of alvos) {
      expect(alvo, `${nome} deveria existir`).toBeDefined()
      expect(Object.isFrozen(alvo), `${nome} deveria estar congelado`).toBe(true)
    }
  })

  it("AA — cada mutação aninhada lança e o estado não muda", () => {
    const antes = structuredClone(r) as unknown
    const tentativas: readonly [string, () => void][] = [
      ["population.excluded", () => ((r.summary.population.excluded as Record<string, number>).MISSING_DUE_DATE = 9)],
      ["bucket.count", () => ((r.summary.buckets[0] as { contract_count: number }).contract_count = 0)],
      ["share value", () => ((r.summary.buckets[0]?.share_count_bp as { value: number }).value = 0)],
      ["buckets.push", () => (r.summary.buckets as unknown[]).push({ forged: true })],
      ["target.dates.push", () => (r.summary.target?.dates as string[]).push("2099-01-01")],
      ["subject_refs.push", () => (r.summary.buckets[0]?.subject_refs as string[]).push("forged")],
      ["event.evidence_refs.push", () => (r.event?.evidence_refs as string[]).push("forged")],
      ["materiality", () => ((r.event?.materiality as { count: number }).count = 0)],
      ["root", () => ((r as unknown as { event: null }).event = null)],
    ]
    for (const [nome, mutar] of tentativas) {
      expect(mutar, nome).toThrowError(TypeError)
    }
    expect(structuredClone(r)).toEqual(antes)
  })

  it("AA — resultado sem evento também é congelado por inteiro", () => {
    const r0 = detectar([contrato(null), contrato("lixo")])
    expect(r0.event).toBeNull()
    expect(Object.isFrozen(r0)).toBe(true)
    expect(Object.isFrozen(r0.summary)).toBe(true)
    expect(Object.isFrozen(r0.summary.buckets)).toBe(true)
    expect(() => ((r0.summary as { material: boolean }).material = true)).toThrowError(TypeError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/** Passa a config sintética alterada pelo validador REAL. */
function comConfigValidada(campos: Record<string, unknown>): DetectorConfig {
  return validateDetectorConfig(comConfig(campos))
}

describe("H — a ordem de concentração é total, não herdada do runtime", () => {
  /**
   * Por que este bloco existe: um mutante que trocava o desempate por data por
   * `return 0` passou por TODOS os testes anteriores. `buckets` já chega ordenado
   * por data e `Array.sort` é estável no V8, então a data mais antiga vencia por
   * acidente do motor. Testar o comparador direto, contra entrada embaralhada,
   * transforma o acidente em garantia.
   */
  const bucket = (date: string, count: number, share: number, valor: number | null): DueBucket => ({
    date,
    contract_count: count,
    share_count_bp: observed(share),
    amount_cents: valor === null ? gap<number>("DATA_NOT_AVAILABLE", "calculated", "x") : observed(valor),
    share_amount_bp: gap<number>("DATA_NOT_AVAILABLE", "calculated", "x"),
    subject_refs: [],
    evidence_refs: [],
  })

  it("participação maior vem primeiro, em qualquer ordem de entrada", () => {
    const a = bucket("2026-12-01", 1, 1000, 100)
    const b = bucket("2026-01-01", 5, 5000, 100)
    expect([a, b].sort(compararConcentracao)[0]?.date).toBe("2026-01-01")
    expect([b, a].sort(compararConcentracao)[0]?.date).toBe("2026-01-01")
  })

  it("com participação igual, o maior valor vence — nas duas ordens", () => {
    const antigo = bucket("2026-01-01", 3, 3000, 100)
    const rico = bucket("2026-12-01", 3, 3000, 900)
    expect([antigo, rico].sort(compararConcentracao)[0]?.date).toBe("2026-12-01")
    expect([rico, antigo].sort(compararConcentracao)[0]?.date).toBe("2026-12-01")
  })

  it("com participação E valor iguais, a data ascendente vence — nas duas ordens", () => {
    const cedo = bucket("2026-01-01", 3, 3000, 500)
    const tarde = bucket("2026-12-01", 3, 3000, 500)
    expect([cedo, tarde].sort(compararConcentracao)[0]?.date).toBe("2026-01-01")
    // A ordem INVERTIDA é o caso que o mutante `return 0` passava indevidamente.
    expect([tarde, cedo].sort(compararConcentracao)[0]?.date).toBe("2026-01-01")
  })

  it("todas as permutações de três empatados dão o mesmo vencedor", () => {
    const x = bucket("2026-03-01", 2, 2000, 100)
    const y = bucket("2026-02-01", 2, 2000, 100)
    const z = bucket("2026-01-01", 2, 2000, 100)
    const permutacoes = [
      [x, y, z], [x, z, y], [y, x, z], [y, z, x], [z, x, y], [z, y, x],
    ]
    const vencedores = new Set(permutacoes.map((p) => [...p].sort(compararConcentracao)[0]?.date))
    expect(vencedores).toEqual(new Set(["2026-01-01"]))
  })

  it("o comparador é antissimétrico e transitivo nos empates", () => {
    const cedo = bucket("2026-01-01", 3, 3000, 500)
    const tarde = bucket("2026-12-01", 3, 3000, 500)
    expect(compararConcentracao(cedo, tarde)).toBeLessThan(0)
    expect(compararConcentracao(tarde, cedo)).toBeGreaterThan(0)
    expect(compararConcentracao(cedo, cedo)).toBe(0)
  })

  it("valor em lacuna perde de valor conhecido, sem virar zero", () => {
    const semValor = bucket("2026-01-01", 3, 3000, null)
    const comValor = bucket("2026-12-01", 3, 3000, 1)
    expect([semValor, comValor].sort(compararConcentracao)[0]?.date).toBe("2026-12-01")
    expect([comValor, semValor].sort(compararConcentracao)[0]?.date).toBe("2026-12-01")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correções do gate adversarial da Fase 2.5
// ═════════════════════════════════════════════════════════════════════════════

describe("HIGH-1 — data civil ESTRITA, casamento total", () => {
  const validos: readonly [string, string][] = [
    ["2026-08-04", "2026-08-04"],
    ["04/08/2026", "2026-08-04"],
    ["4/8/2026", "2026-08-04"],
    ["04-08-2026", "2026-08-04"],
    ["4-8-2026", "2026-08-04"],
    ["29/02/2024", "2024-02-29"],
    ["2024-02-29", "2024-02-29"],
  ]

  for (const [entrada2, esperado] of validos) {
    it(`aceita ${entrada2} → ${esperado}`, () => {
      expect(parseCivilDateStrict(entrada2)).toBe(esperado)
    })
  }

  const invalidos: readonly string[] = [
    "2026-08-04garbage",
    "2026-08-04T00:00:00Z",
    "2026-08-04T23:30:00-03:00",
    "2026-08-04 00:00",
    "x2026-08-04",
    " 2026-08-04",
    "2026-08-04 ",
    "31/02/2026",
    "29/02/2025",
    "00/08/2026",
    "04/13/2026",
    "04/00/2026",
    "32/01/2026",
    "04/08/26",
    "04/08-2026",
    "2026/08/04",
    "08/04/2026 (US)",
    "",
    "N/A",
  ]

  for (const ruim of invalidos) {
    it(`recusa ${JSON.stringify(ruim)}`, () => {
      expect(parseCivilDateStrict(ruim)).toBeNull()
    })
  }

  it("recusa número — serial de planilha não declara epoch", () => {
    expect(parseCivilDateStrict(46234)).toBeNull()
    expect(parseCivilDateStrict(0)).toBeNull()
  })

  it("recusa null/undefined/objeto", () => {
    for (const x of [null, undefined, {}, [], true]) {
      expect(parseCivilDateStrict(x)).toBeNull()
    }
  })

  it("04/13/2026 NÃO é reinterpretado como formato americano", () => {
    // Mês 13 não existe. Recusar é diferente de virar 2026-04-13.
    expect(parseCivilDateStrict("04/13/2026")).toBeNull()
  })

  describe("o timestamp é recusado NO DETECTOR, não só na primitiva", () => {
    const r = detectar([
      contrato("2026-08-04T23:30:00-03:00"),
      contrato("2026-08-04garbage"),
      ...preencher(4, "2026-08-04"),
    ])

    it("as duas formas entram como INVÁLIDAS, não no bucket", () => {
      expect(r.summary.population.excluded.INVALID_DUE_DATE).toBe(2)
      expect(r.summary.population.eligible_contracts).toBe(4)
      expect(bucketDe(r, "2026-08-04")?.contract_count).toBe(4)
    })

    it("e a qualidade cai", () => {
      expect(r.summary.quality_status).not.toBe("ok")
    })
  })

  it("o bucket não depende do fuso do processo", () => {
    // A canonicalização é puramente lexical: sem `new Date`, sem offset. Um
    // timestamp de 23:30 em -03:00 seria 2026-08-05 em UTC — e por isso é
    // recusado em vez de atribuído a um dos dois dias.
    const original = process.env["TZ"]
    try {
      for (const tz of ["UTC", "America/Sao_Paulo", "Pacific/Kiritimati", "Etc/GMT+12"]) {
        process.env["TZ"] = tz
        expect(parseCivilDateStrict("2026-08-04"), tz).toBe("2026-08-04")
        expect(parseCivilDateStrict("04/08/2026"), tz).toBe("2026-08-04")
      }
    } finally {
      if (original === undefined) delete process.env["TZ"]
      else process.env["TZ"] = original
    }
  })

  it("`parseDateISO` global segue permissivo — não foi alterado", () => {
    // A correção é ADITIVA. Mudar o parser do motor trocaria um defeito
    // localizado por uma regressão espalhada nos consumidores já aprovados.
    expect(parseDateISO("2026-08-04T23:30:00-03:00")).toBe("2026-08-04")
    expect(parseCivilDateStrict("2026-08-04T23:30:00-03:00")).toBeNull()
  })
})

describe("HIGH-2 — a qualidade da fonte atravessa até o evento", () => {
  const comSnapshot = (campos: Record<string, unknown>): Snapshot[] =>
    [{ ...(snapshots[0] as unknown as Record<string, unknown>), ...campos }] as unknown as Snapshot[]

  const material = (): DueContractRecord[] => [
    ...preencher(5, "2026-09-04"),
    ...preencher(2, "2026-09-10"),
  ]

  it("snapshot conflicted: o evento NUNCA é ok", () => {
    const r = detectar(material(), { snapshots: comSnapshot({ quality_status: "conflicted" }) })
    expect(r.summary.quality_status).toBe("conflicted")
    expect(r.event?.data_quality.quality_status).toBe("conflicted")
  })

  it("snapshot degraded: o evento NUNCA é ok", () => {
    const r = detectar(material(), { snapshots: comSnapshot({ quality_status: "degraded" }) })
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("snapshot insufficient propaga", () => {
    const r = detectar(material(), { snapshots: comSnapshot({ quality_status: "insufficient" }) })
    expect(r.summary.quality_status).toBe("insufficient")
  })

  it("conflicts populados tornam o evento conflicted, e os ids atravessam", () => {
    const r = detectar(material(), {
      snapshots: comSnapshot({
        conflicts: [
          {
            conflict_id: "conf_abc123",
            field: "first_due_date",
            versions: [],
            resolution_state: "unresolved",
          },
        ],
      }),
    })
    expect(r.summary.quality_status).toBe("conflicted")
    expect(r.event?.data_quality.conflict_ids).toContain("conf_abc123")
  })

  it("missing_fields do snapshot degradam", () => {
    const r = detectar(material(), { snapshots: comSnapshot({ missing_fields: ["primeiro_vencimento"] }) })
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("rows_skipped degradam — linha descartada é dado que não chegou", () => {
    const r = detectar(material(), { snapshots: comSnapshot({ rows_skipped: 3 }) })
    expect(r.summary.quality_status).not.toBe("ok")
  })

  it("a pior dependência vence: degraded + conflicted = conflicted", () => {
    const r = detectar([contrato("31/02/2026"), ...material()], {
      snapshots: comSnapshot({ quality_status: "conflicted" }),
    })
    expect(r.summary.quality_status).toBe("conflicted")
  })

  it("o lattice é compartilhado e a ordem é por severidade", () => {
    expect(severidadeDaQualidade("ok")).toBeLessThan(severidadeDaQualidade("degraded"))
    expect(severidadeDaQualidade("degraded")).toBeLessThan(severidadeDaQualidade("insufficient"))
    expect(severidadeDaQualidade("insufficient")).toBeLessThan(severidadeDaQualidade("conflicted"))
    expect(piorQualidade(["ok", "degraded", "conflicted"])).toBe("conflicted")
    expect(piorQualidade([])).toBe("ok")
  })

  it("com fonte limpa e dados completos, ok continua alcançável", () => {
    const r = detectar(material())
    expect(r.summary.quality_status).toBe("ok")
  })
})

describe("HIGH-3 — a lacuna financeira sobrevive no evento", () => {
  const semDinheiro = (): DueContractRecord[] => [
    ...preencher(4, "2026-09-04", null),
    ...preencher(2, "2026-09-10", null),
  ]

  describe("A — valor ausente com severidade por contagem", () => {
    const r = detectar(semDinheiro())

    it("o evento de CONTAGEM sai — métricas são independentes", () => {
      expect(r.event).not.toBeNull()
      const m = r.event?.observed_metric as { value?: number }
      expect(m.value).toBe(4)
    })

    it("mas o evento NÃO é ok", () => {
      expect(r.event?.data_quality.quality_status).not.toBe("ok")
    })

    it("as dimensões financeiras aparecem como ausentes", () => {
      expect(r.event?.data_quality.missing_fields).toContain("target_amount_cents")
      expect(r.event?.data_quality.missing_fields).toContain("target_share_amount_bp")
    })

    it("e nenhum valor parcial é publicado", () => {
      const mat = r.event?.materiality as { basis?: string; amount_cents?: number }
      expect(mat.basis).toBe("count")
      expect(mat.amount_cents).toBeUndefined()
    })

    it("o summary preserva o Gap exato e sua reason", () => {
      const v = r.summary.target?.amount_cents
      expect(v !== undefined && isOk(v)).toBe(false)
      if (v !== undefined && !isOk(v)) expect(v.gap).toBe("DATA_NOT_AVAILABLE")
    })
  })

  describe("B — overflow com severidade por contagem", () => {
    const r = detectar([
      ...preencher(4, "2026-09-04", Number.MAX_SAFE_INTEGER),
      ...preencher(2, "2026-09-10", Number.MAX_SAFE_INTEGER),
    ])

    it("o evento sai, mas não parece financeiramente completo", () => {
      expect(r.event).not.toBeNull()
      expect(r.event?.data_quality.quality_status).not.toBe("ok")
      expect(r.event?.data_quality.missing_fields).toContain("target_amount_cents")
    })

    it("nenhum valor aproximado após overflow", () => {
      const mat = r.event?.materiality as { amount_cents?: number }
      expect(mat.amount_cents).toBeUndefined()
      expect(JSON.stringify(r.event)).not.toContain("9007199254740991")
    })
  })

  describe("C — sinal misto: contagem intacta, dinheiro sinalizado", () => {
    const r = detectar([
      ...preencher(4, "2026-09-04", 900_000),
      contrato("2026-09-10", -5_000_000),
      ...preencher(2, "2026-09-10", 100_000),
    ])

    it("a contagem segue exata", () => {
      const q = r.summary.target?.share_count_bp
      expect(q !== undefined && isOk(q) && q.value).toBe(5714)
    })

    it("a participação em valor é lacuna e aparece no evento", () => {
      expect(r.event?.data_quality.missing_fields).toContain("target_share_amount_bp")
      expect(r.event?.data_quality.quality_status).not.toBe("ok")
    })
  })

  it("D — severity por VALOR com dinheiro em lacuna continua SEM evento", () => {
    const r = detectar(semDinheiro(), {}, comConfig({ severity_dimension: "share_amount_bp" }))
    expect(r.event).toBeNull()
    expect(r.summary.not_emitted_reason).toBe("SEVERITY_DIMENSION_UNAVAILABLE")
  })

  it("com dinheiro completo, missing_fields não aparece", () => {
    const r = detectar([...preencher(5, "2026-09-04"), ...preencher(2, "2026-09-10")])
    expect(r.event?.data_quality.missing_fields).toBeUndefined()
    expect(r.event?.data_quality.quality_status).toBe("ok")
  })
})

describe("HIGH-4 — a evidência tem de sustentar O ALVO", () => {
  const cincoEmQuatro = (): DueContractRecord[] => [
    ...preencher(5, "2026-09-04"),
    ...preencher(2, "2026-09-10"),
  ]

  const rodar = (
    contracts: readonly DueContractRecord[],
    provenance: readonly ComputedEvidenceProvenance[],
    extra: Partial<FirstDueDetectorInput> = {},
    config: DetectorConfig = TEST_CONFIG,
  ): ReturnType<typeof detectar> =>
    detectar(contracts, { aggregate_provenance: provenance, ...extra }, config)

  /**
   * O que um evento com severidade por CONTAGEM e dinheiro disponível afirma.
   *
   * Não é "todas as claims possíveis" — é a lista derivada do evento real. A
   * versão anterior deste helper omitia as participações, e foi exatamente por
   * isso que os testes não atacavam o furo que o gate encontrou.
   */
  const CLAIMS_POR_CONTAGEM: readonly FirstDueClaim[] = [
    "amount_cents",
    "contract_count",
    "share_amount_bp",
    "share_count_bp",
  ]

  // ── A ──
  it("A — evidência ancorada em 2026-09-04, alvo real 2026-09-04: aceita", () => {
    const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
    expect(() => rodar(cincoEmQuatro(), [p])).not.toThrow()
  })

  // ── B — O ATAQUE ──
  describe("B — evidência de 04 usada para alvo 05", () => {
    /**
     * As duas datas vivem no MESMO snapshot e MESMO dataset. Ownership estrutural
     * não distingue uma da outra: só a âncora sabe qual dia a evidência agrega.
     */
    const cincoEmCinco = (): DueContractRecord[] => [
      ...preencher(5, "2026-09-05"),
      ...preencher(2, "2026-09-10"),
    ]

    it("o snapshot e o dataset estão corretos — o ataque não é de ownership", () => {
      const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
      expect(p.evidence_ref).toBe("ev_agregado")
    })

    it("FALHA FECHADA — nenhum evento sustentado pela prova do dia errado", () => {
      const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
      expect(() => rodar(cincoEmCinco(), [p])).toThrowError(/não corresponde ao alvo/)
    })

    it("a recusa nomeia o alvo calculado e as duas identidades", () => {
      const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
      try {
        rodar(cincoEmCinco(), [p])
        expect.unreachable("deveria ter recusado")
      } catch (e) {
        const msg = (e as GatewayError).message
        expect(msg).toContain("2026-09-05")
        expect(msg).toContain(p.computation_id)
      }
    })
  })

  // ── C ──
  it("C — claim errada: evidência só de contagem não prova dinheiro", () => {
    const soContagem = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["contract_count"],
    })
    // O alvo TEM dinheiro, então o claim_set esperado inclui amount_cents.
    expect(() => rodar(cincoEmQuatro(), [soContagem])).toThrowError(/não corresponde ao alvo/)
  })

  it("C — e quando o dinheiro é lacuna, a claim de contagem é a correta", () => {
    const semDinheiro = [...preencher(5, "2026-09-04", null), ...preencher(2, "2026-09-10", null)]
    const soContagem = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["contract_count", "share_count_bp"],
    })
    expect(() => rodar(semDinheiro, [soContagem])).not.toThrow()
  })

  it("C — mas a claim de dinheiro NÃO é aceita quando o dinheiro não existe", () => {
    const semDinheiro = [...preencher(5, "2026-09-04", null), ...preencher(2, "2026-09-10", null)]
    const comDinheiro = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
    expect(() => rodar(semDinheiro, [comDinheiro])).toThrowError(/não corresponde ao alvo/)
  })

  // ── D ──
  it("D — evidência de same_day usada em calendar_month: rejeita", () => {
    const p = provenanceDoAlvo({ start: "2026-09-01", end: "2026-09-30", claims: CLAIMS_POR_CONTAGEM })
    expect(() =>
      rodar(
        cincoEmQuatro(),
        [p],
        { reference_date: "2026-08-16" },
        comConfig({ window: { mode: "calendar_month", months_ahead: 1 }, material_count: 1 }),
      ),
    ).toThrowError(/não corresponde ao alvo/)
  })

  // ── E ──
  it("E — next_n_days com boundary diferente: rejeita", () => {
    const errado = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-21",
      claims: CLAIMS_POR_CONTAGEM,
      window_mode: "next_n_days",
      reference_date: "2026-09-04",
    })
    expect(() =>
      rodar(
        cincoEmQuatro(),
        [errado],
        { reference_date: "2026-09-04" },
        comConfig({ window: { mode: "next_n_days", days: 17 }, material_count: 1 }),
      ),
    ).toThrowError(/não corresponde ao alvo/)
  })

  // ── F ──
  it("F — dataset errado no escopo da âncora: rejeita", () => {
    const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM }, "ev_agregado", [
      { source_system: "google_sheets", dataset_id: "ds_outro" },
    ])
    expect(() => rodar(cincoEmQuatro(), [p])).toThrowError(/não corresponde ao alvo/)
  })

  // ── G ──
  it("G — provenance ausente: rejeita", () => {
    expect(() => rodar(cincoEmQuatro(), [])).toThrowError(/sem provenance/)
  })

  it("G — âncora para OUTRA evidência não conta", () => {
    const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM }, "ev_linha")
    expect(() => rodar(cincoEmQuatro(), [p])).toThrowError(/sem provenance/)
  })

  // ── H ──
  it("H — computation_id divergente: rejeita", () => {
    const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
    const adulterada = { ...p, computation_id: `cfc_${"0".repeat(16)}` }
    expect(() => rodar(cincoEmQuatro(), [adulterada])).toThrowError(/não corresponde ao alvo/)
  })

  it("versão de provenance desconhecida: rejeita", () => {
    const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
    expect(() => rodar(cincoEmQuatro(), [{ ...p, provenance_version: "9.9.9" }])).toThrowError(
      /desconhecida/,
    )
  })

  it("mesma evidência com duas computation_ids: falha fechada", () => {
    const a = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
    const b = provenanceDoAlvo({ start: "2026-09-10", end: "2026-09-10", claims: CLAIMS_POR_CONTAGEM })
    expect(() => rodar(cincoEmQuatro(), [a, b])).toThrowError(/conflito com/)
  })

  // ── I ──
  it("I — fórmula perfeita não salva âncora divergente: fórmula não é autoridade", () => {
    const evComFormulaPerfeita = rawEvidence({
      evidence_id: "ev_agregado",
      snapshot_id: "snap_vendas",
      kind: "computed",
      locator: { dataset_id: "ds_vendas", sheet: "Vendas", column: "Primeiro vencimento" },
      formula: "count(elegiveis where first_due_date in 2026-09-05)",
    }) as unknown as Evidence
    const p = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM })
    expect(() =>
      rodar([...preencher(5, "2026-09-05"), ...preencher(2, "2026-09-10")], [p], {
        evidence: [evidence[0] as Evidence, evComFormulaPerfeita],
      }),
    ).toThrowError(/não corresponde ao alvo/)
  })

  it("a identidade da computação NÃO inclui evidence_ref", () => {
    const base = { start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM } as const
    expect(provenanceDoAlvo(base, "ev_a").computation_id).toBe(
      provenanceDoAlvo(base, "ev_b").computation_id,
    )
  })

  it("a identidade distingue alvo, janela, período e escopo", () => {
    const base = provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM }).computation_id
    expect(provenanceDoAlvo({ start: "2026-09-05", end: "2026-09-05", claims: CLAIMS_POR_CONTAGEM }).computation_id).not.toBe(base)
    expect(
      provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM, window_mode: "next_n_days", reference_date: "2026-09-04" }).computation_id,
    ).not.toBe(base)
    expect(
      provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims: ["contract_count"] }).computation_id,
    ).not.toBe(base)
  })

  it("a ordem do escopo e das claims não muda a identidade", () => {
    const dois = [
      { source_system: "google_sheets", dataset_id: "ds_a" },
      { source_system: "bitrix24", dataset_id: "ds_b" },
    ]
    const alvo = { start: "2026-09-04", end: "2026-09-04", claims: CLAIMS_POR_CONTAGEM } as const
    expect(provenanceDoAlvo(alvo, "ev", dois).computation_id).toBe(
      provenanceDoAlvo(alvo, "ev", [...dois].reverse()).computation_id,
    )
    expect(
      provenanceDoAlvo({ ...alvo, claims: ["contract_count", "amount_cents"] }).computation_id,
    ).toBe(provenanceDoAlvo({ ...alvo, claims: ["amount_cents", "contract_count"] }).computation_id)
  })

  it("multi-dataset continua falhando fechado antes de chegar à provenance", () => {
    const outroSnap = rawSnapshot({
      snapshot_id: "snap_outro",
      source_system: "bitrix24",
      dataset_id: "ds_outro",
    }) as unknown as Snapshot
    const evLinha = rawEvidence({
      evidence_id: "ev_linha_outro",
      snapshot_id: "snap_outro",
      kind: "row",
      locator: { dataset_id: "ds_outro", sheet: "Vendas", row_key: "b".repeat(64) },
    }) as unknown as Evidence
    const doOutro: DueContractRecord = {
      subject_ref: subjectRef(),
      unit: MATCHED,
      first_due_date_raw: "2026-09-04",
      amount_cents: 100_000,
      evidence_refs: ["ev_linha_outro"],
      snapshot_id: "snap_outro",
    }
    expect(() =>
      rodar([...cincoEmQuatro(), doOutro], [], {
        snapshots: [snapshots[0] as Snapshot, outroSnap],
        evidence: [...evidence, evLinha],
      }),
    ).toThrowError(/escopos governados/)
  })

  it("sem evento material, a provenance do alvo não é exigida", () => {
    // Nada a provar: nenhum número executivo é afirmado.
    const r = rodar(preencher(2, "2026-09-04"), [], {}, comConfig({ minimum_sample_size: 5 }))
    expect(r.event).toBeNull()
    expect(r.summary.buckets.length).toBeGreaterThan(0)
  })
})

describe("claim_set — a evidência tem de sustentar as RAZÕES, não só os numeradores", () => {
  /**
   * O furo que este bloco fecha: evidência do numerador não prova a razão.
   *
   * Quem calculou "900.000 vencem em 04/09" não afirmou, por isso, que
   * "900.000 ÷ 1.200.000 = 7500 bp" — a razão depende de um denominador (a
   * população elegível daquele período e escopo) que a evidência do numerador
   * não conhece. A severidade do evento vem justamente dessa razão.
   */
  const comDinheiro = (): DueContractRecord[] => [
    ...preencher(5, "2026-09-04", 300_000),
    ...preencher(2, "2026-09-10", 100_000),
  ]

  const semDinheiro = (): DueContractRecord[] => [
    ...preencher(5, "2026-09-04", null),
    ...preencher(2, "2026-09-10", null),
  ]

  const rodarCom = (
    contracts: readonly DueContractRecord[],
    claims: readonly FirstDueClaim[],
    dimensao: "share_count_bp" | "share_amount_bp",
  ): ReturnType<typeof detectar> =>
    detectar(
      contracts,
      {
        aggregate_provenance: [
          provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims }),
        ],
      },
      comConfig({ severity_dimension: dimensao }),
    )

  // ── A ──
  it("A — severity por VALOR, provenance sem share_amount_bp: REJEITA", () => {
    expect(() =>
      rodarCom(comDinheiro(), ["contract_count", "amount_cents", "share_count_bp"], "share_amount_bp"),
    ).toThrowError(/não corresponde ao alvo/)
  })

  it("A — `amount_cents` presente NÃO dispensa `share_amount_bp`", () => {
    // O ponto exato: o numerador está declarado, a razão não. São duas
    // afirmações distintas.
    expect(() =>
      rodarCom(comDinheiro(), ["contract_count", "amount_cents"], "share_amount_bp"),
    ).toThrowError(/não corresponde ao alvo/)
  })

  // ── B ──
  it("B — com share_amount_bp declarada: aceita", () => {
    expect(() =>
      rodarCom(
        comDinheiro(),
        ["contract_count", "amount_cents", "share_count_bp", "share_amount_bp"],
        "share_amount_bp",
      ),
    ).not.toThrow()
  })

  // ── C ──
  it("C — severity por CONTAGEM, provenance só com contract_count: REJEITA", () => {
    expect(() => rodarCom(semDinheiro(), ["contract_count"], "share_count_bp")).toThrowError(
      /não corresponde ao alvo/,
    )
  })

  // ── D ──
  it("D — com share_count_bp declarada: aceita", () => {
    expect(() =>
      rodarCom(semDinheiro(), ["contract_count", "share_count_bp"], "share_count_bp"),
    ).not.toThrow()
  })

  // ── E ──
  it("E — count-only com lacuna de dinheiro NÃO exige claims financeiras", () => {
    const r = rodarCom(semDinheiro(), ["contract_count", "share_count_bp"], "share_count_bp")
    expect(r.event).not.toBeNull()
    // E o inverso: declarar dinheiro que o evento não afirma também é recusado.
    expect(() =>
      rodarCom(
        semDinheiro(),
        ["contract_count", "share_count_bp", "amount_cents"],
        "share_count_bp",
      ),
    ).toThrowError(/não corresponde ao alvo/)
  })

  it("E — nem exige share_amount_bp quando a participação em valor é lacuna", () => {
    expect(() =>
      rodarCom(
        semDinheiro(),
        ["contract_count", "share_count_bp", "share_amount_bp"],
        "share_count_bp",
      ),
    ).toThrowError(/não corresponde ao alvo/)
  })

  // ── F ──
  //
  // O teste anterior afirmava "severidade por contagem ⇒ share_amount_bp fora".
  // Estava incompleto, e o gate mostrou por quê: a regra olha se a razão FOI
  // USADA na decisão, não apenas quem gradua. Dois cenários, separados.
  describe("F — share_amount_bp entra quando DECIDE, sai quando é só calculável", () => {
    /**
     * 4 contratos de 900.000 em 04/09, 3 de 100.000 em 10/09.
     * Alvo = 04/09 (4 > 3). share_count = 5714 bp. share_amount = 9231 bp.
     */
    const cenario = (): DueContractRecord[] => [
      ...preencher(4, "2026-09-04", 900_000),
      ...preencher(3, "2026-09-10", 100_000),
    ]

    /** Só `share_amount_bp` cruza. Severidade segue por contagem. */
    const soPorValorRelativo = comConfig({
      severity_dimension: "share_count_bp",
      minimum_sample_size: 1,
      material_count: 999_999,
      material_share_count_bp: 6000,
      material_amount_cents: 9_000_000,
      material_share_amount_bp: 9000,
    })

    /** Nada de valor relativo cruza; `share_count_bp` cruza. */
    const soPorContagemRelativa = comConfig({
      severity_dimension: "share_count_bp",
      minimum_sample_size: 1,
      material_count: 999_999,
      material_share_count_bp: 5000,
      material_amount_cents: 9_000_000,
      material_share_amount_bp: 9999,
    })

    const comClaims = (
      claims: readonly FirstDueClaim[],
      cfg: DetectorConfig,
    ): ReturnType<typeof detectar> =>
      detectar(
        cenario(),
        {
          aggregate_provenance: [
            provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims }),
          ],
        },
        cfg,
      )

    const TUDO: readonly FirstDueClaim[] = [
      "amount_cents",
      "contract_count",
      "share_amount_bp",
      "share_count_bp",
    ]

    it("o cenário é material SOMENTE por share_amount_bp", () => {
      const r = comClaims(TUDO, soPorValorRelativo)
      expect(r.summary.satisfied_dimensions).toEqual(["share_amount_bp"])
      expect(r.summary.material).toBe(true)
      expect(r.summary.severity_dimension).toBe("share_count_bp")
    })

    it("SEM share_amount_bp na provenance: FALHA FECHADA", () => {
      // O evento existe por causa dessa razão. Sem prova dela, existe por um
      // número não provado — era o furo que o gate encontrou.
      expect(() =>
        comClaims(["contract_count", "share_count_bp", "amount_cents"], soPorValorRelativo),
      ).toThrowError(/não corresponde ao alvo/)
    })

    it("COM share_amount_bp na provenance: aceita", () => {
      expect(comClaims(TUDO, soPorValorRelativo).event).not.toBeNull()
    })

    it("quando share_amount_bp NÃO decide, ela não é exigida", () => {
      const r = comClaims(
        ["contract_count", "share_count_bp", "amount_cents"],
        soPorContagemRelativa,
      )
      expect(r.summary.satisfied_dimensions).toEqual(["share_count_bp"])
      expect(r.event).not.toBeNull()
    })

    it("e declará-la nesse caso é recusado — calculável não é afirmada", () => {
      expect(() => comClaims(TUDO, soPorContagemRelativa)).toThrowError(/não corresponde ao alvo/)
    })
  })

  describe("F — múltiplos gatilhos: todos entram, não só o primeiro", () => {
    const cenario = (): DueContractRecord[] => [
      ...preencher(4, "2026-09-04", 900_000),
      ...preencher(3, "2026-09-10", 100_000),
    ]

    const todosCruzam = comConfig({
      severity_dimension: "share_count_bp",
      minimum_sample_size: 1,
      material_count: 4,
      material_share_count_bp: 5000,
      material_amount_cents: 3_000_000,
      material_share_amount_bp: 9000,
    })

    const COMPLETO: readonly FirstDueClaim[] = [
      "amount_cents",
      "contract_count",
      "share_amount_bp",
      "share_count_bp",
    ]

    const rodarComClaims = (claims: readonly FirstDueClaim[]): ReturnType<typeof detectar> =>
      detectar(
        cenario(),
        {
          aggregate_provenance: [
            provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims }),
          ],
        },
        todosCruzam,
      )

    it("as quatro dimensões aparecem em satisfied_dimensions", () => {
      expect([...rodarComClaims(COMPLETO).summary.satisfied_dimensions].sort()).toEqual([
        "amount_cents",
        "count",
        "share_amount_bp",
        "share_count_bp",
      ])
    })

    it("e faltar QUALQUER uma no claim_set falha fechado", () => {
      for (const faltando of COMPLETO) {
        const parcial = COMPLETO.filter((c) => c !== faltando)
        expect(() => rodarComClaims(parcial), `sem ${faltando}`).toThrowError(
          /não corresponde ao alvo/,
        )
      }
    })
  })

  // ── G ──
  it("G — claim livre/desconhecida não existe no tipo, e a âncora não casa", () => {
    expect(() =>
      rodarCom(
        comDinheiro(),
        ["contract_count", "risco_futuro" as FirstDueClaim, "share_count_bp"],
        "share_count_bp",
      ),
    ).toThrowError(/não corresponde ao alvo/)
  })

  // ── H ──
  it("H — a ordem do claim_set não altera a computation_id", () => {
    const a = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["amount_cents", "contract_count", "share_amount_bp", "share_count_bp"],
    }).computation_id
    const b = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["share_count_bp", "share_amount_bp", "contract_count", "amount_cents"],
    }).computation_id
    expect(b).toBe(a)
  })

  it("H — claim duplicada também não altera: é um CONJUNTO", () => {
    const a = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["contract_count", "share_count_bp"],
    }).computation_id
    const b = provenanceDoAlvo({
      start: "2026-09-04",
      end: "2026-09-04",
      claims: ["contract_count", "share_count_bp", "contract_count", "share_count_bp"],
    }).computation_id
    expect(b).toBe(a)
  })

  it("claim_sets semanticamente diferentes produzem ids diferentes", () => {
    const id = (claims: readonly FirstDueClaim[]): string =>
      provenanceDoAlvo({ start: "2026-09-04", end: "2026-09-04", claims }).computation_id

    const ids = new Set([
      id(["contract_count"]),
      id(["contract_count", "share_count_bp"]),
      id(["contract_count", "amount_cents"]),
      id(["contract_count", "amount_cents", "share_amount_bp"]),
      id(["contract_count", "share_count_bp", "amount_cents", "share_amount_bp"]),
    ])
    expect(ids.size).toBe(5)
  })

  it("as quatro claims do tipo fechado são exatamente estas", () => {
    const validas: readonly FirstDueClaim[] = [
      "contract_count",
      "share_count_bp",
      "amount_cents",
      "share_amount_bp",
    ]
    expect(new Set(validas).size).toBe(4)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.7c.1 §1/§4 — a janela é parâmetro de EXECUÇÃO, e não tem padrão
//
// A Política Creditum v1 aprova duas janelas executivas — `same_day` e
// `next_n_days: 7` — e não elege nenhuma. Configuração sem janela chegando aqui
// é recusa: cair para `same_day` porque ela dispensa `reference_date` faria uma
// característica de FORMA decidir qual análise a Creditum executa.
// ═════════════════════════════════════════════════════════════════════════════

describe("§4 — sem janela explícita o detector RECUSA", () => {
  const semJanela = (): DetectorConfig => {
    const c = structuredClone(TEST_CONFIG) as unknown as Record<string, Record<string, unknown>>
    const due = { ...c["firstDueConcentration"] }
    delete due["window"]
    c["firstDueConcentration"] = due
    return c as unknown as DetectorConfig
  }

  it("configuração sem janela levanta GatewayError", () => {
    expect(() => detectar(preencher(5, "2026-09-04"), {}, semJanela())).toThrow(GatewayError)
  })

  it("a recusa nomeia o campo e aponta o construtor de execução", () => {
    try {
      detectar(preencher(5, "2026-09-04"), {}, semJanela())
    } catch (e) {
      const d = ((e as GatewayError).details ?? []).join(" ")
      expect(d).toContain("firstDueConcentration.window")
      expect(d).toContain("buildFirstDueExecutionConfig")
      return
    }
    throw new Error("esperava recusa")
  })

  it("NÃO cai para same_day: nenhum alvo é calculado", () => {
    // O defeito que isto impede: um `?? { mode: "same_day" }` faria o detector
    // produzir um Event executivo de uma janela que ninguém escolheu.
    let saiu: unknown = "nada"
    try {
      saiu = detectar(preencher(5, "2026-09-04"), {}, semJanela())
    } catch {
      saiu = "recusou"
    }
    expect(saiu).toBe("recusou")
  })

  it("com janela explícita volta a rodar — a recusa é da ausência, não do detector", () => {
    expect(() => detectar(preencher(5, "2026-09-04"), {}, TEST_CONFIG)).not.toThrow()
  })
})
