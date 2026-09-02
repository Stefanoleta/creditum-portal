/**
 * D2B-EV2 — VERIFICADOR MÍNIMO DE EVIDÊNCIA.
 *
 * ─── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * A bancada r1–r9 encontrou defeitos reais de produção — lavagem de fsync, symlink
 * atravessando a raiz, durabilidade do pai — e depois passou a gastar rodadas
 * auditando a própria auditoria. Cada correção do medidor revelava outra camada do
 * medidor. Isso deixou de pagar.
 *
 * Este arquivo NÃO é um framework. São treze perguntas de segurança sobre a d2b, cada
 * uma respondida por evidência direta e determinística: comportamento observado em
 * teste, ou uma asserção pequena de AST sobre a fonte de produção. Sem mutação, sem
 * oráculo, sem classificação, sem contagem.
 *
 * A produção está CONGELADA. Nada aqui a modifica.
 */

import { spawn } from "node:child_process"
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import ts from "typescript"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** Injeção de falha de `fsync`, só neste arquivo. Alvo identificado pelo caminho. */
const falha: { alvo: null | "registro" | "dirChave" | "attempts" | "raiz"; raiz: string } = {
  alvo: null,
  raiz: "",
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>()
  const ehAlvo = (c: string): boolean => {
    switch (falha.alvo) {
      case "registro": return c.endsWith("reservation.json")
      case "dirChave": return /\/attempts\/[0-9a-f]{64}$/.test(c)
      case "attempts": return c.endsWith("/attempts")
      case "raiz": return c === falha.raiz
      default: return false
    }
  }
  return {
    ...real,
    open: async (caminho: string, ...resto: unknown[]) => {
      const h = await (real.open as unknown as (...a: unknown[]) => Promise<
        Awaited<ReturnType<typeof real.open>>
      >)(caminho, ...resto)
      if (!ehAlvo(String(caminho))) return h
      return new Proxy(h, {
        get(alvo, prop, rec) {
          if (prop === "sync") {
            return () => {
              const e = new Error("falha de durabilidade injetada") as Error & { code: string }
              e.code = "EIO"
              return Promise.reject(e)
            }
          }
          return Reflect.get(alvo, prop, rec) as unknown
        },
      })

    },
  }
})

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

const {
  PRODUCTION_EXECUTION_LEDGER_ROOT, classifyExecutionAttempt, executionKey,
  recordExecutionTerminal,
} = await import("../src/execution-ledger")
const {
  LIVE_ATTEMPT_DEADLINE_SECONDS, LIVE_AUTHORIZATION_TTL_SECONDS,
  LIVE_EXECUTION_SPEC_VERSION, LIVE_TIMEOUT_DERIVATION_POLICY,
  issueLiveExecutionAuthorization, liveExecutionFingerprint,
} = await import("../src/live-execution")
const {
  ReservedExecutionAttempt, consumeReservedExecutionAttempt, prepareGovernedExecution,
} = await import("../src/execution-supervisor")
type Spec = import("../src/live-execution").LiveExecutionSpecV1

const SUP = join(__dirname, "..", "src", "execution-supervisor.ts")
const LED = join(__dirname, "..", "src", "execution-ledger.ts")
const ID = "ev2-exec-0001"

let RAIZ: string
beforeEach(() => {
  est.raiz = ""
  est.relogio = null
  RAIZ = mkdtempSync(join(tmpdir(), "creditum-ev2-"))
  falha.alvo = null
  falha.raiz = RAIZ
})
afterEach(() => rmSync(RAIZ, { recursive: true, force: true }))

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
const txt = (content: string) => ({ untrusted: true as const, content })
function pedido(s: Spec) {
  return {
    approval_id: "ap-ev2", schema_version: "1.0.0", requested_at: "2026-09-01T12:00:00Z",
    requested_by: "HERMES", approver: "STEFANO", subject_type: "OTHER",
    subject_ref: s.execution_id, proposed_action: txt("executar uma chamada viva governada"),
    rationale: txt("perceber, sem agir"), supporting_refs: [],
    risk_and_uncertainty: [txt("o modelo pode recusar")], status: "DECIDED",
    decision_ref: "dec-ev2", subject_content_hash: liveExecutionFingerprint(s),
  }
}
const decisao = () => ({
  decision_id: "dec-ev2", schema_version: "1.0.0", approval_id: "ap-ev2",
  decided_by: "STEFANO", decision: "APPROVED", decided_at: "2026-09-01T12:05:00Z",
})
function autorizacao(s: Spec = spec()) {
  const r = issueLiveExecutionAuthorization(s, pedido(s), [decisao()])
  if (r.status !== "authorized") throw new Error(`d1 recusou: ${r.defect}`)
  return r.authorization
}

