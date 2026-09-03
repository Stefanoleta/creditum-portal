/**
 * D2E-A2 — evidência direta do plano canônico.
 *
 * O ponto: os hashes que Stefano aprova existem ANTES da execução, vêm de UMA
 * derivação, e planejar não gasta nada — nem livro-razão, nem autorização, nem rede.
 *
 * O planejador Python é mockado APENAS aqui, no nível do `spawn`. Produção não tem
 * parâmetro de executável, worker, ambiente nem protocolo.
 */

import { EventEmitter } from "node:events"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ChildProcess } from "node:child_process"
import ts from "typescript"
import { beforeEach, describe, expect, it, vi } from "vitest"

interface ProcFalso extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { end: (d: string) => void; on: () => void }
  kill: () => boolean
}

/** Tipo explícito, para não precisar de asserção por campo. */
interface FilhoFalso {
  chamadas: { exe: string; args: string[]; opts: Record<string, unknown> }[]
  stdinRecebido: string[]
  stdout: string
  rc: number | null
  sinal: string | null
  erroAoNascer: boolean
  travar: boolean
}

const filho = vi.hoisted<FilhoFalso>(() => ({
  chamadas: [],
  stdinRecebido: [],
  stdout: "",
  rc: 0,
  sinal: null,
  erroAoNascer: false,
  travar: false,
}))

vi.mock("node:child_process", () => ({
  spawn: (exe: string, args: string[], opts: Record<string, unknown>) => {
    filho.chamadas.push({ exe, args, opts })
    const proc = new EventEmitter() as ProcFalso
    const out = new EventEmitter()
    const err = new EventEmitter()
    proc.stdout = out
    proc.stderr = err
    proc.stdin = { end: (d: string) => filho.stdinRecebido.push(d), on: () => undefined }
    proc.kill = () => true
    setTimeout(() => {
      if (filho.erroAoNascer) { proc.emit("error", new Error("ENOENT")); return }
      if (filho.travar) return
      if (filho.stdout !== "") out.emit("data", Buffer.from(filho.stdout, "utf8"))
      proc.emit("close", filho.rc, filho.sinal)
    }, 0)
    return proc as unknown as ChildProcess
  },
}))

const {
  OPERATION_REASONING_RESPONSE_ONLY, PLAN_HERMES_HOME, PLAN_PYTHON_EXECUTABLE,
  PLAN_MATERIAL_HASH_FIELDS, PLAN_MATERIAL_TEXT_FIELDS, PLAN_RESULT_PROTOCOL,
  PLAN_WORKER_MODULE, buildEvidenceCanonicalLivePlan, canonicalLivePlanFromMaterial,
  plansMatch, renderEvidenceAuthorizationText,
} = await import("../src/live-plan")
const { liveExecutionFingerprint } = await import("../src/live-execution")

const PLANO_TS = join(__dirname, "..", "src", "live-plan.ts")
const ID = "d2e-plan-teste-0001"

/** Os valores CONCRETOS derivados pelo planejador Python real, nesta máquina. */
const H = {
  read_model_fingerprint: "c2a29172a3b9653f2ca79a4418234fd31386fa228e955483f03d93b14871cead",
  request_fingerprint: "6c643ecea4a1a60f2a54763201bac4e5650edcc25daf993aca0dcd029160582d",
  runtime_binding_fingerprint: "34b2e67476fb03364e4bfe8c510f9f2fb28a06e750f10be9a6a45597c51e63d5",
  request_hash: "6c643ecea4a1a60f2a54763201bac4e5650edcc25daf993aca0dcd029160582d",
  user_payload_hash: "eba9b594d23b0a07293b55a9d0cff56d7271dc43ee797ebe1fcbaf3b8c91582e",
  constitution_hash: "38a38edc0af169bdfffde8e196a6fe8ba9acc82ba5b0ae0cb5726db0d95a1b79",
  system_contract_hash: "a315e9ec7afb3d91329716596341224dfed4ddf472e07998f272b5f54ab684de",
}

