import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { CONTRACT_NAMES, assertValid, loadedContracts, validate } from "../src/contracts"
import type { ContractName } from "../src/contracts"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function readJson(...segments: string[]): unknown {
  return JSON.parse(readFileSync(join(ROOT, ...segments), "utf8")) as unknown
}

function readDir(...segments: string[]): { name: string; value: unknown }[] {
  const dir = join(ROOT, ...segments)
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, value: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown }))
}

describe("compilação dos contratos", () => {
  it("todos os seis contratos compilam sob ajv strict", () => {
    expect([...loadedContracts()].sort()).toEqual([...CONTRACT_NAMES].sort())
  })
})

describe("fixtures sintéticas satisfazem os contratos", () => {
  const cases: [ContractName, string[]][] = [
    ["snapshot", ["fixtures", "synthetic", "snapshots"]],
    ["event", ["fixtures", "synthetic", "events"]],
    ["evidence", ["fixtures", "synthetic", "evidence"]],
  ]

  for (const [contract, segments] of cases) {
    describe(contract, () => {
      for (const { name, value } of readDir(...segments)) {
        it(`${name} é válido`, () => {
          const result = validate(contract, value)
          expect(result.ok ? [] : result.issues).toEqual([])
        })
      }
    })
  }

  it("a recomendação dourada do caso A é válida", () => {
    const result = validate("recommendation", readJson("fixtures", "golden", "recommendation_caso_a.json"))
    expect(result.ok ? [] : result.issues).toEqual([])
  })
})

describe("snapshot — o que o contrato recusa", () => {
  const valid = () =>
    structuredClone(readJson("fixtures", "synthetic", "snapshots", "snap_2026_08_pipeline.json")) as Record<string, unknown>

  it("recusa propriedade desconhecida (negação por padrão)", () => {
    const payload = { ...valid(), campo_inventado: 1 }
    expect(validate("snapshot", payload).ok).toBe(false)
  })

  it("recusa fonte fora do enum", () => {
    const payload = { ...valid(), source_system: "planilha_do_zap" }
    expect(validate("snapshot", payload).ok).toBe(false)
  })

  it("recusa rows_skipped ausente — descarte silencioso é proibido", () => {
    const payload = valid()
    delete payload["rows_skipped"]
    expect(validate("snapshot", payload).ok).toBe(false)
  })

  it("recusa conflito marcado como resolvido", () => {
    const payload = structuredClone(
      readJson("fixtures", "synthetic", "snapshots", "snap_2026_08_sales.json"),
    ) as { conflicts: { resolved: boolean }[] }
    const first = payload.conflicts[0]
    expect(first).toBeDefined()
    if (first !== undefined) first.resolved = true
    expect(validate("snapshot", payload).ok).toBe(false)
  })

  it("recusa cobertura acima de 100%", () => {
    const payload = valid()
    payload["coverage"] = { expected_units: 20, reporting_units: 21, ratio_bp: 10500 }
    expect(validate("snapshot", payload).ok).toBe(false)
  })
})

describe("event — invariantes da classe de dado", () => {
  const valid = () =>
    structuredClone(readJson("fixtures", "synthetic", "events", "evt_a_parcelamento.json")) as Record<
      string,
      unknown
    >

  it("recusa métrica calculated sem fórmula", () => {
    const payload = valid()
    payload["observed_metric"] = { name: "x", data_class: "calculated", value: 10 }
    expect(validate("event", payload).ok).toBe(false)
  })

  it("recusa métrica inferred sem confiança", () => {
    const payload = valid()
    payload["observed_metric"] = { name: "x", data_class: "inferred", value: 10 }
    expect(validate("event", payload).ok).toBe(false)
  })

  it("recusa forecast sem faixa", () => {
    const payload = valid()
    payload["observed_metric"] = { name: "x", data_class: "forecast", confidence_bp: 5000 }
    expect(validate("event", payload).ok).toBe(false)
  })

  it("recusa gap que carrega valor — ausência não vira número", () => {
    const payload = valid()
    payload["observed_metric"] = {
      name: "x",
      data_class: "gap",
      gap_reason: "DATA_NOT_AVAILABLE",
      value: 0,
    }
    expect(validate("event", payload).ok).toBe(false)
  })

  it("aceita gap sem valor", () => {
    const payload = valid()
    payload["observed_metric"] = { name: "x", data_class: "gap", gap_reason: "EMPTY_DENOMINATOR" }
    expect(validate("event", payload).ok).toBe(true)
  })

  it("recusa subject_ref que não seja pseudônimo", () => {
    const payload = valid()
    payload["contributing_cases"] = [
      { subject_ref: "joao_da_silva", contribution: { count: 1 } },
    ]
    expect(validate("event", payload).ok).toBe(false)
  })

  it("recusa evento sem evidência", () => {
    const payload = valid()
    payload["evidence_refs"] = []
    expect(validate("event", payload).ok).toBe(false)
  })
})