/** AST: declarações de topo do módulo, com marca de export. */
function fonte(caminho: string) {
  return ts.createSourceFile(caminho, readFileSync(caminho, "utf8"), ts.ScriptTarget.ES2022, true)
}
function chamadasEm(no: ts.Node): string[] {
  const out: string[] = []
  const anda = (n: ts.Node): void => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const e = n.expression
      const nome = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null
      if (nome !== null) out.push(nome)
    }
    ts.forEachChild(n, anda)
  }
  anda(no)
  return out
}

describe("EV2-01 a autoridade d1 é consumida antes de qualquer IO do livro-razão", () => {
  it("EV2-01 fonte: o consumo aparece antes do primeiro `await` do preparador", () => {
    const src = fonte(SUP)
    let fn: ts.FunctionDeclaration | undefined
    ts.forEachChild(src, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.text === "prepareGovernedExecution") fn = n
    })
    expect(fn, "prepareGovernedExecution não encontrada").toBeDefined()
    let posConsumo = -1
    let posPrimeiroAwait = -1
    const anda = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
          n.expression.text === "consumeLiveExecutionAuthorization" && posConsumo < 0) {
        posConsumo = n.getStart(src)
      }
      if (ts.isAwaitExpression(n) && posPrimeiroAwait < 0) posPrimeiroAwait = n.getStart(src)
      ts.forEachChild(n, anda)
    }
    anda(fn!.body!)
    expect(posConsumo).toBeGreaterThan(-1)
    expect(posPrimeiroAwait).toBeGreaterThan(-1)
    expect(posConsumo).toBeLessThan(posPrimeiroAwait)
  })

  it("EV2-01 runtime: autorização forjada não escreve nada no livro-razão", async () => {
    const s = spec()
    const falsa = {
      spec: s, execution_fingerprint: liveExecutionFingerprint(s), decision_id: "dec-ev2",
      issued_at_monotonic: 0, isConsumed: false, _consumeOnce: () => true,
    }
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(falsa))
    expect(r.status).toBe("refused")
    expect(readdirSync(RAIZ)).toEqual([])
  })
})

describe("EV2-02 um execution_id nunca rende duas capacidades", () => {
  it("EV2-02 duas autorizações legítimas para o mesmo id → um vencedor", async () => {
    const a = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    const b = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect([a, b].filter((x) => x.status === "reserved").length).toBe(1)
  })

  it("EV2-02 dezesseis concorrentes no mesmo id → um vencedor", async () => {
    const rs = await Promise.all(
      Array.from({ length: 16 }, () => (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))),
    )
    expect(rs.filter((r) => r.status === "reserved").length).toBe(1)
  })

  it("EV2-02 mesmo id com fingerprint diferente é recusado", async () => {
    await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    const outra = spec({ model: "gpt-5.6-outro" })
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao(outra)))
    expect(r.status).toBe("refused")
  })
})

