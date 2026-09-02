/**
 * Fase 3.1d-D1 — provas do envelope de segurança da primeira chamada viva.
 *
 * O ponto central: a autoridade humana NÃO é reimplementada aqui. O emissor chama
 * `resolveEffectiveDecision` e `decisionAuthorizes` — as mesmas funções que a
 * fronteira de divulgação chama. Estes testes provam que os caminhos de recusa
 * canônicos se aplicam por REUSO, não por cópia.
 *
 * Zero rede, zero cliente, zero provedor, zero modelo.
 */

import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  LIVE_ATTEMPT_DEADLINE_SECONDS,
  LIVE_AUTHORIZATION_TTL_SECONDS,
  LIVE_BACKGROUND,
  LIVE_EXECUTION_SPEC_VERSION,
  LIVE_MAX_RETRIES,
  LIVE_TIMEOUT_DERIVATION_POLICY,
  LiveExecutionAuthorization,
  consumeLiveExecutionAuthorization,
  deriveAttemptTimeoutSeconds,
  issueLiveExecutionAuthorization,
  liveExecutionFingerprint,
  monotonicSeconds,
} from "../src/live-execution"
import type { LiveExecutionSpecV1 } from "../src/live-execution"

const EXECUTION_ID = "live-exec-0001"
/** A fonte de produção, para as duas checagens estruturais da r3. */
const D1 = new URL("../src/live-execution.ts", import.meta.url)
function fonteTS(): ts.SourceFile {
  return ts.createSourceFile(
    "live-execution.ts", readFileSync(D1, "utf8"), ts.ScriptTarget.ES2022, true)
}

/**
 * Os tipos literais de `LiveExecutionSpecV1` (`tool_count: 0`, `stream: false`)
 * EXPRIMEM a política aprovada — e por isso o compilador recusa construir a forma
 * não aprovada. Mas um chamador em JavaScript puro passa o que quiser, e é
 * exatamente isso que a conferência de runtime existe para barrar.
 *
 * Uma conversão, aqui, com esta razão. O tipo continua estreito em produção.
 */
