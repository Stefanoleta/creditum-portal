import { describe, expect, it } from "vitest"
import { ReadOnlyGateway } from "../src/gateway"
import { POC_ALLOWLIST } from "../src/allowlist"
import { createValidatedStore, loadSyntheticStore } from "../src/store"
import { GatewayError } from "../src/errors"
import { CLOCK, FACTORY_OPTS, rawEvent, rawEvidence, rawSnapshot } from "./helpers"

function gateway(): ReadOnlyGateway {
  return new ReadOnlyGateway(loadSyntheticStore(FACTORY_OPTS), POC_ALLOWLIST, CLOCK)
}

describe("allowlist de fontes", () => {
  it("lista apenas snapshots de fontes permitidas", () => {
    const { data } = gateway().listSnapshots()
    expect(new Set(data.map((s) => s.source_system))).toEqual(new Set(["google_sheets"]))
  })

  it("o snapshot da Omie existe no store mas é invisível ao plano de consulta", () => {
    const store = loadSyntheticStore(FACTORY_OPTS)
    expect(store.allSnapshots().some((s) => s.source_system === "omie")).toBe(true)

    const { data } = gateway().listSnapshots()
    expect(data.some((s) => s.snapshot_id === "snap_2026_08_omie_bloqueado")).toBe(false)
  })

  it("buscar o snapshot bloqueado devolve o mesmo erro de inexistente — sem enumeração", () => {
    const g = gateway()

    const codigo = (id: string): string => {
      try {
        g.getSnapshot(id)
        return "sem-erro"
      } catch (e) {
        return (e as GatewayError).code
      }
    }

    expect(codigo("snap_2026_08_omie_bloqueado")).toBe("UNKNOWN_SNAPSHOT")
    expect(codigo("snap_nao_existe_mesmo")).toBe("UNKNOWN_SNAPSHOT")
  })

  it("recusa consulta explícita a fonte fora da allowlist", () => {
    expect(() => gateway().listSnapshots({ source_system: "omie" })).toThrowError(
      /não é consultável/,
    )
  })
})

describe("projeção de campos do payload", () => {
  // `internal_margin_bp` é campo LEGÍTIMO do contrato de snapshot — a ingestão
  // pode gravá-lo. Ele simplesmente não está na allowlist do agente. É o que
  // prova que schema e allowlist são camadas distintas.
  const store = createValidatedStore(
    {
      snapshots: [
        rawSnapshot({
          snapshot_id: "snap_projecao",
          payload: { sales_count: 14, internal_margin_bp: 4200 },
        }),
      ],
    },
    FACTORY_OPTS,
  )

  const g = new ReadOnlyGateway(store, POC_ALLOWLIST, CLOCK)

  it("devolve só o que está na allowlist de campos", () => {
    const { data } = g.getSnapshot("snap_projecao")
    expect(Object.keys(data.payload)).toEqual(["sales_count"])
  })

  it("o campo interno existe no store, apenas não é exposto", () => {
    expect(store.allSnapshots()[0]?.payload.internal_margin_bp).toBe(4200)
  })

  it("a allowlist de campos é explícita e revisável", () => {
    expect(POC_ALLOWLIST.payloadFields).toContain("sales_count")
    expect(POC_ALLOWLIST.payloadFields).not.toContain("internal_margin_bp")
    expect(POC_ALLOWLIST.payloadFields).not.toContain("unit_breakdown")
  })
})

describe("unit_breakdown não atravessa para o modelo — resíduo R1", () => {
  // As chaves são nomes livres de unidade. Nome de pessoa numa chave não é
  // detectável sem heurística, e heurística de nome está fora de escopo. Então
  // o mapa inteiro fica fora do caminho `to_model` até a Fase 2 canonicalizar as
  // unidades (D13) e a chave virar identificador fechado.
  const store = createValidatedStore(
    {
      snapshots: [
        rawSnapshot({
          snapshot_id: "snap_unidades",
          payload: {
            sales_count: 14,
            unit_breakdown: { "Mogi das Cruzes": 5, "Maria Silva": 1 },
          },
        }),
      ],
    },
    FACTORY_OPTS,
  )

  it("o mapa é preservado no store para auditoria e para a Fase 2", () => {
    expect(store.allSnapshots()[0]?.payload.unit_breakdown).toEqual({
      "Mogi das Cruzes": 5,
      "Maria Silva": 1,
    })
  })

  it("nenhuma chave de unidade aparece na resposta ao modelo", () => {
    const resposta = new ReadOnlyGateway(store, POC_ALLOWLIST, CLOCK).getSnapshot("snap_unidades")

    expect(Object.keys(resposta.data.payload)).toEqual(["sales_count"])
    expect(JSON.stringify(resposta)).not.toContain("Maria Silva")
    expect(JSON.stringify(resposta)).not.toContain("Mogi das Cruzes")
  })
})

