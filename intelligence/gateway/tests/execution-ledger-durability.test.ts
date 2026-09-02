/**
 * Fase 3.1d-D2B-R1 — a fronteira de durabilidade, com falha DETERMINÍSTICA.
 *
 * A d2b deixou B4 e B6 vivas por uma razão honesta: o ramo de falha de durabilidade é
 * alcançável em produção (disco cheio, `EIO`, permissão mudando no meio da chamada) mas
 * eu não conseguia provocá-lo num teste. Com o pai somente-leitura o `mkdir` falha
 * antes, com `EACCES`, e o fluxo vira `EXECUTION_LEDGER_UNAVAILABLE` — nunca
 * `EXECUTION_RESERVATION_NOT_DURABLE`.
 *
 * A saída NÃO foi abrir costura de produção. É `vi.mock` sobre `node:fs/promises`,
 * vivendo apenas aqui: o `mkdir` real roda e cria o diretório; o `fsync` do registro
 * falha. Exatamente o estado que a produção pode alcançar, e nada no código de
 * produção sabe que este teste existe.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ORACULOS, oraculo } from "./oracle"

/**
 * Qual `fsync` deve falhar. Cada alvo é identificado pelo CAMINHO aberto, então o teste
 * prova que falhou o sync PRETENDIDO — não "o próximo fsync", que seria ambíguo.
 *
 *   registro   → <raiz>/attempts/<chave>/reservation.json
 *   dirChave   → <raiz>/attempts/<chave>          (diretório da execução)
 *   attempts   → <raiz>/attempts                  (pai da chave)
 *   raiz       → <raiz>                           (raiz do livro-razão)
 *
 * Só este arquivo mexe nisto. Nenhum gancho em código de produção.
 */
const falha: {
  alvo: null | "registro" | "dirChave" | "attempts" | "raiz"
  raiz: string
  /**
   * Esconde `attempts` do PRIMEIRO `stat`, abrindo a janela de corrida real: o
   * `stat` diz que não existe, o `mkdir` bate em `EEXIST`. É o único caminho até o
   * ramo de revalidação de tipo, e sem isto ele fica sem regressão.
   */
  escondeAttemptsDoPrimeiroStat: boolean
} = { alvo: null, raiz: "", escondeAttemptsDoPrimeiroStat: false }

let statsDeAttempts = 0

/**
 * Registro das operações que o livro-razão realmente executou.
 *
 * O achado do regate: a contenção canônica recusava o link do `attempts` por OUTRO
 * caminho, mascarando a falha do no-follow. Um teste que só olha o desfecho não
 * distingue "recusou no `lstat`" de "recusou no `realpath`". Este registro distingue.
 */
const chamadas: { realpath: string[]; mkdir: string[]; open: string[] } = {
  realpath: [],
  mkdir: [],
  open: [],
}

