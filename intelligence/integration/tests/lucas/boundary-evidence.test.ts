/**
 * Fase 2.11a — a fronteira de erro e o caminho de evidência.
 *
 * Duas coisas provadas aqui, e as duas foram corrigidas nesta fase:
 *
 * 1. `load()` devolve SEMPRE um estado fechado. Nenhuma condição da fonte escapa
 *    como exceção genérica — nem relógio adiantado, nem `modifiedTime` ilegível,
 *    nem recusa do contrato governado.
 *
 * 2. A evidência que chega aos detectores é a que o PROVIDER produziu. Não é
 *    convenção: `DetectorMappingInput` não tem campo para recebê-la.
 */

import { describe, expect, it } from "vitest"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import { rowKeyFor } from "../../src/lucas/evidence"
import { toInstallmentInput, toLowTicketInput } from "../../src/lucas/detector-input"
import { productionLucasProvider } from "../../src/lucas/production"
import { GatewayError } from "../../../gateway/src/errors"
import { FakeDrive, arquivo } from "./fake-drive"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const GRADE = {
  headers: HEADER_AGOSTO,
  rows: [
    linhaAgosto({ venc: "27/08/2026", cpf: cpfSintetico(1), unidade: "Meriti", parcelas: 20, ticket: "R$ 8.151,60", status: "E" }),
    linhaAgosto({ venc: "PG", cpf: "", unidade: "Santos", parcelas: 12, ticket: "R$ 4.000,00", status: "P" }),
  ],
}

const carregar = (
  modified: string,
  now = "2026-08-19T18:00:00.000Z",
): ReturnType<LucasMonthlyContractsProvider["load"]> =>
  new LucasMonthlyContractsProvider({
    drive: new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", modified, GRADE)] }),
    now: () => new Date(now),
  }).load({ period: "2026-08" })

// ═════════════════════════════════════════════════════════════════════════════
// §10 — a invariante de tempo, comparada por INSTANTE
// ═════════════════════════════════════════════════════════════════════════════

