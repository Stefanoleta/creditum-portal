/**
 * Content hash, snapshot governado, semântica de status e integração A/low-ticket.
 *
 * Os dois testes que mais importam:
 *
 *   · o hash NÃO muda quando só o relógio da coleta muda — é o que dá idempotência;
 *   · a decomposição de status reproduz os números REAIS medidos na Fase 2.10, e
 *     mostra a divergência de 2,5× no mês vigente.
 */

import { describe, expect, it } from "vitest"
import { sheetContentHash } from "../../src/lucas/content-hash"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { decomposeStatuses, classifyOutcome } from "../../src/lucas/status-semantics"
import {
  DETECTOR_C_DEFERRAL,
  awaitingSignatureFacts,
  structuralPopulation,
  toInstallmentInput,
  toLowTicketInput,
} from "../../src/lucas/detector-input"
import { detectLowTicketContracts } from "../../../detectors/src/low-ticket"
import { FakeDrive, arquivo } from "./fake-drive"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const capturar = async (
  rows: readonly (readonly unknown[])[],
  now = "2026-08-19T18:00:00.000Z",
  modified = "2026-08-19T13:39:00Z",
): Promise<Awaited<ReturnType<LucasMonthlyContractsProvider["load"]>>> => {
  const drive = new FakeDrive({
    files: [arquivo("f1", "Novos Alunos - Agosto", modified, { headers: HEADER_AGOSTO, rows })],
  })
  return new LucasMonthlyContractsProvider({ drive, now: () => new Date(now) }).load({
    period: "2026-08",
  })
}

const linha = (i: number, status: "E" | "A" | "P" | "C", ticket = "R$ 5.000,00", parcelas = 10) =>
  linhaAgosto({ venc: "27/08/2026", cpf: cpfSintetico(i), unidade: "Meriti", parcelas, ticket, status })

/**
 * Entrada de detector. A evidência NÃO é montada aqui.
 *
 * Duas correções sucessivas moram nesta função. A primeira versão passava
 * `evidence: []`, e a precondição governada de low-ticket recusou — "nenhum alerta
 * individual sem lastro" — revelando que faltava o `EvidenceBuilder`.
 *
 * A segunda passava a chamar `buildEvidenceSet` aqui, no teste. Funcionava, e provava
 * pouco: nada impedia este arquivo de fabricar evidência que satisfizesse o schema
 * sem ter vindo da fonte. Agora a evidência é campo obrigatório da CAPTURA, o tipo
 * de `DetectorMappingInput` não tem onde recebê-la, e a única evidência possível é a
 * que o provider produziu.
 */
const comEvidencia = (
  capture: Extract<Awaited<ReturnType<LucasMonthlyContractsProvider["load"]>>, { status: "available" } | { status: "available_empty" }>,
  stance: "current" | "closed" = "current",
) => ({ capture, stance, detected_at: "2026-08-19T18:00:00.000Z" })

// ═════════════════════════════════════════════════════════════════════════════
// §41/§62 — content hash
// ═════════════════════════════════════════════════════════════════════════════