describe("recommendation — o contrato que separa recomendação de opinião", () => {
  const valid = () =>
    structuredClone(readJson("fixtures", "golden", "recommendation_caso_a.json")) as Record<
      string,
      unknown
    >

  it("recusa menos de três alternativas", () => {
    const payload = valid()
    const alts = payload["alternatives"] as unknown[]
    payload["alternatives"] = alts.slice(0, 2)
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa três alternativas da mesma postura", () => {
    const payload = valid()
    const alts = payload["alternatives"] as { stance: string }[]
    for (const a of alts) a.stance = "conservative"
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa alternativa sem risco declarado", () => {
    const payload = valid()
    const alts = payload["alternatives"] as Record<string, unknown>[]
    const first = alts[0]
    expect(first).toBeDefined()
    if (first !== undefined) delete first["risk"]
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa causa provável não marcada como inferência", () => {
    const payload = valid()
    const cause = payload["probable_cause"] as Record<string, unknown>
    cause["is_inference"] = false
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa human_decision_required = false", () => {
    const payload = valid()
    payload["human_decision_required"] = false
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa conflito declarado como resolvido pelo agente", () => {
    const payload = valid()
    const dq = payload["data_quality"] as { conflicts: { resolved: boolean }[] }
    const first = dq.conflicts[0]
    expect(first).toBeDefined()
    if (first !== undefined) first.resolved = true
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa proveniência sem modelo — troca silenciosa de modelo não passa", () => {
    const payload = valid()
    const prov = payload["provenance"] as Record<string, unknown>
    delete prov["model"]
    expect(validate("recommendation", payload).ok).toBe(false)
  })

  it("recusa fato sem evidência", () => {
    const payload = valid()
    const fact = payload["fact"] as Record<string, unknown>
    fact["evidence_refs"] = []
    expect(validate("recommendation", payload).ok).toBe(false)
  })
})