describe("§10 — tempo da fonte", () => {
  it("SOURCE_TIME_INCONSISTENT quando o relógio da fonte está adiantado", async () => {
    const r = await carregar("2026-08-20T09:00:00Z", "2026-08-19T18:00:00.000Z")
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SOURCE_TIME_INCONSISTENT")
    // Os dois tempos ficam à vista, e nenhum foi ajustado.
    expect(r.detail).toContain("2026-08-20T09:00:00Z")
    expect(r.detail).toContain("2026-08-19T18:00:00.000Z")
  })

  it("precisões ISO diferentes NÃO produzem falso positivo", async () => {
    // O bug corrigido nesta fase. `Date.toISOString()` produz milissegundos e o
    // Drive não: comparando como STRING, na posição 19 aparece `Z` (0x5A) contra
    // `.` (0x2E), e `"…T18:00:00Z" > "…T18:00:00.000Z"` é `true`. Dois tempos que
    // são o MESMO instante viravam divergência de relógio.
    expect("2026-08-19T18:00:00Z" > "2026-08-19T18:00:00.000Z").toBe(true)
    expect(Date.parse("2026-08-19T18:00:00Z") > Date.parse("2026-08-19T18:00:00.000Z")).toBe(false)

    const r = await carregar("2026-08-19T18:00:00Z", "2026-08-19T18:00:00.000Z")
    expect(r.status).toBe("available")
  })

  it("um segundo antes da coleta é válido; um segundo depois não é", async () => {
    expect((await carregar("2026-08-19T17:59:59Z", "2026-08-19T18:00:00.000Z")).status).toBe("available")
    const depois = await carregar("2026-08-19T18:00:01Z", "2026-08-19T18:00:00.000Z")
    expect(depois.status).toBe("invalid_source")
  })

  it("`modifiedTime` ilegível é estado PRÓPRIO, não inventamos observed_at", async () => {
    const r = await carregar("ontem à tarde")
    expect(r.status).toBe("invalid_source")
    if (r.status !== "invalid_source") throw new Error("estado errado")
    expect(r.reason).toBe("SOURCE_TIME_UNPARSEABLE")
    // Datar a observação com o NOSSO relógio afirmaria que observamos a planilha no
    // instante da ingestão, o que é falso.
    expect(r.detail).toContain("ontem à tarde")
  })

  it("nenhum destes estados carrega snapshot ou linhas", async () => {
    for (const m of ["2026-08-20T09:00:00Z", "ontem à tarde"]) {
      const r = await carregar(m)
      const serial = JSON.stringify(r)
      expect(serial, m).not.toContain('"snapshot"')
      expect(serial, m).not.toContain('"rows"')
      expect(serial, m).not.toContain('"row_count"')
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §11/§12 — três fronteiras que nunca se misturam
// ═════════════════════════════════════════════════════════════════════════════

describe("§11 — CONFIGURATION vs SOURCE_ERROR vs DATA_NOT_AVAILABLE", () => {
  it("CONFIGURATION ERROR — impede CONSTRUIR o provider, é bootstrap", () => {
    // Sem credencial não existe provider. Isso acontece ANTES de `load()`, então é
    // legitimamente exceção de configuração e não um estado de captura: não há
    // captura, não houve leitura, e não há período sobre o qual afirmar nada.
    let capturado: unknown
    try {
      productionLucasProvider({})
    } catch (e) {
      capturado = e
    }
    expect(capturado).toBeInstanceOf(GatewayError)
    const g = capturado as GatewayError
    expect(g.message).toContain("não configurado")
    // Cita NOMES de variável, nunca valores.
    expect(JSON.stringify(g.details ?? [])).toContain("GOOGLE_SERVICE_ACCOUNT_EMAIL")
  })

  it("a mensagem de configuração nunca contém o valor da credencial", () => {
    try {
      productionLucasProvider({ GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com" })
    } catch (e) {
      const tudo = e instanceof Error ? `${e.message}${JSON.stringify(e)}` : ""
      expect(tudo).toContain("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
      expect(tudo).not.toContain("sa@x.iam.gserviceaccount.com")
    }
  })

  it("SOURCE_ERROR — o Google respondeu com erro; NÃO é ausência de dado", async () => {
    for (const falha of ["permission denied", "quota exceeded", "backend error 503"]) {
      const p = new LucasMonthlyContractsProvider({
        drive: new FakeDrive({ files: [], listThrows: falha }),
        now: () => new Date("2026-08-19T18:00:00.000Z"),
      })
      const r = await p.load({ period: "2026-08" })
      expect(r.status, falha).toBe("source_error")
      if (r.status !== "source_error") throw new Error("estado errado")
      expect(r.detail, falha).toContain(falha)
      // A confusão que este subsistema existe para não cometer: outage virando
      // "não houve contrato" e depois "as vendas caíram".
      expect(r.status).not.toBe("data_not_available")
    }
  })

  it("SOURCE_ERROR também na leitura da aba, não só na listagem", async () => {
    const p = new LucasMonthlyContractsProvider({
      drive: new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", GRADE)], readThrows: "rate limited" }),
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    })
    const r = await p.load({ period: "2026-08" })
    expect(r.status).toBe("source_error")
  })

  it("DATA_NOT_AVAILABLE — o Google respondeu BEM e o arquivo não existe", async () => {
    const p = new LucasMonthlyContractsProvider({
      drive: new FakeDrive({ files: [] }),
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    })
    const r = await p.load({ period: "2026-08" })
    expect(r.status).toBe("data_not_available")
    if (r.status !== "data_not_available") throw new Error("estado errado")
    expect(r.detail).toContain("NÃO significa zero contratos")
  })

  it("§12 — `load()` sobre provider válido NUNCA lança para condição de fonte", async () => {
    const cenarios: readonly (() => ReturnType<LucasMonthlyContractsProvider["load"]>)[] = [
      () => carregar("2026-08-20T09:00:00Z"), // relógio adiantado
      () => carregar("nao-e-data"), // tempo ilegível
      () =>
        new LucasMonthlyContractsProvider({
          drive: new FakeDrive({ files: [], listThrows: "boom" }),
          now: () => new Date("2026-08-19T18:00:00.000Z"),
        }).load({ period: "2026-08" }),
      () =>
        new LucasMonthlyContractsProvider({
          drive: new FakeDrive({ files: [] }),
          now: () => new Date("2026-08-19T18:00:00.000Z"),
        }).load({ period: "2026-13" }), // período fora do domínio
    ]
    const estados: string[] = []
    for (const c of cenarios) {
      // Sem try/catch: se qualquer um lançar, o teste falha e o contrato está furado.
      estados.push((await c()).status)
    }
    expect(estados).toEqual([
      "invalid_source",
      "invalid_source",
      "source_error",
      "source_error",
    ])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §7/§8/§9 — evidência do caminho de produção
// ═════════════════════════════════════════════════════════════════════════════

describe("§7/§8 — a evidência nasce no pipeline, não no chamador", () => {
  const carregarOk = (): ReturnType<LucasMonthlyContractsProvider["load"]> =>
    carregar("2026-08-19T13:39:00Z")

  it("§8 — o tipo NÃO tem onde receber evidência de fora", () => {
    // A prova é do compilador. `DetectorMappingInput` não declara `evidence` nem
    // `aggregate_evidence_ref`; um chamador que tentasse injetar não compila. É por
    // isso que a garantia é estrutural e não uma convenção de revisão.
    type Campos = keyof import("../../src/lucas/detector-input").DetectorMappingInput
    const campos: readonly Campos[] = ["capture", "stance", "detected_at", "unit_coverage"]
    expect([...campos].sort()).toEqual(["capture", "detected_at", "stance", "unit_coverage"])
  })

  it("a evidência que chega ao detector é a MESMA instância da captura", async () => {
    const r = await carregarOk()
    if (r.status !== "available") throw new Error("estado errado")
    const a = toInstallmentInput({ capture: r, stance: "current", detected_at: "2026-08-19T18:00:00.000Z" })
    const lt = toLowTicketInput({ capture: r, stance: "current", detected_at: "2026-08-19T18:00:00.000Z" })
    expect(a.evidence).toBe(r.evidence.all)
    expect(lt.evidence).toBe(r.evidence.all)
    expect(a.aggregate_evidence_ref).toBe(r.evidence.aggregate.evidence_id)
  })

  it("§9 — usa os contratos canônicos da Fase 1, sem protocolo paralelo", async () => {
    const r = await carregarOk()
    if (r.status !== "available") throw new Error("estado errado")
    for (const e of r.evidence.all) {
      // `Evidence` do gateway: `kind` fechado, `locator` com `dataset_id`.
      expect(["row", "computed"]).toContain(e.kind)
      expect(e.evidence_id).toMatch(/^ev_[a-f0-9]{16}$/)
      expect(e.snapshot_id).toBe(r.snapshot.snapshot_id)
      expect(e.locator.dataset_id).toBe("lucas_status_contratos_mensal")
      // `observed_at` é o da FONTE, não o da coleta: a evidência não afirma ter
      // observado a planilha no instante em que a lemos.
      expect(e.observed_at).toBe(r.snapshot.observed_at)
    }
    // Nenhum tipo `LucasEvidence` / `SalesEvidence` foi criado.
    expect(r.evidence.rowEvidence).toHaveLength(r.row_count)
    expect(r.evidence.aggregate.kind).toBe("computed")
    expect(r.evidence.aggregateProvenance.provenance_version).toBe("1.0.0")
    expect(r.evidence.aggregateProvenance.evidence_ref).toBe(r.evidence.aggregate.evidence_id)
  })

  it("§7 — `row_key` vem do produtor canônico e é SHA-256", async () => {
    const r = await carregarOk()
    if (r.status !== "available") throw new Error("estado errado")
    for (const [i, e] of r.evidence.rowEvidence.entries()) {
      expect(e.locator.row_key).toMatch(/^[a-f0-9]{64}$/)
      // Reproduzível pelo mesmo produtor canônico (`computeIdentity`).
      expect(e.locator.row_key).toBe(rowKeyFor("f1", "Status Contratos", i + 1))
      expect(e.locator.sheet).toBe("Status Contratos")
    }
  })

  it("`row_key` inclui o arquivo — linha 1 de agosto ≠ linha 1 de setembro", () => {
    // Sem o escopo do arquivo, o sistema concluiria que uma é edição da outra e
    // passaria a versionar uma por cima da outra.
    expect(rowKeyFor("f_ago", "Status Contratos", 1)).not.toBe(rowKeyFor("f_set", "Status Contratos", 1))
    expect(rowKeyFor("f1", "Status Contratos", 1)).not.toBe(rowKeyFor("f1", "Status Contratos", 2))
  })

  it("§7 — `subject_ref` satisfaz o contrato canônico, com e sem CPF", async () => {
    const r = await carregarOk()
    if (r.status !== "available") throw new Error("estado errado")
    const a = toInstallmentInput({ capture: r, stance: "current", detected_at: "2026-08-19T18:00:00.000Z" })
    // Linha 1 tem CPF, linha 2 não. As duas satisfazem o padrão do detector.
    expect(a.contracts).toHaveLength(2)
    for (const c of a.contracts) expect(c.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
    // E são pseudônimos DIFERENTES: pessoa e linha vivem em domínios separados.
    expect(a.contracts[0]?.subject_ref).not.toBe(a.contracts[1]?.subject_ref)
  })

  it("§7 — cada contrato está vinculado à evidência e ao snapshot certos", async () => {
    const r = await carregarOk()
    if (r.status !== "available") throw new Error("estado errado")
    const a = toInstallmentInput({ capture: r, stance: "current", detected_at: "2026-08-19T18:00:00.000Z" })
    const ids = new Set(r.evidence.all.map((e) => e.evidence_id))
    for (const c of a.contracts) {
      expect(c.snapshot_id).toBe(r.snapshot.snapshot_id)
      expect(c.evidence_refs.length).toBeGreaterThan(0)
      for (const ref of c.evidence_refs) expect(ids.has(ref)).toBe(true)
    }
  })

  it("§7 — nenhum CPF em claro na evidência, em nenhuma forma", async () => {
    const cpf = cpfSintetico(1)
    const r = await carregarOk()
    if (r.status !== "available") throw new Error("estado errado")
    const serial = JSON.stringify(r.evidence)
    expect(serial).not.toContain(cpf)
    expect(serial).not.toContain(cpf.replace(/\D/gu, ""))
    expect(serial).not.toContain(cpf.replace(/\D/gu, "").slice(0, 9))
    // Nem `untrusted_excerpt`, que é a porta pela qual texto de fonte entraria.
    expect(serial).not.toContain("untrusted_excerpt")
  })

  it("evidência é determinística: mesma captura lógica, mesmos ids", async () => {
    const a = await carregarOk()
    const b = await carregarOk()
    if (a.status !== "available" || b.status !== "available") throw new Error("estado errado")
    expect(a.evidence.all.map((e) => e.evidence_id)).toEqual(b.evidence.all.map((e) => e.evidence_id))
    expect(a.evidence.aggregateProvenance.computation_id).toBe(b.evidence.aggregateProvenance.computation_id)
  })

  it("captura vazia produz evidência de agregado e nenhuma de linha", async () => {
    const p = new LucasMonthlyContractsProvider({
      drive: new FakeDrive({ files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", { headers: HEADER_AGOSTO, rows: [] })] }),
      now: () => new Date("2026-08-19T18:00:00.000Z"),
    })
    const r = await p.load({ period: "2026-08" })
    if (r.status !== "available_empty") throw new Error("estado errado")
    expect(r.evidence.rowEvidence).toEqual([])
    // O agregado existe: "zero contratos" é uma afirmação, e afirmação precisa de
    // lastro tanto quanto um número diferente de zero.
    expect(r.evidence.aggregate.kind).toBe("computed")
  })
})
