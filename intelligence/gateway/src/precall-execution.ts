/**
 * Fase 3.1d-D2C — COSTURA PRIVADA TS→PYTHON, SÓ ATÉ O PRECALL.
 *
 * ─── O que esta fase faz, e onde ela para ────────────────────────────────────
 *
 *   ReservedExecutionAttempt (d2b) → ATTEMPT_COMMITTED durável → filho Python privado
 *   → PRECALL limitado → resultado fechado → terminal no livro-razão.
 *
 * E para. Não existe `Responses.create`, não existe cliente, não existe rede. O
 * `precall_probe` do runtime congelado levanta ANTES de qualquer cliente existir.
 *
 * ─── Commit antes do spawn, e por quê ───────────────────────────────────────
 *
 * `attempt-committed.json` é escrito e sincronizado ANTES de o filho nascer. Entre a
 * decisão e o `spawn` há uma janela, e "STARTED" alegaria que existe um processo no SO
 * quando só existe intenção. Se o processo morrer nessa janela, o `execution_id` fica
 * queimado — sem retomada, sem replay. Conservador de propósito: o custo de recusar
 * demais é uma aprovação nova; o de permitir demais é uma segunda execução.
 *
 * ─── O Python não é autoridade ──────────────────────────────────────────────
 *
 * O filho recebe MATERIAL DE EXECUÇÃO — identificador, fingerprint, nonce. Nenhum
 * token de aprovação atravessa: um token que atravessa é dado, e dado se replica. Ele
 * não decide se a execução foi autorizada; isso já foi decidido pela d1 e pela d2b.
 *
 * ─── Sem costura privilegiada ───────────────────────────────────────────────
 *
 * A d2b custou uma fase inteira porque um `__prepareGovernedExecutionForTests(auth,
 * seam)` exportado deixava o chamador escolher a raiz. Aqui não há parâmetro de
 * executável, de worker, de ambiente, de prazo nem de protocolo. Os testes mockam
 * `node:child_process`; produção não tem porta.
 *
 * ─── R1: as três fronteiras que a primeira versão deixou abertas ────────────
 *
 * (A) `readonly` é do compilador, não do runtime. A capacidade era autêntica, mas
 *     suas propriedades continuavam graváveis por `Object.defineProperty` — e esta
 *     função as relia DEPOIS do `await` do commit. Logo: commit gravado com uma
 *     identidade, pedido e terminal com outra. Agora as propriedades são lidas UMA
 *     vez, de forma síncrona, antes do primeiro `await`, validadas entre si e
 *     congeladas num instantâneo próprio. Depois disso a capacidade não é mais lida.
 *     E o diretório NUNCA vem da propriedade: vem de `executionKey(execution_id)`,
 *     a mesma derivação canônica da d2b.
 *
 * (B) O prazo restante era calculado ANTES do commit durável e usado DEPOIS. Um
 *     commit lento devolvia tempo à linhagem — 30 s de `fsync` viravam ~210 s de
 *     orçamento. Agora a autoridade é o prazo ABSOLUTO; o restante é recalculado
 *     depois do commit, e o cronômetro do filho deriva do absoluto no instante do
 *     `spawn`.
 *
 * (C) Sucesso era "outcome + duas contagens". Um filho podia declarar
 *     `PRECALL_SUCCEEDED` com `mode: "LIVE"`, `client_constructions: 1`, veredito
 *     inventado, hashes ausentes e `rc: 137`, e a camada gravava COMPLETED_ACCEPTED.
 *     Agora o sucesso exige o conjunto EXATO de campos com os valores EXATOS do
 *     worker congelado, o processo tem de ter terminado limpo, e a evidência
 *     governada é construída pelo pai — nunca o objeto do filho.
 */

import { spawn } from "node:child_process"
import { join } from "node:path"
import {
  PRODUCTION_EXECUTION_LEDGER_ROOT,
  executionKey,
  recordAttemptCommitted,
  recordExecutionTerminal,
} from "./execution-ledger"
import {
  LIVE_ATTEMPT_DEADLINE_SECONDS,
  liveExecutionFingerprint,
  monotonicSeconds,
} from "./live-execution"
import {
  type IssuedExecutionState,
  consumeReservedExecutionAttempt,
} from "./execution-supervisor"

