/**
 * Fase 3.1d-D2E-A2 — o PLANO CANÔNICO, do lado TypeScript.
 *
 * ─── O problema que a d2e-a1 encontrou ───────────────────────────────────────
 *
 * Stefano aprova hashes, e até aqui nem todos existiam antes da execução:
 *
 *   `read_model_fingerprint` e `runtime_binding_fingerprint` eram ENTRADAS da spec.
 *   A d1 conferia que eram texto não vazio e os copiava; nada os produzia. Nos testes
 *   eram `"x".repeat(64)` e `"b".repeat(64)` — placeholders, sempre foram.
 *
 *   `request_hash` e `user_payload_hash` nasciam DENTRO do `precall_probe`, e obtê-los
 *   exigia reservar e queimar um `execution_id`.
 *
 * Um `execution_fingerprint` derivado de placeholder não descreve execução nenhuma, e
 * ninguém deveria assinar o que não foi calculado.
 *
 * ─── Onde cada valor nasce, e por que não em dois lugares ────────────────────
 *
 *   Python  os cinco valores acima. É lá que `build_governed_request` e
 *           `request_fingerprint` já vivem, e é lá que a execução os calcula — pela
 *           MESMA função, `construir_material_governado`.
 *
 *   TS      `execution_fingerprint` e `subject_content_hash`. É aqui que
 *           `liveExecutionFingerprint` vive, e ela é congelada pela d1.
 *
 * Nenhum valor é calculado dos dois lados. Reimplementar `request_fingerprint` aqui
 * criaria uma segunda verdade sobre os mesmos bytes — o defeito que esta fase veio
 * fechar. Reimplementar `liveExecutionFingerprint` no Python seria o mesmo defeito na
 * direção contrária.
 *
 * ─── O que este módulo NÃO faz ───────────────────────────────────────────────
 *
 * Não reserva, não escreve no livro-razão, não consome autorização, não emite
 * capacidade, não constrói cliente, não chama provedor, não abre rede. Planejar é
 * calcular, e calcular não gasta a execução.
 */

import { spawn } from "node:child_process"
import {
  LIVE_ATTEMPT_DEADLINE_SECONDS,
  LIVE_AUTHORIZATION_TTL_SECONDS,
  LIVE_BACKGROUND,
  LIVE_EXECUTION_SPEC_VERSION,
  LIVE_MAX_RETRIES,
  LIVE_TIMEOUT_DERIVATION_POLICY,
  type LiveExecutionSpecV1,
  liveExecutionFingerprint,
} from "./live-execution"

const CONGELA = Object.freeze

/** O executável EXATO da Hostinger, o mesmo da d2c. Sem PATH, sem `python3`. */
export const PLAN_PYTHON_EXECUTABLE = "/opt/venv/bin/python3"

/**
 * Entrypoint DEDICADO, e não um modo do worker PRECALL.
 *
 * A d1 fechou o defeito de a string `"LIVE"` bastar para mudar comportamento.
 * Acrescentar `mode=` ao worker de execução reabriria a mesma porta com outro nome.
 * Dois entrypoints fixos não têm seletor para adulterar.
 */
export const PLAN_WORKER_MODULE = "creditum_hermes_planner.worker"

export const PLAN_REQUEST_PROTOCOL = "creditum_plan_request/1.0.0"
export const PLAN_RESULT_PROTOCOL = "creditum_plan_result/1.0.0"

/** O `HERMES_HOME` governado — mesma constante fixa que a d2c-r6 estabeleceu. */
export const PLAN_HERMES_HOME = "/data"

export const PLAN_REQUEST_MAX_BYTES = 64 * 1024
export const PLAN_STDOUT_MAX_BYTES = 64 * 1024
export const PLAN_STDERR_MAX_BYTES = 16 * 1024

/** Orçamento próprio do planejamento. Não é a linhagem de 180 s da execução. */
export const PLAN_TIMEOUT_SECONDS = 60

export const OPERATION_REASONING_RESPONSE_ONLY = "REASONING_RESPONSE_ONLY"

const HEX256 = /^[0-9a-f]{64}$/