function ehAlvo(caminho: string): boolean {
  const c = String(caminho)
  switch (falha.alvo) {
    case "registro":
      return c.endsWith("reservation.json")
    case "dirChave":
      return /\/attempts\/[0-9a-f]{64}$/.test(c)
    case "attempts":
      return c.endsWith("/attempts")
    case "raiz":
      return c === falha.raiz
    default:
      return false
  }
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...real,
    // `lstat` E `stat`: a validação no-follow usa `lstat`, e um mock que só cobrisse
    // `stat` deixaria os testes do ramo EEXIST passarem SEM nunca alcançá-lo. Foi
    // exatamente o que a mutação EEXIST1 expôs ao sobreviver.
    lstat: async (caminho: string, ...resto: unknown[]) => {
      if (
        falha.escondeAttemptsDoPrimeiroStat &&
        String(caminho).endsWith("/attempts") &&
        statsDeAttempts++ === 0
      ) {
        const e = new Error("ENOENT simulado") as Error & { code: string }
        e.code = "ENOENT"
        throw e
      }
      return (real.lstat as unknown as (...a: unknown[]) => Promise<unknown>)(caminho, ...resto)
    },
    stat: async (caminho: string, ...resto: unknown[]) =>
      (real.stat as unknown as (...a: unknown[]) => Promise<unknown>)(caminho, ...resto),
    realpath: async (caminho: string, ...resto: unknown[]) => {
      chamadas.realpath.push(String(caminho))
      return (real.realpath as unknown as (...a: unknown[]) => Promise<unknown>)(
        caminho,
        ...resto,
      )
    },
    mkdir: async (caminho: string, ...resto: unknown[]) => {
      chamadas.mkdir.push(String(caminho))
      return (real.mkdir as unknown as (...a: unknown[]) => Promise<unknown>)(
        caminho,
        ...resto,
      )
    },
    open: async (caminho: string, ...resto: unknown[]) => {
      chamadas.open.push(String(caminho))
      const handle = await (real.open as unknown as (...a: unknown[]) => Promise<
        Awaited<ReturnType<typeof real.open>>
      >)(caminho, ...resto)
      if (ehAlvo(caminho)) {
        // O arquivo FOI criado e escrito; o que falha é a durabilidade — o caso real
        // de disco cheio ou erro de IO no `fsync`.
        return new Proxy(handle, {
          get(alvo, prop, recebedor) {
            if (prop === "sync") {
              // `Promise.reject` em vez de `async` que só lança: o `sync()` real
              // devolve promessa, e o lint recusa `async` sem `await`.
              return () => {
                const e = new Error("ENOSPC simulado no fsync") as Error & { code: string }
                e.code = "ENOSPC"
                return Promise.reject(e)
              }
            }
            return Reflect.get(alvo, prop, recebedor) as unknown
          },
        })

      }
      return handle
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

const { PRODUCTION_EXECUTION_LEDGER_ROOT, classifyExecutionAttempt, executionKey } =
  await import("../src/execution-ledger")
const {
  LIVE_ATTEMPT_DEADLINE_SECONDS,
  LIVE_AUTHORIZATION_TTL_SECONDS,
  LIVE_EXECUTION_SPEC_VERSION,
  LIVE_TIMEOUT_DERIVATION_POLICY,
  issueLiveExecutionAuthorization,
  liveExecutionFingerprint,
} = await import("../src/live-execution")
const { prepareGovernedExecution } = await import("../src/execution-supervisor")
type Spec = import("../src/live-execution").LiveExecutionSpecV1

let RAIZ: string
beforeEach(() => {
  est.raiz = ""
  est.relogio = null
  RAIZ = mkdtempSync(join(tmpdir(), "creditum-d2b-r1-"))
  falha.alvo = null
  falha.raiz = RAIZ
  falha.escondeAttemptsDoPrimeiroStat = false
  statsDeAttempts = 0
  chamadas.realpath = []
  chamadas.mkdir = []
  chamadas.open = []
})
afterEach(() => {
  rmSync(RAIZ, { recursive: true, force: true })
})

const ID = "live-exec-d2b-r1-0001"

function spec(over: Record<string, unknown> = {}): Spec {
  return {
    spec_version: LIVE_EXECUTION_SPEC_VERSION,
    execution_id: ID,
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
  } as unknown as Spec
}
const texto = (content: string) => ({ untrusted: true as const, content })
function pedido(s: Spec) {
  return {
    approval_id: "ap-d2b-r1",
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
    decision_ref: "dec-d2b-r1",
    subject_content_hash: liveExecutionFingerprint(s),
  }
}
const decisao = () => ({
  decision_id: "dec-d2b-r1",
  schema_version: "1.0.0",
  approval_id: "ap-d2b-r1",
  decided_by: "STEFANO",
  decision: "APPROVED",
  decided_at: "2026-08-31T12:05:00Z",
})
function autorizacao(s: Spec = spec()) {
  const r = issueLiveExecutionAuthorization(s, pedido(s), [decisao()])
  if (r.status !== "authorized") throw new Error(`d1 recusou: ${r.defect}`)
  return r.authorization
}

describe("3.1d-D2B-R1 falha de durabilidade depois da criação do diretório", () => {
  it("recusa, não devolve capacidade, e o id fica QUEIMADO sem limpeza", async () => {
    falha.alvo = "registro"

    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))

    // (5) preparação recusa · (6) nenhuma capacidade
    oraculo(ORACULOS.RECIBO_SEM_DURABILIDADE, r.status === "reserved")
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
    expect((r as unknown as { attempt?: unknown }).attempt).toBeUndefined()

    // (7) o diretório de tentativa CONTINUA existindo — nada foi limpo
    const dir = join(RAIZ, "attempts", executionKey(ID))
    expect(existsSync(dir)).toBe(true)
    // O registro foi ESCRITO por completo; o que falhou foi o `fsync`. Em disco ele
    // está legível, então a classificação é `RESERVED` — e essa é a leitura honesta:
    // o conteúdo existe, a GARANTIA de que sobrevive a queda de energia é que não.
    // Depois de um `ENOSPC` no `fsync` o dado pode ou não estar persistido; o que a
    // fase exige não é adivinhar isso, é nunca devolver capacidade sem a garantia.
    const estado = await classifyExecutionAttempt(RAIZ, ID)
    expect(estado).not.toBe("UNSEEN")
    expect(["RESERVED", "MALFORMED"]).toContain(estado)

    // (8) uma segunda autorização legítima para o MESMO id é recusada
    falha.alvo = null
    const segunda = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(segunda.status).toBe("refused")
    if (segunda.status !== "refused") return
    expect(segunda.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("falha de durabilidade JAMAIS resulta em capacidade utilizável", async () => {
    falha.alvo = "registro"
    const rs = await Promise.all(
      Array.from({ length: 8 }, () =>
        (est.raiz = RAIZ, prepareGovernedExecution(autorizacao())),
      ),
    )
    // Nenhum vencedor: um perde na durabilidade, os outros no `EEXIST`.
    oraculo(ORACULOS.RECIBO_SEM_DURABILIDADE, rs.some((x) => x.status === "reserved"))
    expect(rs.filter((x) => x.status === "reserved").length).toBe(0)
    const defeitos = new Set(
      rs.map((x) => (x.status === "refused" ? x.defect : "reserved")),
    )
    expect(defeitos.has("reserved")).toBe(false)
    expect(
      [...defeitos].every(
        (d) => d === "EXECUTION_RESERVATION_NOT_DURABLE" || d === "EXECUTION_ALREADY_RESERVED",
      ),
    ).toBe(true)
  })

  it("com o fsync são, o caminho normal ainda reserva e entrega capacidade", async () => {
    // Controle positivo: sem ele, o teste acima passaria mesmo se a preparação
    // estivesse recusando SEMPRE, por qualquer motivo.
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    if (r.status !== "reserved") return
    expect(r.attempt.execution_id).toBe(ID)
    expect(await classifyExecutionAttempt(RAIZ, ID)).toBe("RESERVED")
    expect(readdirSync(join(RAIZ, "attempts", r.attempt.execution_key))).toEqual([
      "reservation.json",
    ])
    expect(PRODUCTION_EXECUTION_LEDGER_ROOT).toContain("/data/")
  })
})

describe("3.1d-D2B-R2 durabilidade da ENTRADA de diretório", () => {
  it("falha no fsync do diretório da EXECUÇÃO não devolve recibo nem capacidade", async () => {
    falha.alvo = "dirChave"
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))

    oraculo(ORACULOS.RECIBO_SEM_DURABILIDADE, r.status === "reserved")
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
    expect((r as unknown as { attempt?: unknown }).attempt).toBeUndefined()

    // ─── O estado inseguro de B4 é REUSO, não "diretório sumiu" ───────────────
    // Apagar a reserva só importa porque devolve o id ao pool. A observação tem de
    // ser a segunda reserva CONCLUINDO — e precisa vir antes da asserção de
    // existência, senão o teste morre ali e o oráculo nunca roda.
    falha.alvo = null
    const segunda = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    oraculo(ORACULOS.ID_REUSAVEL_APOS_ROLLBACK, segunda.status === "reserved")
    expect(segunda.status).toBe("refused")
    if (segunda.status !== "refused") return
    expect(segunda.defect).toBe("EXECUTION_ALREADY_RESERVED")

    // Sem rollback: o diretório fica.
    const dir = join(RAIZ, "attempts", executionKey(ID))
    expect(existsSync(dir)).toBe(true)
  })

  it("falha no fsync de `attempts` (pai) não devolve recibo nem capacidade", async () => {
    falha.alvo = "attempts"
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))

    oraculo(ORACULOS.RECIBO_SEM_DURABILIDADE, r.status === "reserved")
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
    expect((r as unknown as { attempt?: unknown }).attempt).toBeUndefined()

    // O diretório da chave foi criado antes do sync do pai e NÃO é limpo.
    expect(existsSync(join(RAIZ, "attempts", executionKey(ID)))).toBe(true)
    expect(existsSync(join(RAIZ, "attempts"))).toBe(true)

    falha.alvo = null
    const segunda = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(segunda.status).toBe("refused")
    if (segunda.status !== "refused") return
    expect(segunda.defect).toBe("EXECUTION_ALREADY_RESERVED")
  })

  it("falha no fsync da RAIZ após criar `attempts` não devolve recibo nem capacidade", async () => {
    // Este caminho só ocorre quando o runtime cria `attempts` pela primeira vez. Em
    // produção a raiz é provisionada pelo deploy; `attempts` é criado no primeiro uso.
    falha.alvo = "raiz"
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))

    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")

    // `attempts` fica onde está — limpeza não existe aqui.
    expect(existsSync(join(RAIZ, "attempts"))).toBe(true)
    // E nenhuma reserva de execução chegou a ser criada.
    expect(readdirSync(join(RAIZ, "attempts"))).toEqual([])
  })

  it("A cria `attempts` e falha na raiz; B NÃO lava a falha vendo o diretório", async () => {
    // A REGRESSÃO EXATA DO ACHADO. O teste que estava aqui afirmava o contrário —
    // "`attempts` já existe → a falha da raiz não se aplica → a reserva conclui" — e
    // eu o chamei de controle positivo. Ele codificava o defeito: era prova de que o
    // bypass funcionava, apresentada como prova de que a injeção mirava certo.
    falha.alvo = "raiz"

    // Chamada A: cria `attempts`, falha no fsync da raiz, recusa, deixa o diretório.
    const a = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    // ORÁCULO de A — distinto do de B. Se A concluir, a reserva aconteceu SEM a
    // durabilidade da raiz; isso é DUR3. A lavagem (B herdando o estado de A) é outra
    // propriedade, e tem oráculo próprio mais abaixo.
    oraculo(ORACULOS.RESERVA_SEM_FSYNC_RAIZ, a.status === "reserved")
    expect(a.status).toBe("refused")
    if (a.status !== "refused") return
    expect(a.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
    expect(existsSync(join(RAIZ, "attempts"))).toBe(true)

    // Chamada B: autorização d1 genuína NOVA, mesmo execution_id, `attempts` já
    // existe — e a raiz continua falhando. B tem de recusar também.
    const b = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    // O ORÁCULO da lavagem: B prosseguiu sem fazer o SEU fsync da raiz.
    oraculo(ORACULOS.FSYNC_LAVADO, b.status === "reserved")
    expect(b.status).toBe("refused")
    if (b.status !== "refused") return
    expect(b.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
    expect((b as unknown as { attempt?: unknown }).attempt).toBeUndefined()

    // E o diretório da chave NUNCA foi criado: nada de queimar estado mais fundo
    // sobre um pré-requisito de durabilidade que não se cumpriu.
    expect(existsSync(join(RAIZ, "attempts", executionKey(ID)))).toBe(false)
    expect(readdirSync(join(RAIZ, "attempts"))).toEqual([])
  })

  it("controle correto: `attempts` já existente + fsync da raiz SÃO → reserva prossegue", async () => {
    // O controle positivo verdadeiro. Prova que a recusa acima vem da falha da raiz,
    // e não de o `attempts` pré-existente bloquear tudo por outro motivo.
    mkdirSync(join(RAIZ, "attempts"))
    falha.alvo = null
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    if (r.status !== "reserved") return
    expect(r.attempt.execution_id).toBe(ID)
  })

  it("concorrente: B vê o `attempts` de A e ainda assim faz o SEU próprio fsync da raiz", async () => {
    // Variante 1 do achado: primeiro uso, duas chamadas concorrentes, raiz falhando
    // para ambas. Nenhuma pode passar por ver o diretório da outra.
    falha.alvo = "raiz"
    const [a, b] = await Promise.all([
      (est.raiz = RAIZ, prepareGovernedExecution(autorizacao())),
      (est.raiz = RAIZ, prepareGovernedExecution(autorizacao())),
    ])
    for (const r of [a, b]) {
      expect(r.status).toBe("refused")
      if (r.status !== "refused") continue
      expect(r.defect).toBe("EXECUTION_RESERVATION_NOT_DURABLE")
    }
    expect(existsSync(join(RAIZ, "attempts", executionKey(ID)))).toBe(false)
  })

  it("concorrente variante 2: quem faz o próprio fsync com sucesso é quem prossegue", async () => {
    // A falha na raiz; depois B, com a raiz sã, pode prosseguir — porque fez o SEU
    // fsync, não porque herdou o diretório de A.
    falha.alvo = "raiz"
    const a = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(a.status).toBe("refused")

    falha.alvo = null
    const b = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(b.status).toBe("reserved")
  })

  it("`attempts` ocupado por um ARQUIVO é defeito, nunca diretório presumido", async () => {
    writeFileSync(join(RAIZ, "attempts"), "não sou diretório", "utf8")
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    expect(r.defect).toBe("EXECUTION_LEDGER_INVALID")
  })

  it("EEXIST na corrida: o tipo de `attempts` é REVALIDADO, nunca presumido", async () => {
    // A janela real: entre o `stat` e o `mkdir`, outro processo ocupa o caminho. Aqui
    // o `stat` é forçado a dizer ENOENT enquanto um ARQUIVO já ocupa `attempts`, então
    // o `mkdir` devolve EEXIST — exatamente o estado em que presumir "é diretório"
    // seria o erro.
    writeFileSync(join(RAIZ, "attempts"), "ocupado por arquivo", "utf8")
    falha.escondeAttemptsDoPrimeiroStat = true

    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("refused")
    if (r.status !== "refused") return
    // O defeito PRECISA ser o de validação de tipo. Sem a revalidação o fluxo seguiria
    // e falharia mais adiante, com outro defeito — e a diferença é o que este teste mede.
    expect(r.defect).toBe("EXECUTION_LEDGER_INVALID")
  })
})

