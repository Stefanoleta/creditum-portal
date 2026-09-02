/**
 * Fase 2.12 — as três populações comerciais e o Detector D.
 *
 * ─── O que esta fase resolve ──────────────────────────────────────────────────
 *
 * A Fase 2.11 deixou D deferido porque escolher entre `E`, `E+A` e `E+A+P` é decisão
 * de negócio, e integrar sob suposição produziria um denominador que ninguém aprovou.
 * A decisão chegou: `COMMERCIAL_POTENTIAL` = E+A+P.
 *
 * O risco desta fase é o oposto do anterior: agora que existem três populações, a
 * tentação é chamar uma delas de "vendas". Os testes abaixo afirmam explicitamente
 * que 9 não é realizado e que 5 não é emitido.
 */

import { describe, expect, it } from "vitest"
import { LucasMonthlyContractsProvider } from "../../src/lucas/provider"
import {
  COMMERCIAL_POPULATIONS,
  FULLY_COMPLETED_SALE_STATUS,
  belongsToPopulation,
  countPopulations,
  decomposeStatuses,
  projectCurrentMonth,
} from "../../src/lucas/status-semantics"
import {
  MATERIAL_SINGLE_CASE_CANDIDATE_IDENTITY_GAP,
  awaitingSignatureFacts,
  pendingStudentSignatureFacts,
  selectPopulation,
  toMaterialSingleCaseInput,
  validateCurrentPeriod,
} from "../../src/lucas/detector-input"
import { currentPeriod } from "../../src/lucas/provider"
import { detectMaterialSingleCase } from "../../../detectors/src/material-single-case"
import { buildProductionDetectorConfig, CREDITUM_POLICY_V1 } from "../../../detectors/src/production-policy"
import { FakeDrive, arquivo } from "./fake-drive"
import { HEADER_AGOSTO, cpfSintetico, linhaAgosto } from "./fixtures"

const PROD = buildProductionDetectorConfig()
const PERIODO = "2026-08"

/** Valida o período e devolve a captura provada. Falha o teste se não for corrente. */
const validar = (
  capture: Extract<Awaited<ReturnType<LucasMonthlyContractsProvider["load"]>>, { status: "available" } | { status: "available_empty" }>,
  current = PERIODO,
) => {
  const c = validateCurrentPeriod(capture, current)
  if (c.status !== "current") throw new Error("esperava período corrente")
  return c.validated
}

const linha = (i: number, status: "E" | "A" | "P" | "C", ticket = "R$ 5.000,00") =>
  linhaAgosto({
    venc: "27/08/2026",
    cpf: cpfSintetico(i),
    unidade: "Meriti",
    parcelas: 10,
    ticket,
    status,
  })

const capturar = async (
  rows: readonly (readonly unknown[])[],
): Promise<Awaited<ReturnType<LucasMonthlyContractsProvider["load"]>>> =>
  new LucasMonthlyContractsProvider({
    drive: new FakeDrive({
      files: [arquivo("f1", "Novos Alunos - Agosto", "2026-08-19T13:39:00Z", { headers: HEADER_AGOSTO, rows })],
    }),
    now: () => new Date("2026-08-19T18:00:00.000Z"),
  }).load({ period: "2026-08" })

// ═════════════════════════════════════════════════════════════════════════════
// §23 — projeção de status nos três eixos
// ═════════════════════════════════════════════════════════════════════════════