// ═════════════════════════════════════════════════════════════════════════════
// Constantes governadas — nenhuma é parâmetro
// ═════════════════════════════════════════════════════════════════════════════

/** O executável EXATO da Hostinger, observado pela sonda d2a. Sem PATH, sem `python3`. */
export const PRECALL_PYTHON_EXECUTABLE = "/opt/venv/bin/python3"

/** Entrypoint próprio da Creditum. O pacote congelado não foi tocado. */
export const PRECALL_WORKER_MODULE = "creditum_hermes_precall.worker"

export const PRECALL_REQUEST_PROTOCOL = "creditum_precall_request/1.0.0"
export const PRECALL_RESULT_PROTOCOL = "creditum_precall_result/1.0.0"

/**
 * Vocabulário EXATO do worker congelado, não aproximação.
 *
 * `MODE_PRECALL_PROBE = "PRECALL_PROBE"` e `verdict="PRECALL_PROBE_COMPLETE"` vêm de
 * `creditum_hermes_reasoning/executor.py`. Escrever `precall_probe` aqui e tornar o
 * comparador insensível a caixa seria acomodar o erro do teste dentro da produção.
 */
export const PRECALL_FROZEN_MODE = "PRECALL_PROBE"
export const PRECALL_FROZEN_VERDICT = "PRECALL_PROBE_COMPLETE"
export const PRECALL_FROZEN_OUTCOME = "PRECALL_SUCCEEDED"

/**
 * `GOVERNED_TOOLS` é a tupla vazia e o pedido governado carrega `tools: []`. Zero é o
 * único valor que o PRECALL congelado pode produzir — ausência nunca é zero, e por
 * isso o campo é exigido e comparado, não presumido.
 */
export const PRECALL_FROZEN_TOOL_COUNT = 0

/** Ambos os hashes do runtime são `sha256().hexdigest()`. */
const HEX256 = /^[0-9a-f]{64}$/

/**
 * O `Object.freeze` confiável, capturado na INICIALIZAÇÃO do módulo.
 *
 * `Object.freeze` é `writable: true, configurable: true`. Escrever
 * `return Object.freeze({...})` no instantâneo fazia a autoridade ser o VALOR DE
 * RETORNO de uma função substituível: um invólucro hostil, instalado depois da
 * inicialização, devolvia outro objeto, e era ELE que passava a definir o diretório
 * da tentativa, a identidade do pedido e o registro terminal.
 *
 * Duas medidas, e a segunda importa mais que a primeira:
 *
 *   1. capturar o intrínseco aqui, antes de qualquer capacidade escapar;
 *   2. NUNCA usar o retorno como autoridade — construir o objeto localmente,
 *      congelar ESSE objeto, e atribuir o local.
 *
 * Só a (1) ainda deixaria a forma frágil: bastaria alguém reescrever a linha para
 * `= CONGELA(...)` e o defeito volta sem que nada observe.
 */
const CONGELA = Object.freeze

/**
 * Limites finitos. Um filho quebrado ou hostil não pode consumir memória sem teto.
 *
 *   pedido  64 KiB — o envelope é identificador + fingerprints + nonce: centenas de
 *                    bytes. Duas ordens de grandeza de folga, e ainda um teto.
 *   stdout  64 KiB — o resultado fechado tem tamanho da mesma ordem.
 *   stderr  16 KiB — diagnóstico operacional, truncado; nunca sobe para a saída do
 *                    Hermes nem entra em registro canônico.
 */
export const PRECALL_REQUEST_MAX_BYTES = 64 * 1024
export const PRECALL_STDOUT_MAX_BYTES = 64 * 1024
export const PRECALL_STDERR_MAX_BYTES = 16 * 1024

/** Teto do texto de auditoria vindo do filho. Não é classificação, e não é ilimitado. */
export const PRECALL_CHILD_DETAIL_MAX_CHARS = 128