export const PLAN_DEFECTS = [
  "PLAN_EXECUTION_ID_INVALID",
  "PLAN_HERMES_HOME_MISMATCH",
  "PLAN_SPAWN_FAILED",
  "PLAN_TIMEOUT",
  "PLAN_OUTPUT_TOO_LARGE",
  "PLAN_WORKER_EXIT_NONZERO",
  "PLAN_RESULT_PROTOCOL_INVALID",
  "PLAN_RESULT_BINDING_MISMATCH",
  "PLAN_REFUSED_BY_RUNTIME",
  "PLAN_MATERIAL_INVALID",
] as const
export type PlanDefect = (typeof PLAN_DEFECTS)[number]

/**
 * O plano CANÔNICO, fechado e congelado.
 *
 * Contém valores concretos. Não existe campo opcional, e não existe placeholder: se
 * um valor não pôde ser calculado, não há plano.
 */
export interface CanonicalLivePlanV1 {
  readonly plan_version: "creditum_canonical_live_plan/1.0.0"
  readonly execution_id: string
  readonly read_model_fingerprint: string
  readonly request_fingerprint: string
  readonly runtime_binding_fingerprint: string
  readonly request_hash: string
  readonly user_payload_hash: string
  /** Da d1, por `liveExecutionFingerprint`. */
  readonly execution_fingerprint: string
  /** A d1 exige `request.subject_content_hash === execution_fingerprint`. */
  readonly subject_content_hash: string
  readonly provider: string
  readonly model: string
  readonly api_mode: string
  readonly sdk_version: string
  readonly constitution_id: string
  readonly constitution_version: string
  readonly constitution_hash: string
  readonly system_contract_id: string
  readonly system_contract_version: string
  readonly system_contract_hash: string
  readonly runtime_id: string
  readonly runtime_version: string
  readonly response_policy_id: string
  readonly response_policy_version: string
  readonly tool_count: number
  readonly stream: boolean
  readonly background: boolean
  readonly max_retries: number
  readonly attempt_deadline_seconds: number
  readonly authorization_ttl_seconds: number
  readonly operation: string
  /** A spec exata que a d1 receberá. Derivada, nunca redigitada. */
  readonly spec: LiveExecutionSpecV1
}

export type PlanResult =
  | { readonly status: "planned"; readonly plan: CanonicalLivePlanV1 }
  | { readonly status: "refused"; readonly defect: PlanDefect; readonly child_detail?: string }

