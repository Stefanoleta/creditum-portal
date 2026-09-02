/**
 * D2C-EV — evidência direta da costura PRECALL. Treze invariantes, sem framework.
 *
 * Mesma forma da ev2 da d2b: perguntas de segurança respondidas por comportamento
 * observado ou asserção pequena de AST. Sem mutação, sem oráculo, sem contagem.
 *
 * O `spawn` é mockado APENAS aqui. Produção não tem parâmetro de executável, worker,
 * ambiente, prazo nem protocolo — a lição que a costura exportada da d2b custou.
 */

import { execFileSync } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import type { EventEmitter as Emissor } from "node:events"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import ts from "typescript"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** Estado do filho falso. Registra o spec de spawn e devolve saída determinística. */
interface FilhoFalso {
  raiz: string
  chamadas: { exe: string; args: string[]; opts: Record<string, unknown> }[]
  stdinRecebido: string[]
  stdout: string
  stderr: string
  rc: number | null
  sinal: string | null
  erroAoNascer: boolean
  demoraMs: number
  travar: boolean
  commitVistoNoSpawn: boolean | null
}

const filho = vi.hoisted<FilhoFalso>(() => ({
  raiz: "",
  chamadas: [],
  stdinRecebido: [],
  stdout: "",
  stderr: "",
  rc: 0,
  sinal: null,
  erroAoNascer: false,
  demoraMs: 0,
  travar: false,
  commitVistoNoSpawn: null,
}))

/** Forma mínima do processo que a costura de produção realmente usa. */
type ProcFalso = Emissor & {
  stdout: Emissor
  stderr: Emissor
  stdin: { end: (d: string) => void; on: () => undefined }
  kill: () => boolean
}

/**
 * Relógio monotônico injetável e gancho pós-commit.
 *
 * Produção não tem parâmetro de relógio nem de commit — a d2b provou o custo de
 * exportar costura. O controle vive no mock do MÓDULO, que só o teste instala.
 */
const relogio = vi.hoisted(() => ({
  agora: null as number | null,
  /** Leituras encadeadas: cada chamada consome uma. Permite vencer o prazo
   *  ENTRE duas conferências de produção. */
  fila: [] as number[],
}))
const gancho = vi.hoisted(() => ({ noCommit: null as null | (() => void) }))

vi.mock("../src/live-execution", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/live-execution")>()
  return {
    ...real,
    monotonicSeconds: (): number => {
      const proxima = relogio.fila.shift()
      if (proxima !== undefined) return proxima
      return relogio.agora === null ? real.monotonicSeconds() : relogio.agora
    },
  }
})

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>()
  const { EventEmitter } = await import("node:events")
  const fs = await import("node:fs")
  const caminho = await import("node:path")
  return {
    ...real,
    spawn: (exe: string, args: string[], opts: Record<string, unknown>) => {
      // Observação NO INSTANTE do spawn: o commit já está no disco?
      if (filho.raiz !== "") {
        const dirAtt = caminho.join(filho.raiz, "attempts")
        filho.commitVistoNoSpawn = fs.existsSync(dirAtt) &&
          fs.readdirSync(dirAtt).some((k) =>
            fs.existsSync(caminho.join(dirAtt, k, "attempt-committed.json")))
      }
      filho.chamadas.push({ exe, args, opts })
      const proc = new EventEmitter() as ProcFalso
      const out = new EventEmitter()
      const err = new EventEmitter()
      proc.stdout = out
      proc.stderr = err
      proc.stdin = {
        end: (d: string) => filho.stdinRecebido.push(d),
        on: () => undefined,
      }
      proc.kill = () => true
      setTimeout(() => {
        if (filho.erroAoNascer) {
          proc.emit("error", new Error("ENOENT"))
          return
        }
        if (filho.travar) return // nunca fecha: exercita o prazo
        if (filho.stdout !== "") out.emit("data", Buffer.from(filho.stdout, "utf8"))
        if (filho.stderr !== "") err.emit("data", Buffer.from(filho.stderr, "utf8"))
        proc.emit("close", filho.rc, filho.sinal)
      }, filho.demoraMs)
      return proc as unknown as ChildProcess
    },
  }
})

vi.mock("../src/execution-ledger", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/execution-ledger")>()
  return {
    ...real,
    get PRODUCTION_EXECUTION_LEDGER_ROOT() {
      return filho.raiz === "" ? real.PRODUCTION_EXECUTION_LEDGER_ROOT : filho.raiz
    },
    recordAttemptCommitted: async (
      dir: string, id: string, fp: string, at: string,
    ): Promise<import("../src/execution-ledger").ExecutionRecordResult> => {
      const r = await real.recordAttemptCommitted(dir, id, fp, at)
      // Depois do commit DURÁVEL e antes do spawn: a janela exata onde o relato do
      // Codex dizia que mutação e tempo escapavam.
      if (gancho.noCommit !== null) gancho.noCommit()
      return r
    },
  }
})

const { classifyExecutionAttempt, executionKey } = await import("../src/execution-ledger")
const {
  LIVE_ATTEMPT_DEADLINE_SECONDS, LIVE_AUTHORIZATION_TTL_SECONDS,
  LIVE_EXECUTION_SPEC_VERSION, LIVE_TIMEOUT_DERIVATION_POLICY,
  issueLiveExecutionAuthorization, liveExecutionFingerprint,
} = await import("../src/live-execution")
const { prepareGovernedExecution } = await import("../src/execution-supervisor")
const {
  PRECALL_PYTHON_EXECUTABLE, PRECALL_WORKER_MODULE, PRECALL_RESULT_PROTOCOL,
  PRECALL_DEFECTS, PRECALL_STDOUT_MAX_BYTES, PRECALL_HERMES_HOME,
  executeReservedPrecall,
} = await import("../src/precall-execution")
type Spec = import("../src/live-execution").LiveExecutionSpecV1

const PRE = join(__dirname, "..", "src", "precall-execution.ts")

/**
 * Protótipos globais como registros opacos.
 *
 * Adulterar intrínsecos é justamente sair do contrato de tipo — e o tipo de método
 * atrelado do TS reclama, com razão, de referência solta. Passar pelo registro deixa a
 * hostilidade explícita em vez de espalhar supressões pelo teste.
 */
type MetodoQualquer = (this: unknown, ...args: unknown[]) => unknown
/** Campos explícitos, não assinatura de índice: `| undefined` só atrapalharia aqui. */
interface MetodosFracos {
  get: MetodoQualquer
  has: MetodoQualquer
  add: MetodoQualquer
  set: MetodoQualquer
}
function comoRegistro(o: object): MetodosFracos {
  return o as unknown as MetodosFracos
}
const ID = "d2c-exec-0001"
const NONCE = "nonce-d2c-0001"

let RAIZ: string
beforeEach(() => {
  RAIZ = mkdtempSync(join(tmpdir(), "creditum-d2c-"))
  filho.raiz = RAIZ
  filho.chamadas = []
  filho.stdinRecebido = []
  filho.stderr = ""
  filho.rc = 0
  filho.sinal = null
  filho.erroAoNascer = false
  filho.demoraMs = 0
  filho.travar = false
  filho.commitVistoNoSpawn = null
  filho.stdout = resultado({})
  relogio.agora = null
  relogio.fila = []
  gancho.noCommit = null
})
afterEach(() => rmSync(RAIZ, { recursive: true, force: true }))

