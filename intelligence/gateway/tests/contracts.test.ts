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