describe("§41/§62 — identidade de conteúdo", () => {
  const headers = ["A", "B"]
  const rows = [["1", "x"], ["2", "y"]]

  it("mesmo conteúdo lógico → mesmo hash", () => {
    expect(sheetContentHash(headers, rows)).toBe(sheetContentHash(["A", "B"], [["1", "x"], ["2", "y"]]))
  })

  it("número e string equivalentes produzem o MESMO hash", () => {
    // A API do Sheets pode devolver `410` ou `"410"` para a mesma célula. Se o hash
    // distinguisse, toda releitura pareceria conteúdo novo.
    expect(sheetContentHash(headers, [[1, "x"]])).toBe(sheetContentHash(headers, [["1", "x"]]))
    expect(sheetContentHash(headers, [[null, "x"]])).toBe(sheetContentHash(headers, [["", "x"]]))
  })

  it("célula alterada → hash diferente", () => {
    expect(sheetContentHash(headers, rows)).not.toBe(sheetContentHash(headers, [["1", "x"], ["2", "z"]]))
  })

  it("cabeçalho alterado → hash diferente", () => {
    expect(sheetContentHash(headers, rows)).not.toBe(sheetContentHash(["A", "C"], rows))
  })

  it("ordem das linhas É material — decisão documentada, não omissão", () => {
    // A posição é o localizador de evidência de cada linha. Se reordenar não
    // mudasse o hash, duas capturas com o mesmo hash apontariam para células
    // diferentes e a auditoria mostraria a linha errada.
    expect(sheetContentHash(headers, rows)).not.toBe(sheetContentHash(headers, [...rows].reverse()))
  })

  it("o relógio da coleta NÃO entra no hash", async () => {
    const rs = [linha(1, "E")]
    const a = await capturar(rs, "2026-08-19T18:00:00.000Z")
    const b = await capturar(rs, "2026-08-19T19:30:00.000Z")
    if (a.status !== "available" || b.status !== "available") throw new Error("estado errado")
    expect(a.provenance.content_hash).toBe(b.provenance.content_hash)
    // E o snapshot_id, que deriva do hash, também é estável.
    expect(a.snapshot.snapshot_id).toBe(b.snapshot.snapshot_id)
    // Mas `ingested_at` reflete o relógio, senão a procedência mentiria.
    expect(a.snapshot.ingested_at).not.toBe(b.snapshot.ingested_at)
  })

  it("`modifiedTime` do Drive NÃO entra no hash", async () => {
    const rs = [linha(1, "E")]
    const a = await capturar(rs, "2026-08-20T10:00:00.000Z", "2026-08-19T13:39:00Z")
    const b = await capturar(rs, "2026-08-20T10:00:00.000Z", "2026-08-20T09:00:00Z")
    if (a.status !== "available" || b.status !== "available") throw new Error("estado errado")
    // Alguém abrir e salvar sem editar muda `modifiedTime` e não muda conteúdo.
    expect(a.provenance.content_hash).toBe(b.provenance.content_hash)
    expect(a.snapshot.observed_at).not.toBe(b.snapshot.observed_at)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §40/§42/§43 — snapshot governado
// ═════════════════════════════════════════════════════════════════════════════

describe("§40/§42/§43 — snapshot e procedência", () => {
  it("procedência completa, com pasta, arquivo e aba", async () => {
    const r = await capturar([linha(1, "E")])
    if (r.status !== "available") throw new Error("estado errado")
    const p = r.provenance
    expect(p.source_system).toBe("google_sheets")
    expect(p.dataset_id).toBe("lucas_status_contratos_mensal")
    expect(p.folder_id).toBe("16e7ABSA6SQnBAkgMtSOFYhPK171For2v")
    expect(p.file_id).toBe("f1")
    expect(p.file_name).toBe("Novos Alunos - Agosto")
    expect(p.sheet_name).toBe("Status Contratos")
    expect(p.period).toBe("2026-08")
    expect(p.content_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it("o snapshot é o governado da Fase 1, com os campos exigidos", async () => {
    const r = await capturar([linha(1, "E"), linha(2, "P")])
    if (r.status !== "available") throw new Error("estado errado")
    const s = r.snapshot
    expect(s.snapshot_id).toMatch(/^snap_[a-f0-9]{16}$/)
    expect(s.dataset_id).toBe("lucas_status_contratos_mensal")
    expect(s.period_start).toBe("2026-08-01")
    expect(s.period_end).toBe("2026-08-31")
    expect(s.record_count).toBe(2)
    // Nenhuma linha é descartada: linha ruim entra com fato.
    expect(s.rows_skipped).toBe(0)
    // Rótulo no formato FECHADO do schema governado.
    expect(s.payload.period_label).toBe("agosto/2026")
  })

  it("§0 — o payload NÃO carrega `sales_count` nem agregado sem população", async () => {
    const r = await capturar([linha(1, "E"), linha(2, "P"), linha(3, "A")])
    if (r.status !== "available") throw new Error("estado errado")
    // "vendas" é KPI do Lucas. Escrever um número aqui obrigaria a escolher a
    // população — `E` = 1 ou `status != C` = 3 — e essa escolha não é nossa.
    expect(r.snapshot.payload.sales_count).toBeUndefined()
    expect(r.snapshot.payload.average_ticket_cents).toBeUndefined()
    expect(r.snapshot.payload.installments_histogram).toBeUndefined()
    expect(Object.keys(r.snapshot.payload)).toEqual(["period_label"])
  })

  it("§43 — a captura é profundamente imutável", async () => {
    const r = await capturar([linha(1, "E")])
    if (r.status !== "available") throw new Error("estado errado")
    expect(Object.isFrozen(r)).toBe(true)
    expect(Object.isFrozen(r.rows)).toBe(true)
    expect(Object.isFrozen(r.rows[0])).toBe(true)
    expect(Object.isFrozen(r.provenance)).toBe(true)
    expect(Object.isFrozen(r.selection)).toBe(true)
    expect(Object.isFrozen(r.selection.candidates)).toBe(true)
    // Nenhuma referência mutável escapa.
    expect(() => {
      ;(r.rows as unknown as unknown[]).push({})
    }).toThrow()
  })

  it("PII não chega ao snapshot em nenhuma forma", async () => {
    const cpf = cpfSintetico(99)
    const drive = new FakeDrive({
      files: [
        arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", {
          headers: HEADER_AGOSTO,
          rows: [linhaAgosto({ venc: "PG", cpf, unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "E", aluno: "Pessoa Sintetica" })],
        }),
      ],
    })
    const r = await new LucasMonthlyContractsProvider({ drive, now: () => new Date("2026-08-19T18:00:00.000Z") }).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    const s = JSON.stringify(r.snapshot)
    expect(s).not.toContain(cpf)
    expect(s).not.toContain(cpf.replace(/\D/gu, ""))
    expect(s).not.toContain("Pessoa Sintetica")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §15/§16/§17/§60 — semântica de status
// ═════════════════════════════════════════════════════════════════════════════

describe("§15/§16 — a mesma população, duas leituras", () => {
  it("§60 — mês VIGENTE: E realizado, A aguardando, P pendente", () => {
    expect(classifyOutcome("E", "current")).toBe("realized")
    expect(classifyOutcome("A", "current")).toBe("awaiting_creditum")
    expect(classifyOutcome("P", "current")).toBe("pending_unsigned")
    expect(classifyOutcome("C", "current")).toBe("cancelled")
  })

  it("§60 — mês FECHADO: só E é realizado; A e P não são", () => {
    expect(classifyOutcome("E", "closed")).toBe("realized")
    expect(classifyOutcome("A", "closed")).toBe("not_realized")
    expect(classifyOutcome("P", "closed")).toBe("not_realized")
    expect(classifyOutcome("C", "closed")).toBe("cancelled")
  })

  it("reproduz AGOSTO real: 8 E, 1 A, 11 P — e realizado é 8, não 20", () => {
    const pop = [
      ...Array.from({ length: 8 }, () => ({ status: "E" as const })),
      { status: "A" as const },
      ...Array.from({ length: 11 }, () => ({ status: "P" as const })),
    ]
    const d = decomposeStatuses(pop, "current")
    expect(d.total).toBe(20)
    expect(d.realized).toBe(8)
    expect(d.awaiting_creditum).toBe(1)
    expect(d.pending_unsigned).toBe(11)
    // A conta do relatório (`status != C`) daria 20. Realizado é 8: 2,5× de
    // diferença, e é por isso que a decomposição precisa viajar rotulada.
    expect(d.realized + d.awaiting_creditum + d.pending_unsigned).toBe(20)
  })

  it("reproduz JULHO real: 19 E, 5 C — as duas contas coincidem no mês fechado", () => {
    const pop = [
      ...Array.from({ length: 19 }, () => ({ status: "E" as const })),
      ...Array.from({ length: 5 }, () => ({ status: "C" as const })),
    ]
    const d = decomposeStatuses(pop, "closed")
    expect(d.total).toBe(24)
    expect(d.realized).toBe(19)
    expect(d.cancelled).toBe(5)
    // Zero pendentes: eles se resolvem antes do fechamento. É o que faz
    // `status != C` = 19 = `E` em retrospecto.
    expect(d.awaiting_creditum).toBe(0)
    expect(d.pending_unsigned).toBe(0)
    expect(d.not_realized).toBe(0)
  })

  it("§0 — a decomposição NÃO expõe campo chamado `vendas`", () => {
    const d = decomposeStatuses([{ status: "E" as const }], "current")
    const chaves = Object.keys(d)
    expect(chaves).not.toContain("vendas")
    expect(chaves).not.toContain("sales")
    expect(chaves).not.toContain("sales_count")
  })

  it("status inválido é contado à parte, nunca somado a realizado", () => {
    const d = decomposeStatuses([{ status: null }, { status: "E" as const }], "current")
    expect(d.invalid_status).toBe(1)
    expect(d.realized).toBe(1)
  })
})

describe("§17 — o fato `A`, sem severidade inventada", () => {
  it("mês vigente produz o fato com evidência e SEM severidade", async () => {
    const r = await capturar([linha(1, "E"), linha(2, "A", "R$ 7.169,92", 17)])
    if (r.status !== "available") throw new Error("estado errado")
    const fatos = awaitingSignatureFacts(comEvidencia(r, "current"))
    expect(fatos).toHaveLength(1)
    const f = fatos[0]
    expect(f?.fact).toBe("AWAITING_CREDITUM_SIGNATURE")
    expect(f?.ticket_cents).toBe(716992)
    expect(f?.unit_id).toBe("sao_joao_de_meriti")
    expect(f?.period).toBe("2026-08")
    // Nenhuma severidade: `creditum-policy.v1.json` não cobre este evento.
    expect(f?.severity).toBeNull()
    expect(f?.severity_status).toBe("SEVERITY_POLICY_UNRESOLVED")
  })

  it("mês fechado não produz o fato — o gargalo já não é acionável", async () => {
    const r = await capturar([linha(2, "A")])
    if (r.status !== "available") throw new Error("estado errado")
    const fatos = awaitingSignatureFacts(comEvidencia(r, "closed"))
    expect(fatos).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §48/§49/§50/§51 — integração com os detectores
// ═════════════════════════════════════════════════════════════════════════════

describe("§48/§49 — A e low-ticket recebem os campos certos", () => {
  it("a população estrutural exclui C e status inválido, mantém E/A/P", async () => {
    const r = await capturar([linha(1, "E"), linha(2, "A"), linha(3, "P"), linha(4, "C")])
    if (r.status !== "available") throw new Error("estado errado")
    const pop = structuralPopulation(r.rows, "current")
    // A e low-ticket medem ESTRUTURA do contratado; pendente já tem parcelamento e
    // ticket definidos. Cancelado não é produto vendido.
    expect(pop).toHaveLength(3)
    expect(pop.map((l) => l.status).sort()).toEqual(["A", "E", "P"])
  })

  it("§48 — o mapeamento de A: PARCELAS, TICKET, unit_id, período", async () => {
    const r = await capturar([linha(1, "E", "R$ 8.151,60", 20), linha(2, "P", "R$ 9.011,10", 21)])
    if (r.status !== "available") throw new Error("estado errado")
    const input = toInstallmentInput(comEvidencia(r, "current"))
    expect(input.contracts).toHaveLength(2)
    expect(input.contracts[0]?.installment_count).toBe(20)
    expect(input.contracts[0]?.amount_cents).toBe(815160)
    expect(input.contracts[1]?.installment_count).toBe(21)
    expect(input.period_start).toBe("2026-08-01")
    expect(input.period_end).toBe("2026-08-31")
    expect(input.snapshots).toHaveLength(1)
    // A unidade chega já canonicalizada — o detector não faz heurística.
    expect(input.contracts[0]?.unit.status).toBe("matched")
    // Sem `expected_units`, `unit_coverage` fica AUSENTE, não zerada.
    expect(input.unit_coverage).toBeUndefined()
    expect("unit_coverage" in input).toBe(false)
  })

  it("§49 — low-ticket usa o TICKET oficial, e o piso governado decide", async () => {
    const r = await capturar([
      // 149998 centavos = R$ 1.499,98 → abaixo do piso
      linha(1, "E", "R$ 1.499,98", 10),
      // 149999 → NO piso, não dispara
      linha(2, "E", "R$ 1.499,99", 10),
      // 150000 → acima
      linha(3, "E", "R$ 1.500,00", 10),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    const input = toLowTicketInput(comEvidencia(r, "current"))
    expect(input.contracts.map((c) => c.ticket_cents)).toEqual([149998, 149999, 150000])

    // Roda a REGRA governada de verdade, não uma reimplementação.
    const res = detectLowTicketContracts(input)
    const veredictos = res.assessed.map((a) => a.verdict)
    expect(veredictos[0]).toBe("BELOW_FLOOR")
    expect(veredictos[1]).not.toBe("BELOW_FLOOR")
    expect(veredictos[2]).not.toBe("BELOW_FLOOR")
  })

  it("§49 — TICKET ausente NÃO é substituído por REPASSE × PARCELAS", async () => {
    const drive = new FakeDrive({
      files: [
        arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", {
          headers: HEADER_AGOSTO,
          rows: [
            // Repasse presente, ticket vazio: o produto daria 100.000 centavos e
            // atravessaria o piso com um número que a fonte não afirmou.
            linhaAgosto({ venc: "PG", cpf: cpfSintetico(1), unidade: "Meriti", parcelas: 10, ticket: "", repasse: "R$ 100,00", status: "E" }),
          ],
        }),
      ],
    })
    const r = await new LucasMonthlyContractsProvider({ drive, now: () => new Date("2026-08-19T18:00:00.000Z") }).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    const input = toLowTicketInput(comEvidencia(r, "current"))
    expect(input.contracts[0]?.ticket_cents).toBeNull()
    expect(r.rows[0]?.transfer_cents).toBe(10000)
  })

  it("linha sem CPF entra nos detectores com pseudônimo de linha, não é excluída", async () => {
    const drive = new FakeDrive({
      files: [
        arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", {
          headers: HEADER_AGOSTO,
          rows: [linhaAgosto({ venc: "PG", cpf: "", unidade: "Meriti", parcelas: 12, ticket: "R$ 1.660,00", status: "P" })],
        }),
      ],
    })
    const r = await new LucasMonthlyContractsProvider({ drive, now: () => new Date("2026-08-19T18:00:00.000Z") }).load({ period: "2026-08" })
    if (r.status !== "available") throw new Error("estado errado")
    const input = toInstallmentInput(comEvidencia(r, "current"))
    // Excluir tiraria o contrato do denominador de concentração.
    expect(input.contracts).toHaveLength(1)
    // Pseudônimo de LINHA, no formato governado `subj_<16 hex>` — a primeira versão
    // usava `subj_missing_row_1`, que o detector recusava por não casar o padrão.
    expect(input.contracts[0]?.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
    expect(input.contracts[0]?.installment_count).toBe(12)
  })
})

describe("§36 — Detector C deferido, com a razão medida", () => {
  it("o deferimento é explícito e nomeia a perda", () => {
    expect(DETECTOR_C_DEFERRAL.integrated).toBe(false)
    expect(DETECTOR_C_DEFERRAL.reason).toBe("EXCLUSION_VOCABULARY_LOSSY")
    // 5 estados de fonte contra 2 do detector: a perda é aritmética, não opinião.
    expect(DETECTOR_C_DEFERRAL.source_states).toHaveLength(5)
    expect(DETECTOR_C_DEFERRAL.detector_states).toEqual(["MISSING_DUE_DATE", "INVALID_DUE_DATE"])
  })

  it("§35 — a data completa é PRESERVADA, para quando a fonte tiver a coluna", async () => {
    const r = await capturar([linha(1, "E")])
    if (r.status !== "available") throw new Error("estado errado")
    const v = r.rows[0]?.venc
    expect(v?.state).toBe("available")
    if (v?.state === "available") expect(v.first_due_date).toBe("2026-08-27")
    // Não declaramos a coluna inteira como vazia só porque C não é chamado.
  })
})

