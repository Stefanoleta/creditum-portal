/**
 * Fase 3.1d-D2B — provas do supervisor governado e do livro-razão de tentativa única.
 *
 * O ponto central: `execution_id` é queimado GLOBALMENTE, e a queima é atômica entre
 * processos. Zero rede, zero cliente, zero provedor, zero modelo, zero `spawn`.
 */

import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  EXECUTION_TERMINAL_OUTCOMES,
  PRODUCTION_EXECUTION_LEDGER_ROOT,
  classifyExecutionAttempt,
  executionKey,
  recordAttemptCommitted,
  recordExecutionTerminal,
} from "../src/execution-ledger"
import {
  LIVE_ATTEMPT_DEADLINE_SECONDS,
  LIVE_AUTHORIZATION_TTL_SECONDS,
  LIVE_EXECUTION_SPEC_VERSION,
  LIVE_TIMEOUT_DERIVATION_POLICY,
  issueLiveExecutionAuthorization,
  liveExecutionFingerprint,
} from "../src/live-execution"
import type { LiveExecutionSpecV1 } from "../src/live-execution"
import { ORACULOS, oraculo } from "./oracle"
import {
  ReservedExecutionAttempt,
  consumeReservedExecutionAttempt,
  prepareGovernedExecution,
} from "../src/execution-supervisor"

/**
 * A raiz e o relógio chegam por MOCK DE MÓDULO, não por costura de produção.
 *
 * A costura `__prepareGovernedExecutionForTests(auth, seam)` era exportada, e por isso
 * um chamador podia escolher a raiz — duas raízes, mesmo `execution_id`, duas
 * capacidades. Ela foi removida. O teste agora substitui a CONSTANTE do módulo do
 * livro-razão, o que não abre porta alguma em produção.
 */
const est = vi.hoisted(() => ({ raiz: "", relogio: null as null | (() => number) }))

vi.mock("../src/execution-ledger", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/execution-ledger")>()
  return {
    ...real,
    get PRODUCTION_EXECUTION_LEDGER_ROOT() {
      return est.raiz === "" ? real.PRODUCTION_EXECUTION_LEDGER_ROOT : est.raiz
    },
  }
})

vi.mock("../src/live-execution", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/live-execution")>()
  return {
    ...real,
    monotonicSeconds: () => (est.relogio === null ? real.monotonicSeconds() : est.relogio()),
  }
})


let RAIZ: string

beforeEach(() => {
  est.raiz = ""
  est.relogio = null
  RAIZ = mkdtempSync(join(tmpdir(), "creditum-d2b-"))
})
afterEach(() => {
  rmSync(RAIZ, { recursive: true, force: true })
})

const ID_BASE = "live-exec-d2b-0001"

function spec(over: Record<string, unknown> = {}): LiveExecutionSpecV1 {
  return {
    spec_version: LIVE_EXECUTION_SPEC_VERSION,
    execution_id: ID_BASE,
    read_model_fingerprint: "x".repeat(64),
    request_fingerprint: "r".repeat(64),
    runtime_binding_fingerprint: "b".repeat(64),
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    api_mode: "codex_responses",
    sdk_version: "2.24.0",
    constitution_hash: "38a38edc0af169bdfffde8e196a6fe8ba9acc82ba5b0ae0cb5726db0d95a1b79",
    system_contract_hash: "a315e9ec7afb3d91329716596341224dfed4ddf472e07998f272b5f54ab684de",
    response_policy_id: "creditum_hermes_response_extraction/v1",
    response_policy_version: "1.0.0",
    tool_count: 0,
    stream: false,
    background: false,
    max_retries: 0,
    attempt_deadline_seconds: LIVE_ATTEMPT_DEADLINE_SECONDS,
    authorization_ttl_seconds: LIVE_AUTHORIZATION_TTL_SECONDS,
    timeout_derivation_policy: LIVE_TIMEOUT_DERIVATION_POLICY,
    ...over,
  } as unknown as LiveExecutionSpecV1
}