function spec(over: Record<string, unknown> = {}): LiveExecutionSpecV1 {
  return {
    spec_version: LIVE_EXECUTION_SPEC_VERSION,
    execution_id: EXECUTION_ID,
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

/**
 * Um `undefined` num literal NÃO remove a chave — o objeto continua tendo a
 * propriedade, e o schema canônico a recusa como forma inválida. A primeira versão
 * destes testes caía em `INVALID_APPROVAL_REQUEST` sem nunca alcançar a regra de
 * ciclo de vida que dizia medir. Chave ausente é ausência; `undefined` é presença.
 */
function semUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}

function pedido(over: Record<string, unknown> = {}, s = spec()) {
  return semUndefined({
    approval_id: "ap-live-0001",
    schema_version: "1.0.0",
    requested_at: "2026-08-28T12:00:00Z",
    requested_by: "HERMES",
    approver: "STEFANO",
    subject_type: "OTHER",
    subject_ref: s.execution_id,
    proposed_action: texto("executar uma chamada viva governada"),
    rationale: texto("perceber, sem agir"),
    supporting_refs: [],
    risk_and_uncertainty: [texto("o modelo pode recusar")],
    status: "DECIDED",
    decision_ref: "dec-live-0001",
    subject_content_hash: liveExecutionFingerprint(s),
    ...over,
  })
}

function decisao(over: Record<string, unknown> = {}) {
  return {
    decision_id: "dec-live-0001",
    schema_version: "1.0.0",
    approval_id: "ap-live-0001",
    decided_by: "STEFANO",
    decision: "APPROVED",
    decided_at: "2026-08-28T12:05:00Z",
    ...over,
  }
}

function emitir(s = spec(), p = pedido({}, s), d: unknown[] = [decisao()]) {
  return issueLiveExecutionAuthorization(s, p, d)
}

/**
 * Protótipos globais como registros opacos. Adulterar intrínsecos é sair do contrato
 * de tipo; passar pelo registro deixa a hostilidade explícita.
 */
type MetodoQualquer = (this: unknown, ...args: unknown[]) => unknown
interface MetodosFracos {
  get: MetodoQualquer
  has: MetodoQualquer
  add: MetodoQualquer
  set: MetodoQualquer
}
function comoRegistro(o: object): MetodosFracos {
  return o as unknown as MetodosFracos
}

/** Duas autorizações AUTÊNTICAS e distintas. Uma aprovação emite uma autorização. */
function autentica(id: string): LiveExecutionAuthorization {
  const s = spec({ execution_id: id })
  const p = pedido({ approval_id: `ap-${id}`, decision_ref: `dec-${id}` }, s)
  const d = [decisao({ decision_id: `dec-${id}`, approval_id: `ap-${id}` })]
  const r = issueLiveExecutionAuthorization(s, p, d)
  if (r.status !== "authorized") throw new Error(`d1 recusou: ${r.defect}`)
  return r.authorization
}

function defeito(r: ReturnType<typeof issueLiveExecutionAuthorization>): string {
  return r.status === "not_authorized" ? r.defect : "AUTORIZOU"
}

describe("D1 — emissão da autorização", () => {
  it("autoriza a execução exata aprovada por Stefano", () => {
    const r = emitir()
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return
    expect(r.authorization).toBeInstanceOf(LiveExecutionAuthorization)
    expect(r.authorization.decision_id).toBe("dec-live-0001")
    expect(r.authorization.execution_fingerprint).toBe(liveExecutionFingerprint(spec()))
    expect(r.authorization.isConsumed).toBe(false)
  })

  it("a id sozinha NÃO autoriza: o hash de conteúdo tem de bater", () => {
    // Stefano aprova UMA execução, não um identificador. Mesma id, X diferente.
    const outro = spec({ read_model_fingerprint: "y".repeat(64) })
    expect(defeito(issueLiveExecutionAuthorization(outro, pedido(), [decisao()])))
      .toBe("EXECUTION_FINGERPRINT_MISMATCH")
  })

  it("SAME-X: trocar o read model invalida a aprovação", () => {
    const s2 = spec({ read_model_fingerprint: "z".repeat(64) })
    expect(defeito(issueLiveExecutionAuthorization(s2, pedido({}, spec()), [decisao()])))
      .toBe("EXECUTION_FINGERPRINT_MISMATCH")
  })

  it("trocar o pedido semântico invalida a aprovação", () => {
    const s2 = spec({ request_fingerprint: "q".repeat(64) })
    expect(defeito(issueLiveExecutionAuthorization(s2, pedido({}, spec()), [decisao()])))
      .toBe("EXECUTION_FINGERPRINT_MISMATCH")
  })

  it.each([
    ["provider", { provider: "outro" }],
    ["model", { model: "outro" }],
    ["api_mode", { api_mode: "outro" }],
    ["sdk_version", { sdk_version: "2.24.1" }],
    ["constitution_hash", { constitution_hash: "0".repeat(64) }],
    ["system_contract_hash", { system_contract_hash: "0".repeat(64) }],
    ["response_policy_id", { response_policy_id: "outra/v2" }],
    ["response_policy_version", { response_policy_version: "2.0.0" }],
    ["runtime_binding", { runtime_binding_fingerprint: "0".repeat(64) }],
  ])("vínculo divergente em %s recusa", (_rotulo, over) => {
    const s2 = spec(over)
    expect(defeito(issueLiveExecutionAuthorization(s2, pedido({}, spec()), [decisao()])))
      .toBe("EXECUTION_FINGERPRINT_MISMATCH")
  })

  it.each([
    ["tools > 0", { tool_count: 1 }],
    ["stream ligado", { stream: true }],
    ["background ligado", { background: true }],
    ["retry permitido", { max_retries: 2 }],
    ["prazo maior", { attempt_deadline_seconds: 600 }],
    ["ttl maior", { authorization_ttl_seconds: 3600 }],
  ])("política de controle divergente (%s) recusa antes de tudo", (_r, over) => {
    const s2 = spec(over)
    expect(defeito(issueLiveExecutionAuthorization(s2, pedido({}, s2), [decisao()])))
      .toBe("SPEC_CONTROL_POLICY_MISMATCH")
  })
})

describe("D1 — a autoridade canônica é REUSADA, não copiada", () => {
  it("pedido RETIRADO recusa", () => {
    expect(defeito(emitir(spec(), pedido({ status: "WITHDRAWN", decision_ref: undefined }))))
      .toBe("REQUEST_WITHDRAWN")
  })

  it("pedido ainda AGUARDANDO recusa", () => {
    expect(
      defeito(emitir(spec(), pedido({ status: "AWAITING_STEFANO_APPROVAL", decision_ref: undefined }))),
    ).toBe("REQUEST_NOT_DECIDED")
  })

  it("decisão de outro que não Stefano recusa (schema canônico)", () => {
    expect(defeito(emitir(spec(), pedido(), [decisao({ decided_by: "HERMES" })])))
      .toBe("MALFORMED_DECISION_CHAIN")
  })

  it("decisão que NÃO autoriza recusa", () => {
    expect(defeito(emitir(spec(), pedido(), [decisao({ decision: "REJECTED" })])))
      .toBe("DECISION_DOES_NOT_AUTHORIZE")
  })

  it("APPROVED_WITH_CHANGES autoriza — a semântica canônica é preservada", () => {
    const r = emitir(spec(), pedido(), [
      decisao({ decision: "APPROVED_WITH_CHANGES", changes: [texto("com ressalva")] }),
    ])
    expect(r.status).toBe("authorized")
  })

  it("decisão SUCEDIDA recusa", () => {
    const nova = decisao({
      decision_id: "dec-live-0002",
      decision: "REJECTED",
      supersedes: "dec-live-0001",
    })
    expect(defeito(emitir(spec(), pedido(), [decisao(), nova]))).toBe("SUPERSEDED_DECISION")
  })

  it("cadeia MALFORMADA recusa", () => {
    // Duas decisões com a mesma id: história corrompida, não aprovação.
    expect(defeito(emitir(spec(), pedido(), [decisao(), decisao()])))
      .toBe("MALFORMED_DECISION_CHAIN")
  })

  it("sem decisão alguma recusa", () => {
    expect(defeito(emitir(spec(), pedido(), []))).toBe("NO_DECISION")
  })

  it("decisão apontada que não é o terminal efetivo recusa", () => {
    const outra = decisao({ decision_id: "dec-live-0009", supersedes: "dec-live-0001" })
    expect(defeito(emitir(spec(), pedido(), [decisao(), outra]))).toBe("SUPERSEDED_DECISION")
  })

  it.each([
    ["assunto de outro tipo", { subject_type: "HERMES_INSIGHT" }],
    ["assunto de outra execução", { subject_ref: "live-exec-9999" }],
  ])("aprovação genérica não cunha capacidade (%s)", (_r, over) => {
    expect(defeito(emitir(spec(), pedido(over)))).toBe("APPROVAL_SUBJECT_MISMATCH")
  })

  it("aprovação sem vínculo de conteúdo recusa", () => {
    expect(defeito(emitir(spec(), pedido({ subject_content_hash: undefined }))))
      .toBe("APPROVAL_MISSING_CONTENT_BINDING")
  })

  it.each([
    ["não é objeto", null],
    ["campo desconhecido", { ...pedido(), invadido: true }],
    ["approver não é Stefano", { ...pedido(), approver: "HERMES" }],
  ])("pedido não canônico recusa (%s)", (_r, cru) => {
    expect(defeito(issueLiveExecutionAuthorization(spec(), cru, [decisao()])))
      .toBe("INVALID_APPROVAL_REQUEST")
  })
})

describe("D1 — a capacidade não é forjável nem serializável", () => {
  it("um objeto de mesma FORMA não é autorização", () => {
    const falsa = {
      spec: spec(),
      execution_fingerprint: liveExecutionFingerprint(spec()),
      decision_id: "dec-live-0001",
      issued_at_monotonic: 0,
      isConsumed: false,
      _consumeOnce: () => true,
    }
    expect(consumeLiveExecutionAuthorization(falsa).status).toBe("refused")
  })

  it("Object.create sobre o protótipo não é autorização", () => {
    const forjada: unknown = Object.create(LiveExecutionAuthorization.prototype) as unknown
    const r = consumeLiveExecutionAuthorization(forjada)
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("AUTHORIZATION_NOT_OWNED")
  })

  it("o construtor público recusa sem o selo do módulo", () => {
    expect(
      () =>
        new (LiveExecutionAuthorization as unknown as new (...a: unknown[]) => unknown)(
          Symbol("falso"), spec(), "f", "d", 0,
        ),
    ).toThrow(/NOT_OWNED/)
  })

  it("serializar uma autorização é RECUSADO", () => {
    const r = emitir()
    if (r.status !== "authorized") throw new Error("não autorizou")
    expect(() => JSON.stringify(r.authorization)).toThrow(/NOT_SERIALIZABLE/)
  })

  it("a visão de auditoria é só primitivo governado, e não volta como autoridade", () => {
    const r = emitir()
    if (r.status !== "authorized") throw new Error("não autorizou")
    const v = r.authorization.safeAuditView()
    for (const valor of Object.values(v)) {
      expect(["string", "number", "boolean"]).toContain(typeof valor)
    }
    expect(consumeLiveExecutionAuthorization(v).status).toBe("refused")
  })
})

describe("D1 — uso único e prazo", () => {
  it("consome uma vez; a segunda é recusada", () => {
    const r = emitir()
    if (r.status !== "authorized") throw new Error("não autorizou")
    const a = consumeLiveExecutionAuthorization(r.authorization)
    expect(a.status).toBe("consumed")
    const b = consumeLiveExecutionAuthorization(r.authorization)
    expect(b.status).toBe("refused")
    if (b.status === "refused") expect(b.defect).toBe("AUTHORIZATION_ALREADY_CONSUMED")
    expect(r.authorization.isConsumed).toBe(true)
  })

  it("uso duplo CONCORRENTE: exatamente um vencedor", async () => {
    const r = emitir()
    if (r.status !== "authorized") throw new Error("não autorizou")
    const tentativas = await Promise.all(
      Array.from({ length: 32 }, () =>
        Promise.resolve().then(() => consumeLiveExecutionAuthorization(r.authorization)),
      ),
    )
    expect(tentativas.filter((t) => t.status === "consumed")).toHaveLength(1)
    expect(tentativas.filter((t) => t.status === "refused")).toHaveLength(31)
  })

  it("expira em 300 s, e expirada não revive", () => {
    const r = emitir()
    if (r.status !== "authorized") throw new Error("não autorizou")
    const nascimento = r.authorization.issued_at_monotonic
    const tarde = consumeLiveExecutionAuthorization(r.authorization, nascimento + 300)
    expect(tarde.status).toBe("refused")
    if (tarde.status === "refused") expect(tarde.defect).toBe("AUTHORIZATION_EXPIRED")
    // Dentro da janela ainda vale: a fronteira é `>= 300`, não `> 300`.
    const r2 = emitir()
    if (r2.status !== "authorized") throw new Error("não autorizou")
    expect(
      consumeLiveExecutionAuthorization(r2.authorization, r2.authorization.issued_at_monotonic + 299.9).status,
    ).toBe("consumed")
  })

  it("o consumo devolve prazo TOTAL monotônico de 180 s", () => {
    const r = emitir()
    if (r.status !== "authorized") throw new Error("não autorizou")
    const c = consumeLiveExecutionAuthorization(r.authorization, 1000)
    expect(c.status).toBe("consumed")
    if (c.status === "consumed") expect(c.attempt_deadline_monotonic).toBe(1180)
  })
})

describe("D1 — derivação do timeout", () => {
  it("devolve o restante, e nunca mais que o máximo aprovado", () => {
    const d = deriveAttemptTimeoutSeconds(1180, 1000)
    expect(d).toEqual({ status: "ok", timeout_seconds: 180 })
    expect(deriveAttemptTimeoutSeconds(1180, 1100)).toEqual({ status: "ok", timeout_seconds: 80 })
  })

  it.each([
    ["prazo vencido", 1000, 1000],
    ["prazo passado", 1000, 1001],
    ["restante maior que o máximo (relógio inconsistente)", 2000, 1000],
    ["não finito", Number.POSITIVE_INFINITY, 1000],
    ["NaN", Number.NaN, 1000],
  ])("recusa quando %s", (_r, prazo, agora) => {
    expect(deriveAttemptTimeoutSeconds(prazo, agora).status).toBe("expired")
  })

  it("nenhum timeout vem do chamador: a assinatura não o aceita", () => {
    // Dois parâmetros, e os dois são relógio — não há entrada de duração.
    expect(deriveAttemptTimeoutSeconds.length).toBe(1)
  })
})

describe("D1 — o relógio é MONOTÔNICO, não de parede", () => {
  it("o valor não é epoch: `Date.now()` seria ~1.8e9", () => {
    // `hrtime.bigint()` conta desde um ponto arbitrário do processo/boot — ordem de
    // grandeza de segundos a dias. `Date.now()/1000` é ~1.8e9. A diferença é
    // observável, e é o que separa "monotônico" de "anda para trás com ajuste de
    // hora". Uma capacidade que expira por relógio de parede se ESTENDE quando o
    // relógio recua.
    const m = monotonicSeconds()
    expect(m).toBeGreaterThan(0)
    expect(m).toBeLessThan(1e8)
    expect(Date.now() / 1000).toBeGreaterThan(1e9)
  })

  it("avança, e nunca retrocede entre leituras", () => {
    const leituras = Array.from({ length: 64 }, () => monotonicSeconds())
    for (let i = 1; i < leituras.length; i += 1) {
      expect(leituras[i]).toBeGreaterThanOrEqual(leituras[i - 1] as number)
    }
  })

  it("o módulo de produção não usa `Date.now`", () => {
    const fonte = readFileSync(
      new URL("../src/live-execution.ts", import.meta.url),
      "utf8",
    )
    // Sem a prosa que explica por que não se usa. Filtrar por PREFIXO de linha não
    // pega `/** ... */` numa linha só — a primeira versão deste teste caiu nisso.
    // Remove-se o bloco inteiro, e depois o comentário de linha.
    const executavel = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
    expect(executavel).not.toContain("Date.now")
    // Controle positivo: a prosa NOMEIA o que proíbe.
    expect(fonte).toContain("Date.now")
  })
})

describe("D1 — constantes governadas", () => {
  it("os limites são exatamente os aprovados", () => {
    expect(LIVE_ATTEMPT_DEADLINE_SECONDS).toBe(180)
    expect(LIVE_AUTHORIZATION_TTL_SECONDS).toBe(300)
    expect(LIVE_MAX_RETRIES).toBe(0)
    expect(LIVE_BACKGROUND).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3.1d-D1-R1 — identidade entre spec selada e fingerprint aprovado
//
// O regate do Codex parou por crédito antes do veredito, mas deixou uma linha:
// o selo prova a ORIGEM do objeto, e faltava provar que a spec ARMAZENADA é o mesmo
// material de execução cujo fingerprint foi aprovado. A d1 fazia
// `fingerprint(objeto do chamador)` e depois `Object.freeze({...spec})` — uma cópia
// INDEPENDENTE. Equivalente enquanto todos os campos forem primitivos; e essa é uma
// propriedade acidental da forma atual, não uma garantia da construção.
// ═════════════════════════════════════════════════════════════════════════════

describe("3.1d-D1-R1 identidade spec selada / fingerprint aprovado", () => {
  it("R1-primária: fingerprint(auth.spec) == auth.execution_fingerprint == subject_content_hash", () => {
    const s = spec()
    const p = pedido({}, s)
    const r = issueLiveExecutionAuthorization(s, p, [decisao()])
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return
    const auth = r.authorization

    expect(liveExecutionFingerprint(auth.spec)).toBe(auth.execution_fingerprint)
    expect(auth.execution_fingerprint).toBe(p.subject_content_hash)
    expect(liveExecutionFingerprint(auth.spec)).toBe(p.subject_content_hash)
  })

  it("a spec do chamador não é a autoridade: mutá-la depois não altera a autorização", () => {
    const s = spec() as unknown as Record<string, unknown>
    const p = pedido({}, s as unknown as LiveExecutionSpecV1)
    const r = issueLiveExecutionAuthorization(s, p, [decisao()])
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return
    const auth = r.authorization
    const antes = auth.execution_fingerprint

    s.model = "modelo-trocado-depois"
    s.constitution_hash = "0".repeat(64)

    expect(auth.spec.model).toBe("gpt-5.6-luna")
    expect(auth.execution_fingerprint).toBe(antes)
    expect(liveExecutionFingerprint(auth.spec)).toBe(antes)
  })

  it("getter instável: a spec aprovada e a armazenada não podem divergir", () => {
    // A prova mais forte disponível SEM inventar campo de produção. Com a ordem
    // antiga — fingerprint sobre o objeto do chamador, cópia depois — a segunda
    // leitura entrega outro valor, e o fingerprint aprovado deixa de descrever a
    // spec selada. Com o instantâneo próprio ANTES, só existe uma leitura.
    let leituras = 0
    const base = spec() as unknown as Record<string, unknown>
    const instavel: Record<string, unknown> = {}
    for (const k of Object.keys(base)) {
      if (k === "model") continue
      instavel[k] = base[k]
    }
    Object.defineProperty(instavel, "model", {
      enumerable: true,
      configurable: true,
      get() {
        leituras += 1
        return leituras === 1 ? "gpt-5.6-luna" : `modelo-mutante-${leituras}`
      },
    })

    // O hash aprovado é o da PRIMEIRA leitura — a spec que Stefano viu.
    const aprovado = liveExecutionFingerprint(spec())
    const r = issueLiveExecutionAuthorization(instavel, pedido({ subject_content_hash: aprovado }), [
      decisao(),
    ])

    // Desfecho ÚNICO exigido. Aceitar "ou autoriza ou recusa" não mediria nada: as
    // duas ordens passariam. O instantâneo próprio lê `model` UMA vez — a primeira,
    // que é a leitura aprovada — então a emissão TEM de autorizar, com a spec exata.
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return
    expect(r.authorization.spec.model).toBe("gpt-5.6-luna")
    expect(r.authorization.execution_fingerprint).toBe(aprovado)
    expect(liveExecutionFingerprint(r.authorization.spec)).toBe(aprovado)
    expect(leituras).toBe(1)
  })

  it("a spec armazenada é congelada em profundidade e não aceita escrita", () => {
    const s = spec()
    const r = issueLiveExecutionAuthorization(s, pedido({}, s), [decisao()])
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return
    const alvo = r.authorization.spec as unknown as Record<string, unknown>
    expect(Object.isFrozen(alvo)).toBe(true)
    expect(() => {
      "use strict"
      alvo.model = "escrita-proibida"
    }).toThrow()
    expect(r.authorization.spec.model).toBe("gpt-5.6-luna")
  })

  it("chave desconhecida na spec é erro, nunca campo ignorado em silêncio", () => {
    const s = spec() as unknown as Record<string, unknown>
    s.campo_nao_governado = "contrabando"
    const r = issueLiveExecutionAuthorization(s, pedido(), [decisao()])
    expect(r.status).toBe("not_authorized")
    if (r.status !== "not_authorized") return
    expect(r.defect).toBe("SPEC_NOT_OWNED_SNAPSHOT")
  })

  it("o construtor recusa spec que não seja instantâneo próprio deste módulo", () => {
    const s = spec()
    expect(
      () =>
        new (LiveExecutionAuthorization as unknown as new (...a: unknown[]) => unknown)(
          Symbol("falso"),
          s,
          liveExecutionFingerprint(s),
          "dec-live-0001",
          monotonicSeconds(),
        ),
    ).toThrow(/LIVE_AUTHORIZATION_NOT_OWNED/)
  })

  it("o uso único e o prazo continuam intactos após a r1", () => {
    const s = spec()
    const r = issueLiveExecutionAuthorization(s, pedido({}, s), [decisao()])
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return
    const auth = r.authorization
    expect(auth.isConsumed).toBe(false)
    const um = consumeLiveExecutionAuthorization(auth)
    expect(um.status).toBe("consumed")
    const dois = consumeLiveExecutionAuthorization(auth)
    expect(dois.status).toBe("refused")
    expect(() => auth.toJSON()).toThrow(/LIVE_AUTHORIZATION_NOT_SERIALIZABLE/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3.1d-D1-R2 — o invariante "nenhuma representação posterior", com regressão
//
// O regate do Codex achou que a r1 classificara a mutação deste ponto como guarda
// inalcançável, e que isso estava errado: `this.spec = spec` executa em TODA emissão
// bem-sucedida. O invariante exigido ficara sem proteção de regressão.
// ═════════════════════════════════════════════════════════════════════════════

describe("3.1d-D1-R2 nenhuma representação posterior da spec", () => {
  it("a spec armazenada é um instantâneo próprio, não o objeto do chamador", () => {
    const chamador = spec() as unknown as Record<string, unknown>
    const r = issueLiveExecutionAuthorization(
      chamador,
      pedido({}, chamador as unknown as LiveExecutionSpecV1),
      [decisao()],
    )
    expect(r.status).toBe("authorized")
    if (r.status !== "authorized") return

    // Não é a referência do chamador…
    expect(r.authorization.spec as unknown).not.toBe(chamador)
    // …e é congelada, com o mesmo conteúdo governado.
    expect(Object.isFrozen(r.authorization.spec)).toBe(true)
    expect(r.authorization.spec.execution_id).toBe(EXECUTION_ID)
  })

  it("cada emissão possui o SEU instantâneo — nenhum é compartilhado", () => {
    const a = spec()
    const b = spec()
    const ra = issueLiveExecutionAuthorization(a, pedido({}, a), [decisao()])
    const rb = issueLiveExecutionAuthorization(b, pedido({}, b), [decisao()])
    expect(ra.status).toBe("authorized")
    expect(rb.status).toBe("authorized")
    if (ra.status !== "authorized" || rb.status !== "authorized") return

    expect(ra.authorization.spec).not.toBe(rb.authorization.spec)
    // Conteúdo idêntico, fingerprint idêntico, objetos distintos.
    expect(ra.authorization.execution_fingerprint).toBe(rb.authorization.execution_fingerprint)
  })

  it("a identidade sobrevive a toda a cadeia: aprovado == selado == derivado do armazenado", () => {
    // O invariante primário da r1, reafirmado depois do invariante pós-atribuição da
    // r2. Se um clone posterior entrar, o construtor recusa e este teste cai.
    for (const id of ["live-exec-0001", "live-exec-0002", "live-exec-0003"]) {
      const s = spec({ execution_id: id })
      const p = pedido({ subject_ref: id }, s)
      const r = issueLiveExecutionAuthorization(s, p, [decisao()])
      expect(r.status).toBe("authorized")
      if (r.status !== "authorized") continue
      expect(r.authorization.execution_fingerprint).toBe(p.subject_content_hash)
      expect(liveExecutionFingerprint(r.authorization.spec)).toBe(p.subject_content_hash)
      expect(r.authorization.spec.execution_id).toBe(id)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// D1-R3 — autoridade em campos privados de linguagem
// ═════════════════════════════════════════════════════════════════════════════
//
// A d2b/d2c pagaram quatro rodadas para fechar a classe "autoridade por despacho
// mutável". Este bloco prova que o módulo que guarda a autoridade de STEFANO — não a
// reserva, não a costura — está fechado pela mesma construção.

describe("D1-R3 a autoridade não mora em nada que o detentor possa reescrever", () => {
  it("R3 campos públicos de A reescritos com os de B: nenhum efeito", () => {
    const A = autentica("live-exec-000a")
    const B = autentica("live-exec-000b")
    for (const campo of ["spec", "execution_fingerprint", "decision_id",
                         "issued_at_monotonic"] as const) {
      Object.defineProperty(A, campo,
        { configurable: true, value: (B as unknown as Record<string, unknown>)[campo] })
    }
    const c = consumeLiveExecutionAuthorization(A, monotonicSeconds())
    expect(c.status).toBe("consumed")
    if (c.status === "consumed") {
      // O fingerprint entregue é o de A, não o de B.
      expect(c.execution_fingerprint)
        .toBe(liveExecutionFingerprint(spec({ execution_id: "live-exec-000a" })))
      expect(c.execution_fingerprint).not.toBe(B.execution_fingerprint)
    }
    // B intacta e independente.
    expect(B.isConsumed).toBe(false)
    expect(consumeLiveExecutionAuthorization(B, monotonicSeconds()).status)
      .toBe("consumed")
  })

  it("R3 `_consumeOnce` religado a B nunca é invocado e não queima B", () => {
    const A = autentica("live-exec-000c")
    const B = autentica("live-exec-000d")
    let invocada = false
    Object.defineProperty(A, "_consumeOnce", {
      configurable: true, writable: true,
      value: () => { invocada = true; return true },
    })
    expect(consumeLiveExecutionAuthorization(A, monotonicSeconds()).status)
      .toBe("consumed")
    expect(invocada, "a produção chamou o método do detentor").toBe(false)
    expect(B.isConsumed).toBe(false)
    expect(consumeLiveExecutionAuthorization(B, monotonicSeconds()).status)
      .toBe("consumed")
  })

  it("R3 `_consumeOnce = () => true` não permite segundo consumo", () => {
    const A = autentica("live-exec-000e")
    Object.defineProperty(A, "_consumeOnce", {
      configurable: true, writable: true, value: () => true,
    })
    expect(consumeLiveExecutionAuthorization(A, monotonicSeconds()).status)
      .toBe("consumed")
    const dois = consumeLiveExecutionAuthorization(A, monotonicSeconds())
    expect(dois.status).toBe("refused")
    if (dois.status === "refused") expect(dois.defect).toBe("AUTHORIZATION_ALREADY_CONSUMED")
  })

  it("R3 `_consumeOnce` não existe mais no protótipo", () => {
    expect("_consumeOnce" in LiveExecutionAuthorization.prototype).toBe(false)
  })

  it("R3 patch em WeakMap/WeakSet.prototype não redireciona A para B", () => {
    const A = autentica("live-exec-000f")
    const B = autentica("live-exec-000g")
    const wm = comoRegistro(WeakMap.prototype)
    const ws = comoRegistro(WeakSet.prototype)
    const oGet = wm.get
    const oSHas = ws.has
    const oSAdd = ws.add
    let c1: ReturnType<typeof consumeLiveExecutionAuthorization>
    let c2: ReturnType<typeof consumeLiveExecutionAuthorization>
    const agora = monotonicSeconds()
    try {
      wm.get = function (this: unknown, k: unknown) {
        return oGet.call(this, k === A ? B : k)
      }
      ws.has = () => false // "nunca emitida" e "nunca consumida"
      ws.add = function (this: unknown) {
        return this
      }
      c1 = consumeLiveExecutionAuthorization(A, agora)
      c2 = consumeLiveExecutionAuthorization(A, agora)
    } finally {
      wm.get = oGet
      ws.has = oSHas
      ws.add = oSAdd
    }
    expect(c1.status).toBe("consumed")
    if (c1.status === "consumed") {
      expect(c1.execution_fingerprint)
        .toBe(liveExecutionFingerprint(spec({ execution_id: "live-exec-000f" })))
    }
    expect(c2.status).toBe("refused")
    expect(B.isConsumed).toBe(false)
    expect(consumeLiveExecutionAuthorization(B, monotonicSeconds()).status)
      .toBe("consumed")
  })

  it("R3 `Symbol.hasInstance` forjado não cria autorização", () => {
    const impostor = { spec: spec(), execution_fingerprint: "f".repeat(64) }
    const desc = Object.getOwnPropertyDescriptor(
      LiveExecutionAuthorization, Symbol.hasInstance)
    try {
      Object.defineProperty(LiveExecutionAuthorization, Symbol.hasInstance, {
        configurable: true, value: () => true,
      })
      expect(impostor instanceof LiveExecutionAuthorization).toBe(true)
      const r = consumeLiveExecutionAuthorization(impostor, monotonicSeconds())
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("AUTHORIZATION_NOT_OWNED")
    } finally {
      if (desc === undefined) {
        delete (LiveExecutionAuthorization as unknown as Record<symbol, unknown>)[
          Symbol.hasInstance]
      } else {
        Object.defineProperty(LiveExecutionAuthorization, Symbol.hasInstance, desc)
      }
    }
  })

  it("R3 patch em Object.freeze não deixa a spec aprovada mutável", () => {
    // O caminho concreto: `auth.spec` é PÚBLICA. Se o congelamento não valer, o
    // detentor muda `model` DEPOIS de Stefano ter aprovado outro fingerprint.
    const original = Object.freeze
    let A: LiveExecutionAuthorization
    try {
      Object.defineProperty(Object, "freeze", {
        configurable: true, writable: true, value: (o: unknown) => o, // não congela
      })
      A = autentica("live-exec-000h")
    } finally {
      Object.defineProperty(Object, "freeze", {
        configurable: true, writable: true, value: original,
      })
    }
    expect(Object.isFrozen(A.spec), "a spec aprovada ficou mutável").toBe(true)
    const modeloAprovado = A.spec.model
    try {
      (A.spec as unknown as Record<string, unknown>).model = "modelo-do-atacante"
    } catch {
      // modo estrito lança; o que importa é o valor não mudar
    }
    expect(A.spec.model).toBe(modeloAprovado)
    const c = consumeLiveExecutionAuthorization(A, monotonicSeconds())
    expect(c.status).toBe("consumed")
    if (c.status === "consumed") {
      expect(c.execution_fingerprint)
        .toBe(liveExecutionFingerprint(spec({ execution_id: "live-exec-000h" })))
    }
  })

  it("R3 TTL vem da EMISSÃO: mutar `issued_at_monotonic` não estende", () => {
    const agora = monotonicSeconds()
    const A = autentica("live-exec-000i")
    // Empurra o instante de emissão para o futuro: se o TTL lesse o campo público,
    // uma autorização expirada voltaria a valer.
    Object.defineProperty(A, "issued_at_monotonic", { configurable: true, value: agora })
    const r = consumeLiveExecutionAuthorization(
      A, agora + LIVE_AUTHORIZATION_TTL_SECONDS + 1)
    expect(r.status).toBe("refused")
    if (r.status === "refused") expect(r.defect).toBe("AUTHORIZATION_EXPIRED")
    // E expirada NÃO é consumida: a segunda tentativa segue dizendo EXPIRED, não USED.
    const dois = consumeLiveExecutionAuthorization(
      A, agora + LIVE_AUTHORIZATION_TTL_SECONDS + 2)
    expect(dois.status).toBe("refused")
    if (dois.status === "refused") expect(dois.defect).toBe("AUTHORIZATION_EXPIRED")
  })

  it("R3 a auditoria vem da EMISSÃO, não dos campos públicos", () => {
    const A = autentica("live-exec-000j")
    Object.defineProperty(A, "decision_id", { configurable: true, value: "dec-forjada" })
    expect(A.safeAuditView().decision_id).toBe("dec-live-exec-000j")
  })

  it("R3 objeto simples, de mesma forma ou de protótipo não é autorização", () => {
    const s = spec()
    const forjadas: unknown[] = [
      { spec: s, execution_fingerprint: liveExecutionFingerprint(s),
        decision_id: "dec-live-0001", issued_at_monotonic: monotonicSeconds(),
        isConsumed: false, _consumeOnce: () => true },
      Object.create(LiveExecutionAuthorization.prototype),
      JSON.parse(JSON.stringify(autentica("live-exec-000k").safeAuditView())),
      null,
      "nao-sou-autorizacao",
    ]
    for (const f of forjadas) {
      const r = consumeLiveExecutionAuthorization(f, monotonicSeconds())
      expect(r.status).toBe("refused")
      if (r.status === "refused") expect(r.defect).toBe("AUTHORIZATION_NOT_OWNED")
    }
  })

  it("R3 nenhum export desfaz, reseta, clona ou reemite autorização", async () => {
    const mod = await import("../src/live-execution")
    expect(Object.keys(mod).filter((k) =>
      /unconsume|reset|clear|release|clone|reissue|restore|revive|deserialize/i.test(k)))
      .toEqual([])
  })

  it("R3 fonte: o selo NUNCA é passado para código do chamador", () => {
    // ESTRUTURAL, via AST. A primeira versão desta checagem era uma regex e ela
    // acusou a PROSA que explica por que o padrão saiu — o mesmo falso positivo que
    // esta fase já pagou dez vezes. Nomes CHAMADOS, nunca texto.
    const src = fonteTS()
    const passagens: string[] = []
    const anda = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const recebeSelo = n.arguments.some(
          (a) => ts.isIdentifier(a) && a.text === "SELO")
        // `new LiveExecutionAuthorization(SELO, …)` é o construtor do módulo e é
        // legítimo; o proibido é entregar o selo a um MÉTODO de objeto, que o
        // detentor pode substituir.
        if (recebeSelo && ts.isPropertyAccessExpression(n.expression)) {
          passagens.push(n.expression.name.text)
        }
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(passagens, "selo entregue a método de objeto").toEqual([])
  })

  it("R3 fonte: a emissão não vem do retorno de uma função", () => {
    const src = fonteTS()
    let fragil = 0
    const anda = (n: ts.Node): void => {
      if (ts.isBinaryExpression(n) &&
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(n.left) &&
          n.left.name.getText(src) === "#emissao" &&
          ts.isCallExpression(n.right)) {
        fragil++
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(fragil, "#emissao recebe o retorno de uma chamada").toBe(0)
  })
})
