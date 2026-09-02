/**
 * Fase 3.0b — o assembler determinístico, provado pelos seis estados.
 *
 * As fixtures são construídas a partir do CAMINHO REAL: `FakeDrive` → provider →
 * `runLucasCurrentPeriodAnalysis` → assembler. Nenhum teste monta um
 * `LucasAnalysisOutcome` à mão para os estados que o pipeline sabe produzir — montar
 * à mão provaria que o assembler funciona sobre uma entrada que talvez nunca ocorra,
 * que é a armadilha que quatro NO-SHIP desta linha de fases me ensinaram.
 */

import { describe, expect, it } from "vitest"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { runLucasCurrentPeriodAnalysis } from "../../src/lucas/analysis"
import type { LucasAnalysisOutcome } from "../../src/lucas/analysis"
import { LUCAS_OFFICIAL_SHEET, LUCAS_DATASET_ID } from "../../src/lucas/drive-port"
import { addCivilDays } from "../../../detectors/src/civil-date"
import { validate } from "../../../gateway/src/contracts"
import {
  assembleExecutiveBriefingV1,
  BRIEFING_ID_VERSION,
} from "../../src/briefing/executive-briefing"
import { FakeDrive } from "../lucas/fake-drive"
import type { ArquivoFalso } from "../lucas/fake-drive"
import {
  HEADER_AGOSTO_REAL,
  cpfSintetico,
  linhaAgostoReal,
  observacao,
  sheetsSerial,
} from "../lucas/fixtures"
import type { PrazoSpec } from "../lucas/fixtures"

const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
const AGORA = new Date("2026-08-19T18:00:00.000Z")
const GERADO_EM = "2026-08-19T18:00:00.000Z"
const PERIODO = "2026-08"
const HOJE = "2026-08-19"

interface Caso {
  readonly status: "P" | "A" | "E" | "C"
  readonly deadline: string | null
  readonly tipo?: string | null
  readonly cpf?: unknown
}

function arquivo(casos: readonly Caso[], over: Partial<ArquivoFalso> = {}): ArquivoFalso {
  const formatadas: unknown[][] = []
  const prazos: (PrazoSpec | null)[] = []
  casos.forEach((c, i) => {
    formatadas.push([
      ...linhaAgostoReal({
        venc: "27/08",
        cpf: c.cpf ?? cpfSintetico(i + 1),
        unidade: "Meriti",
        parcelas: 10,
        ticket: "R$ 5.000,00",
        status: c.status,
        desembolso: c.deadline === null ? "" : `${c.deadline.slice(8)}/${c.deadline.slice(5, 7)}`,
      }),
    ])
    prazos.push(
      c.deadline === null
        ? null
        : { serial: sheetsSerial(c.deadline), ...(c.tipo === undefined ? {} : { type: c.tipo }) },
    )
  })
  return {
    meta: {
      file_id: "f1",
      name: "Novos Alunos - Agosto",
      mime_type: SHEETS_MIME,
      modified_time: "2026-08-19T13:39:00Z",
    },
    sheets: { [LUCAS_OFFICIAL_SHEET]: { headers: HEADER_AGOSTO_REAL, rows: formatadas } },
    observations: {
      [LUCAS_OFFICIAL_SHEET]: observacao(HEADER_AGOSTO_REAL, formatadas, prazos),
    },
    ...over,
  }
}

/** Roda o pipeline REAL e devolve o outcome governado. */
const analisar = async (
  arquivos: readonly ArquivoFalso[],
  cfg: { readonly listThrows?: string; readonly readThrows?: string } = {},
): Promise<LucasAnalysisOutcome> => {
  const provider = new LucasMonthlyContractsProvider({
    drive: new FakeDrive({ files: [...arquivos], ...cfg }),
    now: () => AGORA,
  })
  return runLucasCurrentPeriodAnalysis(
    { provider, detected_at: AGORA.toISOString(), metric: "amount_sum_cents", aggregator: "sum" },
    { periodClock: () => AGORA },
  )
}

const montar = (lucas: LucasAnalysisOutcome, over: Record<string, unknown> = {}) =>
  assembleExecutiveBriefingV1({
    generated_at: GERADO_EM,
    period: PERIODO,
    lucas,
    ...over,
  } as never)

const montado = (r: ReturnType<typeof montar>) => {
  expect(r.status, JSON.stringify(r)).toBe("assembled")
  if (r.status !== "assembled") throw new Error("não montou")
  return r.briefing
}

// ═══════════════════════════════════════════════════════════════════════════════
// §40 — toda saída passa pelo contrato canônico
// ═══════════════════════════════════════════════════════════════════════════════

describe("§40 — a saída é sempre schema-válida", () => {
  it("o briefing montado valida contra executive-briefing", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    expect(validate("executive-briefing", b).ok).toBe(true)
  })

  it("§41 — nenhum campo de conveniência fora do schema", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "E", deadline: null }])])))
    for (const proibido of [
      "debug",
      "raw_source",
      "raw_contracts",
      "priority_score",
      "hermes_notes",
      "temporary_data",
    ]) {
      expect(Object.keys(b), proibido).not.toContain(proibido)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §46–§49 — os quatro estados sem captura: DESCONHECIDO NUNCA É ZERO
// ═══════════════════════════════════════════════════════════════════════════════

describe("§46 — source_not_available", () => {
  it("declara a indisponibilidade e NÃO fabrica métrica", async () => {
    // Pasta vazia: nenhum candidato.
    const o = await analisar([])
    expect(o.status).toBe("source_not_available")
    const b = montado(montar(o))

    expect(b.source_health[0]?.view_state).toBe("data_not_available")
    expect(b.source_health[0]?.owner).toBe("LUCAS")
    // O ponto: NENHUMA contagem. Não `0` — ausente.
    expect(b.commercial_state).toEqual({ view_state: "data_not_available" })
    for (const m of [
      "commercial_potential",
      "commercially_confirmed",
      "emitted",
      "historical_realized",
    ]) {
      expect(Object.keys(b.commercial_state), m).not.toContain(m)
    }
    // Detector não ficou "sem achados": não teve entrada.
    expect(b.detector_results).toEqual([{ detector: "D", execution_state: "unavailable" }])
    expect(b.operational_facts).toBeUndefined()
    expect(b.material_findings).toBeUndefined()
    expect(b.evidence_index).toEqual([])
  })

  it("qualidade é `not_measured` — e NUNCA `insufficient`", async () => {
    const b = montado(montar(await analisar([])))
    // Este teste dizia `insufficient` e passava. Estava errado, e a revisão
    // adversarial provou por quê: `insufficient` é "cobertura baixa demais para
    // afirmar" — um RESULTADO de medição. Sem captura não houve medição alguma, e
    // escolher um resultado medido para representar a ausência de medição é inventar
    // veredito. É a mesma família de "desconhecido virou zero", numa casa diferente.
    expect(b.quality_and_coverage.quality_status).toBe("not_measured")
    expect(b.quality_and_coverage.quality_status).not.toBe("insufficient")
    expect(Object.keys(b.quality_and_coverage)).not.toContain("expected_units")
  })
})

describe("§47 — source_error", () => {
  it("preserva o estado de erro e não inventa achado", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])], {
      listThrows: "quota excedida",
    })
    expect(o.status).toBe("source_error")
    const b = montado(montar(o))

    expect(b.source_health[0]?.view_state).toBe("source_error")
    expect(b.commercial_state).toEqual({ view_state: "source_error" })
    expect(b.detector_results[0]?.execution_state).toBe("unavailable")
    expect(b.material_findings).toBeUndefined()
  })

  it("não transporta detalhe cru de erro para o briefing", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])], {
      readThrows: "Bearer abc123 rejeitado em /path/secreto",
    })
    const b = montado(montar(o))
    const s = JSON.stringify(b)
    expect(s).not.toContain("Bearer")
    expect(s).not.toContain("abc123")
    expect(s).not.toContain("secreto")
  })
})