describe("frescor agregado — vale a dependência MAIS VELHA", () => {
  const doisSnapshots = createValidatedStore(
    {
      snapshots: [
        rawSnapshot({
          snapshot_id: "snap_novo",
          observed_at: "2026-08-16T09:00:00.000Z",
          ingested_at: "2026-08-16T09:05:00.000Z",
        }),
        rawSnapshot({
          snapshot_id: "snap_velho",
          observed_at: "2026-06-01T09:00:00.000Z",
          ingested_at: "2026-06-01T09:05:00.000Z",
        }),
      ],
    },
    FACTORY_OPTS,
  )

  it("as_of é o observado mais antigo, não o mais recente", () => {
    const { meta } = new ReadOnlyGateway(doisSnapshots, POC_ALLOWLIST, CLOCK).listSnapshots()
    expect(meta.as_of).toBe("2026-06-01T09:00:00.000Z")
  })

  it("a idade reflete o mais antigo — misturar novo com velho não rejuvenesce a resposta", () => {
    const { meta } = new ReadOnlyGateway(doisSnapshots, POC_ALLOWLIST, CLOCK).listSnapshots()
    // 2026-06-01T09:00Z → 2026-08-16T15:00Z
    expect(meta.data_age_hours).toBeGreaterThan(24 * 75)
  })

  it("compara por instante, não por ordenação textual de string", () => {
    // Armadilha: textualmente "2026-08-15T23:00-05:00" vem ANTES de
    // "2026-08-16T01:00Z", mas temporalmente é 3h DEPOIS (04:00Z vs 01:00Z).
    // Ordenação de string escolheria o snapshot errado como o mais velho.
    const comFuso = createValidatedStore(
      {
        snapshots: [
          rawSnapshot({
            snapshot_id: "snap_utc",
            observed_at: "2026-08-16T01:00:00.000Z",
            ingested_at: "2026-08-16T02:00:00.000Z",
          }),
          rawSnapshot({
            snapshot_id: "snap_offset",
            observed_at: "2026-08-15T23:00:00.000-05:00",
            ingested_at: "2026-08-16T05:00:00.000Z",
          }),
        ],
      },
      FACTORY_OPTS,
    )

    const { meta } = new ReadOnlyGateway(comFuso, POC_ALLOWLIST, CLOCK).listSnapshots()
    expect(meta.as_of).toBe("2026-08-16T01:00:00.000Z")
    expect(meta.data_age_hours).toBe(14)
  })
})

describe("timestamp no futuro em relação ao relógio do gateway", () => {
  // O snapshot é válido no momento da ingestão (factory com relógio adiantado),
  // mas o gateway lê com relógio anterior. É o caso real de desvio de relógio
  // entre a máquina de ingestão e a de consulta.
  const futuro = createValidatedStore(
    {
      snapshots: [
        rawSnapshot({
          snapshot_id: "snap_do_futuro",
          observed_at: "2026-08-16T20:00:00.000Z",
          ingested_at: "2026-08-16T20:05:00.000Z",
        }),
      ],
    },
    { now: new Date("2026-08-17T00:00:00.000Z") },
  )

  const g = new ReadOnlyGateway(futuro, POC_ALLOWLIST, CLOCK)

  it("degrada para insufficient — idade desconhecida não é frescor", () => {
    expect(g.getSnapshot("snap_do_futuro").meta.quality_status).toBe("insufficient")
  })

  it("sinaliza a anomalia explicitamente", () => {
    expect(g.getSnapshot("snap_do_futuro").meta.clock_anomaly).toBe(true)
  })

  it("não reporta idade negativa", () => {
    expect(g.getSnapshot("snap_do_futuro").meta.data_age_hours).toBe(0)
  })

  it("resposta normal não marca anomalia", () => {
    expect(gateway().listSnapshots().meta.clock_anomaly).toBe(false)
  })
})