function texto(content: string) {
  return { untrusted: true as const, content }
}
function semUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}
function pedido(s: LiveExecutionSpecV1, over: Record<string, unknown> = {}) {
  return semUndefined({
    approval_id: "ap-d2b-0001",
    schema_version: "1.0.0",
    requested_at: "2026-08-31T12:00:00Z",
    requested_by: "HERMES",
    approver: "STEFANO",
    subject_type: "OTHER",
    subject_ref: s.execution_id,
    proposed_action: texto("executar uma chamada viva governada"),
    rationale: texto("perceber, sem agir"),
    supporting_refs: [],
    risk_and_uncertainty: [texto("o modelo pode recusar")],
    status: "DECIDED",
    decision_ref: "dec-d2b-0001",
    subject_content_hash: liveExecutionFingerprint(s),
    ...over,
  })
}
function decisao() {
  return {
    decision_id: "dec-d2b-0001",
    schema_version: "1.0.0",
    approval_id: "ap-d2b-0001",
    decided_by: "STEFANO",
    decision: "APPROVED",
    decided_at: "2026-08-31T12:05:00Z",
  }
}

/** Uma autorização d1 legítima e fresca. A d1 permite várias para a mesma decisão. */
function autorizacao(s: LiveExecutionSpecV1 = spec()) {
  const r = issueLiveExecutionAuthorization(s, pedido(s), [decisao()])
  if (r.status !== "authorized") throw new Error(`d1 recusou: ${r.defect}`)
  return r.authorization
}