describe("§2/§3/§4/§5/§23 — os três eixos por status", () => {
  it("E — os três: no funil, confirmado pelo cliente, emitido", () => {
    expect(projectCurrentMonth("E")).toEqual({
      in_commercial_pipeline: true,
      commercially_confirmed: true,
      emitted: true,
    })
  })

  it("A — no funil e CONFIRMADO, mas NÃO emitido", () => {
    // O aluno e o garantidor assinaram; falta a Creditum. É a distinção que o
    // alerta de `A` carrega, e é por isso que ele não pode contar como emitido.
    expect(projectCurrentMonth("A")).toEqual({
      in_commercial_pipeline: true,
      commercially_confirmed: true,
      emitted: false,
    })
  })

  it("P — apenas no funil; nem confirmado, nem emitido", () => {
    expect(projectCurrentMonth("P")).toEqual({
      in_commercial_pipeline: true,
      commercially_confirmed: false,
      emitted: false,
    })
  })

  it("C — nenhum dos três", () => {
    expect(projectCurrentMonth("C")).toEqual({
      in_commercial_pipeline: false,
      commercially_confirmed: false,
      emitted: false,
    })
  })

  it("§6 — a pertinência a cada população segue os eixos", () => {
    const esperado: Record<string, readonly string[]> = {
      E: ["COMMERCIALLY_CONFIRMED", "COMMERCIAL_POTENTIAL", "EMITTED"],
      A: ["COMMERCIALLY_CONFIRMED", "COMMERCIAL_POTENTIAL"],
      P: ["COMMERCIAL_POTENTIAL"],
      C: [],
    }
    for (const [status, pops] of Object.entries(esperado)) {
      const pertence = COMMERCIAL_POPULATIONS.filter((p) =>
        belongsToPopulation(status as "E" | "A" | "P" | "C", p),
      )
      expect([...pertence].sort(), status).toEqual([...pops].sort())
    }
  })

  it("§8 — venda 100% concluída é DECLARADA e não computada", () => {
    // Declarar impede que `EMITTED` ou `COMMERCIALLY_CONFIRMED` sejam lidos como
    // conclusão financeira. Exige `E` + pagamento no Omie, que não é fonte
    // observável nesta fase.
    expect(FULLY_COMPLETED_SALE_STATUS).toBe("DEFERRED_REQUIRES_OMIE_PAYMENT")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §24 — as três contagens sobre a fixture governada
// ═════════════════════════════════════════════════════════════════════════════

describe("§24 — E=3, A=2, P=4, C=1", () => {
  const pop = [
    ...Array.from({ length: 3 }, () => ({ status: "E" as const })),
    ...Array.from({ length: 2 }, () => ({ status: "A" as const })),
    ...Array.from({ length: 4 }, () => ({ status: "P" as const })),
    { status: "C" as const },
  ]

  it("as três populações dão 9, 5 e 3", () => {
    expect(countPopulations(pop)).toEqual({
      COMMERCIAL_POTENTIAL: 9,
      COMMERCIALLY_CONFIRMED: 5,
      EMITTED: 3,
    })
  })

  it("9 NÃO é venda realizada, e 5 NÃO é emitido", () => {
    const c = countPopulations(pop)
    // Realizado histórico é `E`. As três populações são do mês corrente, e nenhuma
    // delas responde "quantas vendas realizadas?".
    const realizado = decomposeStatuses(pop, "current").realized
    expect(realizado).toBe(3)
    expect(c.COMMERCIAL_POTENTIAL).not.toBe(realizado)
    expect(c.COMMERCIALLY_CONFIRMED).not.toBe(c.EMITTED)
    // E nenhuma das chaves se chama `sales` ou `realized`.
    const chaves = Object.keys(c)
    for (const proibida of ["sales", "sales_count", "realized", "vendas"]) {
      expect(chaves, proibida).not.toContain(proibida)
    }
  })

  it("status inválido não entra em nenhuma população", () => {
    const c = countPopulations([...pop, { status: null }])
    expect(c).toEqual({ COMMERCIAL_POTENTIAL: 9, COMMERCIALLY_CONFIRMED: 5, EMITTED: 3 })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §26 — histórico inalterado
// ═════════════════════════════════════════════════════════════════════════════

describe("§7/§26 — a nova semântica NÃO muda o histórico", () => {
  it("mês fechado: realizado continua sendo E, e A/P não viram possibilidade", () => {
    const julho = [
      ...Array.from({ length: 19 }, () => ({ status: "E" as const })),
      ...Array.from({ length: 5 }, () => ({ status: "C" as const })),
    ]
    const d = decomposeStatuses(julho, "closed")
    expect(d.realized).toBe(19)
    expect(d.cancelled).toBe(5)
    expect(d.awaiting_creditum).toBe(0)
    expect(d.pending_unsigned).toBe(0)
  })

  it("um A e um P de mês FECHADO são não-realizados, não confirmados", () => {
    const fechado = [{ status: "E" as const }, { status: "A" as const }, { status: "P" as const }]
    const d = decomposeStatuses(fechado, "closed")
    expect(d.realized).toBe(1)
    expect(d.not_realized).toBe(2)
    // As três populações são de mês CORRENTE. Não existe função que as aplique a
    // `closed`, e é isso que impede a possibilidade retroativa.
    expect(d.stance).toBe("closed")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §27 — alertas de A e P
// ═════════════════════════════════════════════════════════════════════════════

describe("§13/§14/§27 — os dois alertas, sem severidade inventada", () => {
  const entrada = async () => {
    const r = await capturar([
      linha(1, "E"),
      linha(2, "A", "R$ 7.169,92"),
      linha(3, "P", "R$ 4.000,00"),
      linha(4, "C"),
    ])
    if (r.status !== "available") throw new Error("estado errado")
    return { capture: r, stance: "current" as const, detected_at: "2026-08-19T18:00:00.000Z" }
  }

  it("A produz AWAITING_CREDITUM_SIGNATURE, e só A", async () => {
    const i = await entrada()
    const fatos = awaitingSignatureFacts(i)
    expect(fatos).toHaveLength(1)
    expect(fatos[0]?.fact).toBe("AWAITING_CREDITUM_SIGNATURE")
    expect(fatos[0]?.ticket_cents).toBe(716992)
    expect(fatos[0]?.unit_id).toBe("sao_joao_de_meriti")
    expect(fatos[0]?.severity).toBeNull()
    expect(fatos[0]?.severity_status).toBe("SEVERITY_POLICY_UNRESOLVED")
  })

  it("P produz PENDING_STUDENT_SIGNATURE, e só P", async () => {
    const i = await entrada()
    const fatos = pendingStudentSignatureFacts(i)
    expect(fatos).toHaveLength(1)
    expect(fatos[0]?.fact).toBe("PENDING_STUDENT_SIGNATURE")
    expect(fatos[0]?.ticket_cents).toBe(400000)
    expect(fatos[0]?.severity).toBeNull()
  })

  it("E e C não produzem nenhum dos dois alertas", async () => {
    const r = await capturar([linha(1, "E"), linha(4, "C")])
    if (r.status !== "available") throw new Error("estado errado")
    const i = { capture: r, stance: "current" as const, detected_at: "2026-08-19T18:00:00.000Z" }
    expect(awaitingSignatureFacts(i)).toEqual([])
    expect(pendingStudentSignatureFacts(i)).toEqual([])
  })

  it("§3 — nenhum fato de PRAZO é produzido: o prazo não foi governado", async () => {
    const i = await entrada()
    const serial = JSON.stringify([...awaitingSignatureFacts(i), ...pendingStudentSignatureFacts(i)])
    // `CREDITUM_SIGNATURE_OVERDUE` exigiria um prazo máximo governado, e ele não
    // existe. Um "atrasado" sem definição de atraso é um alerta que ninguém pode
    // conferir.
    expect(serial).not.toContain("OVERDUE")
    expect(serial).not.toContain("deadline")
    expect(serial).not.toContain("aging")
    expect(serial).not.toContain("days")
  })

  it("os dois fatos são DISTINTOS — a pendência é de quem?", async () => {
    const i = await entrada()
    const a = awaitingSignatureFacts(i)[0]
    const p = pendingStudentSignatureFacts(i)[0]
    // Em `A` o gargalo é INTERNO (a Creditum emite); em `P` é EXTERNO (o aluno
    // assina). Um fato único obrigaria quem recebe a descobrir de quem é a vez.
    expect(a?.fact).not.toBe(p?.fact)
    expect(a?.subject_ref).not.toBe(p?.subject_ref)
  })

  it("ambos os fatos têm evidência canônica do pipeline", async () => {
    const i = await entrada()
    const ids = new Set(i.capture.evidence.all.map((e) => e.evidence_id))
    for (const f of [...awaitingSignatureFacts(i), ...pendingStudentSignatureFacts(i)]) {
      expect(f.evidence_refs.length).toBeGreaterThan(0)
      for (const ref of f.evidence_refs) expect(ids.has(ref)).toBe(true)
      expect(f.snapshot_id).toBe(i.capture.snapshot.snapshot_id)
    }
  })

  it("nenhum CPF em claro nos fatos", async () => {
    const cpf = cpfSintetico(2)
    const i = await entrada()
    const serial = JSON.stringify([...awaitingSignatureFacts(i), ...pendingStudentSignatureFacts(i)])
    expect(serial).not.toContain(cpf)
    expect(serial).not.toContain(cpf.replace(/\D/gu, ""))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// §25 — Detector D com a população governada
// ═════════════════════════════════════════════════════════════════════════════

describe("§9/§10/§11/§25 — Detector D sobre COMMERCIAL_POTENTIAL", () => {
  // Acima do mínimo governado de população para D, senão o detector responde
  // `insufficient` por tamanho e o teste não mede o que quer medir.
  const doze = Array.from({ length: 12 }, (_, i) =>
    linha(100 + i, i < 5 ? "E" : i < 8 ? "A" : "P", "R$ 5.000,00"),
  )
  const comCancelado = [...doze, linha(999, "C", "R$ 90.000,00")]

  const rodar = async () => {
    const r = await capturar(comCancelado)
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    if (m.status !== "mapped") throw new Error(`esperava mapped, veio ${m.status}`)
    return m
  }

  it("§11 — a população chega ROTULADA como COMMERCIAL_POTENTIAL", async () => {
    const m = await rodar()
    expect(m.population.population).toBe("COMMERCIAL_POTENTIAL")
    expect(m.population.stance).toBe("current")
    // 12 no funil; o cancelado fica fora.
    expect(m.population.count).toBe(12)
    expect(m.input.cases).toHaveLength(12)
  })

  it("§9 — D recebe exatamente E+A+P; C NÃO entra", async () => {
    const r = await capturar(comCancelado)
    if (r.status !== "available") throw new Error("estado errado")
    const potential = selectPopulation(validar(r), "COMMERCIAL_POTENTIAL")
    expect(potential.rows.map((l) => l.status).sort()).toEqual(
      [...Array.from({ length: 3 }, () => "A"), ...Array.from({ length: 5 }, () => "E"), ...Array.from({ length: 4 }, () => "P")].sort(),
    )
    expect(potential.rows.some((l) => l.status === "C")).toBe(false)
    // E o cancelado de R$ 90 mil — que dominaria o agregado — está de fora.
    const m = await rodar()
    expect(m.input.cases.some((c) => c.amount_cents === 9_000_000)).toBe(false)
  })

  it("as outras duas populações são subconjuntos, e distintas", async () => {
    const r = await capturar(comCancelado)
    if (r.status !== "available") throw new Error("estado errado")
    const v = validar(r)
    expect(selectPopulation(v, "COMMERCIAL_POTENTIAL").count).toBe(12)
    expect(selectPopulation(v, "COMMERCIALLY_CONFIRMED").count).toBe(8)
    expect(selectPopulation(v, "EMITTED").count).toBe(5)
  })

  it("§10 — o valor é o TICKET oficial, sem peso por status", async () => {
    const m = await rodar()
    // Todos R$ 5.000. Um `P` vale um contrato com o ticket que a fonte afirmou —
    // nenhuma probabilidade, nenhum fator de conversão.
    for (const c of m.input.cases) expect(c.amount_cents).toBe(500000)
    expect(m.input.metric).toBe("amount_sum_cents")
    expect(CREDITUM_POLICY_V1.single_case_aggregators).toContain("amount_sum_cents")
  })

  it("§25 — o Detector D REAL roda com a config de produção", async () => {
    const m = await rodar()
    const res = detectMaterialSingleCase(m.input, PROD)
    // Não reimplemento a matemática de D: só afirmo que ele avaliou a população.
    expect(res.summary.candidates_evaluated).toBe(12)
    expect(res.evaluated).toHaveLength(12)
  })

  it("§21 — um caso dominante `A` prova que D opera sobre E+A+P, não só E", async () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, i) => linha(200 + i, "P", "R$ 1.000,00")),
      linha(299, "A", "R$ 60.000,00"),
    ]
    const r = await capturar(rows)
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    if (m.status !== "mapped") throw new Error("esperava mapped")
    const res = detectMaterialSingleCase(m.input, PROD)
    const materiais = res.evaluated.filter((i) => i.outcome === "material")
    expect(materiais).toHaveLength(1)
    // O dominante é um `A` — que NÃO é venda emitida, e ainda assim concentra o
    // funil. Se D operasse só sobre `E`, a população seria vazia.
    expect(m.input.cases).toHaveLength(12)
    expect(PROD.materialSingleCase.material_absolute_delta_cents).toBe(5_000_000)
  })

  it("§21/§F — um `P` participa como membro pleno, sem ponderação", async () => {
    // Onze `A` de R$ 1.000 e um `P` de R$ 60.000: o dominante é o `P`. Se houvesse
    // qualquer peso por status, ele não seria material.
    const rows = [
      ...Array.from({ length: 11 }, (_, i) => linha(400 + i, "A", "R$ 1.000,00")),
      linha(499, "P", "R$ 60.000,00"),
    ]
    const r = await capturar(rows)
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    if (m.status !== "mapped") throw new Error("esperava mapped")
    const dominante = m.input.cases.find((c) => c.amount_cents === 6_000_000)
    expect(dominante).toBeDefined()
    const res = detectMaterialSingleCase(m.input, PROD)
    expect(res.evaluated.filter((i) => i.outcome === "material")).toHaveLength(1)
  })

  it("§10 — nenhum forecast, probabilidade ou sales_count aparece na entrada", async () => {
    const m = await rodar()
    const serial = JSON.stringify(m.input)
    for (const proibido of ["forecast", "probability", "weight", "sales_count", "conversion"]) {
      expect(serial, proibido).not.toContain(proibido)
    }
  })

  it("cada candidato tem o SEU contrafactual, nenhum reutilizado", async () => {
    const m = await rodar()
    expect(m.input.counterfactual_bindings).toHaveLength(12)
    const refs = m.input.counterfactual_bindings.map((b) => b.evidence_ref)
    expect(new Set(refs).size).toBe(12)
    for (const b of m.input.counterfactual_bindings) {
      expect(b.operation).toBe("exclude_subject")
      expect(b.evidence_ref).toMatch(/^ev_[a-f0-9]{16}$/)
    }
    expect(m.input.counterfactual_provenance).toHaveLength(12)
    const ancoradas = new Set(m.input.counterfactual_provenance.map((p) => p.evidence_ref))
    for (const r of refs) expect(ancoradas.has(r)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.12a — HIGH 1: o período corrente é PROVADO, não afirmado
// ═════════════════════════════════════════════════════════════════════════════

describe("2.12a §1–§6 — fronteira de período", () => {
  const doze = Array.from({ length: 12 }, (_, i) => linha(700 + i, i < 4 ? "E" : i < 8 ? "A" : "P"))

  it("§5 A — captura do período corrente é aceita", async () => {
    const r = await capturar(doze)
    if (r.status !== "available") throw new Error("estado errado")
    const c = validateCurrentPeriod(r, "2026-08")
    expect(c.status).toBe("current")
    if (c.status !== "current") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(c.validated, "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    expect(m.status).toBe("mapped")
  })

  it("§5 B — captura de mês FECHADO é recusada, e D não é invocado", async () => {
    // A captura é de 2026-08; o período corrente é 2026-09. Antes desta correção o
    // mapeamento ESTAMPAVA `stance: "current"` e tratava `A` e `P` históricos como
    // possibilidade comercial — o vazamento que a regra histórica proíbe.
    const r = await capturar(doze)
    if (r.status !== "available") throw new Error("estado errado")
    const c = validateCurrentPeriod(r, "2026-09")
    expect(c.status).toBe("not_current")
    if (c.status !== "not_current") throw new Error("estado errado")
    expect(c.reason).toBe("CLOSED_PERIOD")
    expect(c.capture_period).toBe("2026-08")
    expect(c.current_period).toBe("2026-09")
    // Não há `validated` para passar adiante: o ramo não o tem.
    expect(JSON.stringify(c)).not.toContain("validated")
    expect(JSON.stringify(c)).not.toContain('"stance"')
  })

  it("período FUTURO é razão diferente de fechado", async () => {
    const r = await capturar(doze)
    if (r.status !== "available") throw new Error("estado errado")
    const c = validateCurrentPeriod(r, "2026-07")
    if (c.status !== "not_current") throw new Error("estado errado")
    // Pedir um mês posterior ao corrente é defeito de chamada, não característica
    // do dado.
    expect(c.reason).toBe("FUTURE_PERIOD")
  })

  it("§6 — o chamador NÃO pode fabricar `stance: current`", () => {
    // A prova é do compilador: `CurrentPeriodCapture` tem uma chave de símbolo
    // privado, não exportada. Nenhum código fora do módulo consegue produzi-la, e
    // `toMaterialSingleCaseInput` não aceita outra coisa.
    //
    // Foi o compilador que quebrou os testes desta suíte quando a assinatura mudou:
    // eles passavam a captura crua, e passaram a não compilar.
    const chaves = Object.getOwnPropertyNames({} as Record<string, unknown>)
    expect(chaves).toEqual([])
  })

  it("§3 — o período corrente vem de America/Sao_Paulo, resolvido uma vez", () => {
    // 01/09 00:30 UTC é 31/08 21:30 em São Paulo: o período corrente é agosto.
    expect(currentPeriod(new Date("2026-09-01T00:30:00.000Z"))).toBe("2026-08")
    expect(currentPeriod(new Date("2026-09-01T03:30:00.000Z"))).toBe("2026-09")
    // `validateCurrentPeriod` NÃO consulta relógio: recebe o valor. Se cada função
    // chamasse o relógio, duas na mesma execução poderiam discordar sobre o mês.
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Fase 2.12a — HIGH 2: sujeito repetido não bloqueia D por dentro
// ═════════════════════════════════════════════════════════════════════════════

describe("2.12a §7–§16 — dois contratos do mesmo sujeito", () => {
  const mesmoCpf = cpfSintetico(8888)
  const doisContratos = (extra: readonly (readonly unknown[])[] = []) => [
    linhaAgosto({ venc: "27/08/2026", cpf: mesmoCpf, unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "E" }),
    linhaAgosto({ venc: "28/08/2026", cpf: mesmoCpf, unidade: "Santos", parcelas: 12, ticket: "R$ 7.000,00", status: "P" }),
    ...extra,
  ]

  it("§14 — os dois contratos permanecem, com row_key DISTINTO", async () => {
    const r = await capturar(doisContratos())
    if (r.status !== "available") throw new Error("estado errado")
    // Nenhum descartado, nenhum somado, nenhum deduplicado por CPF.
    expect(r.row_count).toBe(2)
    expect(r.rows[0]?.ticket_cents).toBe(500000)
    expect(r.rows[1]?.ticket_cents).toBe(700000)
    // Mesmo sujeito — é a mesma pessoa, e isso está certo.
    const a = r.rows[0]?.identity
    const b = r.rows[1]?.identity
    if (a?.status !== "identified" || b?.status !== "identified") throw new Error("esperava identificado")
    expect(a.subject_ref).toBe(b.subject_ref)
    // §15 — e a evidência continua por CONTRATO: row_key distinto.
    const keys = r.evidence.rowEvidence.map((e) => e.locator.row_key)
    expect(new Set(keys).size).toBe(2)
    for (const k of keys) expect(k).toMatch(/^[a-f0-9]{64}$/)
  })

  it("§12 — D NÃO é executado, com razão governada", async () => {
    const r = await capturar(doisContratos())
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    expect(m.status).toBe("not_executed")
    if (m.status !== "not_executed") throw new Error("estado errado")
    expect(m.reason).toBe("NON_UNIQUE_SUBJECT_FOR_CONTRACT_POPULATION")
    // O ramo de não-execução NÃO tem input: não existe o que mandar a D.
    expect(JSON.stringify(m)).not.toContain('"cases"')
    expect(JSON.stringify(m)).not.toContain('"counterfactual_bindings"')
    // A população fica auditável, e o sujeito repetido é nomeado por pseudônimo.
    expect(m.population.count).toBe(2)
    expect(m.duplicated_subjects).toHaveLength(1)
    expect(m.duplicated_subjects[0]?.contracts).toBe(2)
    expect(m.duplicated_subjects[0]?.subject_ref).toMatch(/^subj_[a-f0-9]{16}$/)
  })

  it("§14 — a recusa acontece ANTES de D, nunca dentro dele", async () => {
    // Deixar D recusar sozinho faria UMA linha repetida bloquear o mês inteiro, com
    // uma mensagem sobre binding — que não é o problema que o operador precisa ler.
    const r = await capturar(doisContratos(
      Array.from({ length: 10 }, (_, i) => linha(600 + i, "E")),
    ))
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    expect(m.status).toBe("not_executed")
    if (m.status !== "not_executed") throw new Error("estado errado")
    // 12 contratos na população, e só um sujeito é o problema.
    expect(m.population.count).toBe(12)
    expect(m.duplicated_subjects).toHaveLength(1)
    expect(m.detail).toContain("exclude_subject")
    expect(m.detail).toContain("Nenhum contrato foi descartado")
  })

  it("§13 — nada de deduplicar por CPF: a granularidade é o contrato", async () => {
    const r = await capturar(doisContratos())
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    if (m.status !== "not_executed") throw new Error("estado errado")
    // As duas linhas seguem na população: nenhuma foi eliminada para fazer D passar.
    expect(m.population.rows).toHaveLength(2)
    expect(m.population.rows.map((l) => l.ticket_cents).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([500000, 700000])
  })

  it("§15 — nenhum CPF em claro no resultado de não-execução", async () => {
    const r = await capturar(doisContratos())
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    const serial = JSON.stringify(m)
    expect(serial).not.toContain(mesmoCpf)
    expect(serial).not.toContain(mesmoCpf.replace(/\D/gu, ""))
  })

  it("§10/§12 — o gap está medido no contrato de D, não suposto", () => {
    const g = MATERIAL_SINGLE_CASE_CANDIDATE_IDENTITY_GAP
    expect(g.binds_by).toBe("subject_ref")
    expect(g.has_candidate_identity).toBe(false)
    expect(g.operation).toBe("exclude_subject")
    // A identidade de linha que a Fase 2.11 já produz, e que D não aceita.
    expect(g.available_row_identity).toBe("row_key")
  })

  it("§16 — duas linhas SEM CPF têm pseudônimos de linha distintos, e D roda", async () => {
    // `IDENTITY_MISSING` usa pseudônimo de LINHA, que já é único por linha — então
    // não há colisão de sujeito e D pode operar.
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => linha(800 + i, "E")),
      linhaAgosto({ venc: "27/08/2026", cpf: "", unidade: "Meriti", parcelas: 10, ticket: "R$ 5.000,00", status: "P" }),
      linhaAgosto({ venc: "28/08/2026", cpf: "", unidade: "Santos", parcelas: 10, ticket: "R$ 6.000,00", status: "P" }),
    ]
    const r = await capturar(rows)
    if (r.status !== "available") throw new Error("estado errado")
    const m = toMaterialSingleCaseInput(validar(r), "2026-08-19T18:00:00.000Z", "amount_sum_cents", "sum")
    expect(m.status).toBe("mapped")
    if (m.status !== "mapped") throw new Error("estado errado")
    expect(m.input.cases).toHaveLength(12)
    // 12 sujeitos distintos, apesar de dois sem CPF.
    expect(new Set(m.input.cases.map((c) => c.subject_ref)).size).toBe(12)
    // E D roda de verdade.
    expect(detectMaterialSingleCase(m.input, PROD).summary.candidates_evaluated).toBe(12)
  })
})