describe("3.1d-D2B-R4 nenhum link atravessa a raiz governada", () => {
  it("`attempts` SYMLINK é recusado NO no-follow — antes de realpath, fsync e mkdir", async () => {
    // O achado exato do regate: sem provar ONDE a recusa acontece, a contenção
    // canônica mascara a falha do no-follow, e a mutação do `attempts` morre por
    // conta da proteção vizinha em vez do invariante que ela declara.
    const externo = mkdtempSync(join(tmpdir(), "creditum-externo-"))
    try {
      symlinkSync(externo, join(RAIZ, "attempts"))
      const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))

      // O ORÁCULO do attempts: o link atravessou o no-follow se qualquer operação
      // abaixo dele foi alcançada, ou se a reserva concluiu.
      oraculo(
        ORACULOS.ATTEMPTS_LINK_ACEITO,
        r.status === "reserved" ||
          chamadas.realpath.some((c) => c.includes("attempts")) ||
          chamadas.mkdir.some((c) => c.includes(executionKey(ID))),
      )
      expect(r.status).toBe("refused")
      if (r.status !== "refused") return
      expect(r.defect).toBe("EXECUTION_LEDGER_INVALID")
      expect((r as unknown as { attempt?: unknown }).attempt).toBeUndefined()

      // ─── A ORDEM, que é o ponto ────────────────────────────────────────────
      // A recusa vem do `lstat`. Nada abaixo dele foi alcançado:
      expect(chamadas.realpath.filter((c) => c.includes("attempts"))).toEqual([])
      expect(chamadas.mkdir.filter((c) => c.includes(executionKey(ID)))).toEqual([])
      // O `fsync` da raiz abre o diretório da raiz — não pode ter acontecido.
      expect(chamadas.open.filter((c) => c === RAIZ)).toEqual([])

      // E nada foi criado no alvo do link.
      expect(readdirSync(externo)).toEqual([])
    } finally {
      rmSync(externo, { recursive: true, force: true })
    }
  })

  it("RAIZ como symlink é recusada — a raiz fixa não é sugestão", async () => {
    const real = mkdtempSync(join(tmpdir(), "creditum-raizreal-"))
    const link = join(mkdtempSync(join(tmpdir(), "creditum-link-")), "v1")
    try {
      symlinkSync(real, link)
      const r = await (est.raiz = link, prepareGovernedExecution(autorizacao()))

      oraculo(ORACULOS.RAIZ_LINK_ACEITA, r.status === "reserved")
      expect(r.status).toBe("refused")
      if (r.status !== "refused") return
      // Recusa como raiz indisponível: o `lstat` barra antes de qualquer `realpath`.
      expect(r.defect).toBe("EXECUTION_LEDGER_UNAVAILABLE")
      expect(readdirSync(real)).toEqual([])
    } finally {
      rmSync(real, { recursive: true, force: true })
    }
  })

  it("corrida EEXIST com symlink: ALCANÇA a revalidação e recusa nela", async () => {
    const externo = mkdtempSync(join(tmpdir(), "creditum-externo2-"))
    try {
      symlinkSync(externo, join(RAIZ, "attempts"))
      falha.escondeAttemptsDoPrimeiroStat = true

      const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
      // O ORÁCULO do EEXIST: a revalidação foi contornada se o fluxo seguiu além dela.
      oraculo(
        ORACULOS.EEXIST_SEM_REVALIDAR,
        r.status === "reserved" ||
          chamadas.realpath.some((c) => c.includes("attempts")) ||
          chamadas.mkdir.some((c) => c.includes(executionKey(ID))),
      )
      expect(r.status).toBe("refused")
      if (r.status !== "refused") return
      expect(r.defect).toBe("EXECUTION_LEDGER_INVALID")

      // Prova que o ramo EEXIST foi ALCANÇADO: o `mkdir` de `attempts` foi tentado
      // (o primeiro `lstat` foi escondido) e bateu no link já existente.
      expect(chamadas.mkdir.filter((c) => c.endsWith("/attempts")).length).toBe(1)
      // E a recusa foi na revalidação no-follow, não depois:
      expect(chamadas.realpath.filter((c) => c.includes("attempts"))).toEqual([])
      expect(chamadas.mkdir.filter((c) => c.includes(executionKey(ID)))).toEqual([])
      expect(chamadas.open.filter((c) => c === RAIZ)).toEqual([])
      expect(readdirSync(externo)).toEqual([])
    } finally {
      rmSync(externo, { recursive: true, force: true })
    }
  })

  it("controle: raiz e `attempts` REAIS passam — a validação não recusa tudo", async () => {
    // Sem este controle, uma implementação que recusasse sempre passaria nos três
    // testes acima e pareceria segura.
    mkdirSync(join(RAIZ, "attempts"))
    const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
    expect(r.status).toBe("reserved")
    if (r.status !== "reserved") return
    expect(r.attempt.execution_id).toBe(ID)
  })

  it("o defeito não vaza caminho externo, errno nem pilha", async () => {
    const externo = mkdtempSync(join(tmpdir(), "creditum-segredo-"))
    try {
      symlinkSync(externo, join(RAIZ, "attempts"))
      const r = await (est.raiz = RAIZ, prepareGovernedExecution(autorizacao()))
      if (r.status !== "refused") throw new Error("esperava recusa")
      const texto = JSON.stringify(r)
      expect(texto).not.toContain(externo)
      expect(texto).not.toContain("ENOENT")
      expect(texto).not.toContain("at Object.")
      expect(texto).not.toContain("/private/")
    } finally {
      rmSync(externo, { recursive: true, force: true })
    }
  })
})