/** Só o que o filho precisa. Mesmo conjunto de sete chaves da d2c-r6. */
function ambienteMinimo(): Record<string, string> {
  return {
    HERMES_HOME: PLAN_HERMES_HOME,
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
  readonly excedeu: boolean
  readonly expirou: boolean
  readonly falhouAoNascer: boolean
}

/** UM filho. Sem `shell`, sem interpolação — argumentos são elementos fixos de array. */
async function rodaPlanejador(pedido: string): Promise<SaidaFilho> {
  return new Promise<SaidaFilho>((resolve) => {
    let stdout = ""
    let excedeu = false
    let terminou = false

    const filho = spawn(
      PLAN_PYTHON_EXECUTABLE,
      ["-I", "-B", "-m", PLAN_WORKER_MODULE],
      { env: ambienteMinimo(), stdio: ["pipe", "pipe", "pipe"] },
    )
    const fecha = (s: SaidaFilho): void => {
      if (terminou) return
      terminou = true
      clearTimeout(cronometro)
      resolve(s)
    }
    const cronometro = setTimeout(() => {
      filho.kill("SIGKILL")
      fecha({ rc: null, sinal: "SIGKILL", stdout, excedeu, expirou: true,
              falhouAoNascer: false })
    }, PLAN_TIMEOUT_SECONDS * 1000)

    filho.on("error", () => {
      fecha({ rc: null, sinal: null, stdout, excedeu, expirou: false,
              falhouAoNascer: true })
    })
    filho.stdout?.on("data", (d: Buffer) => {
      if (stdout.length + d.length > PLAN_STDOUT_MAX_BYTES) {
        excedeu = true
        filho.kill("SIGKILL")
        return
      }
      stdout += d.toString("utf8")
    })
    // stderr é lido e DESCARTADO: diagnóstico do filho não sobe para lugar nenhum.
    filho.stderr?.on("data", () => undefined)
    filho.on("close", (rc, sinal) => {
      fecha({ rc, sinal, stdout, excedeu, expirou: false, falhouAoNascer: false })
    })
    filho.stdin?.on("error", () => undefined)
    filho.stdin?.end(pedido)
  })
}

/** Campos EXATOS do resultado bem-sucedido. Nem um a mais, nem um a menos. */
const CAMPOS_TEXTO = [
  "protocol_version", "execution_id", "outcome",
  "read_model_fingerprint", "request_fingerprint", "runtime_binding_fingerprint",
  "request_hash", "user_payload_hash", "provider", "model", "api_mode",
  "sdk_version", "constitution_id", "constitution_version", "constitution_hash",
  "system_contract_id", "system_contract_version", "system_contract_hash",
  "runtime_id", "runtime_version", "response_policy_id", "response_policy_version",
  "operation",
] as const
const CAMPOS_NUMERO = ["tool_count"] as const
const CAMPOS_BOOLEANO = ["stream"] as const
const HASHES_OBRIGATORIOS = [
  "read_model_fingerprint", "request_fingerprint", "runtime_binding_fingerprint",
  "request_hash", "user_payload_hash", "constitution_hash", "system_contract_hash",
] as const

function leResultado(bruto: string): Record<string, unknown> | null {
  const linhas = bruto.split("\n").filter((l) => l.trim() !== "")
  if (linhas.length !== 1) return null
  let doc: unknown
  try {
    doc = JSON.parse(linhas[0] ?? "")
  } catch {
    return null
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null
  const d = doc as Record<string, unknown>
  if (d.protocol_version !== PLAN_RESULT_PROTOCOL) return null
  return d
}

/**
 * Planejamento por FIXTURE — evidência determinística, NÃO produção do Telegram.
 *
 * A r3 renomeou esta função. Ela sempre usou o worker do fixture, e enquanto se
 * chamava `buildCanonicalLivePlan` era, por nome e por uso, "a via de construir um
 * plano". O regate mostrou o custo: a via de produção do Telegram não existia, e esta
 * silenciosamente ocupava o lugar dela.
 *
 * A produção do Telegram usa `canonicalLivePlanFromMaterial` com material derivado da
 * mensagem admitida, no Python, depois de a procedência ser provada.
 *
 * Recebe o `execution_id` já escolhido — e nada mais.
 *
 * Não gera o id, não o reserva e não o marca. Quem escolhe a identidade da execução é
 * quem vai pedir a aprovação; reservar aqui queimaria a execução futura só para
 * calcular um hash, que foi exatamente o impasse da d2e-a1.
 *
 * Nenhum hash entra por parâmetro. O planejador CALCULA.
 */
export async function buildEvidenceCanonicalLivePlan(executionId: string): Promise<PlanResult> {
  if (typeof executionId !== "string" || executionId === "" || executionId.length > 512) {
    return { status: "refused", defect: "PLAN_EXECUTION_ID_INVALID" }
  }
  // Mesma porta fecha-falha da d2c-r6: host que anuncia outra raiz não é o aprovado.
  const homeDoPai = process.env.HERMES_HOME
  if (homeDoPai !== undefined && homeDoPai !== PLAN_HERMES_HOME) {
    return { status: "refused", defect: "PLAN_HERMES_HOME_MISMATCH" }
  }

  const pedido = JSON.stringify({
    protocol_version: PLAN_REQUEST_PROTOCOL,
    execution_id: executionId,
  })
  if (Buffer.byteLength(pedido, "utf8") > PLAN_REQUEST_MAX_BYTES) {
    return { status: "refused", defect: "PLAN_EXECUTION_ID_INVALID" }
  }

  const saida = await rodaPlanejador(pedido)
  if (saida.falhouAoNascer) return { status: "refused", defect: "PLAN_SPAWN_FAILED" }
  if (saida.expirou) return { status: "refused", defect: "PLAN_TIMEOUT" }
  if (saida.excedeu) return { status: "refused", defect: "PLAN_OUTPUT_TOO_LARGE" }
  if (saida.rc !== 0 || saida.sinal !== null) {
    return { status: "refused", defect: "PLAN_WORKER_EXIT_NONZERO" }
  }

  const d = leResultado(saida.stdout)
  if (d === null) return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
  if (d.execution_id !== executionId) {
    return { status: "refused", defect: "PLAN_RESULT_BINDING_MISMATCH" }
  }
  if (d.outcome !== "PLAN_DERIVED") {
    const detalhe = typeof d.defect === "string" ? d.defect.slice(0, 128) : undefined
    return detalhe === undefined
      ? { status: "refused", defect: "PLAN_REFUSED_BY_RUNTIME" }
      : { status: "refused", defect: "PLAN_REFUSED_BY_RUNTIME", child_detail: detalhe }
  }

  // ─── contrato EXATO do sucesso ────────────────────────────────────────────
  for (const c of CAMPOS_TEXTO) {
    if (typeof d[c] !== "string" || d[c] === "") {
      return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
    }
  }
  for (const c of CAMPOS_NUMERO) {
    if (typeof d[c] !== "number" || !Number.isInteger(d[c])) {
      return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
    }
  }
  for (const c of CAMPOS_BOOLEANO) {
    if (typeof d[c] !== "boolean") {
      return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
    }
  }
  const permitidos = new Set<string>([...CAMPOS_TEXTO, ...CAMPOS_NUMERO, ...CAMPOS_BOOLEANO])
  for (const c of Object.keys(d)) {
    if (!permitidos.has(c)) return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
  }
  for (const c of HASHES_OBRIGATORIOS) {
    if (!HEX256.test(d[c] as string)) {
      return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
    }
  }
  // Valores impossíveis para o escopo aprovado.
  if (d.tool_count !== 0 || d.stream !== false) {
    return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
  }
  if (d.operation !== OPERATION_REASONING_RESPONSE_ONLY) {
    return { status: "refused", defect: "PLAN_RESULT_PROTOCOL_INVALID" }
  }

  return canonicalLivePlanFromMaterial(executionId, d)
}

/** Texto obrigatório no material. Ausente ou vazio não vira plano. */
export const PLAN_MATERIAL_TEXT_FIELDS = [
  "read_model_fingerprint", "request_fingerprint", "runtime_binding_fingerprint",
  "request_hash", "user_payload_hash", "provider", "model", "api_mode",
  "sdk_version", "constitution_id", "constitution_version", "constitution_hash",
  "system_contract_id", "system_contract_version", "system_contract_hash",
  "runtime_id", "runtime_version", "response_policy_id", "response_policy_version",
] as const

/** Dos campos acima, os que têm de ser sha-256 hexadecimal. */
export const PLAN_MATERIAL_HASH_FIELDS = [
  "read_model_fingerprint", "request_fingerprint", "runtime_binding_fingerprint",
  "request_hash", "user_payload_hash", "constitution_hash", "system_contract_hash",
] as const

/**
 * O material descreve uma execução possível dentro do escopo aprovado?
 *
 * ─── O que a r4 encontrou aqui ───────────────────────────────────────────────
 *
 * O construtor lia `d.provider as string` e seguia. Um material sem o campo produzia
 * `undefined`, o `as string` calava o compilador, e saía um plano com a palavra
 * "undefined" impressa onde Stefano leria o modelo. Pior: `tool_count` e `stream`
 * eram FIXADOS em 0/false aqui, então um material anunciando três ferramentas era
 * aceito e exibido como zero — o texto mostrado passaria a discordar do material.
 *
 * Fixar o valor certo não basta; o material que discorda tem de ser RECUSADO.
 */
function materialInvalido(d: Record<string, unknown>): boolean {
  for (const c of PLAN_MATERIAL_TEXT_FIELDS) {
    if (typeof d[c] !== "string" || d[c] === "") return true
  }
  for (const c of PLAN_MATERIAL_HASH_FIELDS) {
    if (!HEX256.test(d[c] as string)) return true
  }
  // Os controles do escopo aprovado. Discordância é recusa, nunca substituição.
  if (d.tool_count !== 0) return true
  if (d.stream !== false) return true
  if (d.operation !== OPERATION_REASONING_RESPONSE_ONLY) return true
  return false
}

/**
 * O construtor CANÔNICO puro: material → `CanonicalLivePlanV1`.
 *
 * ─── Por que ele existe separado, desde a r3 ─────────────────────────────────
 *
 * O regate encontrou que a ÚNICA via que construía um `CanonicalLivePlanV1` passava
 * pelo worker do fixture. Ou seja: usar o construtor existente descrevia o fixture, e
 * não usá-lo deixava o Telegram sem o plano que Stefano veria.
 *
 * ─── ELE CRIA DADO. NÃO CRIA AUTORIDADE DE PRODUÇÃO DO TELEGRAM ──────────────
 *
 * Esta função é PURA e não sabe de onde o material veio. Um `CanonicalLivePlanV1`
 * válido saído daqui NÃO é prova de admissão, e a r4 fechou a composição que fazia
 * com que parecesse: quem possui apenas um plano não alcança o renderizador de
 * produção. O texto de produção exige um candidato EMITIDO, e emissão é do Python,
 * depois de a procedência do transporte ser provada.
 */
export function canonicalLivePlanFromMaterial(
  executionId: string,
  d: Record<string, unknown>,
): PlanResult {
  if (typeof executionId !== "string" || executionId === "" || executionId.length > 512) {
    return { status: "refused", defect: "PLAN_EXECUTION_ID_INVALID" }
  }
  if (materialInvalido(d)) return { status: "refused", defect: "PLAN_MATERIAL_INVALID" }

  // ─── a spec da d1, DERIVADA do plano ──────────────────────────────────────
  //
  // Os campos de política vêm das constantes congeladas da d1, não do filho: um
  // planejador comprometido não escolhe `max_retries` nem o prazo.
  const spec: LiveExecutionSpecV1 = {
    spec_version: LIVE_EXECUTION_SPEC_VERSION,
    execution_id: executionId,
    read_model_fingerprint: d.read_model_fingerprint as string,
    request_fingerprint: d.request_fingerprint as string,
    runtime_binding_fingerprint: d.runtime_binding_fingerprint as string,
    provider: d.provider as string,
    model: d.model as string,
    api_mode: d.api_mode as string,
    sdk_version: d.sdk_version as string,
    constitution_hash: d.constitution_hash as string,
    system_contract_hash: d.system_contract_hash as string,
    response_policy_id: d.response_policy_id as string,
    response_policy_version: d.response_policy_version as string,
    tool_count: 0,
    stream: false,
    background: LIVE_BACKGROUND,
    max_retries: LIVE_MAX_RETRIES,
    attempt_deadline_seconds: LIVE_ATTEMPT_DEADLINE_SECONDS,
    authorization_ttl_seconds: LIVE_AUTHORIZATION_TTL_SECONDS,
    timeout_derivation_policy: LIVE_TIMEOUT_DERIVATION_POLICY,
  } as unknown as LiveExecutionSpecV1
  CONGELA(spec)

  // A função CONGELADA da d1. Não há segunda implementação deste hash.
  const fingerprint = liveExecutionFingerprint(spec)

  const plano: CanonicalLivePlanV1 = {
    plan_version: "creditum_canonical_live_plan/1.0.0",
    execution_id: executionId,
    read_model_fingerprint: d.read_model_fingerprint as string,
    request_fingerprint: d.request_fingerprint as string,
    runtime_binding_fingerprint: d.runtime_binding_fingerprint as string,
    request_hash: d.request_hash as string,
    user_payload_hash: d.user_payload_hash as string,
    execution_fingerprint: fingerprint,
    // A d1 confere `request.subject_content_hash !== fingerprint` e recusa. O que
    // Stefano assina como conteúdo É o fingerprint da execução — não um segundo hash.
    subject_content_hash: fingerprint,
    provider: d.provider as string,
    model: d.model as string,
    api_mode: d.api_mode as string,
    sdk_version: d.sdk_version as string,
    constitution_id: d.constitution_id as string,
    constitution_version: d.constitution_version as string,
    constitution_hash: d.constitution_hash as string,
    system_contract_id: d.system_contract_id as string,
    system_contract_version: d.system_contract_version as string,
    system_contract_hash: d.system_contract_hash as string,
    runtime_id: d.runtime_id as string,
    runtime_version: d.runtime_version as string,
    response_policy_id: d.response_policy_id as string,
    response_policy_version: d.response_policy_version as string,
    tool_count: 0,
    stream: false,
    background: LIVE_BACKGROUND,
    max_retries: LIVE_MAX_RETRIES,
    attempt_deadline_seconds: LIVE_ATTEMPT_DEADLINE_SECONDS,
    authorization_ttl_seconds: LIVE_AUTHORIZATION_TTL_SECONDS,
    operation: OPERATION_REASONING_RESPONSE_ONLY,
    spec,
  }
  CONGELA(plano)
  return { status: "planned", plan: plano }
}

/**
 * O plano aprovado descreve a execução que vai sair?
 *
 * Chamada ANTES de qualquer `Responses.create`. Divergiu, recusa — e recusar aqui é o
 * desfecho certo: aprovação humana vale para o que foi mostrado, não para o que o
 * runtime reconstruiu depois. Qualquer mudança material exige plano novo, hashes novos
 * e aprovação nova.
 */
export function plansMatch(
  aprovado: CanonicalLivePlanV1,
  agora: CanonicalLivePlanV1,
): boolean {
  const CAMPOS = [
    "plan_version", "execution_id", "read_model_fingerprint", "request_fingerprint",
    "runtime_binding_fingerprint", "request_hash", "user_payload_hash",
    "execution_fingerprint", "subject_content_hash", "provider", "model", "api_mode",
    "sdk_version", "constitution_hash", "system_contract_hash", "response_policy_id",
    "response_policy_version", "tool_count", "stream", "background", "max_retries",
    "attempt_deadline_seconds", "authorization_ttl_seconds", "operation",
  ] as const
  for (const c of CAMPOS) {
    if (aprovado[c] !== agora[c]) return false
  }
  return true
}

/**
 * O texto de EVIDÊNCIA. Não é o texto de autorização de produção do Telegram.
 *
 * ─── Por que o nome mudou na r4 ──────────────────────────────────────────────
 *
 * Enquanto se chamava `renderAuthorizationText` e aceitava qualquer
 * `CanonicalLivePlanV1`, ele era — por nome, tipo e uso — "o renderizador de
 * autorização". Isso deixava uma composição aberta:
 *
 *     material arbitrário → canonicalLivePlanFromMaterial → renderAuthorizationText
 *
 * Três passos, nenhum deles envolvendo o Telegram, e o resultado tinha a aparência do
 * texto que Stefano assina. Renomear sozinho não fecharia nada; o que fecha é o
 * renderizador de produção EXIGIR um candidato emitido, que vive no Python e não é
 * construível a partir de um plano. Esta função continua existindo, e continua
 * imprimindo `transport: NOT YET BOUND` — porque é literalmente verdade sobre ela.
 *
 * Determinístico: o mesmo plano dá o mesmo texto. E ele NÃO é aprovação.
 */
export function renderEvidenceAuthorizationText(plano: CanonicalLivePlanV1): string {
  const l = (rotulo: string, valor: string | number | boolean): string =>
    `  ${rotulo.padEnd(28)}${String(valor)}`
  return [
    "EVIDÊNCIA DE PLANO CANÔNICO — CREDITUM HERMES",
    "",
    "  Uma execução. Uma tentativa. Sem retomada.",
    "",
    "IDENTIDADE",
    l("execution_id", plano.execution_id),
    l("subject_content_hash", plano.subject_content_hash),
    l("execution_fingerprint", plano.execution_fingerprint),
    l("request_hash", plano.request_hash),
    l("user_payload_hash", plano.user_payload_hash),
    "",
    "PRECURSORES",
    l("read_model_fingerprint", plano.read_model_fingerprint),
    l("request_fingerprint", plano.request_fingerprint),
    l("runtime_binding_fingerprint", plano.runtime_binding_fingerprint),
    "",
    "RUNTIME",
    l("provider", plano.provider),
    l("model", plano.model),
    l("api_mode", plano.api_mode),
    l("sdk_version", plano.sdk_version),
    l("constitution", `${plano.constitution_id} ${plano.constitution_version}`),
    l("system_contract", `${plano.system_contract_id} ${plano.system_contract_version}`),
    l("response_policy", `${plano.response_policy_id} ${plano.response_policy_version}`),
    "",
    "CONTROLES",
    l("tools", plano.tool_count),
    l("max_retries", plano.max_retries),
    l("stream", plano.stream),
    l("background", plano.background),
    l("attempt_deadline_seconds", plano.attempt_deadline_seconds),
    l("authorization_ttl_seconds", plano.authorization_ttl_seconds),
    "",
    "ESCOPO",
    l("operation", plano.operation),
    l("transport", "NOT YET BOUND"),
    "",
    "  Este texto é EVIDÊNCIA. Não é a autorização de produção do Telegram: não há",
    "  transporte vinculado aqui, e nenhuma mensagem admitida o originou.",
  ].join("\n")
}