describe("EV2-03 a reserva é um mkdir atômico não-recursivo", () => {
  it("EV2-03 fonte: o mkdir do diretório da chave não usa `recursive`", () => {
    const src = fonte(LED)
    let achou = false
    const anda = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
          n.expression.text === "mkdir" && n.arguments.length >= 1) {
        const primeiro = n.arguments.at(0)
        if (primeiro !== undefined && primeiro.getText(src).includes("dirTentativa")) {
          achou = true
          expect(n.arguments.length, "mkdir da chave recebeu opções").toBe(1)
        }
      }
      ts.forEachChild(n, anda)
    }
    anda(src)
    expect(achou, "mkdir(dirTentativa) não encontrado").toBe(true)
  })

  it("EV2-03 oito processos concorrentes disputando o mesmo mkdir → um vencedor", () => {
    const script = join(RAIZ, "corrida.mjs")
    writeFileSync(script,
      `import { mkdirSync, existsSync } from "node:fs"
const [, , alvo, barreira] = process.argv
while (!existsSync(barreira)) {}
try { mkdirSync(alvo); process.stdout.write("WON") }
catch (e) { process.stdout.write(e.code === "EEXIST" ? "LOST" : "ERR") }
`, "utf8")
    const alvo = join(RAIZ, "attempts", executionKey(ID))
    const barreira = join(RAIZ, "LARGADA")
    mkdirSync(join(RAIZ, "attempts"), { recursive: true })
    const filhos = Array.from({ length: 8 }, () =>
      spawn(process.execPath, [script, alvo, barreira],
            { stdio: ["ignore", "pipe", "ignore"] }))
    const saidas = filhos.map((f) => new Promise<string>((res) => {
      let b = ""
      const saida = f.stdout
      if (saida === null) {
        res("SEM_STDOUT")
        return
      }
      saida.on("data", (d: Buffer) => (b += d.toString()))
      f.on("close", () => res(b.trim()))
    }))
    writeFileSync(barreira, "vai", "utf8")
    return Promise.all(saidas).then((rs) => {
      expect(rs.filter((s) => s === "WON").length).toBe(1)
      expect(rs.filter((s) => s === "LOST").length).toBe(7)
    })
  })
})

describe("EV2-04 diretório existente queima o id para sempre", () => {
  it("EV2-04 sem registro nenhum", async () => {
    mkdirSync(join(RAIZ, "attempts", executionKey(ID)), { recursive: true })
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
  })
  it("EV2-04 registro malformado", async () => {
    const d = join(RAIZ, "attempts", executionKey(ID))
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, "reservation.json"), "{ não é json", "utf8")
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
  })
  it("EV2-04 terminal antigo não libera o id", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    await recordExecutionTerminal(join(RAIZ, "attempts", r.attempt.execution_key), ID,
      r.attempt.execution_fingerprint, "COMPLETED_ACCEPTED", "2019-01-01T00:00:00Z", 1)
    expect(await classifyExecutionAttempt(RAIZ, ID)).toBe("TERMINAL")
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
  })
})

describe("EV2-05 produção não tem caminho para liberar um id queimado", () => {
  const DESTRUTIVAS = new Set([
    "rm", "rmSync", "rmdir", "rmdirSync", "unlink", "unlinkSync",
    "rename", "renameSync", "truncate", "truncateSync", "ftruncate",
  ])
  it("EV2-05 nenhuma chamada destrutiva no livro-razão nem no supervisor", () => {
    for (const arq of [LED, SUP]) {
      const achadas = chamadasEm(fonte(arq)).filter((c) => DESTRUTIVAS.has(c))
      expect(achadas, `${arq}: chamada destrutiva`).toEqual([])
    }
  })
  it("EV2-05 nenhum export de apagar/liberar/resetar/repetir", async () => {
    const led = await import("../src/execution-ledger")
    const sup = await import("../src/execution-supervisor")
    for (const n of ["deleteReservation", "releaseReservation", "unreserve",
                     "resetExecution", "retryExecution", "clearAttempt", "rollback"]) {
      expect(Object.keys(led)).not.toContain(n)
      expect(Object.keys(sup)).not.toContain(n)
    }
  })
})

describe("EV2-06 a ordem da cadeia de durabilidade", () => {
  it("EV2-06 fonte: validações e fsyncs na ordem exigida, antes do mkdir da chave", () => {
    const src = fonte(LED)
    const txtSrc = src.getFullText()
    const pos = (s: string) => txtSrc.indexOf(s)
    const raizVal = pos("raizUtilizavel(ledgerRoot)")
    const attVal = pos("attemptsRealNaoLink(paiTentativas)")
    const contido = pos("contidoNaRaiz(ledgerRoot, paiTentativas)")
    const fsyncRaiz = pos("sincronizaDiretorio(ledgerRoot)")
    const mkdirChave = pos("await mkdir(dirTentativa)")
    const fsyncAtt = pos("sincronizaDiretorio(paiTentativas)")
    const escrita = pos("escreveDuravel(dirTentativa, ARQ_RESERVA")
    const recibo = pos("new DurableReservationReceipt(")
    for (const [nome, p] of Object.entries({ raizVal, attVal, contido, fsyncRaiz, mkdirChave, fsyncAtt, escrita, recibo })) {
      expect(p, `${nome} ausente`).toBeGreaterThan(-1)
    }
    expect(raizVal).toBeLessThan(attVal)
    expect(attVal).toBeLessThan(contido)
    expect(contido).toBeLessThan(fsyncRaiz)
    expect(fsyncRaiz).toBeLessThan(mkdirChave)
    expect(mkdirChave).toBeLessThan(fsyncAtt)
    expect(fsyncAtt).toBeLessThan(escrita)
    expect(escrita).toBeLessThan(recibo)
  })

  it("EV2-06 runtime: o caminho sadio produz reserva e registro", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    if (r.status !== "reserved") return
    expect(readdirSync(join(RAIZ, "attempts", r.attempt.execution_key))).toEqual(["reservation.json"])
  })
})