describe("decision — ledger append-only", () => {
  const base = {
    decision_id: "dec_caso_a_001",
    schema_version: "1.0.0",
    recommendation_id: "rec_caso_a_parcelamento_2026_08",
    run_id: "run_2026_08_16_0905",
    decided_at: "2026-08-16T12:00:00.000Z",
    decided_by_role: "ceo",
  }

  it("aceita decisão aprovada com postura escolhida", () => {
    expect(validate("decision", { ...base, outcome: "approved", chosen_stances: ["moderate"] }).ok).toBe(
      true,
    )
  })

  it("recusa aprovação sem dizer o que foi aprovado", () => {
    expect(validate("decision", { ...base, outcome: "approved" }).ok).toBe(false)
  })

  it("aceita rejeição sem postura", () => {
    expect(validate("decision", { ...base, outcome: "rejected" }).ok).toBe(true)
  })

  it("permite resolução humana de conflito como evento novo", () => {
    const comResolucao = {
      ...base,
      outcome: "approved",
      chosen_stances: ["moderate"],
      conflict_resolutions: [
        {
          conflict_id: "conf_vendas_pipeline_vs_financeiro",
          resolution: "chose_version",
          chosen_version_repr: "financeiro: 14",
          rationale: "Conciliação do backoffice confirmou as 6 vendas sem contrapartida.",
          resolved_at: "2026-08-20T10:00:00.000Z",
          resolved_by_role: "backoffice",
          evidence_refs: ["ev_b_financeiro_vendas"],
        },
      ],
    }
    expect(validate("decision", comResolucao).ok).toBe(true)
  })

  it("resolução por escolha exige dizer QUAL versão foi escolhida", () => {
    const semVersao = {
      ...base,
      outcome: "approved",
      chosen_stances: ["moderate"],
      conflict_resolutions: [
        {
          conflict_id: "conf_vendas_pipeline_vs_financeiro",
          resolution: "chose_version",
          rationale: "porque sim",
          resolved_at: "2026-08-20T10:00:00.000Z",
          resolved_by_role: "backoffice",
        },
      ],
    }
    expect(validate("decision", semVersao).ok).toBe(false)
  })

  it("permite manter o conflito aberto conscientemente", () => {
    const mantido = {
      ...base,
      outcome: "deepen",
      conflict_resolutions: [
        {
          conflict_id: "conf_data_venda_divergente",
          resolution: "kept_open",
          rationale: "Diferença de um dia não muda a decisão; resolver custa mais do que vale.",
          resolved_at: "2026-08-20T10:00:00.000Z",
          resolved_by_role: "ceo",
        },
      ],
    }
    expect(validate("decision", mantido).ok).toBe(true)
  })

  it("a resolução NÃO altera o conflito original — o snapshot segue com resolved: false", () => {
    // O contrato de snapshot continua exigindo `const false`. A resolução vive
    // no ledger de decisão, vinculada por conflict_id, e o histórico preserva
    // que houve divergência.
    const snapshot = structuredClone(
      readJson("fixtures", "synthetic", "snapshots", "snap_2026_08_sales.json"),
    ) as { conflicts: { resolved: boolean }[] }
    const first = snapshot.conflicts[0]
    if (first !== undefined) first.resolved = true
    expect(validate("snapshot", snapshot).ok).toBe(false)
  })

  it("registra correção por supersedes, nunca por sobrescrita", () => {
    const corrected = {
      ...base,
      decision_id: "dec_caso_a_002",
      outcome: "combined",
      chosen_stances: ["conservative", "moderate"],
      supersedes: "dec_caso_a_001",
    }
    expect(validate("decision", corrected).ok).toBe(true)
  })
})

describe("assertValid", () => {
  it("aborta com os caminhos dos problemas", () => {
    expect(() => {
      assertValid("snapshot", { snapshot_id: "x" })
    }).toThrow(/não satisfaz o contrato/)
  })
})

// ---------------------------------------------------------------------------
// Invariantes endurecidas (Fase 1.1)
// ---------------------------------------------------------------------------

describe("event.materiality — o basis obriga o campo correspondente", () => {
  const comMaterialidade = (materiality: unknown): boolean => {
    const payload = structuredClone(
      readJson("fixtures", "synthetic", "events", "evt_a_parcelamento.json"),
    ) as Record<string, unknown>
    payload["materiality"] = materiality
    return validate("event", payload).ok
  }

  it("recusa basis amount_cents sem amount_cents", () => {
    expect(comMaterialidade({ basis: "amount_cents", count: 3 })).toBe(false)
  })

  it("recusa basis count sem count", () => {
    expect(comMaterialidade({ basis: "count", amount_cents: 100 })).toBe(false)
  })

  it("recusa basis ratio_bp sem ratio_bp", () => {
    expect(comMaterialidade({ basis: "ratio_bp", count: 3 })).toBe(false)
  })

  it("aceita quando basis e campo combinam", () => {
    expect(comMaterialidade({ basis: "ratio_bp", ratio_bp: 5000 })).toBe(true)
  })
})