function resultado(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    protocol_version: PLAN_RESULT_PROTOCOL, execution_id: ID, outcome: "PLAN_DERIVED",
    ...H,
    provider: "openai-codex", model: "gpt-5.6-luna", api_mode: "codex_responses",
    sdk_version: "2.24.0",
    constitution_id: "creditum_hermes_constitution/v1", constitution_version: "1.0.0",
    system_contract_id: "creditum_hermes_reasoning_system/v1",
    system_contract_version: "1.0.0",
    runtime_id: "creditum_hermes_reasoning_runtime/v1", runtime_version: "1.0.0",
    response_policy_id: "creditum_hermes_response_extraction/v1",
    response_policy_version: "1.0.0",
    tool_count: 0, stream: false, operation: OPERATION_REASONING_RESPONSE_ONLY,
    ...over,
  }) + "\n"
}

beforeEach(() => {
  filho.chamadas = []
  filho.stdinRecebido = []
  filho.rc = 0
  filho.sinal = null
  filho.erroAoNascer = false
  filho.travar = false
  filho.stdout = resultado()
})

function fonte(): ts.SourceFile {
  return ts.createSourceFile(PLANO_TS, readFileSync(PLANO_TS, "utf8"),
                             ts.ScriptTarget.ES2022, true)
}

describe("P1 o plano é completo e concreto", () => {
  it("P1 todos os hashes são reais, nenhum placeholder", async () => {
    const r = await buildEvidenceCanonicalLivePlan(ID)
    expect(r.status).toBe("planned")
    if (r.status !== "planned") return
    for (const c of ["read_model_fingerprint", "request_fingerprint",
                     "runtime_binding_fingerprint", "request_hash", "user_payload_hash",
                     "execution_fingerprint", "subject_content_hash"] as const) {
      const v = r.plan[c]
      expect(v, c).toMatch(/^[0-9a-f]{64}$/)
      // `"x".repeat(64)` era o que a d1 recebia antes desta fase.
      expect(v, `${c} parece placeholder`).not.toBe(v[0]!.repeat(64))
    }
  })

  it("P1 o fingerprint vem da função CONGELADA da d1, não de uma cópia", async () => {
    const r = await buildEvidenceCanonicalLivePlan(ID)
    if (r.status !== "planned") throw new Error("esperava plano")
    expect(r.plan.execution_fingerprint).toBe(liveExecutionFingerprint(r.plan.spec))
    // A d1 exige `subject_content_hash === fingerprint`.
    expect(r.plan.subject_content_hash).toBe(r.plan.execution_fingerprint)
  })

  it("P1 o plano e a spec são congelados", async () => {
    const r = await buildEvidenceCanonicalLivePlan(ID)
    if (r.status !== "planned") throw new Error("esperava plano")
    expect(Object.isFrozen(r.plan)).toBe(true)
    expect(Object.isFrozen(r.plan.spec)).toBe(true)
  })
})

describe("P2 determinismo", () => {
  it("P2 mesma entrada, mesmo plano", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    const b = await buildEvidenceCanonicalLivePlan(ID)
    if (a.status !== "planned" || b.status !== "planned") throw new Error("esperava planos")
    expect(a.plan).toEqual(b.plan)
  })

  it("P2 execution_id diferente muda o fingerprint da execução, não o do conteúdo", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    filho.stdout = resultado({ execution_id: "d2e-plan-teste-0002" })
    const b = await buildEvidenceCanonicalLivePlan("d2e-plan-teste-0002")
    if (a.status !== "planned" || b.status !== "planned") throw new Error("esperava planos")
    expect(a.plan.execution_fingerprint).not.toBe(b.plan.execution_fingerprint)
    expect(a.plan.request_hash).toBe(b.plan.request_hash)
    expect(a.plan.user_payload_hash).toBe(b.plan.user_payload_hash)
  })

  it("P2 material diferente muda o fingerprint da execução", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    filho.stdout = resultado({ read_model_fingerprint: "a".repeat(63) + "b" })
    const b = await buildEvidenceCanonicalLivePlan(ID)
    if (a.status !== "planned" || b.status !== "planned") throw new Error("esperava planos")
    expect(a.plan.execution_fingerprint).not.toBe(b.plan.execution_fingerprint)
  })
})