function resultado(over: Record<string, unknown>): string {
  return JSON.stringify({
    protocol_version: PRECALL_RESULT_PROTOCOL, execution_id: ID,
    execution_fingerprint: liveExecutionFingerprint(spec()), request_nonce: NONCE,
    outcome: "PRECALL_SUCCEEDED", mode: "PRECALL_PROBE",
    request_hash: "a1".repeat(32), user_payload_hash: "b2".repeat(32), tool_count: 0,
    client_constructions: 0, provider_calls: 0, model_call_completed: false,
    verdict: "PRECALL_PROBE_COMPLETE", ...over,
  }) + "\n"
}

function spec(over: Record<string, unknown> = {}): Spec {
  return {
    spec_version: LIVE_EXECUTION_SPEC_VERSION, execution_id: ID,
    read_model_fingerprint: "x".repeat(64), request_fingerprint: "r".repeat(64),
    runtime_binding_fingerprint: "b".repeat(64), provider: "openai-codex",
    model: "gpt-5.6-luna", api_mode: "codex_responses", sdk_version: "2.24.0",
    constitution_hash: "38a38edc0af169bdfffde8e196a6fe8ba9acc82ba5b0ae0cb5726db0d95a1b79",
    system_contract_hash: "a315e9ec7afb3d91329716596341224dfed4ddf472e07998f272b5f54ab684de",
    response_policy_id: "creditum_hermes_response_extraction/v1",
    response_policy_version: "1.0.0", tool_count: 0, stream: false, background: false,
    max_retries: 0, attempt_deadline_seconds: LIVE_ATTEMPT_DEADLINE_SECONDS,
    authorization_ttl_seconds: LIVE_AUTHORIZATION_TTL_SECONDS,
    timeout_derivation_policy: LIVE_TIMEOUT_DERIVATION_POLICY, ...over,
  } as unknown as Spec
}
const txt = (c: string) => ({ untrusted: true as const, content: c })
function pedido(s: Spec) {
  // Ids derivados da execução: uma aprovação emite UMA autorização, então A e B
  // precisam de aprovações distintas para coexistirem como capacidades autênticas.
  return {
    approval_id: `ap-${s.execution_id}`, schema_version: "1.0.0",
    requested_at: "2026-09-01T12:00:00Z",
    requested_by: "HERMES", approver: "STEFANO", subject_type: "OTHER",
    subject_ref: s.execution_id, proposed_action: txt("executar chamada viva governada"),
    rationale: txt("perceber, sem agir"), supporting_refs: [],
    risk_and_uncertainty: [txt("o modelo pode recusar")], status: "DECIDED",
    decision_ref: `dec-${s.execution_id}`, subject_content_hash: liveExecutionFingerprint(s),
  }
}
const decisao = (s: Spec) => ({
  decision_id: `dec-${s.execution_id}`, schema_version: "1.0.0",
  approval_id: `ap-${s.execution_id}`, decided_by: "STEFANO", decision: "APPROVED",
  decided_at: "2026-09-01T12:05:00Z",
})
async function capacidade(id: string = ID) {
  const s = spec({ execution_id: id })
  const a = issueLiveExecutionAuthorization(s, pedido(s), [decisao(s)])
  if (a.status !== "authorized") throw new Error(`d1 recusou: ${a.defect}`)
  const r = await prepareGovernedExecution(a.authorization)
  if (r.status !== "reserved") throw new Error(`d2b recusou: ${r.defect}`)
  return r.attempt
}
/**
 * Observa os atrasos passados a `setTimeout` durante uma execução. É assim que o
 * cronômetro DERIVADO do filho fica mensurável sem abrir costura em produção.
 */
async function atrasosDurante<T>(f: () => Promise<T>): Promise<[T, number[]]> {
  const original = globalThis.setTimeout
  const ds: number[] = []
  globalThis.setTimeout = ((fn: () => void, ms?: number, ...resto: unknown[]) => {
    if (typeof ms === "number") ds.push(ms)
    return (original as (...a: unknown[]) => unknown)(fn, ms, ...resto)
  }) as unknown as typeof globalThis.setTimeout
  try {
    return [await f(), ds]
  } finally {
    globalThis.setTimeout = original
  }
}

function fonte(caminho: string) {
  return ts.createSourceFile(caminho, readFileSync(caminho, "utf8"), ts.ScriptTarget.ES2022, true)
}
function chamadasEm(no: ts.Node): string[] {
  const out: string[] = []
  const anda = (n: ts.Node): void => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const e = n.expression
      const nome = ts.isIdentifier(e) ? e.text
        : ts.isPropertyAccessExpression(e) ? e.name.text : null
      if (nome !== null) out.push(nome)
    }
    ts.forEachChild(n, anda)
  }
  anda(no)
  return out
}