describe("EV2-07 falha de durabilidade não devolve recibo nem capacidade", () => {
  for (const alvo of ["registro", "dirChave", "attempts", "raiz"] as const) {
    it(`EV2-07 falha no fsync de ${alvo}`, async () => {
      falha.alvo = alvo
      const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
      expect(r.status).toBe("refused")
      expect((r as unknown as { attempt?: unknown }).attempt).toBeUndefined()
      if (r.status === "refused") {
        expect(r.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
      }
    })
  }
  it("EV2-07 sem rollback: o diretório permanece e o id segue queimado", async () => {
    falha.alvo = "dirChave"
    await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(existsSync(join(RAIZ, "attempts", executionKey(ID)))).toBe(true)
    falha.alvo = null
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
  })
})

describe("EV2-08 nenhum link atravessa a raiz governada", () => {
  it("EV2-08 `attempts` symlink para fora é recusado e nada é escrito no alvo", async () => {
    const externo = mkdtempSync(join(tmpdir(), "creditum-ev2-ext-"))
    try {
      symlinkSync(externo, join(RAIZ, "attempts"))
      const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
      expect(r.status).toBe("refused")
      expect(readdirSync(externo)).toEqual([])
    } finally { rmSync(externo, { recursive: true, force: true }) }
  })
  it("EV2-08 raiz symlink é recusada e nada é escrito no alvo", async () => {
    const real = mkdtempSync(join(tmpdir(), "creditum-ev2-raiz-"))
    const link = join(mkdtempSync(join(tmpdir(), "creditum-ev2-lnk-")), "v1")
    try {
      symlinkSync(real, link)
      expect((await (est.raiz = link, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
      expect(readdirSync(real)).toEqual([])
    } finally { rmSync(real, { recursive: true, force: true }) }
  })
  it("EV2-08 `attempts` ocupado por arquivo é recusado", async () => {
    writeFileSync(join(RAIZ, "attempts"), "não sou diretório", "utf8")
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
  })
  it("EV2-08 fonte: validação por lstat, com recusa explícita de link", () => {
    const t = readFileSync(LED, "utf8")
    expect(t).toContain("await lstat(caminho)")
    expect(t).toContain("st.isSymbolicLink()")
    expect(chamadasEm(fonte(LED)).filter((c) => c === "lstat").length).toBeGreaterThan(0)
  })
})

describe("EV2-09 o fsync da raiz é exigido em toda reserva", () => {
  it("EV2-09 com `attempts` pré-existente, a falha na raiz ainda recusa", async () => {
    mkdirSync(join(RAIZ, "attempts"))
    falha.alvo = "raiz"
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("refused")
    expect(existsSync(join(RAIZ, "attempts", executionKey(ID)))).toBe(false)
  })
  it("EV2-09 A falha na raiz; B, vendo o `attempts` de A, também recusa", async () => {
    falha.alvo = "raiz"
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
    expect((await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))).status).toBe("refused")
  })
  it("EV2-09 fonte: o fsync da raiz não é condicionado por variável", () => {
    const t = readFileSync(LED, "utf8")
    expect(t).toContain('if ((await sincronizaDiretorio(ledgerRoot)) !== "ok") {')
    expect(t).not.toContain("criouPai &&")
  })
})

describe("EV2-10 a capacidade é local ao processo", () => {
  it("EV2-10 objeto de mesma forma não é capacidade", () => {
    const r = consumeReservedExecutionAttempt({
      execution_id: ID, execution_fingerprint: "f".repeat(64), spec: spec(),
      execution_key: executionKey(ID), attempt_deadline_monotonic: 1,
      isConsumed: false, _consumeOnce: () => true,
    })
    expect(r.status).toBe("refused")
  })
  it("EV2-10 `Object.create` sobre o protótipo não é capacidade", () => {
    const forjada = Object.create(ReservedExecutionAttempt.prototype) as unknown
    expect(forjada instanceof ReservedExecutionAttempt).toBe(true)
    expect(consumeReservedExecutionAttempt(forjada).status).toBe("refused")
  })
  it("EV2-10 não é serializável, e o registro em disco não a recria", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    expect(() => r.attempt.toJSON()).toThrow(/NOT_SERIALIZABLE/)
    const disco: unknown = JSON.parse(
      readFileSync(join(RAIZ, "attempts", r.attempt.execution_key, "reservation.json"), "utf8"))
    expect(consumeReservedExecutionAttempt(disco).status).toBe("refused")
  })
  it("EV2-10 uso único: um vencedor entre 32", async () => {
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    const rs = Array.from({ length: 32 }, () => consumeReservedExecutionAttempt(r.attempt))
    expect(rs.filter((x) => x.status === "consumed").length).toBe(1)
  })
  it("EV2-10 nenhum export reconstrói capacidade a partir de dado", async () => {
    const sup = await import("../src/execution-supervisor")
    expect(Object.keys(sup).filter((k) => /^(from|parse|load|restore|deserialize|revive)/i.test(k)))
      .toEqual([])
  })
})

describe("EV2-11 o prazo monotônico nasce antes da IO e não reinicia", () => {
  it("EV2-11 relógio determinístico: o prazo usa a PRIMEIRA leitura", async () => {
    let n = 0
    const r = await (est.relogio = () => (n++ === 0 ? 1000 : 5000), est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    if (r.status !== "reserved") throw new Error("esperava reserva")
    expect(r.attempt.attempt_deadline_monotonic).toBe(1000 + LIVE_ATTEMPT_DEADLINE_SECONDS)
  })
  it("EV2-11 fonte: o prazo vem do consumo, não de leitura posterior", () => {
    const t = readFileSync(SUP, "utf8")
    expect(t).toContain("const inicio = monotonicSeconds()")
    expect(t).toContain("consumeLiveExecutionAuthorization(auth, inicio)")
    expect(t).toContain("const prazo = consumo.attempt_deadline_monotonic")
  })
})

describe("EV2-12 a raiz de produção é fixa", () => {
  it("EV2-12 constante exata", () => {
    expect(PRODUCTION_EXECUTION_LEDGER_ROOT)
      .toBe("/data/creditum_hermes_runtime/execution-ledger/v1")
  })
  it("EV2-12 nenhum export do SUPERVISOR aceita raiz nem semente", () => {
    // O defeito que o regate final achou: `__prepareGovernedExecutionForTests(auth,
    // seam)` era EXPORTADO e aceitava `ledgerRoot`. Duas raízes, mesmo execution_id,
    // duas capacidades. Conferir a aridade do wrapper público não bastava — a porta
    // estava na função ao lado. A pergunta certa é sobre TODOS os exports do
    // supervisor, que é onde a capacidade nasce.
    const PROIBIDOS = /^(ledgerRoot|root|raiz|path|caminho|directory|diretorio|seam|semente)$/i
    const src = fonte(SUP)
    ts.forEachChild(src, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.name === undefined) return
      const exportado = (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0
      if (!exportado) return
      for (const par of n.parameters) {
        const nome = ts.isIdentifier(par.name) ? par.name.text : ""
        expect(PROIBIDOS.test(nome),
               `export ${n.name.text} aceita parâmetro de raiz "${nome}"`).toBe(false)
        const tipo = par.type ? par.type.getText(src) : ""
        expect(/ledgerRoot|Seam|Semente/.test(tipo),
               `export ${n.name.text} recebe semente/raiz via tipo`).toBe(false)
      }
    })
  })

  it("EV2-12 o livro-razão aceita raiz mas NÃO pode produzir capacidade", () => {
    // `reserveExecutionAttempt(ledgerRoot, ...)` é a camada inferior e recebe raiz por
    // desenho — testes do livro-razão usam raiz temporária. Isso só é seguro porque
    // aquele módulo não conhece `ReservedExecutionAttempt`: um recibo cunhado numa
    // raiz arbitrária não vira capacidade. A capacidade nasce em UM ponto, dentro do
    // supervisor, e esse ponto usa a raiz fixa.
    const led = readFileSync(LED, "utf8")
    expect(led).not.toContain("ReservedExecutionAttempt")
    const sup = fonte(SUP)
    let construcoes = 0
    let dentroDaViaFixa = 0
    ts.forEachChild(sup, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.body === undefined) return
      const anda = (x: ts.Node): void => {
        if (ts.isNewExpression(x) && ts.isIdentifier(x.expression) &&
            x.expression.text === "ReservedExecutionAttempt") {
          construcoes++
          if (n.name?.text === "prepareGovernedExecution") dentroDaViaFixa++
        }
        ts.forEachChild(x, anda)
      }
      anda(n.body)
    })
    expect(construcoes, "capacidade construída em mais de um ponto").toBe(1)
    expect(dentroDaViaFixa, "capacidade construída fora da via de raiz fixa").toBe(1)
    expect(readFileSync(SUP, "utf8")).toContain("const raiz = PRODUCTION_EXECUTION_LEDGER_ROOT")
  })

  it("EV2-12 a via pública tem aridade 1", () => {
    expect(prepareGovernedExecution.length).toBe(1)
  })

  it("EV2-12 nenhum export nomeado sugere costura de teste", async () => {
    const sup = await import("../src/execution-supervisor")
    const led = await import("../src/execution-ledger")
    const chaves = [...Object.keys(sup), ...Object.keys(led)]
    expect(chaves.filter((k) => /ForTests|__|Seam|Semente|TestOnly/i.test(k))).toEqual([])
  })

  it("EV2-12 fonte: sem queda para /tmp, HOME, cwd ou state.db", () => {
    // ESTRUTURAL, não textual. A primeira versão deste teste usava `toContain` e
    // acusou a PROSA que diz que o `state.db` do Hermes está fora de questão — o
    // mesmo falso positivo que esta fase já pagou seis vezes. Comentário não é nó.
    const CHAMADAS_DE_QUEDA = new Set(["tmpdir", "homedir", "cwd"])
    for (const arq of [LED, SUP]) {
      const src = fonte(arq)
      expect(chamadasEm(src).filter((c) => CHAMADAS_DE_QUEDA.has(c)), `${arq}: queda`)
        .toEqual([])
      // Nenhuma STRING de caminho alternativo no código executável.
      const literais: string[] = []
      const anda = (n: ts.Node): void => {
        if (ts.isStringLiteral(n)) literais.push(n.text)
        ts.forEachChild(n, anda)
      }
      anda(src)
      for (const lit of literais) {
        expect(/^\/tmp|state\.db|^~\//.test(lit), `${arq}: literal ${lit}`).toBe(false)
      }
    }
  })
})