describe("P3 planejar não gasta nada", () => {
  it("P3 zero livro-razão, zero autorização, zero rede — estrutural", () => {
    const src = fonte()
    const chamados: string[] = []
    const anda = (n: ts.Node): void => {
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const e = n.expression
        const nome = ts.isIdentifier(e) ? e.text
          : ts.isPropertyAccessExpression(e) ? e.name.text : null
        if (nome !== null) chamados.push(nome)
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    for (const p of ["reserveExecutionAttempt", "recordAttemptCommitted",
                     "recordExecutionTerminal", "prepareGovernedExecution",
                     "consumeLiveExecutionAuthorization", "consumeReservedExecutionAttempt",
                     "executeReservedPrecall", "fetch", "create", "request"]) {
      expect(chamados, `o planejador chama ${p}`).not.toContain(p)
    }
  })

  it("P3 não importa livro-razão nem supervisor", () => {
    const src = fonte()
    const mods: string[] = []
    ts.forEachChild(src, (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        mods.push(n.moduleSpecifier.text)
      }
    })
    expect(mods.sort()).toEqual(["./live-execution", "node:child_process"])
  })

  it("P3 nenhuma reimplementação de hash: o TS não faz sha256 aqui", () => {
    const src = fonte()
    const chamados: string[] = []
    const anda = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        chamados.push(n.expression.text)
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(chamados).not.toContain("createHash")
    // O único hash calculado aqui é o da d1, pela função dela.
    expect(chamados).toContain("liveExecutionFingerprint")
  })
})

describe("P4 o filho é fixo e o ambiente é o governado", () => {
  it("P4 executável, argv e ambiente exatos", async () => {
    await buildEvidenceCanonicalLivePlan(ID)
    expect(filho.chamadas.length).toBe(1)
    const c = filho.chamadas[0]!
    expect(c.exe).toBe(PLAN_PYTHON_EXECUTABLE)
    expect(c.args).toEqual(["-I", "-B", "-m", PLAN_WORKER_MODULE])
    expect(c.opts.env).toEqual({
      HERMES_HOME: PLAN_HERMES_HOME, PATH: "/usr/bin:/bin",
      LC_ALL: "C.UTF-8", LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1",
      PYTHONUNBUFFERED: "1", PYTHONHASHSEED: "0",
    })
    expect(c.opts.shell).toBeUndefined()
  })

  it("P4 o pedido carrega SÓ o execution_id", async () => {
    await buildEvidenceCanonicalLivePlan(ID)
    const env = JSON.parse(filho.stdinRecebido[0] ?? "{}") as Record<string, unknown>
    expect(Object.keys(env).sort()).toEqual(["execution_id", "protocol_version"])
  })

  it("P4 não existe entrypoint com modo: dois workers fixos", () => {
    const t = readFileSync(PLANO_TS, "utf8")
    expect(t).toContain('PLAN_WORKER_MODULE = "creditum_hermes_planner.worker"')
    for (const p of ["mode=", "--live", "live=true"]) {
      const executavel = t.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "")
      expect(executavel, p).not.toContain(p)
    }
  })

  it("P4 segredo do pai não atravessa", async () => {
    process.env.OPENAI_API_KEY = "sk-NAO-DEVE-ATRAVESSAR"
    try {
      await buildEvidenceCanonicalLivePlan(ID)
      const env = filho.chamadas[0]!.opts.env as Record<string, string>
      expect(env.OPENAI_API_KEY).toBeUndefined()
      expect(JSON.stringify(env)).not.toContain("NAO-DEVE-ATRAVESSAR")
    } finally {
      delete process.env.OPENAI_API_KEY
    }
  })
})