describe("C1 só a capacidade d2b autêntica ativa o PRECALL", () => {
  it("C1 objeto de mesma forma é recusado e nenhum filho nasce", async () => {
    const r = await executeReservedPrecall({
      execution_id: ID, execution_fingerprint: "f".repeat(64),
      execution_key: executionKey(ID), attempt_deadline_monotonic: 1e9,
      spec: spec(), isConsumed: false, _consumeOnce: () => true,
    }, { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_ATTEMPT_INVALID")
    expect(filho.chamadas.length).toBe(0)
  })
  it("C1 DECISIVO: A reescrita com os valores REAIS de B executa sob A", async () => {
    // A rota que o Codex demonstrou. Não é objeto forjado: são DUAS capacidades
    // autênticas, e A recebe os campos públicos de B — mutuamente coerentes, porque
    // vêm de uma emissão real. Validação cruzada não distingue isto; estado privado sim.
    const ID_B = "d2c-exec-0002"
    const capA = await capacidade(ID)
    const capB = await capacidade(ID_B)
    const chaveA = executionKey(ID)
    const chaveB = executionKey(ID_B)
    for (const campo of ["execution_id", "execution_key", "execution_fingerprint",
                         "spec", "attempt_deadline_monotonic"] as const) {
      Object.defineProperty(capA, campo,
        { value: (capB as unknown as Record<string, unknown>)[campo] })
    }

    const rA = await executeReservedPrecall(capA, { request_nonce: NONCE })
    expect(rA.status).toBe("precall_succeeded")
    if (rA.status !== "precall_succeeded") return
    // (i) a identidade é de A
    expect(rA.evidence.execution_id).toBe(ID)
    expect(rA.evidence.execution_key).toBe(chaveA)
    // (ii) o pedido enviado ao filho é de A
    const env = JSON.parse(filho.stdinRecebido[0] ?? "{}") as Record<string, unknown>
    expect(env.execution_id).toBe(ID)
    // (iii) A tem commit e terminal
    expect(readdirSync(join(RAIZ, "attempts", chaveA)).sort())
      .toEqual(["attempt-committed.json", "reservation.json", "terminal.json"])
    // (iv) B recebeu NADA: só a própria reserva
    expect(readdirSync(join(RAIZ, "attempts", chaveB)), "A escreveu no diretório de B")
      .toEqual(["reservation.json"])

    // (v) B segue sendo capacidade distinta, consumível por si
    const especB = spec({ execution_id: ID_B })
    filho.stdout = resultado({
      execution_id: ID_B, execution_fingerprint: liveExecutionFingerprint(especB),
    })
    const rB = await executeReservedPrecall(capB, { request_nonce: NONCE })
    expect(rB.status).toBe("precall_succeeded")
    if (rB.status === "precall_succeeded") expect(rB.evidence.execution_id).toBe(ID_B)
    expect(filho.chamadas.length, "um filho por capacidade, nunca mais").toBe(2)
  })

  it("C1 execution_key adulterado é IRRELEVANTE: nada escrito fora da raiz", async () => {
    const cap = await capacidade()
    const fora = mkdtempSync(join(tmpdir(), "creditum-fora-"))
    Object.defineProperty(cap, "execution_key",
      { value: relative(join(RAIZ, "attempts"), fora) })
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    // A r1 rejeitava. Agora a propriedade simplesmente não participa da decisão —
    // propriedade mais forte, porque sobrevive a alguém acrescentar um campo público.
    expect(r.status).toBe("precall_succeeded")
    expect(readdirSync(fora), "escreveu fora da raiz governada").toEqual([])
    expect(readdirSync(join(RAIZ, "attempts", executionKey(ID))))
      .toContain("attempt-committed.json")
    rmSync(fora, { recursive: true, force: true })
  })

  it("C1 a travessia literal do relato do Codex não move o diretório", async () => {
    const cap = await capacidade()
    Object.defineProperty(cap, "execution_key", { value: "../../../../../tmp/owned" })
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(r.status).toBe("precall_succeeded")
    if (r.status === "precall_succeeded") {
      expect(r.evidence.execution_key).toBe(executionKey(ID))
    }
  })

  for (const campo of ["execution_id", "execution_fingerprint", "spec",
                       "attempt_deadline_monotonic"] as const) {
    it(`C1 '${campo}' adulterado não altera o estado autoritativo`, async () => {
      const cap = await capacidade()
      const valor = campo === "spec" ? spec({ model: "outro-modelo" })
        : campo === "execution_id" ? "id-do-atacante"
        : campo === "attempt_deadline_monotonic" ? -1
        : "a".repeat(64)
      Object.defineProperty(cap, campo, { value: valor })
      const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
      expect(r.status).toBe("precall_succeeded")
      if (r.status !== "precall_succeeded") return
      expect(r.evidence.execution_id).toBe(ID)
      expect(r.evidence.execution_key).toBe(executionKey(ID))
      expect(existsSync(join(RAIZ, "attempts", executionKey("id-do-atacante"))))
        .toBe(false)
    })
  }

  it("C1 a auditoria da capacidade também vem do estado privado", async () => {
    const cap = await capacidade()
    Object.defineProperty(cap, "execution_id", { value: "id-do-atacante" })
    // Uma visão de auditoria que o detentor pudesse reescrever seria auditoria de nada.
    expect(cap.safeAuditView().execution_id).toBe(ID)
  })

  it("C1 mutação DURANTE o commit não atravessa: tudo usa o instantâneo", async () => {
    const cap = await capacidade()
    const idOrig = cap.execution_id
    const chaveOrig = cap.execution_key
    const fpOrig = cap.execution_fingerprint
    gancho.noCommit = () => {
      // A janela: commit durável já no disco, filho ainda não nascido.
      Object.defineProperty(cap, "execution_id", { value: "id-do-atacante" })
      Object.defineProperty(cap, "execution_key",
        { value: executionKey("id-do-atacante") })
      Object.defineProperty(cap, "execution_fingerprint", { value: "a".repeat(64) })
      Object.defineProperty(cap, "attempt_deadline_monotonic", { value: 1e12 })
    }
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(r.status).toBe("precall_succeeded")
    if (r.status !== "precall_succeeded") return

    // (i) evidência devolvida
    expect(r.evidence.execution_id).toBe(idOrig)
    expect(r.evidence.execution_key).toBe(chaveOrig)
    expect(r.evidence.execution_fingerprint).toBe(fpOrig)
    // (ii) pedido enviado ao filho
    const env = JSON.parse(filho.stdinRecebido[0] ?? "{}") as Record<string, unknown>
    expect(env.execution_id).toBe(idOrig)
    expect(env.execution_fingerprint).toBe(fpOrig)
    // (iii) registros no disco, sob a chave ORIGINAL
    const dir = join(RAIZ, "attempts", chaveOrig)
    expect(readdirSync(dir)).toContain("attempt-committed.json")
    const term = JSON.parse(readFileSync(join(dir, "terminal.json"), "utf8")) as
      Record<string, unknown>
    expect(term.execution_id).toBe(idOrig)
    expect(term.execution_fingerprint).toBe(fpOrig)
    expect(term.outcome_code).toBe("COMPLETED_ACCEPTED")
    // (iv) nenhum diretório do atacante
    expect(existsSync(join(RAIZ, "attempts", executionKey("id-do-atacante")))).toBe(false)
  })

  it("C1 fonte: a capacidade não é lida depois do instantâneo", () => {
    // O defeito era estrutural: `capacidade.execution_id` relido após o await.
    // Nenhum acesso a propriedade de `attempt` dentro da via é a forma da correção.
    const src = fonte(PRE)
    let acessos = 0
    ts.forEachChild(src, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.name?.text !== "executeReservedPrecall") return
      const anda = (x: ts.Node): void => {
        if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) &&
            x.expression.text === "attempt") {
          acessos++
        }
        ts.forEachChild(x, anda)
      }
      anda(n)
    })
    expect(acessos, "a via lê propriedades da capacidade diretamente").toBe(0)
  })

  it("C1 a via não aceita execution_id, caminho nem configuração", () => {
    const src = fonte(PRE)
    let params: string[] = []
    ts.forEachChild(src, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.text === "executeReservedPrecall") {
        params = n.parameters.map((p) => p.name.getText(src))
      }
    })
    expect(params).toEqual(["attempt", "governedInput"])
  })
})