describe("§48 — source_invalid", () => {
  it("preserva invalid_source e não inventa métrica", async () => {
    // Header duplicado: o incidente real da 2.13.
    const duplicado = [...HEADER_AGOSTO_REAL, "Status"]
    const arq: ArquivoFalso = {
      meta: {
        file_id: "f1",
        name: "Novos Alunos - Agosto",
        mime_type: SHEETS_MIME,
        modified_time: "2026-08-19T13:39:00Z",
      },
      sheets: { [LUCAS_OFFICIAL_SHEET]: { headers: duplicado, rows: [] } },
    }
    const o = await analisar([arq])
    expect(o.status).toBe("source_invalid")
    const b = montado(montar(o))

    expect(b.source_health[0]?.view_state).toBe("invalid_source")
    expect(b.commercial_state).toEqual({ view_state: "invalid_source" })
    // A razão governada aparece no detalhe, sem virar métrica.
    expect(JSON.stringify(b.source_health)).toContain("DUPLICATED_HEADER_FIELD")
  })
})

describe("§49 — not_current", () => {
  it("não fabrica o mundo comercial corrente", async () => {
    const arq: ArquivoFalso = {
      ...arquivo([{ status: "P", deadline: HOJE }]),
      meta: {
        file_id: "f1",
        name: "Novos Alunos - Agosto",
        mime_type: SHEETS_MIME,
        modified_time: "2026-08-19T13:39:00Z",
      },
    }
    // Provider devolve o período pedido; para forçar `not_current` seria necessário
    // um provider divergente. Aqui exercito o assembler sobre o estado governado.
    const o: LucasAnalysisOutcome = {
      status: "not_current",
      period: PERIODO,
      capture_period: "2026-07",
      reason: "CLOSED_PERIOD",
    }
    const b = montado(montar(o))
    expect(b.commercial_state).toEqual({ view_state: "data_not_available" })
    expect(b.detector_results[0]?.execution_state).toBe("unavailable")
    expect(JSON.stringify(b.source_health)).toContain("CLOSED_PERIOD")
    expect(JSON.stringify(b.source_health)).toContain("2026-07")
    void arq
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §1–§7 §16 §30–§37 — MEDIDO não é NÃO-MEDIDO
//
// Três situações, e a terceira não é a segunda:
//
//   medido e suficiente      ok / degraded
//   medido e insuficiente    insufficient / conflicted
//   NÃO medido               not_measured
//
// A revisão adversarial provou que o vocabulário anterior não sabia dizer a terceira,
// e que a montagem então escolhia `insufficient` — convertendo ausência de medição em
// conclusão sobre a qualidade.
// ═══════════════════════════════════════════════════════════════════════════════

/** Os quatro estados sem captura utilizável, cada um pelo caminho que o produz. */
const SEM_CAPTURA: readonly {
  readonly nome: string
  readonly outcome: () => Promise<LucasAnalysisOutcome>
}[] = [
  {
    nome: "source_not_available",
    outcome: () => analisar([]),
  },
  {
    nome: "source_error",
    outcome: () =>
      analisar([arquivo([{ status: "P", deadline: HOJE }])], { listThrows: "quota excedida" }),
  },
  {
    nome: "source_invalid",
    outcome: () =>
      analisar([
        {
          meta: {
            file_id: "f1",
            name: "Novos Alunos - Agosto",
            mime_type: SHEETS_MIME,
            modified_time: "2026-08-19T13:39:00Z",
          },
          sheets: { [LUCAS_OFFICIAL_SHEET]: { headers: [...HEADER_AGOSTO_REAL, "Status"], rows: [] } },
        },
      ]),
  },
  {
    nome: "not_current",
    // O provider devolve o período pedido; forçar `not_current` pelo caminho real
    // exigiria um provider divergente. O estado governado é exercido diretamente, e é
    // o único dos quatro em que isso acontece.
    outcome: async (): Promise<LucasAnalysisOutcome> => ({
      status: "not_current",
      period: PERIODO,
      capture_period: "2026-07",
      reason: "CLOSED_PERIOD",
    }),
  },
]

describe("§34 — sem captura, a qualidade é NÃO MEDIDA", () => {
  for (const { nome, outcome } of SEM_CAPTURA) {
    it(`${nome} declara not_measured, nunca insufficient`, async () => {
      const o = await outcome()
      expect(o.status, `esperava ${nome}`).toBe(nome)
      const b = montado(montar(o))
      expect(b.quality_and_coverage.quality_status).toBe("not_measured")
      // O ponto exato do achado HIGH #1.
      expect(b.quality_and_coverage.quality_status).not.toBe("insufficient")
      expect(b.quality_and_coverage.quality_status).not.toBe("ok")
      expect(b.quality_and_coverage.quality_status).not.toBe("degraded")
      expect(b.quality_and_coverage.quality_status).not.toBe("conflicted")
    })
  }

  it("§11 — o CONTRATO proíbe cobertura medida sob not_measured", async () => {
    // A proteção não é a boa conduta do assembler: é estrutural. Quem tentasse
    // escrever a medição de zero no ramo não-medido produziria briefing INVÁLIDO.
    const b = montado(montar(await analisar([])))
    const cru = JSON.parse(JSON.stringify(b)) as Record<string, unknown>
    expect(validate("executive-briefing", cru).ok).toBe(true)
    cru["quality_and_coverage"] = {
      quality_status: "not_measured",
      expected_units: 0,
      reporting_units: 0,
    }
    expect(validate("executive-briefing", cru).ok).toBe(false)
  })

  it("§35 — não-medido NÃO carrega número de cobertura algum", async () => {
    for (const { nome, outcome } of SEM_CAPTURA) {
      const b = montado(montar(await outcome()))
      const chaves = Object.keys(b.quality_and_coverage)
      for (const k of ["expected_units", "reporting_units", "coverage_percent", "missing_units"]) {
        expect(chaves, `${nome}/${k}`).not.toContain(k)
      }
      // Desconhecido não é zero: o valor não é `0`, é AUSENTE.
      expect(JSON.parse(JSON.stringify(b.quality_and_coverage))).toEqual(
        expect.objectContaining({ quality_status: "not_measured" }),
      )
    }
  })

  it("§31 §32 §33 — estado da FONTE e estado da MEDIÇÃO são dimensões distintas", async () => {
    // `source_error` continua sendo `source_error` em `source_health`. Não é
    // substituído por "não medido": um descreve a aquisição da fonte, o outro
    // descreve se houve medição de qualidade. Colapsá-los perderia informação.
    const erro = montado(
      montar(
        await analisar([arquivo([{ status: "P", deadline: HOJE }])], { listThrows: "quota" }),
      ),
    )
    expect(erro.source_health[0]?.view_state).toBe("source_error")
    expect(erro.quality_and_coverage.quality_status).toBe("not_measured")

    const invalido = montado(
      montar(
        await analisar([
          {
            meta: {
              file_id: "f1",
              name: "Novos Alunos - Agosto",
              mime_type: SHEETS_MIME,
              modified_time: "2026-08-19T13:39:00Z",
            },
            sheets: {
              [LUCAS_OFFICIAL_SHEET]: { headers: [...HEADER_AGOSTO_REAL, "Status"], rows: [] },
            },
          },
        ]),
      ),
    )
    expect(invalido.source_health[0]?.view_state).toBe("invalid_source")
    expect(invalido.quality_and_coverage.quality_status).toBe("not_measured")
  })
})

describe("§8 §36 §37 — resultado MEDIDO é transportado, não substituído", () => {
  it("`ok` medido chega como `ok`, pelo caminho real", async () => {
    // Planilha lida sem ressalva de linha: a medição diz `ok`, e o briefing repete.
    const o = await analisar([arquivo([])])
    if (o.status !== "d_executed") throw new Error("estado")
    expect(o.source.quality_status).toBe("ok")
    const b = montado(montar(o))
    expect(b.quality_and_coverage.quality_status).toBe("ok")
  })

  it("`degraded` medido chega como `degraded`, pelo caminho real", async () => {
    // A fixture de agosto carrega ressalva de linha, e a medição da captura conclui
    // `degraded` — utilizável com reserva explícita. Medição real, resultado real.
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    expect(o.source.quality_status).toBe("degraded")
    const b = montado(montar(o))
    expect(b.quality_and_coverage.quality_status).toBe("degraded")
  })

  it("`insufficient` REAL é transportado — o vocabulário não foi banido", async () => {
    // `insufficient` não está proibido: está reservado para quando a MEDIÇÃO diz
    // isso. Hoje o cálculo de qualidade da captura só produz `ok` e `degraded`, então
    // o veredito medido é substituído no ponto exato onde a medição vive — a projeção
    // governada — e todo o resto do resultado segue sendo o do pipeline real.
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    const medido: LucasAnalysisOutcome = {
      ...o,
      source: { ...o.source, quality_status: "insufficient" },
    }
    const b = montado(montar(medido))
    expect(b.quality_and_coverage.quality_status).toBe("insufficient")
    // E aqui a cobertura MEDIDA pode aparecer, porque houve medição.
    expect(Object.keys(b.quality_and_coverage)).toContain("expected_units")
  })

  it("`conflicted` REAL é transportado", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    const b = montado(
      montar({ ...o, source: { ...o.source, quality_status: "conflicted" } }),
    )
    expect(b.quality_and_coverage.quality_status).toBe("conflicted")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §13–§26 §38–§43 — resultado UTILIZÁVEL exige a projeção da fonte
//
// `d_executed` e `d_not_executed` só existem depois de uma captura utilizável. A
// projeção é o que prova isso: dela saem o índice autoritativo de evidência, a
// medição de qualidade e o estado de visão da fonte. Um resultado utilizável sem ela
// não é "fonte ausente" — é invariante violada, e publicar `available` nessa condição
// afirmaria estado comercial sem o lastro que o sustenta.
// ═══════════════════════════════════════════════════════════════════════════════

describe("§38 §41 §42 §43 — projeção ausente falha FECHADO", () => {
  const semProjecao = (o: LucasAnalysisOutcome, como: "null" | "ausente"): LucasAnalysisOutcome => {
    const cru = { ...(o as unknown as Record<string, unknown>) }
    if (como === "null") cru["source"] = null
    else delete cru["source"]
    // O `as` é o ponto do teste: em produção o tipo proíbe isto, e é justamente por
    // isso que a defesa tem de ser de runtime. Objeto desserializado ou cast atravessa
    // o tipo sem tocá-lo.
    return cru as unknown as LucasAnalysisOutcome
  }

  const utilizaveis: readonly {
    readonly nome: "d_executed" | "d_not_executed"
    readonly outcome: () => Promise<LucasAnalysisOutcome>
  }[] = [
    { nome: "d_executed", outcome: () => analisar([arquivo([{ status: "P", deadline: HOJE }])]) },
    {
      nome: "d_not_executed",
      outcome: () =>
        analisar([
          arquivo([
            { status: "P", deadline: HOJE, cpf: cpfSintetico(7) },
            { status: "P", deadline: HOJE, cpf: cpfSintetico(7) },
          ]),
        ]),
    },
  ]

  for (const { nome, outcome } of utilizaveis) {
    for (const como of ["null", "ausente"] as const) {
      it(`${nome} com source ${como} é recusado`, async () => {
        const o = await outcome()
        expect(o.status).toBe(nome)
        const r = montar(semProjecao(o, como))
        expect(r).toEqual({
          status: "not_assembled",
          defect: "MISSING_REQUIRED_SOURCE_PROJECTION",
        })
      })
    }
  }

  it("§42 — NÃO vira estado de fonte nem métrica zerada", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const r = montar(semProjecao(o, "null"))
    // Defeito nosso, não da planilha do Lucas. Confundir os dois esconderia um bug
    // atrás de uma resposta plausível sobre a fonte.
    expect(r.status).toBe("not_assembled")
    if (r.status !== "not_assembled") throw new Error("montou")
    expect(r.defect).not.toBe("OUTPUT_CONTRACT_VIOLATION")
    expect(JSON.stringify(r)).not.toContain("data_not_available")
    expect(JSON.stringify(r)).not.toContain("available_empty")
    expect(JSON.stringify(r)).not.toContain("not_measured")
  })

  it("§25 — nunca cai num índice de evidência vazio por perda da fonte", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const r = montar(semProjecao(o, "null"))
    expect(r.status).toBe("not_assembled")
  })

  it("projeção estruturalmente corrompida também é recusada", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    const corrompidas: readonly Record<string, unknown>[] = [
      { ...o.source, view_state: "quem_sabe" },
      { ...o.source, quality_status: "not_measured" },
      { ...o.source, evidence_ids: "não é lista" },
      { ...o.source, dataset_id: 42 },
    ]
    for (const src of corrompidas) {
      const r = montar({ ...o, source: src } as unknown as LucasAnalysisOutcome)
      expect(r, JSON.stringify(src).slice(0, 80)).toEqual({
        status: "not_assembled",
        defect: "MISSING_REQUIRED_SOURCE_PROJECTION",
      })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §0 §6–§14 §48 — FORMA DE TIPO NÃO É VALOR GOVERNADO
//
// A guarda anterior perguntava "é string?" e seguia. Isso deixava passar identidade
// de fonte inventada e fato de qualidade inventado — que saíam do assembler como
// briefing válido pelo schema, porque o schema tipa `string` e não sabe distinguir
// rótulo governado de rótulo fabricado.
// ═══════════════════════════════════════════════════════════════════════════════

describe("§20–§25 §48 — valor fora do vocabulário canônico falha FECHADO", () => {
  const recusa = { status: "not_assembled", defect: "MISSING_REQUIRED_SOURCE_PROJECTION" }

  /** Um `d_executed` real, com a projeção adulterada em UM campo governado. */
  const comProjecao = async (over: Record<string, unknown>) => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    return montar({ ...o, source: { ...o.source, ...over } } as unknown as LucasAnalysisOutcome)
  }

  it("§6 §34 — dataset_id fora do canônico é recusado", async () => {
    expect(await comProjecao({ dataset_id: "fake_dataset" })).toEqual(recusa)
    expect(await comProjecao({ dataset_id: "Novos Alunos - Agosto" })).toEqual(recusa)
    expect(await comProjecao({ dataset_id: "" })).toEqual(recusa)
  })

  it("§8 §9 §35 — source_quality fora do vocabulário é recusado", async () => {
    expect(await comProjecao({ source_quality: ["FABRICATED_STATE"] })).toEqual(recusa)
    // Misturado com fato real: um inválido contamina o conjunto.
    expect(
      await comProjecao({ source_quality: ["UNKNOWN_HEADER_PRESENT", "FABRICATED_STATE"] }),
    ).toEqual(recusa)
    // §37: nada de aparar/normalizar até o vizinho conhecido.
    expect(await comProjecao({ source_quality: [" unknown_header_present "] })).toEqual(recusa)
    expect(await comProjecao({ source_quality: [42] })).toEqual(recusa)
  })

  it("§11 §13 §14 — chave de row_quality_counts fora do vocabulário é recusada", async () => {
    expect(await comProjecao({ row_quality_counts: { FABRICATED_STATE: 1 } })).toEqual(recusa)
    expect(
      await comProjecao({ row_quality_counts: { IDENTITY_MISSING: 1, FABRICATED_STATE: 1 } }),
    ).toEqual(recusa)
    // §13 — chave de protótipo não é chave governada. `Set.has` recusa; `in` aceitaria.
    expect(await comProjecao({ row_quality_counts: { toString: 1 } })).toEqual(recusa)
    expect(await comProjecao({ row_quality_counts: { constructor: 1 } })).toEqual(recusa)
  })

  it("§12 §23 §24 §25 — contagem inválida é recusada", async () => {
    for (const valor of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "3",
      null,
    ]) {
      expect(
        await comProjecao({ row_quality_counts: { IDENTITY_MISSING: valor } }),
        String(valor),
      ).toEqual(recusa)
    }
  })

  it("§18 — cobertura com número inválido é recusada", async () => {
    for (const cob of [
      { expected_units: -1, reporting_units: 0, ratio_bp: 0 },
      { expected_units: 1.5, reporting_units: 1, ratio_bp: 0 },
      { expected_units: 1, reporting_units: Number.NaN, ratio_bp: 0 },
      { expected_units: Number.MAX_SAFE_INTEGER + 1, reporting_units: 1, ratio_bp: 0 },
    ]) {
      expect(await comProjecao({ coverage: cob }), JSON.stringify(cob)).toEqual(recusa)
    }
  })

  it("§17 — quality_status fora do vocabulário medido é recusado", async () => {
    expect(await comProjecao({ quality_status: "MAGIC" })).toEqual(recusa)
    expect(await comProjecao({ quality_status: "" })).toEqual(recusa)
  })

  it("§16 — view_state fora do vocabulário utilizável é recusado", async () => {
    expect(await comProjecao({ view_state: "data_not_available" })).toEqual(recusa)
    expect(await comProjecao({ view_state: "source_error" })).toEqual(recusa)
  })

  it("§36 — a recusa não ecoa a projeção, o texto fabricado nem PII", async () => {
    const r = await comProjecao({
      dataset_id: "fake_dataset",
      source_quality: ["Bearer abc123 vazado"],
      row_quality_counts: { FABRICATED_STATE: 99 },
    })
    const serializado = JSON.stringify(r)
    for (const proibido of ["fake_dataset", "Bearer", "abc123", "FABRICATED_STATE", "99"]) {
      expect(serializado, proibido).not.toContain(proibido)
    }
  })

  it("§26 — projeção governada VÁLIDA continua montando", async () => {
    // A guarda não pode ser impossível de satisfazer: o caminho real passa, e um
    // conjunto governado montado à mão com valores canônicos também.
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    expect(montar(o).status).toBe("assembled")
    const b = montado(
      montar({
        ...o,
        source: {
          ...o.source,
          dataset_id: LUCAS_DATASET_ID,
          source_quality: ["DUPLICATE_SOURCE_WARNING", "UNKNOWN_HEADER_PRESENT"],
          row_quality_counts: { IDENTITY_MISSING: 0, INVALID_TICKET: 3 },
        },
      } as unknown as LucasAnalysisOutcome),
    )
    expect(JSON.stringify(b.quality_and_coverage)).toContain("DUPLICATE_SOURCE_WARNING")
    expect(JSON.stringify(b.quality_and_coverage)).toContain("INVALID_TICKET=3")
  })

  it("§10 — fato de fonte repetido não vira duas notas", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    const b = montado(
      montar({
        ...o,
        source: {
          ...o.source,
          source_quality: ["UNKNOWN_HEADER_PRESENT", "UNKNOWN_HEADER_PRESENT"],
        },
      } as unknown as LucasAnalysisOutcome),
    )
    const notas = (b.quality_and_coverage.notes ?? []).filter((n) =>
      n.content.includes("source_quality: UNKNOWN_HEADER_PRESENT"),
    )
    // A montante é um conjunto: repetição não é fato adicional.
    expect(notas.length).toBe(1)
  })
})

describe("§16 §39 — a produção CONSTRÓI a projeção, não a promete", () => {
  it("todo d_executed / d_not_executed sai do pipeline com projeção não-nula", async () => {
    const cenarios: readonly (() => Promise<LucasAnalysisOutcome>)[] = [
      () => analisar([arquivo([{ status: "P", deadline: HOJE }])]),
      () => analisar([arquivo([{ status: "E", deadline: HOJE }, { status: "A", deadline: HOJE }])]),
      () => analisar([arquivo([])]),
      () =>
        analisar([
          arquivo([
            { status: "P", deadline: HOJE, cpf: cpfSintetico(7) },
            { status: "P", deadline: HOJE, cpf: cpfSintetico(7) },
          ]),
        ]),
    ]
    let utilizaveis = 0
    for (const cenario of cenarios) {
      const o = await cenario()
      if (o.status !== "d_executed" && o.status !== "d_not_executed") continue
      utilizaveis += 1
      // Não é asserção de tipo: é o objeto que o pipeline real devolveu.
      expect(o.source, o.status).not.toBeNull()
      expect(typeof o.source.dataset_id).toBe("string")
      expect(Array.isArray(o.source.evidence_ids)).toBe(true)
      expect(["available", "available_empty"]).toContain(o.source.view_state)
    }
    expect(utilizaveis).toBeGreaterThanOrEqual(3)
  })
})

describe("§22 §23 §24 §40 — vazio VÁLIDO não é fonte perdida", () => {
  it("planilha sem contratos é `available_empty`, com projeção válida", async () => {
    const o = await analisar([arquivo([])])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    expect(o.source.view_state).toBe("available_empty")
    const b = montado(montar(o))
    expect(b.commercial_state.view_state).toBe("available_empty")
    // Zero aqui é MEDIDO: houve leitura, e a leitura encontrou zero contratos.
    expect(b.commercial_state.commercial_potential).toBe(0)
    expect(b.quality_and_coverage.quality_status).not.toBe("not_measured")
  })

  it("§2 §5 §29 — vazio legítimo: AS DUAS dimensões dizem available_empty", async () => {
    // Este teste falharia com o `source_health` fixo em `available`: o briefing
    // afirmava `available` na saúde da fonte e `available_empty` no comercial ao mesmo
    // tempo — duas afirmações contraditórias sobre a mesma fonte, ambas válidas pelo
    // schema. Afirmar as duas dimensões é o que torna a contradição detectável.
    const o = await analisar([arquivo([])])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    expect(o.source.view_state).toBe("available_empty")
    const b = montado(montar(o))
    expect(b.source_health[0]?.view_state).toBe("available_empty")
    expect(b.commercial_state.view_state).toBe("available_empty")
    // E as duas concordam — não por coincidência, por serem o mesmo valor.
    expect(b.source_health[0]?.view_state).toBe(b.commercial_state.view_state)
  })

  it("§3 — captura com contratos: AS DUAS dizem available", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    expect(b.source_health[0]?.view_state).toBe("available")
    expect(b.commercial_state.view_state).toBe("available")
  })

  it("§28 — a identidade do dataset é a canônica, em qualquer estado", async () => {
    for (const o of [
      await analisar([arquivo([{ status: "P", deadline: HOJE }])]),
      await analisar([arquivo([])]),
      await analisar([]),
    ]) {
      const b = montado(montar(o))
      expect(b.source_health[0]?.dataset_id).toBe(LUCAS_DATASET_ID)
    }
  })

  it("o estado de visão é TRANSPORTADO da projeção, não derivado de row_count", async () => {
    // Uma única autoridade decide `available` × `available_empty`: o provider, ao
    // construir a captura. Se o assembler ainda derivasse de `row_count === 0`, este
    // teste veria `available` — e a divergência entre as duas autoridades só
    // apareceria em produção, no dia em que discordassem.
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    expect(o.source.view_state).toBe("available")
    const b = montado(
      montar({ ...o, source: { ...o.source, view_state: "available_empty" } }),
    )
    // §17: isto NÃO legitima chamador inventando estado de provider — a projeção é
    // objeto governado interno, e a guarda de runtime confere cada valor dela contra
    // o vocabulário canônico. O que o teste prova é que o assembler não RECALCULA o
    // que o provider já decidiu; se recalculasse, veria `available` aqui.
    expect(b.commercial_state.view_state).toBe("available_empty")
    expect(b.source_health[0]?.view_state).toBe("available_empty")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §50 §51 §52 — Detector D
// ═══════════════════════════════════════════════════════════════════════════════

describe("§50 — d_not_executed NUNCA é executed_no_findings", () => {
  it("preserva a razão e os fatos que existem", async () => {
    // Dois contratos com o MESMO CPF: sujeito repetido impede D.
    const mesmo = cpfSintetico(7)
    const o = await analisar([
      arquivo([
        { status: "P", deadline: HOJE, cpf: mesmo },
        { status: "P", deadline: HOJE, cpf: mesmo },
      ]),
    ])
    expect(o.status).toBe("d_not_executed")
    const b = montado(montar(o))

    const d = b.detector_results[0]
    expect(d?.execution_state).toBe("not_executed")
    expect(d?.not_executed_reason).toBe("NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION")
    // E NÃO é o outro estado.
    expect(d?.execution_state).not.toBe("executed_no_findings")
    expect(d?.events).toBeUndefined()

    // Os fatos comerciais SOBREVIVEM: não dependem de D.
    expect(b.commercial_state.commercial_potential).toBe(2)
    expect((b.operational_facts ?? []).length).toBeGreaterThan(0)
    // E o sujeito repetido é declarado na qualidade.
    expect(JSON.stringify(b.quality_and_coverage)).toContain("duplicated_subject")
  })
})

describe("§51 — d_executed com zero achados é ZERO CONHECIDO", () => {
  it("executed_no_findings, distinto de indisponível", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    expect(o.status).toBe("d_executed")
    const b = montado(montar(o))

    const d = b.detector_results[0]
    expect(d?.execution_state).toBe("executed_no_findings")
    expect(d?.events).toBe(0)
    expect(d?.population).toBe("COMMERCIAL_POTENTIAL")
    // Zero aqui é legítimo: rodou e não encontrou. Diferente de `unavailable`.
    expect(d?.execution_state).not.toBe("unavailable")
    expect(d?.execution_state).not.toBe("not_executed")
  })
})

describe("§52 — d_executed com achado transporta sem inventar severidade", () => {
  it("finding governado entra em material_findings", async () => {
    // Onze contratos de R$ 1.000 e um de R$ 60.000: caso material dominante.
    const linhas: unknown[][] = []
    const prazos: (PrazoSpec | null)[] = []
    for (let i = 0; i < 12; i += 1) {
      linhas.push([
        ...linhaAgostoReal({
          venc: "27/08",
          cpf: cpfSintetico(i + 20),
          unidade: "Meriti",
          parcelas: 10,
          ticket: i === 0 ? "R$ 60.000,00" : "R$ 1.000,00",
          status: "P",
          desembolso: "19/08",
        }),
      ])
      prazos.push({ serial: sheetsSerial(HOJE) })
    }
    const arq: ArquivoFalso = {
      meta: {
        file_id: "f1",
        name: "Novos Alunos - Agosto",
        mime_type: SHEETS_MIME,
        modified_time: "2026-08-19T13:39:00Z",
      },
      sheets: { [LUCAS_OFFICIAL_SHEET]: { headers: HEADER_AGOSTO_REAL, rows: linhas } },
      observations: { [LUCAS_OFFICIAL_SHEET]: observacao(HEADER_AGOSTO_REAL, linhas, prazos) },
    }
    const o = await analisar([arq])
    if (o.status !== "d_executed") throw new Error(`estado ${o.status}`)

    const b = montado(montar(o))
    const d = b.detector_results[0]
    expect(d?.execution_state).toBe("executed_with_findings")
    expect(d?.events).toBe(o.detector.events.length)
    expect((b.material_findings ?? []).length).toBe(o.detector.events.length)
    // Transporte: o id do evento governado, e nada de score/rank/prioridade.
    expect(b.material_findings?.[0]).toBe(
      [...o.detector.events.map((e) => e.event_id)].sort()[0],
    )
    expect(JSON.stringify(b)).not.toContain("priority")
    expect(JSON.stringify(b)).not.toContain("rank")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §53 §54 §55 §56 — transporte de fatos
// ═══════════════════════════════════════════════════════════════════════════════

describe("§53 — fatos de A e P transportados", () => {
  it("AWAITING_CREDITUM_SIGNATURE e PENDING_STUDENT_SIGNATURE", async () => {
    const o = await analisar([
      arquivo([
        { status: "A", deadline: addCivilDays(HOJE, 30) ?? "" },
        { status: "P", deadline: addCivilDays(HOJE, 30) ?? "" },
      ]),
    ])
    const b = montado(montar(o))
    const tipos = (b.operational_facts ?? []).map((f) => f.fact_type)
    expect(tipos).toContain("AWAITING_CREDITUM_SIGNATURE")
    expect(tipos).toContain("PENDING_STUDENT_SIGNATURE")
    // Severidade não governada permanece nula — o assembler não atribui nenhuma.
    for (const f of b.operational_facts ?? []) {
      expect(f.severity).toBeNull()
      expect(f.severity_status).toBe("SEVERITY_POLICY_UNRESOLVED")
    }
  })
})

describe("§54 — fatos de prazo transportados, nunca recalculados", () => {
  it("os quatro tipos chegam com data e offset prontos", async () => {
    const o = await analisar([
      arquivo([
        { status: "P", deadline: addCivilDays(HOJE, 4) ?? "" },
        { status: "A", deadline: addCivilDays(HOJE, 1) ?? "" },
        { status: "P", deadline: HOJE },
        { status: "A", deadline: addCivilDays(HOJE, -2) ?? "" },
      ]),
    ])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    const b = montado(montar(o))

    const dePrazo = (b.operational_facts ?? []).filter((f) => f.deadline !== undefined)
    expect(dePrazo.map((f) => f.fact_type).sort()).toEqual([
      "AUTO_CANCELLED_BY_DEADLINE",
      "A_EMISSION_DEADLINE_ALERT",
      "CONTRACT_DEADLINE_MISSED",
      "P_SIGNATURE_DEADLINE_ATTENTION",
    ])
    // Valores IDÊNTICOS aos que a 2.13 calculou: transporte, não recálculo.
    for (const f of dePrazo) {
      const upstream = o.deadline.facts.find((x) => x.subject_ref === f.subject_ref)
      expect(f.deadline).toBe(upstream?.deadline)
      expect(f.offset_days).toBe(upstream?.offset_days)
      expect(f.evaluation_date).toBe(upstream?.evaluation_date)
    }
    // E o auto-cancelado carrega a semântica de recuperação já derivada.
    const auto = dePrazo.find((f) => f.fact_type === "AUTO_CANCELLED_BY_DEADLINE")
    expect(auto?.recovery_candidate).toBe(true)
    expect(auto?.recovery_semantics).toBe("RECOVERY_OPPORTUNITY_TO_INVESTIGATE")
  })

  it("nenhum campo de aritmética de prazo aparece no briefing", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    const s = JSON.stringify(b)
    for (const proibido of ["deadline_offset_days", "calendar_rule", "timezone", "D-4", "D-1"]) {
      expect(s, proibido).not.toContain(proibido)
    }
  })
})

describe("§55 — source_status preservado sob auto-cancelamento", () => {
  it("P derivado auto-cancelado permanece source P", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: addCivilDays(HOJE, -2) ?? "" }])])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    const b = montado(montar(o))

    const f = (b.operational_facts ?? []).find(
      (x) => x.fact_type === "AUTO_CANCELLED_BY_DEADLINE",
    )
    expect(f?.source_status).toBe("P")
    expect(f?.derived_deadline_state).toBe("auto_cancelled_by_deadline")
    // E a população comercial NÃO mudou por causa do derivado.
    expect(b.commercial_state.commercial_potential).toBe(1)
  })
})

describe("§56 — prazo não-avaliável não é zero alertas", () => {
  it("o fato base sobrevive e a impossibilidade é declarada", async () => {
    // Célula não tipada como DATE: prazo não-avaliável.
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE, tipo: "NUMBER" }])])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    const b = montado(montar(o))

    // Nenhum fato de prazo…
    expect((b.operational_facts ?? []).filter((f) => f.deadline !== undefined)).toEqual([])
    // …mas o fato base de `P` continua…
    expect((b.operational_facts ?? []).map((f) => f.fact_type)).toContain(
      "PENDING_STUDENT_SIGNATURE",
    )
    // …e a impossibilidade de avaliar está DECLARADA, não escondida atrás de zero.
    expect(JSON.stringify(b.quality_and_coverage)).toContain("deadline_not_evaluable")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §57 §58 — qualidade e evidência
// ═══════════════════════════════════════════════════════════════════════════════

describe("§57 — duplicidade resolvida continua available com qualidade degradada", () => {
  it("DUPLICATE_SOURCE_WARNING viaja como nota, não como invalid_source", async () => {
    const a = arquivo([{ status: "P", deadline: HOJE }])
    const b2: ArquivoFalso = {
      ...a,
      meta: { ...a.meta, file_id: "f2", modified_time: "2026-08-19T10:00:00Z" },
    }
    const o = await analisar([a, b2])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    const b = montado(montar(o))

    expect(b.source_health[0]?.view_state).toBe("available")
    expect(JSON.stringify(b.quality_and_coverage)).toContain("DUPLICATE_SOURCE_WARNING")
  })
})

describe("§58 — integridade referencial de evidência", () => {
  it("refs de fato apontam para o índice autoritativo", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const b = montado(montar(o))
    expect(b.evidence_index.length).toBeGreaterThan(0)
    const idx = new Set(b.evidence_index)
    for (const f of b.operational_facts ?? []) {
      for (const r of f.evidence_refs ?? []) expect(idx.has(r), r).toBe(true)
    }
  })

  it("referência pendurada faz o assembler falhar FECHADO", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    // Esvazia o índice autoritativo mantendo as citações nos fatos.
    const corrompido: LucasAnalysisOutcome = {
      ...o,
      source: { ...o.source, evidence_ids: [] },
    }
    const r = montar(corrompido)
    expect(r).toEqual({ status: "not_assembled", defect: "DANGLING_EVIDENCE_REF" })
  })

  it("o índice é deduplicado e ordenado — determinístico", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const b = montado(montar(o))
    expect(b.evidence_index).toEqual([...new Set(b.evidence_index)].sort())
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §59 — segurança model-facing
// ═══════════════════════════════════════════════════════════════════════════════

describe("§59 — nenhum PII atravessa o briefing", () => {
  it("nem CPF, nem nome, nem row_key, nem ticket_cents", async () => {
    const o = await analisar([
      arquivo([
        { status: "P", deadline: HOJE },
        { status: "A", deadline: addCivilDays(HOJE, 1) ?? "" },
        { status: "E", deadline: null },
      ]),
    ])
    const s = JSON.stringify(montado(montar(o)))
    expect(s).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
    expect(s).not.toMatch(/\d{11}/u)
    expect(s).not.toContain("Aluno")
    expect(s).not.toContain("row_key")
    expect(s).not.toContain("ticket_cents")
    expect(s).not.toContain("Meriti")
  })

  it("subject_ref é pseudônimo governado", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const b = montado(montar(o))
    for (const f of b.operational_facts ?? []) {
      expect(f.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/u)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §60 §61 §62 §63 — determinismo e imutabilidade
// ═══════════════════════════════════════════════════════════════════════════════

describe("§61 — mesma entrada, mesma saída", () => {
  it("duas montagens são deepEqual, com o MESMO briefing_id", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const a = montado(montar(o))
    const b = montado(montar(o))
    expect(a).toEqual(b)
    expect(a.briefing_id).toBe(b.briefing_id)
    expect(a.briefing_id).toMatch(/^brf_[a-f0-9]{32}$/u)
  })

  it("o assembler não lê relógio: generated_at vem do input", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const a = montado(montar(o))
    const b = montado(montar(o, { generated_at: "2026-08-20T00:00:00.000Z" }))
    expect(a.generated_at).toBe(GERADO_EM)
    expect(b.generated_at).toBe("2026-08-20T00:00:00.000Z")
    // Instante diferente é briefing diferente — e a identidade reflete isso.
    expect(a.briefing_id).not.toBe(b.briefing_id)
  })

  it("§1 §33 — o assembler não TOCA relógio nem sorteio", async () => {
    // A comparação de dois `briefing_id` seguidos NÃO prova isto: `Date.now()` no
    // mesmo milissegundo devolve o mesmo número, e a mutação passaria. A prova é
    // proibir as duas fontes de não-determinismo e exigir que a montagem funcione.
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    const nowReal = Date.now
    const randomReal = Math.random
    Date.now = () => {
      throw new Error("o assembler leu o relógio")
    }
    Math.random = () => {
      throw new Error("o assembler sorteou")
    }
    try {
      const b = montado(montar(o))
      expect(b.generated_at).toBe(GERADO_EM)
      expect(b.briefing_id).toMatch(/^brf_[a-f0-9]{32}$/u)
    } finally {
      Date.now = nowReal
      Math.random = randomReal
    }
  })

  it("a versão do material de identidade é declarada", () => {
    expect(BRIEFING_ID_VERSION).toBe("1.0.0")
  })
})

describe("§60 — ordem de entrada não muda a identidade", () => {
  it("fatos equivalentes em ordem diferente dão o mesmo briefing", async () => {
    const o = await analisar([
      arquivo([
        { status: "P", deadline: HOJE },
        { status: "A", deadline: addCivilDays(HOJE, 1) ?? "" },
      ]),
    ])
    if (o.status !== "d_executed" && o.status !== "d_not_executed") throw new Error("estado")
    const invertido: LucasAnalysisOutcome = {
      ...o,
      deadline: { ...o.deadline, facts: [...o.deadline.facts].reverse() },
      facts: {
        awaiting_creditum_signature: [...o.facts.awaiting_creditum_signature].reverse(),
        pending_student_signature: [...o.facts.pending_student_signature].reverse(),
      },
    }
    const a = montado(montar(o))
    const b = montado(montar(invertido))
    expect(a.briefing_id).toBe(b.briefing_id)
    expect(a.operational_facts).toEqual(b.operational_facts)
  })
})

describe("§62 — o assembler não muta a entrada", () => {
  it("mutar o array do chamador depois não altera o briefing", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    if (o.status !== "d_executed") throw new Error("estado")
    const refs = [...o.source.evidence_ids]
    const entrada: LucasAnalysisOutcome = { ...o, source: { ...o.source, evidence_ids: refs } }
    const b = montado(montar(entrada))
    const antes = [...b.evidence_index]
    refs.push("ev_injetada")
    expect(b.evidence_index).toEqual(antes)
    expect(b.evidence_index).not.toContain("ev_injetada")
  })
})

describe("§63 — a saída é profundamente imutável", () => {
  it("mutação pós-montagem não altera o briefing canônico", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    expect(Object.isFrozen(b)).toBe(true)
    expect(Object.isFrozen(b.source_health)).toBe(true)
    expect(Object.isFrozen(b.commercial_state)).toBe(true)
    expect(Object.isFrozen(b.evidence_index)).toBe(true)
    expect(Object.isFrozen(b.quality_and_coverage)).toBe(true)
    expect(() => {
      ;(b as { period: string }).period = "2026-09"
    }).toThrow()
    expect(b.period).toBe(PERIODO)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §34 §44 §45 — contrato de entrada e falha fechada
// ═══════════════════════════════════════════════════════════════════════════════

describe("§34 — período divergente falha FECHADO", () => {
  it("briefing rotulado com outro mês é recusado", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    expect(montar(o, { period: "2026-09" })).toEqual({
      status: "not_assembled",
      defect: "PERIOD_MISMATCH",
    })
  })

  it("período malformado é recusado", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    for (const p of ["agosto/2026", "2026-8", "", "2026"]) {
      expect(montar(o, { period: p }).status, p).toBe("not_assembled")
    }
  })
})

describe("§33 — generated_at inválido falha FECHADO", () => {
  it("não substitui por relógio nem por padrão", async () => {
    const o = await analisar([arquivo([{ status: "P", deadline: HOJE }])])
    for (const t of ["2026-08-19", "hoje", "", "19/08/2026"]) {
      expect(montar(o, { generated_at: t }), t).toEqual({
        status: "not_assembled",
        defect: "INVALID_GENERATED_AT",
      })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §19 §21 §22 — capacidade ausente ≠ fonte quebrada
// ═══════════════════════════════════════════════════════════════════════════════

describe("§21 §22 — o financeiro do Leonardo NÃO é marcado como quebrado", () => {
  it("finance aparece como capacidade adiada, nunca em source_health", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))

    // source_health SÓ da fonte observada.
    expect(b.source_health).toHaveLength(1)
    expect(b.source_health[0]?.owner).toBe("LUCAS")
    expect(b.source_health.map((h) => h.owner)).not.toContain("LEONARDO")

    // E o financeiro está declarado como adiado, com o motivo.
    const caps = b.unavailable_capabilities ?? []
    const fin = caps.find((c) => c.capability === "FINANCE_DOMAIN")
    expect(fin?.status).toBe("deferred")
    expect(JSON.stringify(fin)).toContain("ownership do Leonardo")
  })

  it("§19 §20 — Detector B e C seguem adiados, não implementados", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    const caps = b.unavailable_capabilities ?? []
    for (const c of ["DETECTOR_B_FINANCE_RECONCILIATION", "DETECTOR_C_FIRST_DUE_DATE"]) {
      expect(caps.find((x) => x.capability === c)?.status, c).toBe("deferred")
    }
    // Nenhum resultado de B ou C no briefing.
    expect(b.detector_results.map((d) => d.detector)).toEqual(["D"])
  })

  it("`deferred` é distinto de `unavailable`", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    // Capacidade adiada por decisão: `deferred`. Fonte que deveria funcionar e não
    // funcionou: `unavailable`. Confundi-los culparia o dono da fonte.
    for (const c of b.unavailable_capabilities ?? []) expect(c.status).toBe("deferred")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §30 §31 §35 §64–§69 — o que o assembler NÃO faz
// ═══════════════════════════════════════════════════════════════════════════════

describe("§30 §31 — nenhuma narrativa, nenhuma priorização", () => {
  it("o briefing não contém interpretação nem ranking", async () => {
    const s = JSON.stringify(
      montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])]))),
    )
    for (const p of [
      "recomend",
      "preocup",
      "parece",
      "sugiro",
      "priority",
      "rank",
      "score",
      "top_",
      "urgen",
      "importan",
    ]) {
      expect(s.toLowerCase(), p).not.toContain(p)
    }
  })
})

describe("§35 — scope não é mais amplo do que o montado", () => {
  it("COMMERCIAL e OPERATIONAL; FINANCIAL fica fora", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    expect([...b.scope].sort()).toEqual(["COMMERCIAL", "OPERATIONAL"])
    expect(b.scope).not.toContain("FINANCIAL")
    expect(b.scope).not.toContain("MARKET")
    expect(b.scope).not.toContain("GROWTH")
  })
})

describe("§64–§69 — nada de 3.0C nesta fase", () => {
  it("o briefing não carrega insight, decisão, observação nem contexto de crescimento", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    for (const proibido of [
      "insights",
      "prior_decisions",
      "dashboard_observations",
      "market_observations",
      "growth_context",
      "aros_context",
      "capabilities",
      "restrictions",
    ]) {
      expect(Object.keys(b), proibido).not.toContain(proibido)
    }
  })

  it("o dataset declarado é o do Lucas, e nenhum outro", async () => {
    const b = montado(montar(await analisar([arquivo([{ status: "P", deadline: HOJE }])])))
    expect(b.source_health[0]?.dataset_id).toBe(LUCAS_DATASET_ID)
  })
})