describe("P5 o resultado do filho é validado por contrato exato", () => {
  const impossiveis: [string, Record<string, unknown>][] = [
    ["ferramenta declarada", { tool_count: 1 }],
    ["stream ligado", { stream: true }],
    ["escopo trocado", { operation: "LIVRE" }],
    ["hash malformado", { request_hash: "zz".repeat(32) }],
    ["hash curto", { user_payload_hash: "ab" }],
    ["campo extra", { extra: "x" }],
    ["campo de modo", { mode: "live" }],
    ["contagem fracionária", { tool_count: 0.5 }],
  ]
  for (const [nome, over] of impossiveis) {
    it(`P5 resultado impossível — ${nome} → recusa`, async () => {
      filho.stdout = resultado(over)
      const r = await buildEvidenceCanonicalLivePlan(ID)
      expect(r.status, nome).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PLAN_RESULT_PROTOCOL_INVALID")
    })
  }

  it("P5 campo ausente → recusa, não default", async () => {
    const doc = JSON.parse(resultado()) as Record<string, unknown>
    delete doc.user_payload_hash
    filho.stdout = `${JSON.stringify(doc)}\n`
    const r = await buildEvidenceCanonicalLivePlan(ID)
    expect(r.status).toBe("refused")
  })

  it("P5 id do filho diferente → vínculo recusado", async () => {
    filho.stdout = resultado({ execution_id: "outro-id" })
    const r = await buildEvidenceCanonicalLivePlan(ID)
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PLAN_RESULT_BINDING_MISMATCH")
  })

  it("P5 processo quebrado com JSON perfeito NÃO é plano", async () => {
    filho.rc = 137
    const r = await buildEvidenceCanonicalLivePlan(ID)
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("PLAN_WORKER_EXIT_NONZERO")
  })

  it("P5 recusa governada do runtime vira defeito NOSSO", async () => {
    filho.stdout = JSON.stringify({
      protocol_version: PLAN_RESULT_PROTOCOL, execution_id: ID,
      outcome: "PLAN_FAILED", defect: "HERMES_RUNTIME_NOT_AVAILABLE",
    }) + "\n"
    const r = await buildEvidenceCanonicalLivePlan(ID)
    expect(r.status).toBe("refused")
    if (r.status === "refused") {
      expect(r.defect).toBe("PLAN_REFUSED_BY_RUNTIME")
      expect(r.child_detail).toBe("HERMES_RUNTIME_NOT_AVAILABLE")
    }
  })

  it("P5 os controles vêm da d1, não do filho", async () => {
    // Um planejador comprometido não escolhe retry nem prazo.
    filho.stdout = resultado({})
    const r = await buildEvidenceCanonicalLivePlan(ID)
    if (r.status !== "planned") throw new Error("esperava plano")
    expect(r.plan.max_retries).toBe(0)
    expect(r.plan.background).toBe(false)
    expect(r.plan.attempt_deadline_seconds).toBe(180)
    expect(r.plan.authorization_ttl_seconds).toBe(300)
  })
})

describe("P6 TOCTOU — o plano aprovado é o plano executado", () => {
  it("P6 material alterado depois produz plano que NÃO casa", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    if (a.status !== "planned") throw new Error("esperava plano")
    // O runtime muda por baixo: outro read model.
    filho.stdout = resultado({ read_model_fingerprint: "c".repeat(64) })
    const b = await buildEvidenceCanonicalLivePlan(ID)
    if (b.status !== "planned") throw new Error("esperava plano")
    expect(plansMatch(a.plan, b.plan), "divergência passou despercebida").toBe(false)
  })

  it("P6 plano idêntico casa", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    const b = await buildEvidenceCanonicalLivePlan(ID)
    if (a.status !== "planned" || b.status !== "planned") throw new Error("esperava planos")
    expect(plansMatch(a.plan, b.plan)).toBe(true)
  })

  it("P6 o plano é imutável depois de criado", async () => {
    const r = await buildEvidenceCanonicalLivePlan(ID)
    if (r.status !== "planned") throw new Error("esperava plano")
    const antes = r.plan.request_hash
    try {
      (r.plan as unknown as Record<string, unknown>).request_hash = "0".repeat(64)
    } catch { /* estrito lança; o que importa é o valor não mudar */ }
    expect(r.plan.request_hash).toBe(antes)
  })
})