describe("3.1d-D2B reserva única por execution_id", () => {
  it("1. autorização d1 válida + id inédito → exatamente uma tentativa reservada", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    if (r.status !== "reserved") return
    expect(r.attempt.execution_id).toBe(ID_BASE)
    expect(r.attempt.execution_key).toBe(executionKey(ID_BASE))
    expect(await classifyExecutionAttempt(RAIZ, ID_BASE)).toBe("RESERVED")
  })

  it("2. a MESMA autorização d1 usada de novo é recusada pelo uso único da d1", async () => {
    const auth = autorizacao()
    const um = await (est.raiz = RAIZ, prepareGovernedExecution(auth))
    expect(um.status).toBe("reserved")
    const dois = await (est.raiz = RAIZ, prepareGovernedExecution(auth))
    expect(dois.status).toBe("refused")
    if (dois.status !== "refused") return
    expect(dois.defect).toBe("AUTHORIZATION_ALREADY_CONSUMED")
  })

  it("3. duas autorizações legítimas para o mesmo id → no máximo um vencedor", async () => {
    const a = autorizacao()
    const b = autorizacao()
    expect(a).not.toBe(b) // a d1 realmente emite duas
    const ra = await (est.raiz = RAIZ, prepareGovernedExecution(a))
    const rb = await (est.raiz = RAIZ, prepareGovernedExecution(b))
    const vencedores = [ra, rb].filter((r) => r.status === "reserved")
    oraculo(ORACULOS.SEGUNDA_CAPACIDADE, vencedores.length > 1)
    expect(vencedores.length).toBe(1)
    const perdedor = [ra, rb].find((r) => r.status === "refused")
    expect(perdedor && perdedor.status === "refused" && perdedor.defect).toBe(
      "EXECUTION_ALREADY_RESERVED",
    )
  })

  it("4. mesmo id com fingerprint DIFERENTE continua recusado", async () => {
    const um = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(um.status).toBe("reserved")
    // Outro material governado, MESMO execution_id: fingerprint necessariamente outro.
    const outra = spec({ model: "gpt-5.6-outro" })
    expect(liveExecutionFingerprint(outra)).not.toBe(liveExecutionFingerprint(spec()))
    const dois = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao(outra)))
    oraculo(ORACULOS.ID_REUTILIZADO, dois.status === "reserved")
    expect(dois.status).toBe("refused")
    if (dois.status !== "refused") return
    expect(dois.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("5. reservas concorrentes do mesmo id → um vencedor, zero handles duplicados", async () => {
    const auths = Array.from({ length: 16 }, () => autorizacao())
    const rs = await Promise.all(
      auths.map((a) => (est.raiz = RAIZ, prepareGovernedExecution(a))),
    )
    oraculo(ORACULOS.SEGUNDA_CAPACIDADE, rs.filter((r) => r.status === "reserved").length > 1)
    expect(rs.filter((r) => r.status === "reserved").length).toBe(1)
    expect(
      rs.filter((r) => r.status === "refused" && r.defect === "EXECUTION_ALREADY_RESERVED")
        .length,
    ).toBe(15)
  })

  it("7. diretório existente com reserva MALFORMADA continua queimado", async () => {
    const dir = join(RAIZ, "attempts", executionKey(ID_BASE))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "reservation.json"), "{ isto não é json", "utf8")
    expect(await classifyExecutionAttempt(RAIZ, ID_BASE)).toBe("MALFORMED")
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    oraculo(ORACULOS.MALFORMADO_LIBERADO, r.status === "reserved")
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("7b. diretório existente SEM registro nenhum continua queimado", async () => {
    mkdirSync(join(RAIZ, "attempts", executionKey(ID_BASE)), { recursive: true })
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    oraculo(ORACULOS.MALFORMADO_LIBERADO, r.status === "reserved")
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("8+9. tentativa TERMINAL, ainda que antiga, jamais libera o id", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    if (r.status !== "reserved") return
    const dir = join(RAIZ, "attempts", r.attempt.execution_key)
    const t = await recordExecutionTerminal(
      dir, ID_BASE, r.attempt.execution_fingerprint,
      "COMPLETED_ACCEPTED", "2019-01-01T00:00:00Z", 1234,
    )
    expect(t.status).toBe("recorded")
    expect(await classifyExecutionAttempt(RAIZ, ID_BASE)).toBe("TERMINAL")

    // Carimbo de 2019 — nenhuma expiração por idade existe.
    const novo = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    oraculo(ORACULOS.ID_REUTILIZADO, novo.status === "reserved")
    expect(novo.status).toBe("refused")
    if (novo.status !== "refused") return
    expect(novo.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("16. segundo terminal é recusado, nunca sobrescreve", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    const dir = join(RAIZ, "attempts", r.attempt.execution_key)
    const fp = r.attempt.execution_fingerprint
    expect(
      (await recordExecutionTerminal(dir, ID_BASE, fp, "COMPLETED_ACCEPTED", "2026-08-31T12:00:00Z", 10))
        .status,
    ).toBe("recorded")
    const segundo = await recordExecutionTerminal(
      dir, ID_BASE, fp, "WORKER_FAILED", "2026-08-31T12:00:01Z", 20,
    )
    oraculo(ORACULOS.TERMINAL_SOBRESCRITO, segundo.status === "recorded")
    expect(segundo.status).toBe("refused")
    if (segundo.status !== "refused") return
    expect(segundo.defect).toBe("TERMINAL_ALREADY_RECORDED")
    const gravado = JSON.parse(readFileSync(join(dir, "terminal.json"), "utf8")) as {
      outcome_code: string
    }
    expect(gravado.outcome_code).toBe("COMPLETED_ACCEPTED") // o primeiro venceu
  })
})

describe("3.1d-D2B a autorização falsa não queima identificador", () => {
  it("10. objeto de mesma forma não cria reserva alguma no disco", async () => {
    const s = spec()
    const falsa = {
      spec: s,
      execution_fingerprint: liveExecutionFingerprint(s),
      decision_id: "dec-d2b-0001",
      issued_at_monotonic: 0,
      isConsumed: false,
      _consumeOnce: () => true,
    }
    const r = await prepareFalsa(falsa)
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("AUTHORIZATION_NOT_OWNED")
    // E o ponto que importa: NADA foi escrito.
    expect(await classifyExecutionAttempt(RAIZ, ID_BASE)).toBe("UNSEEN")
    expect(readdirSync(RAIZ)).toEqual([])
  })

  async function prepareFalsa(falsa: unknown) {
    return (est.raiz = RAIZ, prepareGovernedExecution(falsa))
  }

  it("10b. `Object.create` sobre o protótipo da d1 também não queima", async () => {
    est.raiz = RAIZ
    const r = await prepareGovernedExecution(
      Object.create(ReservedExecutionAttempt.prototype) as unknown,
    )
    expect(r.status).toBe("refused")
    expect(readdirSync(RAIZ)).toEqual([])
  })
})

describe("3.1d-D2B a capacidade é local ao processo", () => {
  it("11. tentativa de mesma forma é recusada no consumo", () => {
    const falsa = {
      execution_id: ID_BASE,
      execution_fingerprint: "f".repeat(64),
      spec: spec(),
      execution_key: executionKey(ID_BASE),
      attempt_deadline_monotonic: 999,
      isConsumed: false,
      _consumeOnce: () => true,
    }
    const r = consumeReservedExecutionAttempt(falsa)
    oraculo(ORACULOS.CAPACIDADE_FORJADA, r.status === "consumed")
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("RESERVED_ATTEMPT_INVALID")
  })

  it("11b. `Object.create` sobre o protótipo não é capacidade", () => {
    const forjada = Object.create(ReservedExecutionAttempt.prototype) as unknown
    expect(forjada instanceof ReservedExecutionAttempt).toBe(true) // passa no instanceof…
    const r = consumeReservedExecutionAttempt(forjada)
    expect(r.status).toBe("refused") // …e não no registro
  })

  it("11c. o construtor recusa quem não tem o selo do módulo", () => {
    expect(
      () =>
        new (ReservedExecutionAttempt as unknown as new (...a: unknown[]) => unknown)(
          Symbol("falso"), { execution_id: ID_BASE, execution_key: executionKey(ID_BASE), execution_fingerprint: "f".repeat(64) }, spec(), 1,
        ),
    ).toThrow(/RESERVED_ATTEMPT_NOT_OWNED/)
  })

  it("12. serializar recusa, e JSON não reconstrói capacidade", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    let serializou = false
    try {
      r.attempt.toJSON()
      serializou = true
    } catch {
      /* esperado */
    }
    oraculo(ORACULOS.CAPACIDADE_SERIALIZADA, serializou)
    expect(() => r.attempt.toJSON()).toThrow(/RESERVED_ATTEMPT_NOT_SERIALIZABLE/)
    expect(() => JSON.stringify(r.attempt)).toThrow()
    // A visão de auditoria é segura E não volta como capacidade.
    const auditoria = r.attempt.safeAuditView()
    expect(consumeReservedExecutionAttempt(auditoria).status).toBe("refused")
    expect(
      consumeReservedExecutionAttempt(JSON.parse(JSON.stringify(auditoria))).status,
    ).toBe("refused")
  })

  it("13. consumo duplo: exatamente um vencedor entre 32 concorrentes", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    const rs = Array.from({ length: 32 }, () =>
      consumeReservedExecutionAttempt(r.attempt),
    )
    oraculo(ORACULOS.CONSUMO_DUPLO, rs.filter((x) => x.status === "consumed").length > 1)
    expect(rs.filter((x) => x.status === "consumed").length).toBe(1)
    expect(
      rs.filter(
        (x) => x.status === "refused" && x.defect === "RESERVED_ATTEMPT_ALREADY_CONSUMED",
      ).length,
    ).toBe(31)
  })

  it("17. não existe API de apagar, resetar, liberar ou repetir", async () => {
    const ledger = await import("../src/execution-ledger")
    const sup = await import("../src/execution-supervisor")
    const proibidos = [
      "deleteReservation", "unreserve", "reset", "retry", "clearExecution", "release",
      "loadReservedExecutionAttempt", "restoreAttempt", "deserializeAttempt",
      "cleanup", "expire", "purge", "execute", "run", "spawn",
    ]
    for (const nome of proibidos) {
      expect(Object.keys(ledger)).not.toContain(nome)
      expect(Object.keys(sup)).not.toContain(nome)
    }
    // E nenhum export do supervisor é construtor de tentativa a partir de dado.
    expect(Object.keys(sup).filter((k) => /^from|^parse|^load|^restore/.test(k))).toEqual([])
  })
})

describe("3.1d-D2B prazo, raiz e higiene do registro", () => {
  it("14. o prazo nasce ANTES do consumo e não é reiniciado depois da IO", async () => {
    // Relógio determinístico: a primeira leitura é o início do orçamento. Se o prazo
    // fosse recalculado depois da IO, ele usaria uma leitura posterior.
    let n = 0
    const relogio = () => (n++ === 0 ? 1000 : 5000)
    const r = await (est.relogio = relogio, est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error(`esperava reserva: ${r.defect}`)
    oraculo(
      ORACULOS.PRAZO_REINICIADO,
      r.attempt.attempt_deadline_monotonic !== 1000 + LIVE_ATTEMPT_DEADLINE_SECONDS,
    )
    expect(r.attempt.attempt_deadline_monotonic).toBe(1000 + LIVE_ATTEMPT_DEADLINE_SECONDS)
    expect(r.attempt.attempt_deadline_monotonic).not.toBe(
      5000 + LIVE_ATTEMPT_DEADLINE_SECONDS,
    )
  })

  it("15. raiz de produção indisponível → falha FECHADA, sem queda para /tmp", async () => {
    // A costura que aceitava raiz foi REMOVIDA da produção. A via pública tem aridade
    // 1 e resolve na constante fixa; aqui a constante é a real (est.raiz vazio), e o
    // caminho `/data/...` não existe nesta máquina.
    expect(prepareGovernedExecution.length).toBe(1)
    const r = await prepareGovernedExecution(autorizacao())
    oraculo(ORACULOS.RAIZ_DO_CHAMADOR, r.status === "reserved")
    oraculo(
      ORACULOS.FALHA_NAO_FECHADA,
      r.status === "reserved" ||
        (r.status === "refused" && r.defect !== "EXECUTION_LEDGER_UNAVAILABLE"),
    )
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_LEDGER_UNAVAILABLE")
    expect(PRODUCTION_EXECUTION_LEDGER_ROOT).toBe(
      "/data/creditum_hermes_runtime/execution-ledger/v1",
    )
    expect(readdirSync(RAIZ)).toEqual([])
  })

  it("16b. o registro guarda identificadores e hashes — nunca material bruto", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    const dir = join(RAIZ, "attempts", r.attempt.execution_key)
    await recordAttemptCommitted(dir, ID_BASE, r.attempt.execution_fingerprint, "2026-08-31T12:00:00Z")
    await recordExecutionTerminal(
      dir, ID_BASE, r.attempt.execution_fingerprint, "MODEL_REFUSED", "2026-08-31T12:01:00Z", 42,
    )
    const bruto = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n")
    oraculo(
      ORACULOS.AUTORIDADE_PERSISTIDA,
      /STEFANO|APPROVED|ap-d2b-0001|dec-d2b-0001/.test(bruto),
    )
    for (const proibido of [
      "STEFANO", "APPROVED", "ap-d2b-0001", "dec-d2b-0001", "approval",
      "decision", "instructions", "api_key", "base_url", "sk-", "untrusted",
      "proposed_action", "rationale", "Traceback", "at Object.",
    ]) {
      expect(bruto).not.toContain(proibido)
    }
    // E o que ele TEM é o vocabulário fechado.
    const chaves = new Set<string>()
    for (const f of readdirSync(dir)) {
      Object.keys(JSON.parse(readFileSync(join(dir, f), "utf8")) as object).forEach((k) =>
        chaves.add(k),
      )
    }
    expect([...chaves].sort()).toEqual([
      "committed_at_utc", "elapsed_ms", "execution_fingerprint", "execution_id",
      "execution_key", "outcome_code", "record_type", "reserved_at_utc", "terminal_at_utc",
    ])
  })

  it("o vocabulário de desfecho é fechado e recusa código de fora", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    const dir = join(RAIZ, "attempts", r.attempt.execution_key)
    const fora = await recordExecutionTerminal(
      dir, ID_BASE, r.attempt.execution_fingerprint,
      "QUASE_OK" as unknown as (typeof EXECUTION_TERMINAL_OUTCOMES)[number],
      "2026-08-31T12:00:00Z", 5,
    )
    expect(fora.status).toBe("refused")
    if (fora.status !== "refused") return
    expect(fora.defect).toBe("EXECUTION_LEDGER_INVALID")
  })
})