describe("EV2-13 a d2b não ativa execução alguma", () => {
  const ATIVACAO = new Set(["spawn", "spawnSync", "fork", "exec", "execFile",
                            "execFileSync", "execSync", "fetch"])
  it("EV2-13 nenhuma chamada de ativação nos módulos de produção", () => {
    for (const arq of [LED, SUP]) {
      expect(chamadasEm(fonte(arq)).filter((c) => ATIVACAO.has(c)), arq).toEqual([])
    }
  })
  it("EV2-13 nenhum import de child_process, openai ou rede", () => {
    for (const arq of [LED, SUP]) {
      const src = fonte(arq)
      const mods: string[] = []
      ts.forEachChild(src, (n) => {
        if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
          mods.push(n.moduleSpecifier.text)
        }
      })
      for (const m of mods) {
        expect(/child_process|openai|node:http|node:net|undici/.test(m), `${arq}: ${m}`).toBe(false)
      }
    }
  })
  it("EV2-13 nenhuma superfície LIVE exportada", async () => {
    const led = await import("../src/execution-ledger")
    const sup = await import("../src/execution-supervisor")
    const chaves = [...Object.keys(led), ...Object.keys(sup)]
    expect(chaves.filter((k) => /runLive|ALLOW_LIVE|LIVE_MODE|startWorker|spawnWorker/i.test(k)))
      .toEqual([])
  })
})