describe("P8 substituição de endpoint depois do planejamento", () => {
  it("P8/B endpoint diferente muda o execution_fingerprint", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    // O endpoint entra no plano pelo `runtime_binding_fingerprint`, que é um dos
    // vinte campos da spec — logo o fingerprint da execução muda por composição.
    filho.stdout = resultado({ runtime_binding_fingerprint: "d".repeat(64) })
    const b = await buildEvidenceCanonicalLivePlan(ID)
    if (a.status !== "planned" || b.status !== "planned") throw new Error("esperava planos")
    expect(a.plan.runtime_binding_fingerprint).not.toBe(b.plan.runtime_binding_fingerprint)
    expect(a.plan.execution_fingerprint).not.toBe(b.plan.execution_fingerprint)
    expect(a.plan.subject_content_hash).not.toBe(b.plan.subject_content_hash)
  })

  it("P8/E o plano aprovado NÃO casa com o replanejado noutro endpoint", async () => {
    // O cenário exato do regate: plano com endpoint A, config muda para B, replaneja.
    const aprovado = await buildEvidenceCanonicalLivePlan(ID)
    if (aprovado.status !== "planned") throw new Error("esperava plano")
    filho.stdout = resultado({ runtime_binding_fingerprint: "d".repeat(64) })
    const naHora = await buildEvidenceCanonicalLivePlan(ID)
    if (naHora.status !== "planned") throw new Error("esperava plano")
    expect(plansMatch(aprovado.plan, naHora.plan),
           "substituição de endpoint passou despercebida").toBe(false)
  })

  it("P8/E `plansMatch` cobre o campo do vínculo", () => {
    // Se `runtime_binding_fingerprint` saísse da lista comparada, o teste acima
    // continuaria passando por outro motivo e a proteção sumiria em silêncio.
    const t = readFileSync(PLANO_TS, "utf8")
    const lista = t.slice(t.indexOf("export function plansMatch"))
    expect(lista).toContain("runtime_binding_fingerprint")
    expect(lista).toContain("execution_fingerprint")
  })

  it("P8/F o texto de autorização não publica a URL crua", async () => {
    const r = await buildEvidenceCanonicalLivePlan(ID)
    if (r.status !== "planned") throw new Error("esperava plano")
    const t = renderEvidenceAuthorizationText(r.plan)
    for (const p of ["http://", "https://", "base_url"]) {
      expect(t, `o texto publica ${p}`).not.toContain(p)
    }
    // Mas a identidade do endpoint ESTÁ comprometida, pelo fingerprint do vínculo.
    expect(t).toContain(r.plan.runtime_binding_fingerprint)
  })
})

describe("P7 o texto de autorização", () => {
  it("P7 traz os cinco valores concretos do vínculo", async () => {
    const r = await buildEvidenceCanonicalLivePlan(ID)
    if (r.status !== "planned") throw new Error("esperava plano")
    const t = renderEvidenceAuthorizationText(r.plan)
    for (const v of [r.plan.execution_id, r.plan.subject_content_hash,
                     r.plan.execution_fingerprint, r.plan.request_hash,
                     r.plan.user_payload_hash]) {
      expect(t).toContain(v)
    }
    expect(t).toContain("openai-codex")
    expect(t).toContain("gpt-5.6-luna")
    expect(t).toContain(OPERATION_REASONING_RESPONSE_ONLY)
  })

  it("P7 declara que o transporte NÃO está ligado", () => {
    // A d2e-a1 provou que não existe contrato de entrada do Telegram neste repo.
    // Renderizar um vínculo que não existe seria pior que não ter texto.
    const t = renderEvidenceAuthorizationText({
      plan_version: "creditum_canonical_live_plan/1.0.0", execution_id: ID,
      ...H, execution_fingerprint: "e".repeat(64), subject_content_hash: "e".repeat(64),
      provider: "openai-codex", model: "gpt-5.6-luna", api_mode: "codex_responses",
      sdk_version: "2.24.0", constitution_id: "c", constitution_version: "1.0.0",
      system_contract_id: "s", system_contract_version: "1.0.0",
      runtime_id: "r", runtime_version: "1.0.0",
      response_policy_id: "p", response_policy_version: "1.0.0",
      tool_count: 0, stream: false, background: false, max_retries: 0,
      attempt_deadline_seconds: 180, authorization_ttl_seconds: 300,
      operation: OPERATION_REASONING_RESPONSE_ONLY,
      spec: {} as never,
    })
    expect(t).toContain("NOT YET BOUND")
    // O rótulo tem de dizer EVIDÊNCIA. Enquanto o cabeçalho dizia "AUTORIZAÇÃO DE
    // EXECUÇÃO VIVA", este texto e o de produção eram indistinguíveis à vista.
    expect(t).toContain("EVIDÊNCIA")
    expect(t).not.toContain("PRODUÇÃO TELEGRAM")
  })

  it("P7 é determinístico", async () => {
    const a = await buildEvidenceCanonicalLivePlan(ID)
    const b = await buildEvidenceCanonicalLivePlan(ID)
    if (a.status !== "planned" || b.status !== "planned") throw new Error("esperava planos")
    expect(renderEvidenceAuthorizationText(a.plan)).toBe(renderEvidenceAuthorizationText(b.plan))
  })

  it("P7 não existe atalho público para o vivo", async () => {
    const mod = await import("../src/live-plan")
    const funcoes = Object.keys(mod).filter((k) =>
      typeof (mod as unknown as Record<string, unknown>)[k] === "function")
    // `canonicalLivePlanFromMaterial` entrou na r3: é o construtor PURO, e é o que a
    // via de produção do Telegram usa pelo CLI fixo. `buildEvidence…` foi renomeado
    // para o nome dizer o que ele é — o regate mostrou o custo de ele se chamar
    // "a via de construir um plano" enquanto usava o fixture.
    expect(funcoes.sort()).toEqual([
      "buildEvidenceCanonicalLivePlan", "canonicalLivePlanFromMaterial",
      "plansMatch", "renderEvidenceAuthorizationText",
    ])
    for (const k of Object.keys(mod)) {
      expect(k, k).not.toMatch(/runLive|approveAndRun|authorize|issue|execute/i)
    }
  })
})