export const PRECALL_DEFECTS = [
  "PRECALL_ATTEMPT_INVALID",
  "PRECALL_ATTEMPT_ALREADY_CONSUMED",
  "PRECALL_CAPABILITY_INVALID",
  "PRECALL_NO_BUDGET_REMAINING",
  "PRECALL_COMMIT_NOT_DURABLE",
  "PRECALL_SPAWN_FAILED",
  "PRECALL_TIMEOUT",
  "PRECALL_OUTPUT_TOO_LARGE",
  "PRECALL_WORKER_EXIT_NONZERO",
  "PRECALL_RESULT_PROTOCOL_INVALID",
  "PRECALL_RESULT_BINDING_MISMATCH",
  "PRECALL_SEMANTIC_REJECTED",
] as const
export type PrecallDefect = (typeof PRECALL_DEFECTS)[number]

/** Evidência CANÔNICA, construída pelo pai depois de todo o contrato passar. */
export interface PrecallEvidence {
  readonly execution_id: string
  readonly execution_key: string
  readonly execution_fingerprint: string
  readonly mode: string
  readonly verdict: string
  readonly tool_count: number
  readonly client_constructions: number
  readonly provider_calls: number
  readonly model_call_completed: boolean
  readonly request_hash: string
  readonly user_payload_hash: string
}

export type PrecallOutcome =
  | { readonly status: "precall_succeeded"; readonly evidence: Readonly<PrecallEvidence> }
  | {
      readonly status: "refused"
      readonly defect: PrecallDefect
      /** Texto do filho, quando houver. AUDITORIA — nunca classificação. */
      readonly child_detail?: string
    }

// ═════════════════════════════════════════════════════════════════════════════
// (A) Instantâneo próprio da capacidade
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O instantâneo local vem do ESTADO PRIVADO DE EMISSÃO, não da capacidade.
 *
 * A r1 lia as propriedades públicas uma única vez e as validava entre si. Não bastou:
 * o chamador com duas capacidades autênticas, A e B, reescrevia em A os valores de B —
 * mutuamente coerentes, porque vinham de uma emissão real — e a execução de A acontecia
 * no diretório reservado de B, sem consumir B. Coerência mútua não prova propriedade.
 *
 * Agora `consumeReservedExecutionAttempt` devolve o estado que o supervisor fixou no
 * cunho, guardado em `WeakMap` privado do módulo. A d2c não consulta nenhum campo
 * público da capacidade — só a entrega ao consumo.
 */
interface InstantaneoCapacidade {
  readonly execution_id: string
  readonly execution_key: string
  readonly execution_fingerprint: string
  readonly attempt_deadline_monotonic: number
  readonly attempt_deadline_seconds: number
  readonly attempt_directory: string
}

function instantaneoDaEmissao(estado: IssuedExecutionState): InstantaneoCapacidade | null {
  const id = estado.execution_id
  const fingerprint = estado.execution_fingerprint
  const prazo = estado.attempt_deadline_monotonic
  const prazoTotal = estado.attempt_deadline_seconds

  // ─── conferência defensiva, sobre valores JÁ privados ─────────────────────
  //
  // O supervisor validou no cunho. Repetir aqui não é desconfiança do supervisor: é
  // recusar depender de uma garantia que vive noutro arquivo e pode mudar sem que
  // esta via observe. Custa três comparações.
  if (typeof id !== "string" || id === "" || id.length > 512) return null
  if (typeof fingerprint !== "string" || !HEX256.test(fingerprint)) return null
  if (typeof prazo !== "number" || !Number.isFinite(prazo)) return null
  if (prazoTotal !== LIVE_ATTEMPT_DEADLINE_SECONDS) return null
  if (estado.spec.execution_id !== id) return null
  if (liveExecutionFingerprint(estado.spec) !== fingerprint) return null

  // A chave é DERIVADA do id. A do estado é conferida contra a derivação e descartada:
  // nem mesmo o supervisor escolhe o diretório desta via.
  const chave = executionKey(id)
  if (estado.execution_key !== chave) return null

  // Construído LOCALMENTE, congelado no lugar, devolvido o local.
  const instantaneo: InstantaneoCapacidade = {
    execution_id: id,
    execution_key: chave,
    execution_fingerprint: fingerprint,
    attempt_deadline_monotonic: prazo,
    attempt_deadline_seconds: prazoTotal,
    attempt_directory: join(PRODUCTION_EXECUTION_LEDGER_ROOT, "attempts", chave),
  }
  CONGELA(instantaneo)
  return instantaneo
}

