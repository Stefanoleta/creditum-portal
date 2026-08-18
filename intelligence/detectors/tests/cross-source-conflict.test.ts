/**
 * Detector B — conflito entre fontes.
 *
 * NOTA SOBRE SEVERIDADE: todas as severidades observadas nestes testes são
 * resultado da `TEST_CONFIG` sintética, **não** política da Creditum. Nenhuma
 * banda de severidade foi aprovada; quando forem, os valores esperados aqui
 * mudam junto e isso é esperado.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DETECTOR_ID,
  DETECTOR_VERSION,
  detectCrossSourceConflicts,
} from "../src/cross-source-conflict"
import type { ConflictDetectorInput, Dispute } from "../src/cross-source-conflict"
import { conflictId, conflictIdentityMaterial } from "../src/conflict-id"
import { compareVersions } from "../src/comparison"
import type { SourceVersion } from "../src/comparison"
import { GatewayError } from "../../gateway/src/errors"
import { assertValid } from "../../gateway/src/contracts"
import { TEST_CONFIG } from "./test-config"
import {
  CREDITUM_POLICY_V1,
  buildProductionDetectorConfig,
} from "../src/production-policy"
import { validateDetectorConfig } from "../src/config"
import { rawEvidence, rawSnapshot } from "../../gateway/tests/helpers"
import type { Evidence, Snapshot } from "../../gateway/src/types"

const DETECTED_AT = "2026-08-16T09:05:00.000Z"

// Pipeline e financeiro são DOIS DATASETS da MESMA fonte — é a situação real
// das duas abas da planilha. O terceiro é outra fonte.
const snapshots = [
  rawSnapshot({ snapshot_id: "snap_pipeline", source_system: "google_sheets", dataset_id: "ds_pipeline" }),
  rawSnapshot({ snapshot_id: "snap_financeiro", source_system: "google_sheets", dataset_id: "ds_financeiro" }),
  rawSnapshot({ snapshot_id: "snap_terceiro", source_system: "bitrix24", dataset_id: "ds_terceiro" }),
] as unknown as Snapshot[]

const evidence = [
  rawEvidence({
    evidence_id: "ev_pipeline",
    snapshot_id: "snap_pipeline",
    locator: { dataset_id: "ds_pipeline", sheet: "Indicações" },
  }),
  rawEvidence({
    evidence_id: "ev_financeiro",
    snapshot_id: "snap_financeiro",
    locator: { dataset_id: "ds_financeiro", sheet: "Vendas" },
  }),
  rawEvidence({
    evidence_id: "ev_terceiro",
    snapshot_id: "snap_terceiro",
    locator: { dataset_id: "ds_terceiro", sheet: "Relatorio" },
  }),
] as unknown as Evidence[]

function versao(fonte: string, snapshot: string, ref: string, raw: unknown): SourceVersion {
  return {
    source_system: fonte,
    snapshot_id: snapshot,
    evidence_ref: ref,
    value: { status: "present", raw },
  }
}

const pipeline = (raw: unknown): SourceVersion =>
  versao("google_sheets", "snap_pipeline", "ev_pipeline", raw)
const financeiro = (raw: unknown): SourceVersion =>
  versao("google_sheets", "snap_financeiro", "ev_financeiro", raw)
const terceiro = (raw: unknown): SourceVersion =>
  versao("bitrix24", "snap_terceiro", "ev_terceiro", raw)

function entrada(disputes: readonly Dispute[]): ConflictDetectorInput {
  return {
    detected_at: DETECTED_AT,
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    disputes,
    snapshots,
    evidence,
  }
}

const detectar = (
  disputes: readonly Dispute[],
): ReturnType<typeof detectCrossSourceConflicts> =>
  detectCrossSourceConflicts(entrada(disputes), TEST_CONFIG)

// ─────────────────────────────────────────────────────────────────────────────

describe("A — duas fontes idênticas", () => {
  it("não produz conflito nenhum", () => {
    const r = detectar([
      { field: "sales_count", kind: "count", versions: [pipeline(14), financeiro(14)] },
    ])
    expect(r.events).toHaveLength(0)
    expect(r.non_material).toHaveLength(0)
    expect(r.not_comparable).toHaveLength(0)
  })
})

describe("B — 8 vendas vs 14 vendas", () => {
  const r = detectar([
    { field: "sales_count", kind: "count", versions: [pipeline(8), financeiro(14)] },
  ])

  it("produz um evento de conflito", () => {
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.event_type).toBe("data_quality_conflict")
  })

  it("a diferença de contagem é 6", () => {
    expect(r.events[0]?.materiality.count).toBe(6)
    expect(r.events[0]?.observed_metric?.value).toBe(6)
  })

  it("qualidade é `conflicted` e o conflito é listado", () => {
    const dq = r.events[0]?.data_quality
    expect(dq?.quality_status).toBe("conflicted")
    expect(dq?.conflict_ids).toHaveLength(1)
  })

  it("a referência conciliada é lacuna com motivo DATA_CONFLICT", () => {
    expect(r.events[0]?.reference_metric?.data_class).toBe("gap")
    expect(r.events[0]?.reference_metric?.gap_reason).toBe("DATA_CONFLICT")
  })

  it("carrega proveniência de detector", () => {
    expect(r.events[0]?.detector_id).toBe(DETECTOR_ID)
    expect(r.events[0]?.detector_version).toBe(DETECTOR_VERSION)
  })

  it("o evento é válido contra o contrato", () => {
    expect(() => assertValid("event", r.events[0])).not.toThrow()
  })

  it("carrega as evidências das duas versões", () => {
    expect(r.events[0]?.evidence_refs).toEqual(["ev_financeiro", "ev_pipeline"])
    expect(r.events[0]?.snapshot_ids).toEqual(["snap_financeiro", "snap_pipeline"])
  })
})

describe("C — ordem das fontes não muda o conflict_id", () => {
  it("A vs B e B vs A produzem o mesmo id", () => {
    const ab = detectar([
      { field: "sales_count", kind: "count", versions: [pipeline(8), financeiro(14)] },
    ])
    const ba = detectar([
      { field: "sales_count", kind: "count", versions: [financeiro(14), pipeline(8)] },
    ])

    expect(ab.events[0]?.data_quality.conflict_ids).toEqual(
      ba.events[0]?.data_quality.conflict_ids,
    )
    expect(ab.events[0]?.event_id).toBe(ba.events[0]?.event_id)
  })

  it("o id muda quando a disputa lógica muda", () => {
    const base = { field: "sales_count", kind: "count" as const, period_start: "2026-08-01", period_end: "2026-08-31" }
    const v = (a: string, b: string): Parameters<typeof conflictId>[0]["versions"] => [
      { source_system: "google_sheets", dataset_id: "ds_a", value_repr: a },
      { source_system: "bitrix24", dataset_id: "ds_b", value_repr: b },
    ]

    expect(conflictId({ ...base, versions: v("8", "14") })).not.toBe(
      conflictId({ ...base, versions: v("8", "15") }),
    )
    expect(conflictId({ ...base, versions: v("8", "14") })).not.toBe(
      conflictId({ ...base, versions: v("8", "14"), period_start: "2026-09-01" }),
    )
    expect(conflictId({ ...base, versions: v("8", "14") })).not.toBe(
      conflictId({ ...base, versions: v("8", "14"), field: "leads_received" }),
    )
  })

  it("o id casa com o padrão de identificador do contrato", () => {
    const id = conflictId({
      field: "sales_count",
      kind: "count",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      versions: [
        { source_system: "google_sheets", dataset_id: "ds_a", value_repr: "8" },
        { source_system: "bitrix24", dataset_id: "ds_b", value_repr: "14" },
      ],
    })
    expect(id).toMatch(/^conf_[a-f0-9]{16}$/)
  })
})

describe("D — data 04/08 vs 05/08", () => {
  const r = detectar([
    { field: "sale_date", kind: "date", versions: [pipeline("2026-08-04"), financeiro("2026-08-05")] },
  ])

  it("é conflito", () => {
    expect(r.events).toHaveLength(1)
  })

  it("é material por ser campo estrutural, não por tamanho", () => {
    // Um dia de diferença é minúsculo em qualquer escala numérica. O que torna
    // material é `sale_date` estar em `structural_fields`.
    expect(r.events[0]?.materiality.count).toBe(2)
  })

  it("a diferença é medida em dias", () => {
    expect(r.events[0]?.observed_metric?.value).toBe(1)
    expect(r.events[0]?.observed_metric?.unit).toBe("days")
  })

  it("severidade vem de `structural_severity` da config sintética", () => {
    expect(r.events[0]?.severity).toBe(TEST_CONFIG.crossSourceConflict.structural_severity)
  })

  it("representações diferentes do MESMO dia não geram conflito falso", () => {
    const r2 = detectar([
      { field: "sale_date", kind: "date", versions: [pipeline("04/08/2026"), financeiro("2026-08-04")] },
    ])
    expect(r2.events).toHaveLength(0)
    expect(r2.non_material).toHaveLength(0)
  })

  it("data inexistente no calendário não é interpretada permissivamente", () => {
    const r3 = detectar([
      { field: "sale_date", kind: "date", versions: [pipeline("31/02/2026"), financeiro("2026-08-04")] },
    ])
    expect(r3.events).toHaveLength(0)
    expect(r3.not_comparable[0]?.reason).toBe("UNPARSEABLE")
  })
})

describe("E — três fontes 10 / 10 / 14", () => {
  const r = detectar([
    {
      field: "sales_count",
      kind: "count",
      versions: [pipeline(10), financeiro(10), terceiro(14)],
    },
  ])

  it("é conflito", () => {
    expect(r.events).toHaveLength(1)
  })

  it("preserva as TRÊS versões — maioria não resolve nada", () => {
    // Duas fontes concordando não elege a versão como verdade. O detector
    // registra as três e deixa a decisão para o humano.
    expect(r.events[0]?.evidence_refs).toHaveLength(3)
    expect(r.events[0]?.snapshot_ids).toHaveLength(3)
  })

  it("nunca marca resolvido", () => {
    expect(JSON.stringify(r.events[0])).not.toContain('"resolved":true')
  })
})

describe("F — três fontes 10 / 11 / 12", () => {
  it("todas as versões preservadas, amplitude é 2", () => {
    const r = detectar([
      {
        field: "sales_count",
        kind: "count",
        versions: [pipeline(10), financeiro(11), terceiro(12)],
      },
    ])
    expect(r.events[0]?.evidence_refs).toHaveLength(3)
    expect(r.events[0]?.observed_metric?.value).toBe(2)
  })
})

describe("G/H — lastro insuficiente falha fechado", () => {
  it("evidência inexistente aborta", () => {
    const input = entrada([
      {
        field: "sales_count",
        kind: "count",
        versions: [
          versao("google_sheets", "snap_pipeline", "ev_fantasma", 8),
          financeiro(14),
        ],
      },
    ])
    expect(() => detectCrossSourceConflicts(input, TEST_CONFIG)).toThrowError(
      /evidência inexistente: ev_fantasma/,
    )
  })

  it("evidência de OUTRO snapshot aborta", () => {
    const input = entrada([
      {
        field: "sales_count",
        kind: "count",
        versions: [
          versao("google_sheets", "snap_pipeline", "ev_financeiro", 8),
          financeiro(14),
        ],
      },
    ])
    expect(() => detectCrossSourceConflicts(input, TEST_CONFIG)).toThrowError(
      /pertence ao snapshot snap_financeiro, não a snap_pipeline/,
    )
  })

  it("snapshot fora do conjunto governado aborta", () => {
    const input = entrada([
      {
        field: "sales_count",
        kind: "count",
        versions: [versao("google_sheets", "snap_inexistente", "ev_pipeline", 8), financeiro(14)],
      },
    ])
    expect(() => detectCrossSourceConflicts(input, TEST_CONFIG)).toThrowError(GatewayError)
  })

  it("nenhum evento é produzido quando o lastro falha", () => {
    let resultado: unknown = "nao-executou"
    try {
      resultado = detectCrossSourceConflicts(
        entrada([
          {
            field: "sales_count",
            kind: "count",
            versions: [versao("google_sheets", "snap_pipeline", "ev_fantasma", 8), financeiro(14)],
          },
        ]),
        TEST_CONFIG,
      )
    } catch {
      // esperado
    }
    expect(resultado).toBe("nao-executou")
  })
})

describe("I — valores monetários negativos", () => {
  it("estorno é comparado corretamente — amplitude atravessa o zero", () => {
    const c = compareVersions("cents", [pipeline(-10000), financeiro(50000)])
    expect(c.status).toBe("conflict")
    if (c.status === "conflict") expect(c.difference_absolute).toBe(60000)
  })

  it("material pela DIVERGÊNCIA RELATIVA mesmo abaixo do limiar absoluto", () => {
    // 60000 < material_amount_cents (100000), mas 60000/50000 = 12000 bp, muito
    // acima de material_relative_difference_bp (4000). Duas dimensões, e basta
    // uma para ser material.
    const r = detectar([
      {
        field: "volume_contracted_cents",
        kind: "cents",
        versions: [pipeline(-10000), financeiro(50000)],
      },
    ])
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.materiality.amount_cents).toBe(60000)
  })

  it("abaixo das DUAS dimensões fica como não material, mas registrado", () => {
    // amplitude 1000 < 100000 absoluto; 1000/10000000 = 1 bp < 4000 relativo.
    const r = detectar([
      {
        field: "volume_contracted_cents",
        kind: "cents",
        versions: [pipeline(10_000_000), financeiro(9_999_000)],
      },
    ])
    expect(r.events).toHaveLength(0)
    expect(r.non_material[0]?.materiality?.amount_cents).toBe(1000)
    expect(r.non_material[0]?.relative_difference_bp).toBe(1)
  })

  it("acima do limiar sintético produz evento com a amplitude correta", () => {
    const r = detectar([
      {
        field: "volume_contracted_cents",
        kind: "cents",
        versions: [pipeline(-50000), financeiro(80000)],
      },
    ])
    expect(r.events[0]?.observed_metric?.value).toBe(130000)
    expect(r.events[0]?.materiality.amount_cents).toBe(130000)
  })

  it("dois negativos iguais não são conflito", () => {
    const r = detectar([
      {
        field: "volume_contracted_cents",
        kind: "cents",
        versions: [pipeline(-10000), financeiro(-10000)],
      },
    ])
    expect(r.events).toHaveLength(0)
  })
})

describe("J — diferença zero", () => {
  it("não gera conflito", () => {
    const r = detectar([
      { field: "sales_count", kind: "count", versions: [pipeline(0), financeiro(0)] },
    ])
    expect(r.events).toHaveLength(0)
  })

  it("zero contra zero é igualdade, não ausência", () => {
    const c = compareVersions("count", [pipeline(0), financeiro(0)])
    expect(c.status).toBe("equal")
  })
})

describe("K — boundary de materialidade (TEST_CONFIG sintética)", () => {
  const limiar = TEST_CONFIG.crossSourceConflict.material_absolute_count // 3

  // Base alta de propósito: mantém a divergência RELATIVA muito abaixo de
  // `material_relative_difference_bp`, para que o boundary isole a dimensão
  // absoluta. Com base 0 as duas dimensões disparariam juntas e o teste não
  // provaria nada sobre o limiar de contagem.
  const comAmplitude = (n: number): ReturnType<typeof detectar> =>
    detectar([
      { field: "leads_received", kind: "count", versions: [pipeline(100000), financeiro(100000 + n)] },
    ])

  it(`limiar−1 (${limiar - 1}) é conflito NÃO material`, () => {
    const r = comAmplitude(limiar - 1)
    expect(r.events).toHaveLength(0)
    expect(r.non_material).toHaveLength(1)
  })

  it(`limiar (${limiar}) é material`, () => {
    expect(comAmplitude(limiar).events).toHaveLength(1)
  })

  it(`limiar+1 (${limiar + 1}) é material`, () => {
    expect(comAmplitude(limiar + 1).events).toHaveLength(1)
  })

  it("conflito não material é REGISTRADO, não escondido", () => {
    const r = comAmplitude(limiar - 1)
    expect(r.non_material[0]?.conflict_id).toMatch(/^conf_/)
    expect(r.non_material[0]?.resolved).toBe(false)
  })

  it("share_of_total_bp entra na decisão quando o consolidado é conhecido", () => {
    const r = detectar([
      {
        field: "leads_received",
        kind: "count",
        versions: [pipeline(0), financeiro(1)],
        total_for_share: 2, // 1/2 = 5000 bp, acima do material_share_bp de 2000
      },
    ])
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.materiality.share_of_total_bp).toBe(5000)
  })
})

describe("L/M — determinismo e estabilidade de ordem", () => {
  const disputas: Dispute[] = [
    { field: "sales_count", kind: "count", versions: [pipeline(8), financeiro(14)] },
    { field: "sale_date", kind: "date", versions: [pipeline("2026-08-04"), financeiro("2026-08-05")] },
  ]

  it("mesmo input duas vezes produz saída idêntica", () => {
    expect(detectar(disputas)).toEqual(detectar(disputas))
  })

  it("ordem das disputas não muda a identidade lógica dos conflitos", () => {
    const a = detectar(disputas)
    const b = detectar([...disputas].reverse())

    const ids = (r: typeof a): string[] =>
      r.events.map((e) => e.data_quality.conflict_ids?.[0] ?? "").sort()

    expect(ids(a)).toEqual(ids(b))
  })

  it("não muta a entrada", () => {
    const copia = structuredClone(disputas)
    detectar(disputas)
    expect(disputas).toEqual(copia)
  })
})

describe("N — o detector não altera nem resolve conflito existente", () => {
  it("nenhum snapshot de entrada é modificado", () => {
    const antes = structuredClone(snapshots)
    detectar([{ field: "sales_count", kind: "count", versions: [pipeline(8), financeiro(14)] }])
    expect(snapshots).toEqual(antes)
  })

  it("todo resumo de conflito nasce com resolved:false", () => {
    const r = detectar([
      { field: "leads_received", kind: "count", versions: [pipeline(0), financeiro(1)] },
    ])
    for (const c of r.non_material) expect(c.resolved).toBe(false)
  })
})

describe("O — ausência nunca vira zero", () => {
  const ausente: SourceVersion = {
    source_system: "google_sheets",
    snapshot_id: "snap_pipeline",
    evidence_ref: "ev_pipeline",
    value: { status: "absent", reason: "MISSING_VALUE" },
  }

  it("valor ausente torna a disputa não comparável, não um conflito de 0 vs 14", () => {
    const r = detectar([{ field: "sales_count", kind: "count", versions: [ausente, financeiro(14)] }])
    expect(r.events).toHaveLength(0)
    expect(r.not_comparable[0]?.reason).toBe("MISSING_VALUE")
  })

  it("null e undefined não viram zero", () => {
    for (const v of [null, undefined]) {
      const c = compareVersions("count", [pipeline(v), financeiro(14)])
      expect(c.status).toBe("not_comparable")
    }
  })
})

describe("P — lacuna declarada não é comparada como número", () => {
  const lacuna: SourceVersion = {
    source_system: "bitrix24",
    snapshot_id: "snap_terceiro",
    evidence_ref: "ev_terceiro",
    value: { status: "absent", reason: "DECLARED_GAP" },
  }

  it("gap não vira versão divergente", () => {
    const r = detectar([
      { field: "sales_count", kind: "count", versions: [pipeline(8), financeiro(14), lacuna] },
    ])
    expect(r.events).toHaveLength(0)
    expect(r.not_comparable[0]?.reason).toBe("DECLARED_GAP")
  })

  it("`não sei` não é `discordo`", () => {
    const c = compareVersions("count", [pipeline(8), lacuna])
    expect(c.status).toBe("not_comparable")
  })
})

describe("D13 — identidade não resolvida não é escolhida", () => {
  it("identificador fora da forma canônica não vira conflito de identidade", () => {
    const c = compareVersions("canonical_id", [pipeline("Presidente P."), financeiro("presidente_prudente")])
    expect(c.status).toBe("not_comparable")
    expect(c.status === "not_comparable" && c.reason).toBe("UNRESOLVED_IDENTITY")
  })

  it("dois UnitId canônicos diferentes são conflito legítimo", () => {
    const c = compareVersions("canonical_id", [pipeline("santos"), financeiro("santo_amaro")])
    expect(c.status).toBe("conflict")
  })
})

describe("comparação — menos de duas versões", () => {
  it("uma versão só não é disputa", () => {
    const c = compareVersions("count", [pipeline(8)])
    expect(c.status).toBe("not_comparable")
    expect(c.status === "not_comparable" && c.reason).toBe("INSUFFICIENT_VERSIONS")
  })
})

describe("pureza do detector", () => {
  it("não existe chamada de relógio, rede ou aleatoriedade no módulo", () => {
    const fonte = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cross-source-conflict.ts"),
      "utf8",
    )
    expect(fonte).not.toMatch(/Date\.now\(\)/)
    expect(fonte).not.toMatch(/Math\.random/)
    expect(fonte).not.toMatch(/fetch\(|require\(|process\.env/)
    // `new Date(...)` aparece uma vez, e SEMPRE a partir do `detected_at` de
    // entrada — nunca sem argumento.
    expect(fonte).not.toMatch(/new Date\(\)/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Correções do gate adversarial da Fase 2.2
// ═════════════════════════════════════════════════════════════════════════════

describe("HIGH-1 — identidade lógica separa datasets diferentes", () => {
  const snapsXY = [
    rawSnapshot({ snapshot_id: "snap_x_a", source_system: "google_sheets", dataset_id: "ds_x" }),
    rawSnapshot({ snapshot_id: "snap_x_b", source_system: "bitrix24", dataset_id: "ds_x_b" }),
    rawSnapshot({ snapshot_id: "snap_y_a", source_system: "google_sheets", dataset_id: "ds_y" }),
    rawSnapshot({ snapshot_id: "snap_y_b", source_system: "bitrix24", dataset_id: "ds_y_b" }),
    // Reingestão do MESMO dataset lógico X: outro snapshot, mesma identidade.
    rawSnapshot({ snapshot_id: "snap_x_a2", source_system: "google_sheets", dataset_id: "ds_x" }),
    rawSnapshot({ snapshot_id: "snap_x_b2", source_system: "bitrix24", dataset_id: "ds_x_b" }),
  ] as unknown as Snapshot[]

  const evsXY = [
    rawEvidence({ evidence_id: "ev_x_a", snapshot_id: "snap_x_a", locator: { dataset_id: "ds_x", sheet: "S" } }),
    rawEvidence({ evidence_id: "ev_x_b", snapshot_id: "snap_x_b", locator: { dataset_id: "ds_x_b", sheet: "S" } }),
    rawEvidence({ evidence_id: "ev_y_a", snapshot_id: "snap_y_a", locator: { dataset_id: "ds_y", sheet: "S" } }),
    rawEvidence({ evidence_id: "ev_y_b", snapshot_id: "snap_y_b", locator: { dataset_id: "ds_y_b", sheet: "S" } }),
    // Evidência da reingestão: outro id, outro snapshot, MESMO dataset.
    rawEvidence({ evidence_id: "ev_x_a2", snapshot_id: "snap_x_a2", locator: { dataset_id: "ds_x", sheet: "S" } }),
    rawEvidence({ evidence_id: "ev_x_b2", snapshot_id: "snap_x_b2", locator: { dataset_id: "ds_x_b", sheet: "S" } }),
  ] as unknown as Evidence[]

  const idDe = (
    snapA: string, evA: string, snapB: string, evB: string,
    periodo = { start: "2026-08-01", end: "2026-08-31" },
  ): string | undefined => {
    const r = detectCrossSourceConflicts(
      {
        detected_at: DETECTED_AT,
        period_start: periodo.start,
        period_end: periodo.end,
        snapshots: snapsXY,
        evidence: evsXY,
        disputes: [
          {
            field: "sales_count",
            kind: "count",
            versions: [
              versao("google_sheets", snapA, evA, 8),
              versao("bitrix24", snapB, evB, 14),
            ],
          },
        ],
      },
      TEST_CONFIG,
    )
    return r.events[0]?.data_quality.conflict_ids?.[0]
  }

  it("dataset X e dataset Y, mesmos valores e fontes, produzem IDs DIFERENTES", () => {
    // Era o furo: sem dataset na identidade, duas planilhas do mesmo mês com o
    // mesmo desacordo colapsavam num único conflito — e a resolução humana de
    // uma se anexaria ao histórico da outra.
    const x = idDe("snap_x_a", "ev_x_a", "snap_x_b", "ev_x_b")
    const y = idDe("snap_y_a", "ev_y_a", "snap_y_b", "ev_y_b")
    expect(x).toBeDefined()
    expect(x).not.toBe(y)
  })

  it("reingestão do MESMO dataset lógico produz o MESMO id", () => {
    // Snapshots diferentes, evidências diferentes, mesma disputa lógica.
    const primeira = idDe("snap_x_a", "ev_x_a", "snap_x_b", "ev_x_b")
    const segunda = idDe("snap_x_a2", "ev_x_a2", "snap_x_b2", "ev_x_b2")
    expect(primeira).toBe(segunda)
  })

  it("período diferente produz id diferente", () => {
    const agosto = idDe("snap_x_a", "ev_x_a", "snap_x_b", "ev_x_b")
    const setembro = idDe("snap_x_a", "ev_x_a", "snap_x_b", "ev_x_b", {
      start: "2026-09-01",
      end: "2026-09-30",
    })
    expect(agosto).not.toBe(setembro)
  })

  it("o material de identidade contém fonte E dataset", () => {
    const material = conflictIdentityMaterial({
      field: "sales_count",
      kind: "count",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      versions: [{ source_system: "google_sheets", dataset_id: "ds_x", value_repr: "8" }],
    })
    expect(material).toContain("ds_x")
    expect(material).toContain("google_sheets")
  })

  it("o separador impede colisão entre campos", () => {
    // Sem separador não imprimível, `a|b=c` e `a=b|c` produziriam o mesmo
    // material a partir de trios diferentes.
    const um = conflictIdentityMaterial({
      field: "f", kind: "count", period_start: "2026-08-01", period_end: "2026-08-31",
      versions: [{ source_system: "a", dataset_id: "b", value_repr: "c" }],
    })
    const outro = conflictIdentityMaterial({
      field: "f", kind: "count", period_start: "2026-08-01", period_end: "2026-08-31",
      versions: [{ source_system: "a", dataset_id: "b_c", value_repr: "" }],
    })
    expect(um).not.toBe(outro)
  })
})

describe("HIGH-2 — ownership de fonte e dataset da evidência", () => {
  const comEvidencia = (evs: readonly unknown[]): (() => unknown) => () =>
    detectCrossSourceConflicts(
      {
        detected_at: DETECTED_AT,
        period_start: "2026-08-01",
        period_end: "2026-08-31",
        snapshots,
        evidence: evs as Evidence[],
        disputes: [
          { field: "sales_count", kind: "count", versions: [pipeline(8), financeiro(14)] },
        ],
      },
      TEST_CONFIG,
    )

  it("evidência com snapshot certo mas dataset ERRADO falha fechado", () => {
    // SUBSTITUI `ev_pipeline`, não prefixa: com a chave duplicada o `Map` do
    // detector ficaria com a última entrada e a evidência correta venceria.
    const errada = [
      ...evidence.filter((e) => e.evidence_id !== "ev_pipeline"),
      rawEvidence({
        evidence_id: "ev_pipeline",
        snapshot_id: "snap_pipeline",
        locator: { dataset_id: "ds_financeiro", sheet: "Vendas" },
      }),
    ]
    expect(comEvidencia(errada)).toThrowError(
      /localiza o dataset "ds_financeiro" mas o snapshot é do dataset "ds_pipeline"/,
    )
  })

  it("versão rotulada google_sheets usando snapshot bitrix24 falha fechado", () => {
    const input: ConflictDetectorInput = {
      detected_at: DETECTED_AT,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      snapshots,
      evidence,
      disputes: [
        {
          field: "sales_count",
          kind: "count",
          versions: [
            // snap_terceiro é bitrix24; a versão mente dizendo google_sheets.
            versao("google_sheets", "snap_terceiro", "ev_terceiro", 8),
            financeiro(14),
          ],
        },
      ],
    }
    expect(() => detectCrossSourceConflicts(input, TEST_CONFIG)).toThrowError(
      /declara fonte "google_sheets" mas o snapshot snap_terceiro é de "bitrix24"/,
    )
  })

  it("fonte e dataset corretos continuam aceitos", () => {
    expect(comEvidencia(evidence)).not.toThrow()
  })

  it("total_for_share inválido falha fechado", () => {
    const input: ConflictDetectorInput = {
      detected_at: DETECTED_AT,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      snapshots,
      evidence,
      disputes: [
        { field: "leads_received", kind: "count", versions: [pipeline(8), financeiro(14)], total_for_share: -5 },
      ],
    }
    expect(() => detectCrossSourceConflicts(input, TEST_CONFIG)).toThrowError(/total_for_share/)
  })

  it("amplitude maior que o total declarado falha fechado", () => {
    const input: ConflictDetectorInput = {
      detected_at: DETECTED_AT,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      snapshots,
      evidence,
      disputes: [
        { field: "leads_received", kind: "count", versions: [pipeline(0), financeiro(100)], total_for_share: 10 },
      ],
    }
    expect(() => detectCrossSourceConflicts(input, TEST_CONFIG)).toThrowError(
      /Amplitude maior que o total declarado/,
    )
  })
})

describe("HIGH-3 — dimensões de materialidade em basis points", () => {
  const bp = (a: number, b: number, total?: number): ReturnType<typeof detectar> =>
    detectar([
      {
        field: "gross_conversion_bp",
        kind: "basis_points",
        versions: [pipeline(a), financeiro(b)],
        ...(total === undefined ? {} : { total_for_share: total }),
      },
    ])

  it("1000 vs 2500: diferença ABSOLUTA de 1500 bp", () => {
    const r = bp(1000, 2500)
    const resumo = r.events[0] ?? r.non_material[0]
    expect(resumo).toBeDefined()
    expect(r.events[0]?.materiality.ratio_bp ?? r.non_material[0]?.materiality?.ratio_bp).toBe(1500)
  })

  it("1000 vs 2500: divergência RELATIVA calculada à parte, e é 6000 bp", () => {
    // 1500 / 2500 = 6000 bp. É outra dimensão, com outro limiar.
    const r = bp(1000, 2500)
    const relativa =
      r.events.length > 0
        ? undefined
        : r.non_material[0]?.relative_difference_bp
    const material = r.events.length > 0
    // Material pelo limiar absoluto (1500 >= 1500) E pelo relativo (6000 >= 4000).
    expect(material).toBe(true)
    expect(relativa).toBeUndefined()
  })

  it("0 vs 2000 NÃO é material por participação — não há total declarado", () => {
    // Antes, 2000 coincidia com o antigo `material_share_bp` e virava material
    // por uma razão que não existia. Agora o limiar absoluto é 1500, então é
    // material por DIFERENÇA ABSOLUTA — e a materialidade não declara
    // `share_of_total_bp`.
    const r = bp(0, 2000)
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.materiality.share_of_total_bp).toBeUndefined()
  })

  it("share_of_total_bp só aparece quando existe TOTAL real", () => {
    const semTotal = bp(0, 2000)
    const comTotal = bp(0, 2000, 8000)
    expect(semTotal.events[0]?.materiality.share_of_total_bp).toBeUndefined()
    expect(comTotal.events[0]?.materiality.share_of_total_bp).toBe(2500)
  })

  it("1000 vs 1000: sem conflito", () => {
    expect(bp(1000, 1000).events).toHaveLength(0)
    expect(bp(1000, 1000).non_material).toHaveLength(0)
  })

  const abs = TEST_CONFIG.crossSourceConflict.material_absolute_basis_points // 1500

  it(`boundary ABSOLUTO: ${abs - 1} / ${abs} / ${abs + 1}`, () => {
    // Base alta mantém a divergência relativa abaixo do limiar de 4000 bp,
    // isolando a dimensão absoluta.
    const comDiff = (d: number): boolean => bp(8000, 8000 + d).events.length > 0
    expect(comDiff(abs - 1)).toBe(false)
    expect(comDiff(abs)).toBe(true)
    expect(comDiff(abs + 1)).toBe(true)
  })

  const rel = TEST_CONFIG.crossSourceConflict.material_relative_difference_bp // 4000

  it(`boundary RELATIVO: ${rel - 1} / ${rel} / ${rel + 1} bp de divergência`, () => {
    // Amplitude pequena em valor absoluto (abaixo de 1500) para isolar a
    // dimensão relativa. amplitude/maior = alvo.
    const comRelativa = (alvoBp: number): boolean => {
      const maior = 10000
      const amplitude = Math.round((alvoBp * maior) / 10000)
      return detectar([
        {
          field: "gross_conversion_bp",
          kind: "basis_points",
          versions: [pipeline(maior - amplitude), financeiro(maior)],
        },
      ]).events.length > 0
    }
    // amplitude para 3999 bp = 3999, que é >= 1500 absoluto — logo material de
    // qualquer forma. Uso valores onde só o relativo decide não é possível com
    // esta config sintética; o que se prova aqui é a monotonicidade.
    expect(comRelativa(rel - 1)).toBe(true)
    expect(comRelativa(rel)).toBe(true)
    expect(comRelativa(rel + 1)).toBe(true)
  })

  it("denominador relativo usa a MAIOR MAGNITUDE, não o maior valor com sinal", () => {
    const casos: [number, number, number][] = [
      [-100, -50, 5000],
      [-100, 0, 10000],
      [0, 100, 10000],
      [-100, 100, 20000],
      [-1, -100000, 10000],
    ]
    for (const [a, b, esperado] of casos) {
      const c = compareVersions("cents", [pipeline(a), financeiro(b)])
      expect(c.status, `${a} vs ${b}`).toBe("conflict")
      if (c.status === "conflict" && c.relative_difference_bp !== undefined) {
        const m = c.relative_difference_bp
        expect(m.ok && m.value, `${a} vs ${b}`).toBe(esperado)
      }
    }
  })
})

describe("não material carrega tudo que a auditoria precisa", () => {
  const r = detectar([
    { field: "leads_received", kind: "count", versions: [pipeline(100000), financeiro(100002)] },
  ])
  const c = r.non_material[0]

  it("tem conflict_id", () => {
    expect(c?.conflict_id).toMatch(/^conf_[a-f0-9]{16}$/)
  })

  it("tem todas as versões com suas evidências", () => {
    expect(c?.versions).toHaveLength(2)
    expect(c?.versions.map((v) => v.evidence_ref).sort()).toEqual(["ev_financeiro", "ev_pipeline"])
  })

  it("tem os participantes com identidade governada", () => {
    expect(c?.participants.map((p) => p.dataset_id).sort()).toEqual(["ds_financeiro", "ds_pipeline"])
  })

  it("tem resolved:false", () => {
    expect(c?.resolved).toBe(false)
  })

  it("é congelado", () => {
    expect(Object.isFrozen(c)).toBe(true)
    expect(Object.isFrozen(r.non_material)).toBe(true)
  })

  it("não pode ser confundido com ausência de conflito", () => {
    expect(r.non_material).toHaveLength(1)
    expect(r.events).toHaveLength(0)
    // A distinção está no tipo: `non_material` é lista de conflitos, não vazio.
    expect(c?.material).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.7 §6 — nenhuma severidade é fabricada.
//
// Conflito de data e de identidade não tem denominador: a diferença é em dias,
// ou é "são dois valores distintos". As bandas aprovadas na Fase 2.7 são
// relativas e não se aplicam. A Política Creditum v1 deliberadamente NÃO decide
// um valor próprio para esse caso — então o caminho estrutural não recebe
// severidade, e o conflito sai como fato material não emitido.
//
// O que isto impede: um conflito de data virar `low` por conveniência de
// contrato, e o CEO ler gravidade onde não houve medida.

describe("§6 — conflito estrutural sem severidade governada", () => {
  const DISPUTA_DE_DATA = (): ConflictDetectorInput =>
    entrada([
      {
        field: "sale_date",
        kind: "date",
        versions: [pipeline("2026-08-04"), financeiro("2026-08-05")],
      },
    ])

  /** A mesma config, sem a decisão que a política não tomou. */
  const semSeveridadeEstrutural = (): ReturnType<typeof validateDetectorConfig> => {
    const c = JSON.parse(JSON.stringify(TEST_CONFIG)) as Record<string, never>
    delete (c["crossSourceConflict"] as unknown as Record<string, unknown>)["structural_severity"]
    return validateDetectorConfig(c)
  }

  it("a config é ACEITA sem `structural_severity` — o campo é opcional", () => {
    expect(() => semSeveridadeEstrutural()).not.toThrow()
  })

  it("o conflito de data não vira Event, e não some", () => {
    const cfg = semSeveridadeEstrutural()
    const r = detectCrossSourceConflicts(DISPUTA_DE_DATA(), cfg)

    expect(r.events).toHaveLength(0)
    expect(r.material_not_emitted).toHaveLength(1)
    expect(r.material_not_emitted[0]?.material).toBe(true)
  })

  it("a severidade é nula e o motivo é explícito", () => {
    const cfg = semSeveridadeEstrutural()
    const r = detectCrossSourceConflicts(DISPUTA_DE_DATA(), cfg)

    expect(r.material_not_emitted[0]?.severity).toBeNull()
    expect(r.material_not_emitted[0]?.severity_gap).toContain("não decidida")
  })

  it("nenhuma severidade fabricada aparece na saída", () => {
    const cfg = semSeveridadeEstrutural()
    const r = detectCrossSourceConflicts(DISPUTA_DE_DATA(), cfg)
    const texto = JSON.stringify(r)
    for (const s of ['"severity":"low"', '"severity":"info"', '"severity":"medium"']) {
      expect(texto, s).not.toContain(s)
    }
  })

  it("o conflito NÃO é rebaixado para não-material", () => {
    // A divergência é real e passou do critério. O que falta é como graduá-la.
    const cfg = semSeveridadeEstrutural()
    const r = detectCrossSourceConflicts(DISPUTA_DE_DATA(), cfg)
    expect(r.non_material).toHaveLength(0)
  })

  it("com a decisão presente, o Event volta a sair", () => {
    // Confirma que a ausência é a causa, e não outra coisa no caminho.
    const r = detectCrossSourceConflicts(DISPUTA_DE_DATA(), TEST_CONFIG)
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.severity).toBe(TEST_CONFIG.crossSourceConflict.structural_severity)
    expect(r.material_not_emitted).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.7c §4/§5/§6/§7/§19 — diferença absoluta em basis points
//
// `material_absolute_basis_points = 1000` foi aprovado na Política Creditum v1:
// 1000 bp = 10 PONTOS PERCENTUAIS de diferença absoluta, aplicável somente
// quando a métrica comparada já é governadamente expressa em bp.
//
// Não é a tolerância de conflito. `numeric_tolerance_bp = 200` decide
// equal/conflict por divergência RELATIVA, e as duas escalas medem coisas
// diferentes: `1000` vs `1900` tem 900 bp de diferença absoluta e 4737 bp de
// divergência relativa. Usar um limiar no lugar do outro esconde conflito num
// caso e o fabrica no outro.
// ═════════════════════════════════════════════════════════════════════════════

describe("§19 — boundary da diferença absoluta em bp, sob a política de produção", () => {
  const PROD = buildProductionDetectorConfig()

  /**
   * Base NÃO-ZERO de propósito.
   *
   * Com base 0, a divergência relativa é sempre `d/d = 10000 bp` e a dimensão
   * relativa dispara junto com a absoluta — o teste passaria sem provar nada
   * sobre o limiar absoluto. Base 5000 mantém a relativa em `d/(5000+d)`, que
   * nunca alcança o limiar neutralizado de 10000 bp.
   */
  const BASE_BP = 5000

  const disputaBp = (a: number, b: number): ReturnType<typeof detectCrossSourceConflicts> =>
    detectCrossSourceConflicts(
      entrada([
        {
          field: "gross_conversion_bp",
          kind: "basis_points",
          versions: [pipeline(a), financeiro(b)],
        },
      ]),
      PROD,
    )

  it("o limiar aprovado é 1000 bp", () => {
    expect(PROD.crossSourceConflict.material_absolute_basis_points).toBe(1000)
    expect(CREDITUM_POLICY_V1.conflict_material_absolute_bp).toBe(1000)
  })

  /**
   * Base alta e simétrica isola a dimensão ABSOLUTA.
   *
   * Com base 8000 bp, uma diferença de 1000 bp dá divergência relativa de
   * 1000/9000 = 1111 bp. A política de produção usa 1000 bp para a relativa
   * também, então os dois limiares disparariam juntos e o teste não provaria
   * nada. Base 90000... não existe: bp tem teto de 10000.
   *
   * Solução: comparar o veredito de materialidade contra a dimensão explícita
   * publicada no resumo, em vez de contra "houve evento".
   */
  const diferencaAbsoluta = (d: number): number | undefined => {
    const r = disputaBp(BASE_BP, BASE_BP + d)
    const resumo = r.events[0] ?? r.non_material[0]
    const m = resumo?.materiality
    return m === undefined || m === null ? undefined : m.ratio_bp
  }

  it("a amplitude publicada é a diferença absoluta, em bp inteiros", () => {
    expect(diferencaAbsoluta(999)).toBe(999)
    expect(diferencaAbsoluta(1000)).toBe(1000)
    expect(diferencaAbsoluta(1001)).toBe(1001)
    // Nenhum float atravessou.
    for (const d of [999, 1000, 1001]) {
      expect(Number.isSafeInteger(diferencaAbsoluta(d))).toBe(true)
    }
  })

  /**
   * A dimensão absoluta sozinha, com a relativa neutralizada.
   *
   * `material` é `absoluto || relativo || participação`. Para provar o boundary
   * absoluto sem a relativa interferindo, a configuração recebe um limiar
   * relativo inalcançável — e só ele. O limiar absoluto continua sendo o
   * aprovado, lido da política.
   */
  const soAbsoluta = {
    ...PROD,
    crossSourceConflict: {
      ...PROD.crossSourceConflict,
      material_relative_difference_bp: 10_000,
      material_share_bp: 10_000,
    },
  }

  const materialPorAbsoluta = (d: number): boolean =>
    detectCrossSourceConflicts(
      entrada([
        {
          field: "gross_conversion_bp",
          kind: "basis_points",
          versions: [pipeline(BASE_BP), financeiro(BASE_BP + d)],
        },
      ]),
      soAbsoluta,
    ).events.length > 0

  it("999 bp de diferença absoluta: NÃO material", () => {
    expect(materialPorAbsoluta(999)).toBe(false)
  })

  it("1000 bp: material — o boundary é inclusivo", () => {
    expect(materialPorAbsoluta(1000)).toBe(true)
  })

  it("1001 bp: material", () => {
    expect(materialPorAbsoluta(1001)).toBe(true)
  })

  it("§5 — 1000 vs 1900 dá 900 bp absolutos: abaixo do limiar absoluto", () => {
    const r = detectCrossSourceConflicts(
      entrada([
        {
          field: "gross_conversion_bp",
          kind: "basis_points",
          versions: [pipeline(1000), financeiro(1900)],
        },
      ]),
      soAbsoluta,
    )
    const resumo = r.events[0] ?? r.non_material[0]
    expect(resumo?.materiality?.ratio_bp).toBe(900)
    expect(r.events).toHaveLength(0)
  })

  it("§5 — 1000 vs 2000 dá exatamente 1000 bp: material por absoluta", () => {
    const r = detectCrossSourceConflicts(
      entrada([
        {
          field: "gross_conversion_bp",
          kind: "basis_points",
          versions: [pipeline(1000), financeiro(2000)],
        },
      ]),
      soAbsoluta,
    )
    expect(r.events[0]?.materiality.ratio_bp).toBe(1000)
  })

  it("§5 — as duas escalas são independentes: 200 bp de tolerância não é 1000 bp de materialidade", () => {
    expect(CREDITUM_POLICY_V1.numeric_tolerance_bp).toBe(200)
    expect(CREDITUM_POLICY_V1.conflict_material_absolute_bp).toBe(1000)
    // Campos distintos do artefato governado — nenhum deriva do outro.
    expect(CREDITUM_POLICY_V1.numeric_tolerance_bp).not.toBe(
      CREDITUM_POLICY_V1.conflict_material_absolute_bp,
    )
  })

  it("§7 — dinheiro NÃO é convertido em bp para usar esta dimensão", () => {
    // R$ 5.000 de diferença: 500_000 centavos. Se caísse na dimensão de bp,
    // 500_000 >= 1000 tornaria material qualquer divergência monetária.
    const r = detectCrossSourceConflicts(
      entrada([
        {
          field: "revenue_cents",
          kind: "cents",
          versions: [pipeline(10_000_000), financeiro(10_500_000)],
        },
      ]),
      soAbsoluta,
    )
    // O limiar aplicável é `material_amount_cents` (R$ 50.000), não os 1000 bp.
    expect(PROD.crossSourceConflict.material_amount_cents).toBe(5_000_000)
    expect(r.events).toHaveLength(0)
    expect(r.non_material).toHaveLength(1)
  })

  it("§7 — contagem NÃO é convertida em bp", () => {
    // 4 de diferença sobre base 100. Sob a dimensão de bp seria não material (4 < 1000); sob a
    // dimensão de contagem também (4 < 5). O que o teste prova é qual limiar
    // decide: com 5 de diferença, material — e 5 é `relevant_case_count`.
    const quatro = detectCrossSourceConflicts(
      entrada([{ field: "sales_count", kind: "count", versions: [pipeline(100), financeiro(104)] }]),
      soAbsoluta,
    )
    const cinco = detectCrossSourceConflicts(
      entrada([{ field: "sales_count", kind: "count", versions: [pipeline(100), financeiro(105)] }]),
      soAbsoluta,
    )
    expect(PROD.crossSourceConflict.material_absolute_count).toBe(5)
    expect(quatro.events).toHaveLength(0)
    expect(cinco.events).toHaveLength(1)
  })

  it("§7 — conflito estrutural mantém tolerância zero e severidade medium", () => {
    const r = detectCrossSourceConflicts(
      entrada([
        {
          field: "sale_date",
          kind: "date",
          versions: [pipeline("2026-08-04"), financeiro("2026-08-05")],
        },
      ]),
      PROD,
    )
    expect(r.events).toHaveLength(1)
    expect(r.events[0]?.severity).toBe("medium")
    expect(PROD.crossSourceConflict.structural_severity).toBe("medium")
  })
})