describe("R4 o construtor puro valida o material", () => {
  const material = (): Record<string, unknown> => {
    const d: Record<string, unknown> = {
      tool_count: 0, stream: false, operation: OPERATION_REASONING_RESPONSE_ONLY,
    }
    for (const c of PLAN_MATERIAL_TEXT_FIELDS) d[c] = `valor-${c}`
    for (const c of PLAN_MATERIAL_HASH_FIELDS) d[c] = "a".repeat(64)
    return d
  }

  it("R4 material bem-formado constrói o plano", () => {
    const r = canonicalLivePlanFromMaterial("tg-r4", material())
    if (r.status !== "planned") throw new Error(`recusou: ${r.defect}`)
    expect(r.plan.execution_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(r.plan.subject_content_hash).toBe(r.plan.execution_fingerprint)
  })

  it("R4 campo de texto ausente é RECUSA, não `undefined` impresso", () => {
    // Antes da r4 o construtor fazia `d.provider as string` e seguia. Um material
    // sem o campo produzia um plano com a palavra "undefined" onde Stefano leria o
    // modelo — e o `as string` calava o compilador sobre isso.
    for (const c of PLAN_MATERIAL_TEXT_FIELDS) {
      const d = material()
      delete d[c]
      const r = canonicalLivePlanFromMaterial("tg-r4", d)
      expect(r.status, c).toBe("refused")
      if (r.status === "refused") expect(r.defect, c).toBe("PLAN_MATERIAL_INVALID")
    }
  })

  it("R4 hash que não é hexadecimal de 64 é RECUSA", () => {
    for (const c of PLAN_MATERIAL_HASH_FIELDS) {
      for (const ruim of ["", "nao-hex", "A".repeat(64), "a".repeat(63), "r".repeat(64)]) {
        const r = canonicalLivePlanFromMaterial("tg-r4", { ...material(), [c]: ruim })
        expect(r.status, `${c}=${ruim.slice(0, 8)}`).toBe("refused")
      }
    }
  })

  it("R4 controle fora do escopo é RECUSA, nunca substituição silenciosa", () => {
    // O defeito sutil: o construtor FIXAVA tool_count 0 e stream false. Um material
    // anunciando três ferramentas era aceito e exibido como zero, e o texto mostrado
    // passava a discordar do material que o originou.
    for (const [c, v] of [["tool_count", 3], ["tool_count", 1], ["stream", true],
                          ["operation", "OUTRA_COISA"]] as const) {
      const r = canonicalLivePlanFromMaterial("tg-r4", { ...material(), [c]: v })
      expect(r.status, `${c}=${String(v)}`).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PLAN_MATERIAL_INVALID")
    }
  })

  it("R4 execution_id inválido é RECUSA", () => {
    for (const id of ["", "x".repeat(513)]) {
      const r = canonicalLivePlanFromMaterial(id, material())
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("PLAN_EXECUTION_ID_INVALID")
    }
  })

  it("R4 o plano construído continua congelado", () => {
    const r = canonicalLivePlanFromMaterial("tg-r4", material())
    if (r.status !== "planned") throw new Error("esperava plano")
    expect(Object.isFrozen(r.plan)).toBe(true)
    expect(Object.isFrozen(r.plan.spec)).toBe(true)
  })
})

