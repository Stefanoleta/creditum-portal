/**
 * Fase 2.13 — o prazo pelo CAMINHO REAL: provider → orquestração → CLI.
 *
 * O arquivo anterior prova a regra. Este prova que ela é ALCANÇADA, e é a distinção
 * que quatro NO-SHIP desta linha de fases me ensinaram: uma peça correta que ninguém
 * chama é uma peça que não roda.
 *
 * Aqui a cadeia começa na observação ATÔMICA do Drive e termina no relatório do
 * comando. Nenhum teste monta `DeadlineResolution` à mão.
 */

import { describe, expect, it } from "vitest"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { runLucasCurrentPeriodAnalysis } from "../../src/lucas/analysis"
import { toReport } from "../../src/lucas/cli"
import { LUCAS_OFFICIAL_SHEET } from "../../src/lucas/drive-port"
import { addCivilDays } from "../../../detectors/src/civil-date"
import { FakeDrive } from "./fake-drive"
import type { ArquivoFalso } from "./fake-drive"
import {
  HEADER_AGOSTO_REAL,
  cpfSintetico,
  linhaAgostoReal,
  observacao,
  sheetsSerial,
} from "./fixtures"
import type { PrazoSpec } from "./fixtures"

const SHEETS_MIME = "application/vnd.google-apps.spreadsheet"
/** 19/08/2026 15:00 BRT. Período corrente 2026-08; hoje civil em SP = 19/08. */
const AGORA = new Date("2026-08-19T18:00:00.000Z")
const HOJE = "2026-08-19"

interface Caso {
  readonly status: "P" | "A" | "E" | "C"
  /** Prazo como data civil, ou `null` para célula vazia. */
  readonly deadline: string | null
  /** Tipo de formato da célula. `undefined` = `DATE`, como a fonte real. */
  readonly tipo?: string | null
}