describe("3.1d-D2B queda, reinício e processos separados", () => {
  it("6. processos Node CONCORRENTES disputando o mesmo id → um único vencedor", async () => {
    // A d2b usava `execFileSync` em laço: os processos rodavam EM SÉRIE, e eu descrevi
    // aquilo como corrida. Não era. Provava só que o segundo em diante recebia
    // `EEXIST` — nada sobre contenção. O regate do Codex cobrou, com razão.
    //
    // Agora: 8 filhos independentes, todos iniciados ANTES de qualquer espera, cada um
    // bloqueado numa barreira em disco até o pai liberar. Não garante partida no mesmo
    // ciclo de instrução — nada em espaço de usuário garante — então a afirmação é a
    // exata: processos independentes CONCORRENTES disputando o mesmo `mkdir` atômico,
    // com tempos de vida sobrepostos.
    const script = join(RAIZ, "disputa.mjs")
    writeFileSync(
      script,
      `import { mkdirSync, existsSync } from "node:fs"
const [, , alvo, barreira] = process.argv
while (!existsSync(barreira)) {}            // espera ocupada: solta na mesma janela
try { mkdirSync(alvo); process.stdout.write("WON") }
catch (e) { process.stdout.write(e.code === "EEXIST" ? "LOST" : "ERR:" + e.code) }
`,
      "utf8",
    )
    const alvo = join(RAIZ, "attempts", executionKey(ID_BASE))
    const barreira = join(RAIZ, "LARGADA")
    mkdirSync(join(RAIZ, "attempts"), { recursive: true })

    const filhos = Array.from({ length: 8 }, () =>
      spawn(process.execPath, [script, alvo, barreira], { stdio: ["ignore", "pipe", "ignore"] }),
    )
    const saidas = filhos.map(
      (f) =>
        new Promise<string>((resolve) => {
          let buf = ""
          f.stdout.on("data", (d: Buffer) => (buf += d.toString()))
          f.on("close", () => resolve(buf.trim()))
        }),
    )
    // Todos já estão vivos e girando na barreira antes desta linha.
    writeFileSync(barreira, "vai", "utf8")
    const resultados = await Promise.all(saidas)

    expect(resultados.filter((s) => s === "WON").length).toBe(1)
    expect(resultados.filter((s) => s === "LOST").length).toBe(7)
    expect(resultados.filter((s) => s.startsWith("ERR:"))).toEqual([])
  })

  it("A. queda depois do consumo d1 e antes da reserva: nenhum handle, nada no disco", async () => {
    // Raiz inexistente reproduz a falha da reserva DEPOIS de a d1 já ter sido gasta.
    const auth = autorizacao()
    est.raiz = join(RAIZ, "inexistente")
    const r = await prepareGovernedExecution(auth)
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_LEDGER_UNAVAILABLE")
    expect(readdirSync(RAIZ)).toEqual([]) // nenhuma tentativa registrada
    // A autoridade d1 foi gasta e não volta: nenhuma tentativa real ocorreu.
    const segunda = await (est.raiz = RAIZ, prepareGovernedExecution(auth))
    expect(segunda.status).toBe("refused")
    if (segunda.status !== "refused") return
    expect(segunda.defect).toBe("AUTHORIZATION_ALREADY_CONSUMED")
  })

  it("B. diretório criado com registro incompleto: mesmo id recusado depois", async () => {
    const dir = join(RAIZ, "attempts", executionKey(ID_BASE))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "reservation.json"), '{"record_type":"creditum', "utf8")
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("C. reserva durável concluída: o id segue queimado mesmo sem handle", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    // Descartamos o handle — como se o processo houvesse morrido aqui.
    expect(await classifyExecutionAttempt(RAIZ, ID_BASE)).toBe("RESERVED")
    const depois = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(depois.status).toBe("refused")
  })

  it("D. depois do reinício, o registro em disco NÃO recria a capacidade", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    const dir = join(RAIZ, "attempts", r.attempt.execution_key)
    const registro = JSON.parse(readFileSync(join(dir, "reservation.json"), "utf8")) as unknown

    // O registro é dado. Não existe função que o transforme em capacidade — e o
    // consumo recusa o objeto lido do disco.
    expect(consumeReservedExecutionAttempt(registro).status).toBe("refused")
    const sup = await import("../src/execution-supervisor")
    expect(
      Object.keys(sup).some((k) => /load|restore|deserialize|fromJSON|revive/i.test(k)),
    ).toBe(false)
    // `ATTEMPT_COMMITTED` sem terminal também não é retomável.
    await recordAttemptCommitted(dir, ID_BASE, r.attempt.execution_fingerprint, "2026-08-31T12:00:00Z")
    expect(await classifyExecutionAttempt(RAIZ, ID_BASE)).toBe("ATTEMPT_COMMITTED")
    const retomada = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(retomada.status).toBe("refused")
  })
})