describe("metadados obrigatórios de toda resposta", () => {
  it("carrega frescor, qualidade, cobertura e versão de contrato", () => {
    const { meta } = gateway().listSnapshots()
    expect(meta.as_of).toBe("2026-08-16T09:00:00.000Z")
    expect(meta.data_age_hours).toBe(6)
    expect(meta.coverage_ratio_bp).toBe(9500)
    expect(meta.contract_version).toBe("1.0.0")
    expect(meta.source_systems).toEqual(["google_sheets"])
  })

  it("a qualidade é a mais fraca do conjunto — conflito domina degradação", () => {
    expect(gateway().listSnapshots().meta.quality_status).toBe("conflicted")
  })

  it("resposta vazia é 'insufficient', nunca 'ok'", () => {
    const { data, meta } = gateway().listSnapshots({ period_start: "2027-01-01" })
    expect(data).toHaveLength(0)
    expect(meta.quality_status).toBe("insufficient")
    expect(meta.coverage_ratio_bp).toBeNull()
  })

  it("resposta vazia não finge ser fresca", () => {
    expect(gateway().listSnapshots({ period_start: "2027-01-01" }).meta.data_age_hours).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })
})

describe("consulta de eventos", () => {
  it("devolve os quatro casos de negócio", () => {
    const { data } = gateway().listEvents()
    expect(data.map((e) => e.event_type).sort()).toEqual([
      "data_quality_conflict",
      "first_due_date_concentration",
      "installment_concentration",
      "material_single_case",
    ])
  })

  it("filtra por gravidade mínima", () => {
    const { data } = gateway().listEvents({ min_severity: "high" })
    expect(data.map((e) => e.event_id).sort()).toEqual([
      "evt_a_parcelamento_agosto",
      "evt_b_conflito_vendas_agosto",
      "evt_d_caso_material_agosto",
    ])
  })

  it("filtra por tipo", () => {
    expect(gateway().listEvents({ event_type: "first_due_date_concentration" }).data).toHaveLength(1)
  })

  it("esconde evento cujo lastro inclui fonte bloqueada", () => {
    const store = createValidatedStore(
      {
        snapshots: [
          rawSnapshot({ snapshot_id: "snap_visivel", evidence_refs: ["ev_visivel"] }),
          rawSnapshot({ snapshot_id: "snap_oculto", source_system: "omie" }),
        ],
        evidence: [rawEvidence({ evidence_id: "ev_visivel", snapshot_id: "snap_visivel" })],
        events: [
          rawEvent({
            event_id: "evt_lastro_bloqueado",
            snapshot_ids: ["snap_visivel", "snap_oculto"],
            evidence_refs: ["ev_visivel"],
          }),
        ],
      },
      FACTORY_OPTS,
    )

    const g = new ReadOnlyGateway(store, POC_ALLOWLIST, CLOCK)
    expect(g.listEvents().data).toHaveLength(0)
  })
})

describe("casos materialmente responsáveis", () => {
  it("devolve pseudônimos e contribuição, nunca identidade", () => {
    const { data } = gateway().getMaterialCases("evt_a_parcelamento_agosto")
    expect(data).toHaveLength(3)
    for (const c of data) {
      expect(c.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
      expect(c.contribution.share_of_event_bp).toBeGreaterThan(0)
    }
  })

  it("evento desconhecido não vaza a existência de nada", () => {
    expect(() => gateway().getMaterialCases("evt_inventado")).toThrowError(/não disponível/)
  })
})

describe("evidências", () => {
  it("devolve apenas as pedidas, e só de snapshots visíveis", () => {
    const { data } = gateway().getEvidence(["ev_a_hist_parcelas", "ev_c_hist_vencimento"])
    expect(data.map((e) => e.evidence_id).sort()).toEqual([
      "ev_a_hist_parcelas",
      "ev_c_hist_vencimento",
    ])
  })

  it("evidência computed sempre carrega fórmula", () => {
    expect(gateway().getEvidence(["ev_a_hist_parcelas"]).data[0]?.formula).toBeTruthy()
  })
})