describe("event.metric — invariantes completas de classe de dado", () => {
  const comMetrica = (metric: unknown): boolean => {
    const payload = structuredClone(
      readJson("fixtures", "synthetic", "events", "evt_a_parcelamento.json"),
    ) as Record<string, unknown>
    payload["observed_metric"] = metric
    return validate("event", payload).ok
  }

  it("recusa observed sem valor", () => {
    expect(comMetrica({ name: "vendas", data_class: "observed" })).toBe(false)
  })

  it("recusa gap com faixa", () => {
    expect(
      comMetrica({
        name: "vendas",
        data_class: "gap",
        gap_reason: "LOW_CONFIDENCE",
        range_low: 1,
        range_high: 2,
      }),
    ).toBe(false)
  })

  it("recusa gap com fórmula", () => {
    expect(
      comMetrica({ name: "vendas", data_class: "gap", gap_reason: "LOW_CONFIDENCE", formula: "a/b" }),
    ).toBe(false)
  })

  it("recusa gap com confiança — ausência não tem grau", () => {
    expect(
      comMetrica({
        name: "vendas",
        data_class: "gap",
        gap_reason: "LOW_CONFIDENCE",
        confidence_bp: 5000,
      }),
    ).toBe(false)
  })

  it("recusa nome de métrica que não seja identificador técnico", () => {
    expect(comMetrica({ name: "Maria da Silva", data_class: "observed", value: 1 })).toBe(false)
  })
})

describe("event.contributing_case — contribuição não pode ser vazia", () => {
  it("recusa contribuição sem nenhuma grandeza", () => {
    const payload = structuredClone(
      readJson("fixtures", "synthetic", "events", "evt_a_parcelamento.json"),
    ) as Record<string, unknown>
    payload["contributing_cases"] = [{ subject_ref: "subj_9f2a4c6e8b0d1357", contribution: {} }]
    expect(validate("event", payload).ok).toBe(false)
  })
})

describe("snapshot.conflict — `resolved` é obrigatório", () => {
  it("recusa conflito que omite o campo", () => {
    const payload = structuredClone(
      readJson("fixtures", "synthetic", "snapshots", "snap_2026_08_sales.json"),
    ) as { conflicts: Record<string, unknown>[] }
    const first = payload.conflicts[0]
    if (first !== undefined) delete first["resolved"]
    expect(validate("snapshot", payload).ok).toBe(false)
  })
})

describe("evidence — especificidade da localização por kind", () => {
  const base = {
    evidence_id: "ev_x",
    snapshot_id: "snap_x",
    observed_at: "2026-08-16T09:00:00.000Z",
  }

  it("recusa `cell` sem coluna", () => {
    expect(
      validate("evidence", {
        ...base,
        kind: "cell",
        locator: { dataset_id: "d", sheet: "Vendas", row_key: "a".repeat(64) },
      }).ok,
    ).toBe(false)
  })

  it("recusa `cell` sem row_key", () => {
    expect(
      validate("evidence", {
        ...base,
        kind: "cell",
        locator: { dataset_id: "d", sheet: "Vendas", column: "Total" },
      }).ok,
    ).toBe(false)
  })

  it("recusa `row` sem row_key", () => {
    expect(
      validate("evidence", { ...base, kind: "row", locator: { dataset_id: "d", sheet: "Vendas" } })
        .ok,
    ).toBe(false)
  })

  it("recusa `aggregate` sem aba", () => {
    expect(validate("evidence", { ...base, kind: "aggregate", locator: { dataset_id: "d" } }).ok).toBe(
      false,
    )
  })

  it("aceita `cell` completa", () => {
    expect(
      validate("evidence", {
        ...base,
        kind: "cell",
        locator: { dataset_id: "d", sheet: "Vendas", row_key: "a".repeat(64), column: "Total" },
      }).ok,
    ).toBe(true)
  })
})

describe("recommendation.alternative.impact — invariantes por classe de dado", () => {
  const comImpacto = (impact: unknown): boolean => {
    const payload = structuredClone(
      readJson("fixtures", "golden", "recommendation_caso_a.json"),
    ) as { alternatives: Record<string, unknown>[] }
    const first = payload.alternatives[0]
    if (first !== undefined) first["impact"] = impact
    return validate("recommendation", payload).ok
  }

  it("recusa forecast sem faixa", () => {
    expect(comImpacto({ data_class: "forecast", confidence_bp: 3000, narrative: "x" })).toBe(false)
  })

  it("recusa forecast sem confiança", () => {
    expect(
      comImpacto({ data_class: "forecast", range_low_cents: -1, range_high_cents: 1 }),
    ).toBe(false)
  })

  it("recusa calculated sem valor", () => {
    expect(comImpacto({ data_class: "calculated", narrative: "x" })).toBe(false)
  })

  it("recusa calculated com faixa — número calculado não tem intervalo", () => {
    expect(
      comImpacto({ data_class: "calculated", amount_cents: 100, range_low_cents: 50 }),
    ).toBe(false)
  })

  it("recusa inferred sem confiança", () => {
    expect(comImpacto({ data_class: "inferred", amount_cents: 100 })).toBe(false)
  })

  it("recusa gap com número", () => {
    expect(comImpacto({ data_class: "gap", narrative: "x", amount_cents: 100 })).toBe(false)
  })

  it("aceita gap só com narrativa", () => {
    expect(comImpacto({ data_class: "gap", narrative: "impacto não estimável" })).toBe(true)
  })
})