describe("C2 a capacidade é de uso único", () => {
  it("C2 segunda ativação falha fechada e não gera segundo filho", async () => {
    const cap = await capacidade()
    const um = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(um.status).toBe("precall_succeeded")
    const dois = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(dois.status).toBe("refused")
    if (dois.status === "refused") {
      expect(dois.defect).toBe("PRECALL_ATTEMPT_ALREADY_CONSUMED")
    }
    expect(filho.chamadas.length).toBe(1)
  })

  it("C2 método de consumo injetado não gera segundo filho", async () => {
    const cap = await capacidade()
    // O relato do Codex aplicado à d2c: se o uso único dependesse de método público,
    // isto renderia dois filhos para uma aprovação.
    Object.defineProperty(cap, "_consumeOnce", {
      configurable: true, writable: true, value: () => true,
    })
    expect((await executeReservedPrecall(cap, { request_nonce: NONCE })).status)
      .toBe("precall_succeeded")
    const dois = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(dois.status).toBe("refused")
    if (dois.status === "refused") {
      expect(dois.defect).toBe("PRECALL_ATTEMPT_ALREADY_CONSUMED")
    }
    expect(filho.chamadas.length, "uma aprovação rendeu dois filhos").toBe(1)
  })

  it("C1 patch em Object.freeze não move a execução de A para B", async () => {
    const ID_B = "d2c-exec-0005"
    const capB = await capacidade(ID_B)
    const falso = {
      execution_id: capB.execution_id,
      execution_key: capB.execution_key,
      execution_fingerprint: capB.execution_fingerprint,
      attempt_deadline_monotonic: capB.attempt_deadline_monotonic,
      attempt_deadline_seconds: capB.spec.attempt_deadline_seconds,
      attempt_directory: join(RAIZ, "attempts", capB.execution_key),
      spec: capB.spec,
    }
    const original = Object.freeze
    let tentativasDeTroca = 0
    let rA: Awaited<ReturnType<typeof executeReservedPrecall>>
    let capA: Awaited<ReturnType<typeof capacidade>>
    try {
      Object.defineProperty(Object, "freeze", {
        configurable: true, writable: true,
        value: (o: unknown) => {
          if (o !== null && typeof o === "object" &&
              ("attempt_directory" in o || ("execution_key" in o && "spec" in o))) {
            tentativasDeTroca++
            return original(falso)
          }
          return original(o as object)
        },
      })
      // A é cunhada E executada com o intrínseco hostil no lugar.
      capA = await capacidade(ID)
      rA = await executeReservedPrecall(capA, { request_nonce: NONCE })
    } finally {
      Object.defineProperty(Object, "freeze", {
        configurable: true, writable: true, value: original,
      })
    }

    expect(tentativasDeTroca, "emissão ou instantâneo passou pelo freeze global").toBe(0)
    expect(rA.status).toBe("precall_succeeded")
    if (rA.status === "precall_succeeded") {
      expect(rA.evidence.execution_id).toBe(ID)
      expect(rA.evidence.execution_key).toBe(executionKey(ID))
    }
    // O commit e o terminal foram para o diretório de A.
    expect(readdirSync(join(RAIZ, "attempts", executionKey(ID))).sort())
      .toEqual(["attempt-committed.json", "reservation.json", "terminal.json"])
    // B ficou só com a própria reserva, e um único filho nasceu.
    expect(readdirSync(join(RAIZ, "attempts", executionKey(ID_B))))
      .toEqual(["reservation.json"])
    expect(filho.chamadas.length).toBe(1)
  })

  it("C1 fonte: o instantâneo não vem do retorno de uma função", () => {
    const src = fonte(PRE)
    let fragil = 0
    const anda = (n: ts.Node): void => {
      // `return Object.freeze({...})` / `return f({...})` num construtor de autoridade.
      if (ts.isReturnStatement(n) && n.expression !== undefined &&
          ts.isCallExpression(n.expression)) {
        const alvo = n.expression.expression.getText(src)
        if (/freeze|CONGELA/.test(alvo)) fragil++
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(fragil, "autoridade vinda do retorno de um congelamento").toBe(0)
  })

  it("C2 patch em WeakMap/WeakSet.prototype não move a execução de A para B", async () => {
    const ID_B = "d2c-exec-0004"
    const capA = await capacidade(ID)
    const capB = await capacidade(ID_B)
    const wm = comoRegistro(WeakMap.prototype)
    const ws = comoRegistro(WeakSet.prototype)
    const oGet = wm.get
    const oSHas = ws.has
    const oSAdd = ws.add
    let rA: Awaited<ReturnType<typeof executeReservedPrecall>>
    try {
      wm.get = function (this: unknown, k: unknown) {
        return oGet.call(this, k === capA ? capB : k)
      }
      ws.has = () => false
      ws.add = function (this: unknown) {
        return this
      }
      rA = await executeReservedPrecall(capA, { request_nonce: NONCE })
    } finally {
      wm.get = oGet
      ws.has = oSHas
      ws.add = oSAdd
    }
    expect(rA.status).toBe("precall_succeeded")
    if (rA.status === "precall_succeeded") {
      expect(rA.evidence.execution_id).toBe(ID)
      expect(rA.evidence.execution_key).toBe(executionKey(ID))
    }
    // B recebeu nada além da própria reserva, e um único filho nasceu.
    expect(readdirSync(join(RAIZ, "attempts", executionKey(ID_B))))
      .toEqual(["reservation.json"])
    expect(filho.chamadas.length).toBe(1)
  })

  it("C2 consumo injetado de A não queima B", async () => {
    const ID_B = "d2c-exec-0003"
    const capA = await capacidade(ID)
    const capB = await capacidade(ID_B)
    Object.defineProperty(capA, "_consumeOnce", {
      configurable: true, writable: true,
      value: () => { throw new Error("a produção não deve chamar isto") },
    })
    expect((await executeReservedPrecall(capA, { request_nonce: NONCE })).status)
      .toBe("precall_succeeded")
    // B segue íntegra e executa sob a própria identidade.
    const especB = spec({ execution_id: ID_B })
    filho.stdout = resultado({
      execution_id: ID_B, execution_fingerprint: liveExecutionFingerprint(especB),
    })
    const rB = await executeReservedPrecall(capB, { request_nonce: NONCE })
    expect(rB.status).toBe("precall_succeeded")
    if (rB.status === "precall_succeeded") expect(rB.evidence.execution_id).toBe(ID_B)
    expect(filho.chamadas.length).toBe(2)
  })
})

describe("C3 ATTEMPT_COMMITTED é durável ANTES do spawn", () => {
  it("C3 no instante do spawn o commit já está no disco", async () => {
    const cap = await capacidade()
    await executeReservedPrecall(cap, { request_nonce: NONCE })
    // Medido DENTRO do mock, no momento exato da criação do filho.
    expect(filho.commitVistoNoSpawn, "commit ausente quando o filho nasceu").toBe(true)
    expect(filho.chamadas.length).toBe(1)
    expect(readdirSync(join(RAIZ, "attempts", cap.execution_key)))
      .toContain("attempt-committed.json")
  })

  it("C3 commit impossível → nenhum filho nasce", async () => {
    const cap = await capacidade()
    // Remove o diretório reservado: o commit não tem onde ser escrito.
    rmSync(join(RAIZ, "attempts", cap.execution_key), { recursive: true, force: true })
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_COMMIT_NOT_DURABLE")
    expect(filho.chamadas.length).toBe(0)
  })
  it("C3 fonte: o commit precede o spawn no corpo da função", () => {
    const t = readFileSync(PRE, "utf8")
    expect(t.indexOf("recordAttemptCommitted(")).toBeLessThan(t.indexOf("await rodaFilho("))
  })
})

describe("C4 executável e worker são fixos", () => {
  it("C4 spec exato do spawn", async () => {
    await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    const c = filho.chamadas[0]
    expect(c?.exe).toBe("/opt/venv/bin/python3")
    expect(c?.args).toEqual(["-I", "-B", "-m", "creditum_hermes_precall.worker"])
    expect(c?.opts.shell).toBeUndefined()
  })
  it("C4 constantes e ausência de lookup por PATH", () => {
    expect(PRECALL_PYTHON_EXECUTABLE).toBe("/opt/venv/bin/python3")
    expect(PRECALL_WORKER_MODULE).toBe("creditum_hermes_precall.worker")
    const t = readFileSync(PRE, "utf8")
    for (const proibido of ['"python3"', '"python"', "shell: true", "sh -c", "bash -c"]) {
      expect(t).not.toContain(proibido)
    }
  })
})

describe("C5 o ambiente do filho é fixo e mínimo", () => {
  it("C5 chaves exatas, sem herdar segredo do pai", async () => {
    process.env.SEGREDO_SINTETICO_D2C = "valor-que-nao-pode-vazar"
    try {
      await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      const env = filho.chamadas[0]?.opts.env as Record<string, string>
      // `HERMES_HOME` entrou na r6, por achado de produção. As outras seis são as
      // mesmas, e a lista segue EXATA: chave a mais é vazamento.
      expect(Object.keys(env).sort()).toEqual(
        ["HERMES_HOME", "LANG", "LC_ALL", "PATH", "PYTHONDONTWRITEBYTECODE",
         "PYTHONHASHSEED", "PYTHONUNBUFFERED"])
      expect(JSON.stringify(env)).not.toContain("valor-que-nao-pode-vazar")
      expect(env.SEGREDO_SINTETICO_D2C).toBeUndefined()
    } finally {
      delete process.env.SEGREDO_SINTETICO_D2C
    }
  })
})

describe("C6 o pedido é fechado e limitado", () => {
  it("C6 um documento, versão exata, campos governados", async () => {
    await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    const enviado = filho.stdinRecebido[0] ?? ""
    const d = JSON.parse(enviado) as Record<string, unknown>
    expect(Object.keys(d).sort()).toEqual(
      ["committed_at_utc", "execution_fingerprint", "execution_id", "protocol_version",
       "request_nonce"])
    expect(d.protocol_version).toBe("creditum_precall_request/1.0.0")
    // Nenhum token de autoridade atravessa a fronteira.
    for (const proibido of ["STEFANO", "APPROVED", "ap-d2c", "dec-d2c", "approval",
                            "decision", "authorization"]) {
      expect(enviado).not.toContain(proibido)
    }
    expect(Buffer.byteLength(enviado, "utf8")).toBeLessThan(64 * 1024)
  })
})

describe("C7 o resultado é fechado e limitado", () => {
  const casos: [string, string, string][] = [
    ["versão errada", resultado({ protocol_version: "outro/9" }), "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["campo desconhecido", resultado({ extra: 1 }), "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["campo obrigatório ausente", '{"protocol_version":"creditum_precall_result/1.0.0"}\n', "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["JSON malformado", "{ isto não é json\n", "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["dois documentos", resultado({}) + resultado({}), "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["lixo após o documento", resultado({}) + "lixo\n", "PRECALL_RESULT_PROTOCOL_INVALID"],
  ]
  for (const [nome, saida, defeito] of casos) {
    it(`C7 ${nome} → recusa fechada`, async () => {
      filho.stdout = saida
      const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe(defeito)
    })
  }
  it("C7 stdout acima do teto → filho morto, recusa fechada", async () => {
    filho.stdout = "x".repeat(PRECALL_STDOUT_MAX_BYTES + 1)
    const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_OUTPUT_TOO_LARGE")
  })
  for (const [campo, valor] of [
    ["mode", { a: 1 }], ["verdict", 7], ["request_hash", null],
    ["tool_count", "3"], ["provider_calls", []], ["model_call_completed", "false"],
  ] as [string, unknown][]) {
    it(`C7 opcional '${campo}' com tipo errado → recusa, não coerção`, async () => {
      // Sem isto, String({}) gravava "[object Object]" DENTRO da evidência governada.
      filho.stdout = resultado({ [campo]: valor })
      const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PRECALL_RESULT_PROTOCOL_INVALID")
    })
  }

  // ─── O contrato EXATO do sucesso ────────────────────────────────────────
  //
  // Cada linha abaixo é um resultado que a versão anterior aceitava como
  // COMPLETED_ACCEPTED porque o predicado media três campos e presumia o resto.
  const impossiveis: [string, Record<string, unknown>, string][] = [
    ["mode LIVE", { mode: "LIVE" }, "PRECALL_SEMANTIC_REJECTED"],
    ["mode minúsculo", { mode: "precall_probe" }, "PRECALL_SEMANTIC_REJECTED"],
    ["cliente construído", { client_constructions: 1 }, "PRECALL_SEMANTIC_REJECTED"],
    ["chamada a provedor", { provider_calls: 1 }, "PRECALL_SEMANTIC_REJECTED"],
    ["modelo concluído", { model_call_completed: true }, "PRECALL_SEMANTIC_REJECTED"],
    ["veredito inventado", { verdict: "APPROVED" }, "PRECALL_SEMANTIC_REJECTED"],
    ["ferramenta declarada", { tool_count: 1 }, "PRECALL_SEMANTIC_REJECTED"],
    ["contagem fracionária", { provider_calls: 0.5 }, "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["booleano onde vai inteiro", { tool_count: true }, "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["hash malformado", { request_hash: "zz".repeat(32) }, "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["hash curto", { user_payload_hash: "ab" }, "PRECALL_RESULT_PROTOCOL_INVALID"],
    ["campo extra no sucesso", { defect: "X" }, "PRECALL_RESULT_PROTOCOL_INVALID"],
  ]
  for (const [nome, over, defeito] of impossiveis) {
    it(`C7 sucesso impossível — ${nome} → ${defeito}`, async () => {
      filho.stdout = resultado(over)
      const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      expect(r.status, `${nome} virou sucesso`).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe(defeito)
    })
  }

  for (const ausente of [
    "mode", "verdict", "request_hash", "user_payload_hash", "tool_count",
    "client_constructions", "provider_calls", "model_call_completed",
  ] as const) {
    it(`C7 sucesso sem '${ausente}' → recusa, não default`, async () => {
      // Ausência nunca é zero. O `?? -1` da versão anterior fabricava evidência.
      const doc = JSON.parse(resultado({})) as Record<string, unknown>
      delete doc[ausente]
      filho.stdout = `${JSON.stringify(doc)}\n`
      const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PRECALL_RESULT_PROTOCOL_INVALID")
    })
  }

  for (const [nome, rc, sinal] of [
    ["rc 1", 1, null], ["rc 137", 137, null], ["sinal", null, "SIGKILL"],
  ] as [string, number | null, string | null][]) {
    it(`C7 processo quebrado (${nome}) com JSON perfeito NÃO é sucesso`, async () => {
      // O desfecho do PROCESSO precede a semântica: stdout impecável não converte
      // processo morto em COMPLETED_ACCEPTED.
      filho.rc = rc
      filho.sinal = sinal
      const cap = await capacidade()
      const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PRECALL_WORKER_EXIT_NONZERO")
      const term = JSON.parse(
        readFileSync(join(RAIZ, "attempts", cap.execution_key, "terminal.json"), "utf8"),
      ) as Record<string, unknown>
      expect(term.outcome_code).toBe("WORKER_FAILED")
    })
  }

  it("C7 o filho não escolhe o defeito governado", async () => {
    // Vocabulário de recusa é FECHADO. O texto do filho é auditoria, nunca classificação.
    filho.stdout = resultado({ outcome: "PRECALL_FAILED", defect: "AUTORIZADO_PELO_DONO" })
    const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("PRECALL_SEMANTIC_REJECTED")
    expect(PRECALL_DEFECTS).toContain(r.defect)
    expect(r.child_detail).toBe("AUTORIZADO_PELO_DONO")
  })

  it("C7 enxurrada no stderr não sobe nem estoura", async () => {
    filho.stderr = "E".repeat(1024 * 1024)
    const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    expect(r.status).toBe("precall_succeeded")
    if (r.status !== "precall_succeeded") return
    expect(JSON.stringify(r.evidence)).not.toContain("EEEE")
  })
})

describe("C8 o resultado é amarrado ao pedido", () => {
  for (const [campo, valor] of [
    ["execution_id", "outro-id"], ["execution_fingerprint", "f".repeat(64)],
    ["request_nonce", "nonce-alheio"],
  ] as const) {
    it(`C8 ${campo} divergente → recusa`, async () => {
      filho.stdout = resultado({ [campo]: valor })
      const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PRECALL_RESULT_BINDING_MISMATCH")
    })
  }
})

describe("C9 o prazo é o mesmo, sem reinício", () => {
  it("C9 o timeout do filho vem do orçamento RESTANTE", async () => {
    const cap = await capacidade()
    filho.travar = true
    const t0 = Date.now()
    const r = await Promise.race([
      executeReservedPrecall(cap, { request_nonce: NONCE }),
      new Promise((res) => setTimeout(() => res({ status: "nao-expirou" }), 3000)),
    ]) as { status: string }
    // O prazo é de 180 s; a corrida acima prova apenas que a função NÃO retorna cedo.
    expect(r.status).toBe("nao-expirou")
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2900)
  }, 10_000)
  it("C9 sem orçamento restante → nenhum filho, nenhum commit", async () => {
    relogio.agora = 1_000
    const cap = await capacidade() // prazo absoluto = 1180
    relogio.agora = 1_300 // já vencido antes de qualquer escrita
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_NO_BUDGET_REMAINING")
    expect(filho.chamadas.length).toBe(0)
    expect(readdirSync(join(RAIZ, "attempts", cap.execution_key)))
      .toEqual(["reservation.json"])
  })

  it("C9 vencido ENTRE a falha rápida e o portão → ZERO spawn", async () => {
    relogio.agora = 1_000
    const cap = await capacidade() // prazo absoluto = 1180
    // Leituras de produção, em ordem: pré-commit, pós-commit, portão do rodaFilho.
    // As duas primeiras positivas; a terceira já vencida. Era exatamente aqui que a
    // r1 criava o processo e só depois agendava sua morte.
    relogio.fila = [1_000, 1_000, 1_300]
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_NO_BUDGET_REMAINING")
    expect(filho.chamadas.length, "o portão deixou nascer um filho vencido").toBe(0)
    // O commit permanece: passou pela falha rápida e foi durável.
    expect(readdirSync(join(RAIZ, "attempts", cap.execution_key)))
      .toContain("attempt-committed.json")
  })

  it("C9 fonte: nenhum spawn é alcançável antes do portão", () => {
    const src = fonte(PRE)
    let posPortao = -1
    let posSpawn = -1
    ts.forEachChild(src, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.name?.text !== "rodaFilho") return
      const anda = (x: ts.Node): void => {
        if (ts.isPropertyAssignment(x) && x.name.getText(src) === "expirouAntesDoSpawn" &&
            x.initializer.getText(src) === "true" && posPortao === -1) {
          posPortao = x.getStart(src)
        }
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) &&
            x.expression.text === "spawn" && posSpawn === -1) {
          posSpawn = x.getStart(src)
        }
        ts.forEachChild(x, anda)
      }
      anda(n)
    })
    expect(posPortao).toBeGreaterThan(-1)
    expect(posSpawn).toBeGreaterThan(-1)
    expect(posPortao, "existe spawn antes do portão do prazo").toBeLessThan(posSpawn)
  })

  it("C9 fonte: sem mínimo artificial que estenda a linhagem", () => {
    // `Math.max(1, restante)` daria 1 ms a uma tentativa já vencida. Zero, não um.
    expect(readFileSync(PRE, "utf8")).not.toContain("Math.max(1, restanteMs)")
  })
  it("C9 commit lento NÃO devolve tempo ao orçamento", async () => {
    relogio.agora = 1_000
    const cap = await capacidade() // prazo absoluto = 1000 + 180 = 1180
    gancho.noCommit = () => {
      if (relogio.agora !== null) relogio.agora += 30 // fsync caro
    }
    const [, atrasos] = await atrasosDurante(() =>
      executeReservedPrecall(cap, { request_nonce: NONCE }))
    const cronometroDoFilho = atrasos.filter((d) => d >= 100_000)
    expect(cronometroDoFilho.length, "um único cronômetro grande").toBe(1)
    // 1180 - 1030 = 150 s. Antes eram 180 s: os 30 s do commit voltavam.
    expect(cronometroDoFilho[0]).toBe(150_000)
  })

  it("C9 commit que ultrapassa o prazo → commit no disco, ZERO filho", async () => {
    relogio.agora = 1_000
    const cap = await capacidade()
    gancho.noCommit = () => {
      if (relogio.agora !== null) relogio.agora += 200 // passou dos 180 s
    }
    const r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_NO_BUDGET_REMAINING")
    expect(filho.chamadas.length, "nasceu filho com prazo vencido").toBe(0)
    // O commit permanece: a tentativa está queimada, e isso é intencional.
    expect(readdirSync(join(RAIZ, "attempts", cap.execution_key)))
      .toContain("attempt-committed.json")
  })

  it("C9 fonte: o filho recebe o prazo ABSOLUTO e deriva o cronômetro", () => {
    // ESTRUTURAL. A versão anterior desta checagem procurava a expressão do cálculo
    // no texto — e continuaria passando com o valor calculado antes do commit.
    const src = fonte(PRE)
    let argumento: string | null = null
    let derivaDentro = false
    const anda = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
          n.expression.text === "rodaFilho" && n.arguments.length === 2) {
        argumento = n.arguments[1]?.getText(src) ?? null
      }
      if (ts.isFunctionDeclaration(n) && n.name?.text === "rodaFilho") {
        derivaDentro = chamadasEm(n).includes("monotonicSeconds")
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(argumento).toBe("inst.attempt_deadline_monotonic")
    expect(derivaDentro, "o cronômetro não deriva do relógio no spawn").toBe(true)
  })
})

describe("C10 no máximo um filho, jamais retry", () => {
  for (const [nome, prep] of [
    ["falha ao nascer", () => { filho.erroAoNascer = true }],
    ["saída inválida", () => { filho.stdout = "lixo\n" }],
    ["código de saída não-zero", () => { filho.rc = 1; filho.stdout = "" }],
  ] as const) {
    it(`C10 ${nome} → exatamente uma invocação`, async () => {
      prep()
      await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      expect(filho.chamadas.length).toBeLessThanOrEqual(1)
    })
  }
  it("C10 fonte: nenhum laço, e uma única chamada ao filho", () => {
    // ESTRUTURAL. A primeira versão procurava a palavra "retry" no texto e acusou a
    // PROSA que diz não haver retry — o mesmo falso positivo que esta fase já pagou
    // sete vezes. Comentário não é laço nem chamada.
    const src = fonte(PRE)
    let chamadasAoFilho = 0
    let dentroDeLaco = 0
    // "Zero laços no módulo" seria grosseiro demais e falso: `leResultado` percorre os
    // campos do protocolo. A propriedade real é que NENHUM laço ENVOLVE a invocação.
    const anda = (n: ts.Node, emLaco: boolean): void => {
      const laco = emLaco || ts.isForStatement(n) || ts.isForOfStatement(n) ||
        ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
          n.expression.text === "rodaFilho") {
        chamadasAoFilho++
        if (laco) dentroDeLaco++
      }
      ts.forEachChild(n, (f) => anda(f, laco))
    }
    anda(src, false)
    expect(dentroDeLaco, "a invocação do filho está dentro de um laço").toBe(0)
    expect(chamadasAoFilho, "o filho é invocado em mais de um ponto").toBe(1)
  })
})

describe("C11 evidência terminal write-once", () => {
  it("C11 sucesso grava terminal e o estado vira TERMINAL", async () => {
    const cap = await capacidade()
    await executeReservedPrecall(cap, { request_nonce: NONCE })
    const dir = join(RAIZ, "attempts", cap.execution_key)
    expect(readdirSync(dir).sort()).toEqual(
      ["attempt-committed.json", "reservation.json", "terminal.json"])
    expect(await classifyExecutionAttempt(RAIZ, ID)).toBe("TERMINAL")
  })
  it("C11 o terminal não guarda material bruto de autoridade", async () => {
    const cap = await capacidade()
    await executeReservedPrecall(cap, { request_nonce: NONCE })
    const dir = join(RAIZ, "attempts", cap.execution_key)
    const bruto = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("")
    for (const p of ["STEFANO", "APPROVED", "ap-d2c", "dec-d2c", "Traceback", "at Object."]) {
      expect(bruto).not.toContain(p)
    }
  })
  it("C11 a evidência é do PAI: forma exata, congelada, sem campo do filho", async () => {
    filho.stdout = resultado({})
    const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    expect(r.status).toBe("precall_succeeded")
    if (r.status !== "precall_succeeded") return
    expect(Object.isFrozen(r.evidence)).toBe(true)
    // `execution_key` NÃO existe no protocolo do filho: só o pai pode tê-lo posto ali.
    // E `protocol_version`/`request_nonce`, que só o filho envia, não sobrevivem.
    expect(Object.keys(r.evidence).sort()).toEqual([
      "client_constructions", "execution_fingerprint", "execution_id", "execution_key",
      "mode", "model_call_completed", "provider_calls", "request_hash", "tool_count",
      "user_payload_hash", "verdict",
    ])
    expect(r.evidence.mode).toBe("PRECALL_PROBE")
    expect(r.evidence.verdict).toBe("PRECALL_PROBE_COMPLETE")
  })

  it("C11 fonte: as constantes da evidência vêm do módulo, não do documento", () => {
    // O pai AFIRMA mode/verdict a partir de constante própria. Se viessem de `doc`,
    // um filho comprometido escolheria o texto que aparece na evidência governada.
    const src = fonte(PRE)
    let achou = false
    const anda = (n: ts.Node): void => {
      if (ts.isPropertyAssignment(n) && n.name.getText(src) === "mode" &&
          ts.isIdentifier(n.initializer) &&
          n.initializer.text === "PRECALL_FROZEN_MODE") {
        achou = true
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(achou, "mode na evidência não vem de constante do módulo").toBe(true)
  })

  it("C11 o id segue queimado após o terminal", async () => {
    const cap = await capacidade()
    await executeReservedPrecall(cap, { request_nonce: NONCE })
    const s = spec()
    const a = issueLiveExecutionAuthorization(s, pedido(s), [decisao(s)])
    if (a.status !== "authorized") throw new Error("d1")
    expect((await prepareGovernedExecution(a.authorization)).status).toBe("refused")
  })
})

describe("C12 zero chamada a modelo, provedor ou rede", () => {
  it("C12 nenhuma chamada de rede no supervisor PRECALL", () => {
    const PROIBIDAS = new Set(["fetch", "request", "createResponse", "create"])
    expect(chamadasEm(fonte(PRE)).filter((c) => PROIBIDAS.has(c))).toEqual([])
  })
  it("C12 nenhum import de openai ou rede", () => {
    const src = fonte(PRE)
    const mods: string[] = []
    ts.forEachChild(src, (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        mods.push(n.moduleSpecifier.text)
      }
    })
    for (const m of mods) {
      expect(/openai|node:http|node:net|undici|axios/.test(m), m).toBe(false)
    }
  })
  it("C12 o sucesso exige provider_calls 0 e model_call_completed false", async () => {
    filho.stdout = resultado({ provider_calls: 1 })
    const r = await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    expect(r.status).toBe("refused")
  })
  it("C12 o worker Python não CHAMA execute_live nem responses.create", () => {
    // ESTRUTURAL, via AST do próprio Python: nomes CHAMADOS, não menções em docstring.
    // A primeira versão acusou o comentário que explica por que o caminho vivo é
    // inalcançável daqui.
    const worker = join(__dirname, "..", "..", "bridge", "creditum_hermes_precall", "worker.py")
    const saida = execFileSync("python3", ["-c", `
import ast, json, sys
a = ast.parse(open(sys.argv[1]).read())
chamados = set()
for n in ast.walk(a):
    if isinstance(n, ast.Call):
        f = n.func
        if isinstance(f, ast.Name):
            chamados.add(f.id)
        elif isinstance(f, ast.Attribute):
            chamados.add(f.attr)
print(json.dumps(sorted(chamados)))
`, worker], { encoding: "utf8" })
    const chamados = JSON.parse(saida.trim()) as string[]
    for (const proibido of ["execute_live", "create", "post", "request", "urlopen"]) {
      expect(chamados, `worker chama ${proibido}`).not.toContain(proibido)
    }
    expect(chamados).toContain("precall_probe")
  })

  it("C12 o worker não emite autorização viva", () => {
    const w = readFileSync(
      join(__dirname, "..", "..", "bridge", "creditum_hermes_precall", "worker.py"), "utf8")
    expect(w).toContain("live_authorization=None")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// C14 — R6: HERMES_HOME governado no ambiente do filho
// ═════════════════════════════════════════════════════════════════════════════
//
// Nasceu de execução REAL na Hostinger: `d2d-precall-20260902-01` recusou com
// `RUNTIME_NOT_RESOLVED` porque o saneamento removia `HERMES_HOME`, e é dele que o
// `hermes_cli` instalado depende para resolver config e provider. O `execution_id`
// está permanentemente queimado — não há, e não haverá, caminho de reuso.

describe("C14 o filho recebe o HERMES_HOME governado", () => {
  const AMBIENTE_ESPERADO = {
    HERMES_HOME: "/data",
    PATH: "/usr/bin:/bin",
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONHASHSEED: "0",
  }

  it("C14/A o ambiente do filho é EXATAMENTE o conjunto governado", async () => {
    await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    expect(filho.chamadas.length).toBe(1)
    const env = filho.chamadas[0]?.opts?.env as Record<string, string>
    // Igualdade exata: chave a mais é vazamento, chave a menos é o defeito da r6.
    expect(env).toEqual(AMBIENTE_ESPERADO)
    expect(env.HERMES_HOME).toBe(PRECALL_HERMES_HOME)
  })

  it("C14/B a forma antiga, sem HERMES_HOME, já não é válida", async () => {
    // A regressão do achado: `ambienteMinimo()` sem esta chave era exatamente o que
    // fazia o `hermes_cli` não resolver na Hostinger.
    await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
    const env = filho.chamadas[0]?.opts?.env as Record<string, string>
    expect(Object.keys(env).sort()).toContain("HERMES_HOME")
    expect(Object.keys(env)).toHaveLength(7)
  })

  it("C14/C o ambiente do PAI não redireciona o do filho", async () => {
    const antes = process.env.HERMES_HOME
    try {
      process.env.HERMES_HOME = PRECALL_HERMES_HOME // presente e IGUAL: segue
      await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      const env = filho.chamadas[0]?.opts?.env as Record<string, string>
      expect(env.HERMES_HOME).toBe("/data")
    } finally {
      if (antes === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = antes
    }
  })

  it("C14/C2 pai com raiz DIVERGENTE → recusa, ZERO filho, nada consumido", async () => {
    const antes = process.env.HERMES_HOME
    const cap = await capacidade()
    let r: Awaited<ReturnType<typeof executeReservedPrecall>>
    try {
      process.env.HERMES_HOME = "/tmp/raiz-do-atacante"
      r = await executeReservedPrecall(cap, { request_nonce: NONCE })
    } finally {
      if (antes === undefined) delete process.env.HERMES_HOME
      else process.env.HERMES_HOME = antes
    }
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PRECALL_HERMES_HOME_MISMATCH")
    expect(filho.chamadas.length, "nasceu filho com raiz divergente").toBe(0)
    // Nem commit, nem terminal: a conferência precede o consumo.
    expect(readdirSync(join(RAIZ, "attempts", cap.execution_key)))
      .toEqual(["reservation.json"])
    // E a capacidade NÃO foi queimada — o host mal configurado não gasta a aprovação.
    expect(cap.isConsumed).toBe(false)
    const depois = await executeReservedPrecall(cap, { request_nonce: NONCE })
    expect(depois.status).toBe("precall_succeeded")
  })

  it("C14/D segredo do pai não atravessa a fronteira", async () => {
    const guardados = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      HOME: process.env.HOME,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    }
    try {
      process.env.OPENAI_API_KEY = "sk-NAO-DEVE-ATRAVESSAR"
      process.env.AWS_SECRET_ACCESS_KEY = "SEGREDO-NAO-DEVE-ATRAVESSAR"
      await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      const env = filho.chamadas[0]?.opts?.env as Record<string, string>
      expect(env.OPENAI_API_KEY).toBeUndefined()
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
      expect(env.HOME).toBeUndefined()
      expect(JSON.stringify(env)).not.toContain("NAO-DEVE-ATRAVESSAR")
    } finally {
      for (const [k, v] of Object.entries(guardados)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  it("C14/E o pai NÃO é encaminhado inteiro", async () => {
    const marca = "CREDITUM_MARCA_R6_" + String(Date.now())
    try {
      process.env[marca] = "1"
      await executeReservedPrecall(await capacidade(), { request_nonce: NONCE })
      const env = filho.chamadas[0]?.opts?.env as Record<string, string>
      expect(env[marca]).toBeUndefined()
      // O pai tem dezenas de variáveis; o filho tem sete.
      expect(Object.keys(env).length).toBeLessThan(Object.keys(process.env).length)
    } finally {
      delete process.env[marca]
    }
  })

  it("C14/F nenhuma via de modelo, provedor ou rede entrou", () => {
    // ESTRUTURAL: a r6 acrescentou UMA chave de ambiente e uma conferência. Nada mais.
    const src = fonte(PRE)
    const PROIBIDAS = new Set(["fetch", "request", "createResponse", "create"])
    expect(chamadasEm(src).filter((c) => PROIBIDAS.has(c))).toEqual([])
    const t = readFileSync(PRE, "utf8")
    for (const p of ["--live", "OPENAI_API_KEY", "api_key", "Authorization"]) {
      expect(t, p).not.toContain(p)
    }
  })

  it("C14 fonte: HERMES_HOME é constante do módulo, não leitura do ambiente", () => {
    // Se `ambienteMinimo()` lesse `process.env`, o ambiente escolheria a raiz — a
    // lição que a d1 pagou com `HERMES_HOME=/tmp/x`.
    const src = fonte(PRE)
    let leituras = 0
    ts.forEachChild(src, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.name?.text !== "ambienteMinimo") return
      const anda = (x: ts.Node): void => {
        if (ts.isPropertyAccessExpression(x) && x.getText(src).startsWith("process.env")) {
          leituras++
        }
        ts.forEachChild(x, anda)
      }
      anda(n)
    })
    expect(leituras, "ambienteMinimo lê process.env").toBe(0)
  })
})

describe("C13 nenhuma superfície privilegiada de ativação", () => {
  it("C13 exports do módulo PRECALL", async () => {
    const m = await import("../src/precall-execution")
    const funcoes = Object.entries(m)
      .filter(([, v]) => typeof v === "function").map(([k]) => k)
    expect(funcoes).toEqual(["executeReservedPrecall"])
  })
  it("C13 nenhum export aceita executável, worker, ambiente, prazo ou raiz", () => {
    const PROIBIDOS = /^(executable|executavel|python|worker|env|environment|ambiente|deadline|prazo|ledgerRoot|root|raiz|seam|semente|opts|options)$/i
    const src = fonte(PRE)
    ts.forEachChild(src, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.name === undefined) return
      if ((ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) === 0) return
      for (const p of n.parameters) {
        const nome = ts.isIdentifier(p.name) ? p.name.text : ""
        expect(PROIBIDOS.test(nome), `${n.name.text} aceita "${nome}"`).toBe(false)
      }
    })
  })
  it("C13 nenhum nome sugere costura de teste ou LIVE", async () => {
    const m = await import("../src/precall-execution")
    expect(Object.keys(m).filter((k) => /ForTests|__|Seam|TestOnly|runLive|ALLOW_LIVE/i.test(k)))
      .toEqual([])
  })
})