// ═════════════════════════════════════════════════════════════════════════════
// O filho
// ═════════════════════════════════════════════════════════════════════════════

/** Só o que o filho precisa. Nada de token, chave, HOME, shell ou config de plugin. */
function ambienteMinimo(): Record<string, string> {
  return {
    PATH: "/usr/bin:/bin",
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONHASHSEED: "0",
  }
}

interface SaidaFilho {
  readonly rc: number | null
  readonly sinal: string | null
  readonly stdout: string
  readonly stderr: string
  readonly excedeu: boolean
  readonly expirou: boolean
  readonly falhouAoNascer: boolean
  /** Prazo vencido no portão: NENHUM processo foi criado. */
  readonly expirouAntesDoSpawn: boolean
}

/**
 * UM filho. Sem `shell`, sem interpolação — argumentos são elementos fixos de array.
 *
 * ─── O portão do prazo é AQUI, imediatamente antes do `spawn` ───────────────
 *
 * A r1 conferia o prazo na via, depois do commit, e só recalculava DENTRO desta função
 * — depois de `spawn` já ter sido chamado. Uma tentativa vencida entre as duas linhas
 * criava um processo e só então agendava sua morte. O portão mudou de lado: nenhuma
 * declaração `spawn` é alcançável antes dele.
 *
 * A conferência da via permanece como falha rápida, e NÃO é autoritativa: se ela
 * desaparecesse ou ficasse obsoleta, a correção continuaria valendo por este portão.
 *
 * ─── O limite que não se pode fingir ───────────────────────────────────────
 *
 * Entre ler o relógio e o sistema operacional criar o processo existe um intervalo que
 * nenhum código de espaço de usuário fecha. A afirmação honesta é: a PERMISSÃO para
 * chamar `spawn` é decidida imediatamente antes da chamada, pelo prazo absoluto. Não
 * há atomicidade entre leitura de relógio e criação de processo, e este comentário
 * existe para não sugerir que haja.
 */