describe("recommendation — `resolved` obrigatório no conflito declarado", () => {
  it("recusa conflito que omite o campo", () => {
    const payload = structuredClone(
      readJson("fixtures", "golden", "recommendation_caso_a.json"),
    ) as { data_quality: { conflicts: Record<string, unknown>[] } }
    const first = payload.data_quality.conflicts[0]
    if (first !== undefined) delete first["resolved"]
    expect(validate("recommendation", payload).ok).toBe(false)
  })
})

describe("decision — posturas escolhidas", () => {
  const base = {
    decision_id: "dec_x",
    schema_version: "1.0.0",
    recommendation_id: "rec_x",
    run_id: "run_x",
    decided_at: "2026-08-16T12:00:00.000Z",
    decided_by_role: "ceo",
  }

  it("recusa aprovação com lista vazia", () => {
    expect(validate("decision", { ...base, outcome: "approved", chosen_stances: [] }).ok).toBe(false)
  })

  it("recusa postura duplicada", () => {
    expect(
      validate("decision", {
        ...base,
        outcome: "approved",
        chosen_stances: ["moderate", "moderate"],
      }).ok,
    ).toBe(false)
  })

  it("recusa `combined` com uma única postura", () => {
    expect(
      validate("decision", { ...base, outcome: "combined", chosen_stances: ["moderate"] }).ok,
    ).toBe(false)
  })

  it("aceita `combined` com duas posturas distintas", () => {
    expect(
      validate("decision", {
        ...base,
        outcome: "combined",
        chosen_stances: ["conservative", "moderate"],
      }).ok,
    ).toBe(true)
  })
})

describe("aros-briefing — sanitização precisa comprovar TODOS os checks", () => {
  const base = {
    briefing_id: "brief_agosto",
    schema_version: "1.0.0",
    generated_at: "2026-08-16T12:00:00.000Z",
    approved_by_human: false,
    context: {
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      summary: "Concentração de prazo acima de 19 parcelas.",
    },
    metrics: [{ name: "share_prazo_longo", data_class: "calculated", value_repr: "50,00%" }],
    hypotheses: [{ statement: "prazo usado como alavanca", is_inference: true }],
    questions: ["Que criativo reduz dependência de prazo?"],
  }

  const TODOS = ["no_cpf", "no_phone", "no_email", "no_person_name", "no_raw_source_text"]

  it("recusa sanitização parcial", () => {
    expect(
      validate("aros-briefing", {
        ...base,
        sanitization: { pii_removed: true, checks_passed: ["no_cpf"] },
      }).ok,
    ).toBe(false)
  })

  it("recusa lista completa em quantidade mas com repetição", () => {
    expect(
      validate("aros-briefing", {
        ...base,
        sanitization: {
          pii_removed: true,
          checks_passed: ["no_cpf", "no_cpf", "no_phone", "no_email", "no_person_name"],
        },
      }).ok,
    ).toBe(false)
  })

  it("recusa pii_removed falso", () => {
    expect(
      validate("aros-briefing", {
        ...base,
        sanitization: { pii_removed: false, checks_passed: TODOS },
      }).ok,
    ).toBe(false)
  })

  it("aceita os cinco checks", () => {
    expect(
      validate("aros-briefing", {
        ...base,
        sanitization: { pii_removed: true, checks_passed: TODOS },
      }).ok,
    ).toBe(true)
  })
})