function arquivo(
  casos: readonly Caso[],
  opts: { readonly semTipo?: boolean; readonly linhaVaziaNoMeio?: boolean } = {},
): ArquivoFalso {
  const formatadas: unknown[][] = []
  const prazos: (PrazoSpec | null)[] = []

  casos.forEach((c, i) => {
    if (opts.linhaVaziaNoMeio === true && i === 1) {
      // Rodapé em branco no MEIO dos dados. O provider filtra linha vazia, e é aqui
      // que um emparelhamento por índice pós-filtro desalinharia tudo o que vem
      // depois — anexando o prazo de um contrato a outro.
      formatadas.push(new Array(HEADER_AGOSTO_REAL.length).fill(""))
      prazos.push(null)
    }
    formatadas.push([
      ...linhaAgostoReal({
        venc: "27/08",
        cpf: cpfSintetico(i + 1),
        unidade: "Meriti",
        parcelas: 10,
        ticket: "R$ 5.000,00",
        status: c.status,
        // O texto EXIBIDO. Sem ano, como na fonte real.
        desembolso: c.deadline === null ? "" : `${c.deadline.slice(8)}/${c.deadline.slice(5, 7)}`,
      }),
    ])
    prazos.push(
      c.deadline === null
        ? null
        : {
            serial: sheetsSerial(c.deadline),
            // `semTipo` simula a célula que a fonte não tipa como data.
            ...(opts.semTipo === true ? { type: "NUMBER" } : {}),
            ...(c.tipo === undefined ? {} : { type: c.tipo }),
          },
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
  }
}

const capturar = (arq: ArquivoFalso) =>
  new LucasMonthlyContractsProvider({
    drive: new FakeDrive({ files: [arq] }),
    now: () => AGORA,
  }).load({ period: "2026-08" })

const analisar = async (arq: ArquivoFalso) => {
  const provider = new LucasMonthlyContractsProvider({
    drive: new FakeDrive({ files: [arq] }),
    now: () => AGORA,
  })
  return runLucasCurrentPeriodAnalysis(
    {
      provider,
      detected_at: AGORA.toISOString(),
      metric: "amount_sum_cents",
      aggregator: "sum",
    },
    { periodClock: () => AGORA },
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3 §4 — o ano chega pelo caminho real, e o texto exibido não o carrega
// ═══════════════════════════════════════════════════════════════════════════════

describe("§3 §4 — o ano vem do serial subjacente", () => {
  it("célula exibida '23/08' resolve para 2026-08-23 com o ano da FONTE", () => {
    return capturar(arquivo([{ status: "P", deadline: "2026-08-23" }])).then((c) => {
      expect(c.status).toBe("available")
      if (c.status !== "available") throw new Error("estado errado")
      const linha = c.rows[0]
      expect(linha?.deadline).toEqual({
        status: "resolved",
        deadline: "2026-08-23",
        source_serial: sheetsSerial("2026-08-23"),
      })
      // O texto formatado da mesma célula NÃO tem o ano. É a diferença inteira.
      expect(String(linha?.deadline.status)).toBe("resolved")
    })
  })

  it("prazo em JANEIRO num arquivo de AGOSTO resolve para o ano seguinte", async () => {
    // O caso que a inferência de ano pelo período erraria por onze meses. O serial
    // diz 2027, o período diz agosto/2026, e quem manda é o serial.
    const c = await capturar(arquivo([{ status: "P", deadline: "2027-01-05" }]))
    expect(c.status).toBe("available")
    if (c.status !== "available") throw new Error("estado errado")
    expect(c.rows[0]?.deadline).toMatchObject({ status: "resolved", deadline: "2027-01-05" })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §4 §13 — a observação é atômica
// ═══════════════════════════════════════════════════════════════════════════════

describe("§4 §13 (2.13a) — observação ATÔMICA, sem junção de duas leituras", () => {
  it("uma única leitura de conteúdo por análise", async () => {
    const drive = new FakeDrive({ files: [arquivo([{ status: "P", deadline: "2026-08-21" }])] })
    await new LucasMonthlyContractsProvider({ drive, now: () => AGORA }).load({ period: "2026-08" })
    // UMA observação. O modelo de duas leituras — formatada e subjacente — permitia
    // que uma reordenação entre elas anexasse o prazo de um contrato a outro, com a
    // contagem de linhas intacta. Não existe mais segunda leitura de conteúdo a
    // desincronizar.
    expect(drive.abasConsultadas).toEqual([{ file_id: "f1", sheet: LUCAS_OFFICIAL_SHEET }])
  })

  it("a porta não expõe mais como ler metade da célula", () => {
    const drive = new FakeDrive({ files: [arquivo([{ status: "P", deadline: "2026-08-21" }])] })
    // A corrida deixou de ser expressável, não apenas improvável: não há método que
    // devolva só os valores exibidos ou só os subjacentes.
    expect((drive as unknown as Record<string, unknown>)["readSheet"]).toBeUndefined()
    expect((drive as unknown as Record<string, unknown>)["readSheetUnderlying"]).toBeUndefined()
  })

  it("linha VAZIA no meio não desloca o prazo das linhas seguintes", async () => {
    // O filtro de linha vazia agora roda sobre as CÉLULAS, então formatado e tipado
    // saem juntos. Não há índice para um lado reindexar sem o outro.
    const casos: readonly Caso[] = [
      { status: "P", deadline: "2026-08-21" },
      { status: "P", deadline: "2026-08-22" },
      { status: "P", deadline: "2026-08-23" },
    ]
    const c = await capturar(arquivo(casos, { linhaVaziaNoMeio: true }))
    expect(c.status).toBe("available")
    if (c.status !== "available") throw new Error("estado errado")

    expect(c.rows).toHaveLength(3)
    expect(c.rows.map((l) => (l.deadline.status === "resolved" ? l.deadline.deadline : null))).toEqual([
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ])
  })

  it("prazo e linha formatada da MESMA linha, provado por valores distintos", async () => {
    // Cada contrato tem CPF distinto e prazo distinto. Se a associação viesse de uma
    // junção por índice sobre representações diferentes, o pareamento apareceria aqui.
    const c = await capturar(
      arquivo([
        { status: "P", deadline: "2026-08-21" },
        { status: "A", deadline: "2026-09-15" },
        { status: "P", deadline: "2027-01-05" },
      ]),
    )
    if (c.status !== "available") throw new Error("estado errado")
    expect(
      c.rows.map((l) => [l.status, l.deadline.status === "resolved" ? l.deadline.deadline : null]),
    ).toEqual([
      ["P", "2026-08-21"],
      ["A", "2026-09-15"],
      ["P", "2027-01-05"],
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §17 — a segunda leitura falhando degrada SÓ o prazo
// ═══════════════════════════════════════════════════════════════════════════════

describe("§24 — prazo malformado numa linha não derruba a fonte", () => {
    it("célula não tipada DATE: prazo não-avaliável, contrato intacto", async () => {
    const c = await capturar(arquivo([{ status: "P", deadline: "2026-08-21" }], { semTipo: true }))
    // NÃO é source_error e NÃO é invalid_source: a linha comercial é válida.
    expect(c.status).toBe("available")
    if (c.status !== "available") throw new Error("estado errado")
    expect(c.rows[0]?.deadline).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_NOT_DATE_TYPED",
    })
    // O contrato continua sendo um contrato, com status e ticket.
    expect(c.rows[0]?.status).toBe("P")
    expect(c.rows[0]?.ticket_cents).toBe(500_000)
  })

  it("uma linha com prazo ruim não contamina as outras", async () => {
    const c = await capturar(
      arquivo([
        { status: "P", deadline: "2026-08-21" },
        { status: "P", deadline: "2026-08-22", tipo: "NUMBER" },
        { status: "P", deadline: "2026-08-23" },
      ]),
    )
    if (c.status !== "available") throw new Error("estado errado")
    expect(c.rows.map((l) => l.deadline.status)).toEqual([
      "resolved",
      "not_evaluable",
      "resolved",
    ])
  })

  it("célula de prazo VAZIA é razão diferente de leitura indisponível", async () => {
    const c = await capturar(arquivo([{ status: "P", deadline: null }]))
    expect(c.status).toBe("available")
    if (c.status !== "available") throw new Error("estado errado")
    expect(c.rows[0]?.deadline).toEqual({ status: "not_evaluable", reason: "DEADLINE_MISSING" })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §24 — a orquestração de produção produz os fatos
// ═══════════════════════════════════════════════════════════════════════════════

describe("§24 — prazo integrado na orquestração existente", () => {
  it("os quatro estados aparecem numa execução, com source_status preservado", async () => {
    const r = await analisar(
      arquivo([
        { status: "P", deadline: addCivilDays(HOJE, 4) ?? "" }, // D-4 → atenção
        { status: "A", deadline: addCivilDays(HOJE, 1) ?? "" }, // D-1 → alerta
        { status: "P", deadline: HOJE }, // D0 → caiu
        { status: "A", deadline: addCivilDays(HOJE, -2) ?? "" }, // D+2 → auto-cancel
        { status: "P", deadline: addCivilDays(HOJE, 30) ?? "" }, // fora da janela
        { status: "E", deadline: HOJE }, // emitido → nada
        { status: "C", deadline: addCivilDays(HOJE, -5) ?? "" }, // C da fonte → nada
      ]),
    )
    expect(["d_executed", "d_not_executed"]).toContain(r.status)
    if (r.status !== "d_executed" && r.status !== "d_not_executed") throw new Error("estado errado")

    const tipos = r.deadline.facts.map((f) => f.fact).sort()
    expect(tipos).toEqual([
      "AUTO_CANCELLED_BY_DEADLINE",
      "A_EMISSION_DEADLINE_ALERT",
      "CONTRACT_DEADLINE_MISSED",
      "P_SIGNATURE_DEADLINE_ATTENTION",
    ])
    expect(r.deadline.evaluation_date).toBe(HOJE)

    // §14 — o estado da FONTE viaja junto e não foi reescrito.
    const auto = r.deadline.facts.find((f) => f.fact === "AUTO_CANCELLED_BY_DEADLINE")
    expect(auto?.source_status).toBe("A")
    expect(auto?.derived_deadline_state).toBe("auto_cancelled_by_deadline")
    expect(auto?.recovery_candidate).toBe(true)
    expect(auto?.recovery_semantics).toBe("RECOVERY_OPPORTUNITY_TO_INVESTIGATE")

    const caiu = r.deadline.facts.find((f) => f.fact === "CONTRACT_DEADLINE_MISSED")
    expect(caiu?.source_status).toBe("P")
    expect(caiu?.offset_days).toBe(0)
    // D0 ainda NÃO é candidato a recuperação: caiu hoje, não foi cancelado.
    expect(caiu?.recovery_candidate).toBe(false)
  })

  it("fonte ATRASADA: P em D+2 permanece P e entra em recuperação", async () => {
    const r = await analisar(arquivo([{ status: "P", deadline: addCivilDays(HOJE, -2) ?? "" }]))
    if (r.status !== "d_executed" && r.status !== "d_not_executed") throw new Error("estado errado")
    const f = r.deadline.facts[0]
    expect(f?.source_status).toBe("P")
    expect(f?.derived_deadline_state).toBe("auto_cancelled_by_deadline")
    expect(f?.offset_days).toBe(2)
    expect(f?.recovery_candidate).toBe(true)
  })

  it("cada fato carrega proveniência segura, sem PII", async () => {
    const r = await analisar(arquivo([{ status: "P", deadline: HOJE }]))
    if (r.status !== "d_executed" && r.status !== "d_not_executed") throw new Error("estado errado")
    const f = r.deadline.facts[0]
    expect(f?.period).toBe("2026-08")
    expect(f?.snapshot_id).toMatch(/^snap_/u)
    expect(f?.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/u)
    expect(f?.deadline).toBe(HOJE)
    expect(f?.evaluation_date).toBe(HOJE)
    expect(f?.evidence_refs.length).toBeGreaterThan(0)
    // Severidade não governada permanece NULA — não inventamos crítico.
    expect(f?.severity).toBeNull()
    expect(f?.severity_status).toBe("SEVERITY_POLICY_UNRESOLVED")
    // Nenhum CPF, nome ou valor no fato serializado.
    const s = JSON.stringify(f)
    expect(s).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
    expect(s).not.toContain("Aluno")
    expect(s).not.toContain("ticket_cents")
  })

  it("não-avaliável é registrado SÓ onde havia pendência", async () => {
    const r = await analisar(
      arquivo([
        { status: "P", deadline: null },
        { status: "A", deadline: null },
        { status: "E", deadline: null },
        { status: "C", deadline: null },
      ]),
    )
    if (r.status !== "d_executed" && r.status !== "d_not_executed") throw new Error("estado errado")
    expect(r.deadline.facts).toEqual([])
    // Só `P` e `A`: um `E` sem prazo legível não é trabalho para ninguém.
    expect(r.deadline.not_evaluable.map((n) => n.source_status).sort()).toEqual(["A", "P"])
    expect(r.deadline.not_evaluable.every((n) => n.reason === "DEADLINE_MISSING")).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §21 — transições, em capturas independentes
// ═══════════════════════════════════════════════════════════════════════════════

describe("§21 — a regra segue o status CORRENTE observado", () => {
  it("P em D-4 → atenção; o MESMO contrato como A em D-1 → alerta, sem atenção", async () => {
    // Capturas independentes: o sistema não armazena histórico, e o teste não finge
    // que armazena. Cada snapshot é avaliado pelo status que a fonte afirma nele.
    const comoP = await analisar(arquivo([{ status: "P", deadline: addCivilDays(HOJE, 4) ?? "" }]))
    if (comoP.status !== "d_executed" && comoP.status !== "d_not_executed") throw new Error("erro")
    expect(comoP.deadline.facts.map((f) => f.fact)).toEqual(["P_SIGNATURE_DEADLINE_ATTENTION"])

    const comoA = await analisar(arquivo([{ status: "A", deadline: addCivilDays(HOJE, 1) ?? "" }]))
    if (comoA.status !== "d_executed" && comoA.status !== "d_not_executed") throw new Error("erro")
    expect(comoA.deadline.facts.map((f) => f.fact)).toEqual(["A_EMISSION_DEADLINE_ALERT"])
    // A atenção de `P` NÃO persiste: ela é fato do status corrente.
    expect(comoA.deadline.facts.map((f) => f.fact)).not.toContain("P_SIGNATURE_DEADLINE_ATTENTION")

    const comoE = await analisar(arquivo([{ status: "E", deadline: addCivilDays(HOJE, 1) ?? "" }]))
    if (comoE.status !== "d_executed" && comoE.status !== "d_not_executed") throw new Error("erro")
    expect(comoE.deadline.facts).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// §25 — a saída do comando
// ═══════════════════════════════════════════════════════════════════════════════

describe("§25 — o relatório do CLI expõe só agregados seguros", () => {
  it("contagens por tipo, mais a data de avaliação", async () => {
    const r = await analisar(
      arquivo([
        { status: "P", deadline: addCivilDays(HOJE, 2) ?? "" },
        { status: "P", deadline: addCivilDays(HOJE, 3) ?? "" },
        { status: "A", deadline: addCivilDays(HOJE, 1) ?? "" },
        { status: "P", deadline: HOJE },
        { status: "A", deadline: addCivilDays(HOJE, -1) ?? "" },
        { status: "P", deadline: null },
      ]),
    )
    const rel = toReport(r)
    expect(rel.deadline).toEqual({
      evaluation_date: HOJE,
      p_deadline_attention_count: 2,
      a_emission_deadline_alert_count: 1,
      deadline_missed_count: 1,
      auto_cancelled_by_deadline_count: 1,
      recovery_candidate_count: 1,
      not_evaluable_count: 1,
    })
  })

  it("nenhum identificador individual atravessa o relatório", async () => {
    const r = await analisar(arquivo([{ status: "P", deadline: HOJE }]))
    const s = JSON.stringify(toReport(r))
    for (const proibido of ["subj_", "row_key", "ticket_cents", "evidence", "Aluno", "snapshot_id"]) {
      expect(s, proibido).not.toContain(proibido)
    }
    expect(s).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/u)
    // E o prazo individual também não sai: só contagens.
    expect(s).not.toContain('"deadline":"2026')
  })

  it("zero alertas e não-avaliável são DISTINGUÍVEIS no relatório", async () => {
    const semAlerta = toReport(await analisar(arquivo([{ status: "P", deadline: addCivilDays(HOJE, 60) ?? "" }])))
    const naoAvaliavel = toReport(await analisar(arquivo([{ status: "P", deadline: null }])))
    expect(semAlerta.deadline?.p_deadline_attention_count).toBe(0)
    expect(semAlerta.deadline?.not_evaluable_count).toBe(0)
    expect(naoAvaliavel.deadline?.p_deadline_attention_count).toBe(0)
    // A diferença: um número que diz "alguém precisa olhar a planilha".
    expect(naoAvaliavel.deadline?.not_evaluable_count).toBe(1)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// §14–§20 §33 §34 (2.13a) — a identidade do snapshot compromete o prazo
// ═══════════════════════════════════════════════════════════════════════════════

describe("§33 — mesma exibição, ano subjacente diferente", () => {
  it("content_hash e snapshot_id DIFEREM", async () => {
    // O terceiro achado do gate. As duas planilhas mostram `26/08`. Os seriais são de
    // 2026 e 2027. Antes: mesmo hash, mesmo snapshot, mesmas evidências — um único
    // snapshot sustentando fatos de prazo incompatíveis, o que quebra replay.
    const a = await capturar(arquivo([{ status: "P", deadline: "2026-08-26" }]))
    const b = await capturar(arquivo([{ status: "P", deadline: "2027-08-26" }]))
    if (a.status !== "available" || b.status !== "available") throw new Error("estado errado")

    // A exibição é IDÊNTICA nas duas — é o que torna o caso perigoso.
    expect(a.provenance.content_hash).not.toBe(b.provenance.content_hash)
    expect(a.snapshot.snapshot_id).not.toBe(b.snapshot.snapshot_id)

    // E os fatos derivados de fato diferem.
    expect(a.rows[0]?.deadline).toMatchObject({ deadline: "2026-08-26" })
    expect(b.rows[0]?.deadline).toMatchObject({ deadline: "2027-08-26" })
  })

  it("a linha formatada é byte-a-byte a mesma nos dois casos", async () => {
    // Prova que a diferença de hash vem do compromisso de prazo, e não de alguma
    // diferença acidental na projeção formatada.
    const a = arquivo([{ status: "P", deadline: "2026-08-26" }])
    const b = arquivo([{ status: "P", deadline: "2027-08-26" }])
    expect(JSON.stringify(a.sheets[LUCAS_OFFICIAL_SHEET])).toBe(
      JSON.stringify(b.sheets[LUCAS_OFFICIAL_SHEET]),
    )
  })
})

describe("§34 — mudança só de TIPO também muda a identidade", () => {
  it("mesmo serial, DATE vs NUMBER: hash diferente", async () => {
    // Mesmo número, mesma exibição. Muda só o que a fonte diz que a célula É — e isso
    // muda o que é avaliável, então tem de mudar a identidade.
    const comData = await capturar(arquivo([{ status: "P", deadline: "2026-08-26" }]))
    const comNumero = await capturar(
      arquivo([{ status: "P", deadline: "2026-08-26", tipo: "NUMBER" }]),
    )
    if (comData.status !== "available" || comNumero.status !== "available") {
      throw new Error("estado errado")
    }
    expect(comData.provenance.content_hash).not.toBe(comNumero.provenance.content_hash)
    expect(comData.rows[0]?.deadline.status).toBe("resolved")
    expect(comNumero.rows[0]?.deadline.status).toBe("not_evaluable")
  })
})

describe("§19 — a identidade é ESTÁVEL quando a fonte não muda", () => {
  it("duas capturas do mesmo conteúdo dão o mesmo hash", async () => {
    // O compromisso novo não pode custar a idempotência: releitura do mesmo mês não
    // pode parecer dado novo, ou reingeriríamos a cada execução.
    const a = await capturar(arquivo([{ status: "P", deadline: "2026-08-26" }]))
    const b = await capturar(arquivo([{ status: "P", deadline: "2026-08-26" }]))
    if (a.status !== "available" || b.status !== "available") throw new Error("estado errado")
    expect(a.provenance.content_hash).toBe(b.provenance.content_hash)
    expect(a.snapshot.snapshot_id).toBe(b.snapshot.snapshot_id)
  })

  it("célula de prazo VAZIA e coluna AUSENTE não colidem", async () => {
    // Dois estados de fonte diferentes: um mês sem a coluna, e um contrato sem o
    // valor. Um hash que os confundisse afirmaria que são a mesma fonte.
    const vazia = await capturar(arquivo([{ status: "P", deadline: null }]))
    const semColuna = await capturar({
      meta: {
        file_id: "f1",
        name: "Novos Alunos - Agosto",
        mime_type: SHEETS_MIME,
        modified_time: "2026-08-19T13:39:00Z",
      },
      sheets: {
        [LUCAS_OFFICIAL_SHEET]: {
          headers: HEADER_AGOSTO_REAL.filter((h) => h !== "Desembolso"),
          rows: [
            linhaAgostoReal({
              venc: "27/08",
              cpf: cpfSintetico(1),
              unidade: "Meriti",
              parcelas: 10,
              ticket: "R$ 5.000,00",
              status: "P",
            }).filter((_, i) => i !== HEADER_AGOSTO_REAL.indexOf("Desembolso")),
          ],
        },
      },
    })
    if (vazia.status !== "available" || semColuna.status !== "available") {
      throw new Error("estado errado")
    }
    expect(vazia.provenance.content_hash).not.toBe(semColuna.provenance.content_hash)
    expect(vazia.rows[0]?.deadline).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_MISSING",
    })
    expect(semColuna.rows[0]?.deadline).toEqual({
      status: "not_evaluable",
      reason: "DEADLINE_COLUMN_ABSENT",
    })
  })
})