async function rodaFilho(pedido: string, prazoAbsolutoS: number): Promise<SaidaFilho> {
  const vazia = {
    rc: null, sinal: null, stdout: "", stderr: "", excedeu: false, expirou: false,
    falhouAoNascer: false,
  }
  // ─── O PORTÃO. Nada de `spawn` acima desta linha. ─────────────────────────
  if (!(prazoAbsolutoS - monotonicSeconds() > 0)) {
    return { ...vazia, expirouAntesDoSpawn: true }
  }

  return new Promise<SaidaFilho>((resolve) => {
    let stdout = ""
    let stderr = ""
    let excedeu = false
    let expirou = false
    let terminou = false

    const filho = spawn(
      PRECALL_PYTHON_EXECUTABLE,
      ["-I", "-B", "-m", PRECALL_WORKER_MODULE],
      { env: ambienteMinimo(), stdio: ["pipe", "pipe", "pipe"] },
    )

    const fecha = (s: SaidaFilho): void => {
      if (terminou) return
      terminou = true
      clearTimeout(cronometro)
      resolve(s)
    }

    // Relido AGORA, do mesmo prazo absoluto. Sem mínimo artificial: `Math.max(1, ...)`
    // somaria tempo além da linhagem. Se o prazo venceu entre o portão e esta linha,
    // o atraso é 0 e o filho morre no próximo tique — que é o caminho local mais curto,
    // e não é retry.
    const restanteMs = Math.floor((prazoAbsolutoS - monotonicSeconds()) * 1000)
    const cronometro = setTimeout(() => {
      expirou = true
      filho.kill("SIGKILL")
      fecha({ rc: null, sinal: "SIGKILL", stdout, stderr, excedeu, expirou: true,
              falhouAoNascer: false, expirouAntesDoSpawn: false })
    }, Math.max(0, restanteMs))

    filho.on("error", () => {
      fecha({ rc: null, sinal: null, stdout, stderr, excedeu, expirou: false,
              falhouAoNascer: true, expirouAntesDoSpawn: false })
    })
    filho.stdout?.on("data", (d: Buffer) => {
      if (stdout.length + d.length > PRECALL_STDOUT_MAX_BYTES) {
        excedeu = true
        filho.kill("SIGKILL")
        return
      }
      stdout += d.toString("utf8")
    })
    filho.stderr?.on("data", (d: Buffer) => {
      // Truncar, nunca crescer sem teto. E nunca subir cru.
      if (stderr.length < PRECALL_STDERR_MAX_BYTES) {
        stderr += d.toString("utf8").slice(0, PRECALL_STDERR_MAX_BYTES - stderr.length)
      }
    })
    filho.on("close", (rc, sinal) => {
      fecha({ rc, sinal, stdout, stderr, excedeu, expirou, falhouAoNascer: false,
              expirouAntesDoSpawn: false })
    })

    filho.stdin?.on("error", () => undefined)
    filho.stdin?.end(pedido)
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// (C) O protocolo do resultado — dois contratos, não um permissivo
// ═════════════════════════════════════════════════════════════════════════════

/** Envelope mínimo: o que TODO resultado tem, sucesso ou recusa. */
const CAMPOS_ENVELOPE = [
  "protocol_version", "execution_id", "execution_fingerprint", "request_nonce", "outcome",
] as const

/** Conjunto EXATO do sucesso do worker congelado. Nem um a mais, nem um a menos. */
const CAMPOS_SUCESSO = [
  ...CAMPOS_ENVELOPE,
  "mode", "request_hash", "user_payload_hash", "tool_count",
  "client_constructions", "provider_calls", "model_call_completed", "verdict",
] as const

/** Campos que só a recusa do worker usa. */
const CAMPOS_RECUSA_OPCIONAIS = ["defect", "detail_type"] as const

const CAMPOS_CONHECIDOS = new Set<string>([...CAMPOS_SUCESSO, ...CAMPOS_RECUSA_OPCIONAIS])

interface Envelope {
  readonly execution_id: string
  readonly execution_fingerprint: string
  readonly request_nonce: string
  readonly outcome: string
  readonly campos: Readonly<Record<string, unknown>>
}

/** Um documento, versão exata, envelope de texto não vazio, campos conhecidos. */
function leEnvelope(bruto: string): Envelope | null {
  const linhas = bruto.split("\n").filter((l) => l.trim() !== "")
  if (linhas.length !== 1) return null // vários documentos ou lixo à frente
  let doc: unknown
  try {
    doc = JSON.parse(linhas[0] ?? "")
  } catch {
    return null
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null
  const d = doc as Record<string, unknown>
  if (d.protocol_version !== PRECALL_RESULT_PROTOCOL) return null
  for (const c of CAMPOS_ENVELOPE) {
    if (typeof d[c] !== "string" || d[c] === "") return null
  }
  for (const c of Object.keys(d)) {
    if (!CAMPOS_CONHECIDOS.has(c)) return null
  }
  return {
    execution_id: d.execution_id as string,
    execution_fingerprint: d.execution_fingerprint as string,
    request_nonce: d.request_nonce as string,
    outcome: d.outcome as string,
    campos: d,
  }
}

/** Inteiro de verdade: `true` passaria em `typeof === "number"`? Não — mas 1.5 e NaN sim. */
function inteiroExato(v: unknown, esperado: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v === esperado
}

type VeredictoSucesso =
  | { readonly ok: true; readonly request_hash: string; readonly user_payload_hash: string }
  | { readonly ok: false; readonly defeito: "protocolo" | "semantica" }

/**
 * O contrato EXATO do sucesso PRECALL.
 *
 * A versão anterior media três coisas e presumia o resto com `?? -1`. Um filho podia
 * afirmar `PRECALL_SUCCEEDED` sem hash, com `mode: "LIVE"` e um cliente construído.
 * Aqui: conjunto exato de campos, valores exatos do runtime congelado, hashes com
 * formato canônico, contagens inteiras. Nada é opcional, nada tem default.
 */
function validaSucesso(env: Envelope): VeredictoSucesso {
  const d = env.campos
  // Estrutura primeiro: campo a mais, a menos ou de tipo errado é PROTOCOLO.
  const chaves = Object.keys(d)
  if (chaves.length !== CAMPOS_SUCESSO.length) return { ok: false, defeito: "protocolo" }
  for (const c of CAMPOS_SUCESSO) {
    if (!(c in d)) return { ok: false, defeito: "protocolo" }
  }
  if (typeof d.mode !== "string" || typeof d.verdict !== "string") {
    return { ok: false, defeito: "protocolo" }
  }
  if (typeof d.request_hash !== "string" || !HEX256.test(d.request_hash)) {
    return { ok: false, defeito: "protocolo" }
  }
  if (typeof d.user_payload_hash !== "string" || !HEX256.test(d.user_payload_hash)) {
    return { ok: false, defeito: "protocolo" }
  }
  // `typeof true === "boolean"`, então booleano onde se espera inteiro cai aqui.
  for (const c of ["tool_count", "client_constructions", "provider_calls"] as const) {
    if (typeof d[c] !== "number" || !Number.isInteger(d[c])) {
      return { ok: false, defeito: "protocolo" }
    }
  }
  if (typeof d.model_call_completed !== "boolean") {
    return { ok: false, defeito: "protocolo" }
  }

  // Valores depois: bem formado mas semanticamente impossível é SEMÂNTICA.
  if (d.mode !== PRECALL_FROZEN_MODE) return { ok: false, defeito: "semantica" }
  if (d.verdict !== PRECALL_FROZEN_VERDICT) return { ok: false, defeito: "semantica" }
  if (!inteiroExato(d.tool_count, PRECALL_FROZEN_TOOL_COUNT)) {
    return { ok: false, defeito: "semantica" }
  }
  if (!inteiroExato(d.client_constructions, 0)) return { ok: false, defeito: "semantica" }
  if (!inteiroExato(d.provider_calls, 0)) return { ok: false, defeito: "semantica" }
  if (d.model_call_completed !== false) return { ok: false, defeito: "semantica" }

  return { ok: true, request_hash: d.request_hash, user_payload_hash: d.user_payload_hash }
}

/** Texto do filho para auditoria: limitado, e só quando for texto de verdade. */
function detalheDoFilho(env: Envelope): string | undefined {
  const bruto = env.campos.defect
  if (typeof bruto !== "string" || bruto === "") return undefined
  return bruto.slice(0, PRECALL_CHILD_DETAIL_MAX_CHARS)
}

// ═════════════════════════════════════════════════════════════════════════════
// A via única
// ═════════════════════════════════════════════════════════════════════════════

/** Material governado que o filho recebe. NENHUM token de autoridade atravessa. */
export interface GovernedPrecallInput {
  readonly request_nonce: string
}

/**
 * A ÚNICA via de ativação. Recebe a CAPACIDADE d2b — não identificador, não caminho,
 * não configuração. Consome de forma síncrona antes de qualquer processo nascer.
 */
export async function executeReservedPrecall(
  attempt: unknown,
  governedInput: GovernedPrecallInput,
): Promise<PrecallOutcome> {
  // (1) consumo SÍNCRONO da capacidade. Segunda tentativa falha fechada.
  const consumo = consumeReservedExecutionAttempt(attempt)
  if (consumo.status !== "consumed") {
    return {
      status: "refused",
      defect: consumo.defect === "RESERVED_ATTEMPT_ALREADY_CONSUMED"
        ? "PRECALL_ATTEMPT_ALREADY_CONSUMED"
        : "PRECALL_ATTEMPT_INVALID",
    }
  }

  // (2) INSTANTÂNEO próprio, do estado PRIVADO devolvido pelo consumo. A capacidade
  // já cumpriu seu papel: nada nesta função volta a tocá-la.
  const inst = instantaneoDaEmissao(consumo.state)
  if (inst === null) {
    return { status: "refused", defect: "PRECALL_CAPABILITY_INVALID" }
  }

  // (3) o nonce é material governado do chamador, e também é lido uma vez.
  const nonce: unknown = governedInput.request_nonce
  if (typeof nonce !== "string" || nonce === "" || nonce.length > 256) {
    return { status: "refused", defect: "PRECALL_CAPABILITY_INVALID" }
  }

  // (4) orçamento da MESMA linhagem monotônica da d1. Sem relógio novo.
  if (inst.attempt_deadline_monotonic - monotonicSeconds() <= 0) {
    return { status: "refused", defect: "PRECALL_NO_BUDGET_REMAINING" }
  }

  const agoraUtc = new Date().toISOString()

  // (5) ATTEMPT_COMMITTED durável ANTES do spawn. Falhou, nenhum filho nasce.
  const commit = await recordAttemptCommitted(
    inst.attempt_directory, inst.execution_id, inst.execution_fingerprint, agoraUtc)
  if (commit.status !== "recorded") {
    return { status: "refused", defect: "PRECALL_COMMIT_NOT_DURABLE" }
  }

  const pedido = JSON.stringify({
    protocol_version: PRECALL_REQUEST_PROTOCOL,
    execution_id: inst.execution_id,
    execution_fingerprint: inst.execution_fingerprint,
    request_nonce: nonce,
    committed_at_utc: agoraUtc,
  })
  if (Buffer.byteLength(pedido, "utf8") > PRECALL_REQUEST_MAX_BYTES) {
    await encerra(inst, "INTERNAL_ABORTED")
    return { status: "refused", defect: "PRECALL_RESULT_PROTOCOL_INVALID" }
  }

  // (6) FALHA RÁPIDA, não autoridade. A escrita e os dois `fsync` consomem a linhagem;
  // devolvê-los ao orçamento era o defeito (B). O portão autoritativo é dentro de
  // `rodaFilho`, imediatamente antes do `spawn` — remover esta conferência não
  // reabriria o defeito, ela só evita trabalho inútil.
  if (inst.attempt_deadline_monotonic - monotonicSeconds() <= 0) {
    await encerra(inst, "TIMED_OUT")
    return { status: "refused", defect: "PRECALL_NO_BUDGET_REMAINING" }
  }

  // (7) UM filho, no máximo. Nunca dois — não existe caminho de retry nesta função.
  const saida = await rodaFilho(pedido, inst.attempt_deadline_monotonic)

  if (saida.expirouAntesDoSpawn) {
    // O portão recusou: o commit permanece, a tentativa segue queimada, e nenhum
    // processo existiu.
    await encerra(inst, "TIMED_OUT")
    return { status: "refused", defect: "PRECALL_NO_BUDGET_REMAINING" }
  }
  if (saida.falhouAoNascer) {
    await encerra(inst, "WORKER_FAILED")
    return { status: "refused", defect: "PRECALL_SPAWN_FAILED" }
  }
  if (saida.expirou) {
    await encerra(inst, "TIMED_OUT")
    return { status: "refused", defect: "PRECALL_TIMEOUT" }
  }
  if (saida.excedeu) {
    await encerra(inst, "WORKER_FAILED")
    return { status: "refused", defect: "PRECALL_OUTPUT_TOO_LARGE" }
  }
  // (8) o DESFECHO DO PROCESSO precede a semântica. O worker congelado sempre sai 0,
  // até quando recusa; `rc != 0` ou sinal significa que o processo quebrou, e stdout
  // perfeito não converte processo quebrado em sucesso.
  if (saida.rc !== 0 || saida.sinal !== null) {
    await encerra(inst, "WORKER_FAILED")
    return { status: "refused", defect: "PRECALL_WORKER_EXIT_NONZERO" }
  }

  const env = leEnvelope(saida.stdout)
  if (env === null) {
    await encerra(inst, "RESPONSE_REJECTED")
    return { status: "refused", defect: "PRECALL_RESULT_PROTOCOL_INVALID" }
  }
  // (9) o resultado tem de ser DESTA execução. Id vindo do filho não basta sozinho:
  // fingerprint e nonce também são conferidos contra o que FOI enviado.
  if (env.execution_id !== inst.execution_id ||
      env.execution_fingerprint !== inst.execution_fingerprint ||
      env.request_nonce !== nonce) {
    await encerra(inst, "RESPONSE_REJECTED")
    return { status: "refused", defect: "PRECALL_RESULT_BINDING_MISMATCH" }
  }

  // (10) só o outcome exato do runtime congelado abre o contrato de sucesso.
  if (env.outcome !== PRECALL_FROZEN_OUTCOME) {
    await encerra(inst, "SEMANTIC_REJECTED")
    return recusaSemantica(env)
  }
  const veredicto = validaSucesso(env)
  if (!veredicto.ok) {
    await encerra(inst,
      veredicto.defeito === "protocolo" ? "RESPONSE_REJECTED" : "SEMANTIC_REJECTED")
    return veredicto.defeito === "protocolo"
      ? { status: "refused", defect: "PRECALL_RESULT_PROTOCOL_INVALID" }
      : recusaSemantica(env)
  }

  // (11) COMPLETED_ACCEPTED só aqui, depois de TODO o contrato passar. E a evidência
  // é construída pelo PAI: as constantes vêm daqui, não do documento. O filho
  // afirma fatos; quem os classifica é esta camada.
  await encerra(inst, "COMPLETED_ACCEPTED")
  const evidencia: PrecallEvidence = {
    execution_id: inst.execution_id,
    execution_key: inst.execution_key,
    execution_fingerprint: inst.execution_fingerprint,
    mode: PRECALL_FROZEN_MODE,
    verdict: PRECALL_FROZEN_VERDICT,
    tool_count: PRECALL_FROZEN_TOOL_COUNT,
    client_constructions: 0,
    provider_calls: 0,
    model_call_completed: false,
    request_hash: veredicto.request_hash,
    user_payload_hash: veredicto.user_payload_hash,
  }
  CONGELA(evidencia)
  return { status: "precall_succeeded", evidence: evidencia }
}

/**
 * O defeito é NOSSO, não do filho: um worker comprometido não escolhe como esta
 * camada classifica a recusa. O texto dele sobrevive só como auditoria limitada.
 */
function recusaSemantica(env: Envelope): PrecallOutcome {
  const detalhe = detalheDoFilho(env)
  return detalhe === undefined
    ? { status: "refused", defect: "PRECALL_SEMANTIC_REJECTED" }
    : { status: "refused", defect: "PRECALL_SEMANTIC_REJECTED", child_detail: detalhe }
}

/**
 * Terminal write-once. Falhar aqui NÃO devolve o id ao pool: a tentativa segue
 * queimada, e o registro é auditoria — nunca capacidade, nunca autorização de retry.
 *
 * O decorrido deriva do relógio monotônico AGORA e da linhagem original — nunca de um
 * restante calculado antes do commit, que era justamente o valor inflado.
 */
async function encerra(
  inst: InstantaneoCapacidade,
  desfecho: "COMPLETED_ACCEPTED" | "TIMED_OUT" | "WORKER_FAILED" | "RESPONSE_REJECTED"
    | "SEMANTIC_REJECTED" | "INTERNAL_ABORTED",
): Promise<void> {
  const restanteAgora = inst.attempt_deadline_monotonic - monotonicSeconds()
  const decorridoS = inst.attempt_deadline_seconds - restanteAgora
  await recordExecutionTerminal(
    inst.attempt_directory, inst.execution_id, inst.execution_fingerprint,
    desfecho, new Date().toISOString(),
    Math.max(0, Math.round(decorridoS * 1000)),
  ).catch(() => undefined)
}
