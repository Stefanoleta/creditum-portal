/**
 * Fase 3.1d-D1 — ENVELOPE DE SEGURANÇA DA PRIMEIRA CHAMADA VIVA.
 *
 * ─── Por que a autoridade mora AQUI, e não no Python ──────────────────────────
 *
 * A efetividade de uma decisão de Stefano é `resolveEffectiveDecision` — cadeia de
 * supersessão, bifurcação, raízes múltiplas, supersessão entre pedidos, decisor não
 * autorizado. Cada regra nasceu de um gate adversarial que achou um furo real.
 *
 * O Python não consegue REUSAR isso: só reimplementar. E reimplementar criaria uma
 * segunda definição, mais fraca, de "aprovação efetiva" — o defeito que a r6-r6 e a
 * c6-r1 já pagaram para fechar em outros eixos.
 *
 * Então: TypeScript é a autoridade humana. Python é trabalhador subordinado. Nenhum
 * token de aprovação atravessa a fronteira, porque um token que atravessa é dado, e
 * dado se replica.
 *
 * ─── A autorização não é um objeto que se possa forjar ───────────────────────
 *
 * `LiveExecutionAuthorization` é local ao processo, selada por símbolo do módulo, de
 * uso único e NÃO serializável como autoridade. Um JSON com os mesmos campos não é
 * uma autorização — é a descrição de uma.
 *
 * ─── Três vocabulários, e um dono para cada valor ────────────────────────────
 *
 *   A. REQUEST_FIELDS            o pedido SEMÂNTICO ao modelo. Fechado em 5, intocado.
 *   B. controles de `create`     `background`, `timeout` — modo e limite da execução
 *   C. controles do CLIENTE      `max_retries` — só existe na construção do cliente
 *
 * `timeout` é dinâmico: depende do relógio. Pô-lo no pedido semântico faria o
 * fingerprint aprovado por Stefano mudar a cada milissegundo, e um fingerprint que
 * muda não é compromisso com nada.
 */

import { createHash } from "node:crypto"
import {
  decisionAuthorizes,
  resolveEffectiveDecision,
  toOwnedApprovalRequest,
} from "./hermes"
import type { ApprovalRequestV1 } from "./hermes"
import { deepFreeze } from "./immutability"

// ═════════════════════════════════════════════════════════════════════════════
// Constantes governadas
// ═════════════════════════════════════════════════════════════════════════════

/** Prazo TOTAL de uma tentativa. Limite de segurança de execução, não regra de negócio. */
export const LIVE_ATTEMPT_DEADLINE_SECONDS = 180

/** Validade da autorização antes do consumo. Não consumida em 5 min: expirada. */
export const LIVE_AUTHORIZATION_TTL_SECONDS = 300

/** Zero retry automático. O SDK 2.24.0 traz `max_retries=2` por padrão — observado. */
export const LIVE_MAX_RETRIES = 0

/** Modo de execução do servidor. Omitir seria aceitar o default remoto, que não observamos. */
export const LIVE_BACKGROUND = false

export const LIVE_EXECUTION_SPEC_VERSION = "1.0.0" as const
export const LIVE_EXECUTION_FINGERPRINT_DOMAIN =
  "creditum_live_execution_spec/v1" as const

/**
 * A regra DETERMINÍSTICA de derivação do timeout, versionada.
 *
 * Stefano aprova um ALGORITMO limitado, não uma leitura futura de relógio. O
 * fingerprint compromete-se com esta identidade e com os 180 s — nunca com o float
 * que só existirá no instante da chamada.
 */
export const LIVE_TIMEOUT_DERIVATION_POLICY =
  "creditum_live_timeout_derivation/v1" as const

export const LIVE_AUTHORIZATION_DEFECTS = [
  "SPEC_NOT_OWNED_SNAPSHOT",
  "INVALID_APPROVAL_REQUEST",
  "INVALID_EXECUTION_SPEC",
  "REQUEST_WITHDRAWN",
  "REQUEST_NOT_DECIDED",
  "APPROVAL_SUBJECT_MISMATCH",
  "APPROVAL_MISSING_CONTENT_BINDING",
  "EXECUTION_FINGERPRINT_MISMATCH",
  "NO_DECISION",
  "MALFORMED_DECISION_CHAIN",
  "SUPERSEDED_DECISION",
  "DECISION_DOES_NOT_AUTHORIZE",
  "SPEC_CONTROL_POLICY_MISMATCH",
] as const
export type LiveAuthorizationDefect = (typeof LIVE_AUTHORIZATION_DEFECTS)[number]

export const LIVE_CONSUMPTION_DEFECTS = [
  "AUTHORIZATION_NOT_OWNED",
  "AUTHORIZATION_ALREADY_CONSUMED",
  "AUTHORIZATION_EXPIRED",
  "DEADLINE_ALREADY_EXPIRED",
] as const
export type LiveConsumptionDefect = (typeof LIVE_CONSUMPTION_DEFECTS)[number]

// ═════════════════════════════════════════════════════════════════════════════
// A especificação da execução — o que Stefano aprova
// ═════════════════════════════════════════════════════════════════════════════

export interface LiveExecutionSpecV1 {
  readonly spec_version: typeof LIVE_EXECUTION_SPEC_VERSION
  readonly execution_id: string
  /** Fingerprint do read model PRÓPRIO. O MESMO X do início ao fim. */
  readonly read_model_fingerprint: string
  /** Fingerprint do pedido semântico governado — o que a r5 verifica e invoca. */
  readonly request_fingerprint: string
  readonly runtime_binding_fingerprint: string
  readonly provider: string
  readonly model: string
  readonly api_mode: string
  readonly sdk_version: string
  readonly constitution_hash: string
  readonly system_contract_hash: string
  readonly response_policy_id: string
  readonly response_policy_version: string
  readonly tool_count: 0
  readonly stream: false
  readonly background: false
  readonly max_retries: 0
  readonly attempt_deadline_seconds: number
  readonly authorization_ttl_seconds: number
  readonly timeout_derivation_policy: typeof LIVE_TIMEOUT_DERIVATION_POLICY
}

/**
 * As chaves governadas, em ordem FIXA. Conjunto FECHADO: chave desconhecida é erro,
 * nunca campo ignorado em silêncio.
 */
const LIVE_EXECUTION_SPEC_KEYS = [
  "spec_version",
  "execution_id",
  "read_model_fingerprint",
  "request_fingerprint",
  "runtime_binding_fingerprint",
  "provider",
  "model",
  "api_mode",
  "sdk_version",
  "constitution_hash",
  "system_contract_hash",
  "response_policy_id",
  "response_policy_version",
  "tool_count",
  "stream",
  "background",
  "max_retries",
  "attempt_deadline_seconds",
  "authorization_ttl_seconds",
  "timeout_derivation_policy",
] as const

const CHAVES_GOVERNADAS: ReadonlySet<string> = new Set(LIVE_EXECUTION_SPEC_KEYS)

/** Instantâneos PRÓPRIOS emitidos por este módulo. Uma referência do chamador não entra. */
const PROPRIAS = new WeakSet<object>()

/**
 * O `Object.freeze` confiável, capturado na INICIALIZAÇÃO do módulo.
 *
 * `Object.freeze` é `writable: true, configurable: true`. A regra da d2c-r5 vale aqui
 * igual: construir o objeto localmente, congelar ESSE objeto com o intrínseco
 * capturado, e atribuir o local — nunca `x = freeze(...)`.
 *
 * Há um caminho concreto se isto faltar: com `Object.freeze` adulterado, a spec própria
 * não fica realmente congelada, e ela é publicada em `auth.spec`. O detentor então muta
 * `model` DEPOIS de Stefano ter aprovado um fingerprint que descrevia outra coisa.
 */
const CONGELA = Object.freeze

/**
 * Instantâneo PRÓPRIO da spec — a fronteira de propriedade da d1-r1.
 *
 * ─── Por que ler cada campo EXATAMENTE UMA VEZ ───────────────────────────────
 *
 * A d1 calculava o fingerprint sobre o objeto do CHAMADOR e só depois o construtor
 * fazia uma cópia INDEPENDENTE. Com campos primitivos os dois coincidem — mas a
 * coincidência é acidente da forma atual, não garantia da construção.
 *
 * E ela quebra hoje, sem campo novo nenhum: um `get model()` que devolve um valor na
 * leitura do fingerprint e outro na leitura da cópia produz autorização cujo
 * fingerprint aprovado NÃO descreve a spec armazenada. Ler uma vez, aqui, e derivar
 * tudo o mais deste instantâneo elimina a janela por construção.
 *
 * Ordem, seguindo a disciplina já estabelecida em `canonicoProprio`: validar a
 * ESTRUTURA do objeto submetido inteiro (chave desconhecida continua sendo erro),
 * copiar, congelar a cópia. Nunca congelar o grafo do chamador.
 */
function toOwnedLiveExecutionSpec(raw: unknown): LiveExecutionSpecV1 | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null

  const presentes = Reflect.ownKeys(raw)
  if (presentes.length !== LIVE_EXECUTION_SPEC_KEYS.length) return null
  for (const chave of presentes) {
    if (typeof chave !== "string") return null
    if (!CHAVES_GOVERNADAS.has(chave)) return null
  }

  // Uma leitura por campo. Depois daqui o objeto do chamador não é mais consultado.
  const fonte = raw as Record<string, unknown>
  const proprio = {
    spec_version: fonte.spec_version,
    execution_id: fonte.execution_id,
    read_model_fingerprint: fonte.read_model_fingerprint,
    request_fingerprint: fonte.request_fingerprint,
    runtime_binding_fingerprint: fonte.runtime_binding_fingerprint,
    provider: fonte.provider,
    model: fonte.model,
    api_mode: fonte.api_mode,
    sdk_version: fonte.sdk_version,
    constitution_hash: fonte.constitution_hash,
    system_contract_hash: fonte.system_contract_hash,
    response_policy_id: fonte.response_policy_id,
    response_policy_version: fonte.response_policy_version,
    tool_count: fonte.tool_count,
    stream: fonte.stream,
    background: fonte.background,
    max_retries: fonte.max_retries,
    attempt_deadline_seconds: fonte.attempt_deadline_seconds,
    authorization_ttl_seconds: fonte.authorization_ttl_seconds,
    timeout_derivation_policy: fonte.timeout_derivation_policy,
  } as unknown as LiveExecutionSpecV1

  // Congelamento PROFUNDO, não raso. Hoje todos os campos são primitivos; a
  // imutabilidade não pode depender dessa propriedade acidental continuar valendo.
  //
  // `deepFreeze` devolve o MESMO objeto — não o retorno de `Object.freeze` — então
  // adulterar o intrínseco não substitui a spec. Mas poderia deixá-la NÃO congelada, e
  // ela é publicada em `auth.spec`. Por isso o congelamento raso vem também do
  // intrínseco capturado. Raso basta e isso é demonstrável: `especificacaoValida` e
  // `politicaDeControleExata` juntas exigem que os vinte campos sejam primitivos.
  deepFreeze(proprio)
  CONGELA(proprio)
  PROPRIAS.add(proprio)
  return proprio
}

/** Só primitivos governados; nenhum campo aceita objeto do chamador. */
function especificacaoValida(spec: LiveExecutionSpecV1): boolean {
  const texto = (v: unknown): boolean => typeof v === "string" && v.length > 0
  return (
    spec !== null &&
    typeof spec === "object" &&
    spec.spec_version === LIVE_EXECUTION_SPEC_VERSION &&
    texto(spec.execution_id) &&
    texto(spec.read_model_fingerprint) &&
    texto(spec.request_fingerprint) &&
    texto(spec.runtime_binding_fingerprint) &&
    texto(spec.provider) &&
    texto(spec.model) &&
    texto(spec.api_mode) &&
    texto(spec.sdk_version) &&
    texto(spec.constitution_hash) &&
    texto(spec.system_contract_hash) &&
    texto(spec.response_policy_id) &&
    texto(spec.response_policy_version) &&
    spec.timeout_derivation_policy === LIVE_TIMEOUT_DERIVATION_POLICY
  )
}

/**
 * A política de controle de execução, conferida por IGUALDADE EXATA.
 *
 * Uma spec que peça `background: true`, retry, stream ou ferramenta não é uma spec
 * mais permissiva — é outra política, e não existe autorização para ela.
 */
function politicaDeControleExata(spec: LiveExecutionSpecV1): boolean {
  return (
    spec.tool_count === 0 &&
    spec.stream === false &&
    spec.background === LIVE_BACKGROUND &&
    spec.max_retries === LIVE_MAX_RETRIES &&
    spec.attempt_deadline_seconds === LIVE_ATTEMPT_DEADLINE_SECONDS &&
    spec.authorization_ttl_seconds === LIVE_AUTHORIZATION_TTL_SECONDS
  )
}

/**
 * O compromisso de CONTEÚDO da execução — o `subject_content_hash` que Stefano aprova.
 *
 * Campos em ordem FIXA, nunca iteração sobre chaves: ordem de inserção não pode
 * influenciar identidade. Não inclui o timeout derivado: ele não existe no momento da
 * aprovação, e comprometer-se com ele seria comprometer-se com uma leitura de relógio.
 */
export function liveExecutionFingerprint(spec: LiveExecutionSpecV1): string {
  const material = JSON.stringify({
    d: LIVE_EXECUTION_FINGERPRINT_DOMAIN,
    v: spec.spec_version,
    execution_id: spec.execution_id,
    read_model_fingerprint: spec.read_model_fingerprint,
    request_fingerprint: spec.request_fingerprint,
    runtime_binding_fingerprint: spec.runtime_binding_fingerprint,
    provider: spec.provider,
    model: spec.model,
    api_mode: spec.api_mode,
    sdk_version: spec.sdk_version,
    constitution_hash: spec.constitution_hash,
    system_contract_hash: spec.system_contract_hash,
    response_policy_id: spec.response_policy_id,
    response_policy_version: spec.response_policy_version,
    tool_count: spec.tool_count,
    stream: spec.stream,
    background: spec.background,
    max_retries: spec.max_retries,
    attempt_deadline_seconds: spec.attempt_deadline_seconds,
    authorization_ttl_seconds: spec.authorization_ttl_seconds,
    timeout_derivation_policy: spec.timeout_derivation_policy,
  })
  return createHash("sha256").update(material, "utf8").digest("hex")
}

// ═════════════════════════════════════════════════════════════════════════════
// A capacidade selada
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Selo do MÓDULO. Não é exportado, então nenhum chamador o obtém — e sem ele não se
 * constrói uma autorização, nem se falsifica uma.
 */
const SELO: unique symbol = Symbol("creditum.live_execution_authorization")

/** Relógio MONOTÔNICO. `Date.now()` anda para trás com ajuste de hora, e uma
 *  capacidade que expira por relógio de parede se estende quando o relógio recua. */
export function monotonicSeconds(): number {
  return Number(process.hrtime.bigint() / 1_000_000n) / 1000
}

/**
 * O que a EMISSÃO fixou. Cópia própria, congelada, capturada das fontes já validadas.
 *
 * Isto NÃO é autoridade transferível: é dado. Não tem selo, não tem marca de classe, e
 * devolvê-lo a qualquer via governada falha na conferência de marca.
 */
export interface IssuedAuthorizationState {
  /** O MESMO instantâneo próprio e congelado. Nunca uma segunda representação. */
  readonly spec: LiveExecutionSpecV1
  readonly execution_fingerprint: string
  readonly decision_id: string
  readonly issued_at_monotonic: number
  /** O TTL e o prazo vêm da EMISSÃO — nunca de campo público relido. */
  readonly authorization_ttl_seconds: number
  readonly attempt_deadline_seconds: number
}

/**
 * O consumidor LEXICAL do módulo. Atribuído no bloco `static {}` da classe, onde os
 * campos privados são visíveis. Não é exportado e não recebe retorno de chamada.
 */
let consumirAutorizacaoViva!: (auth: unknown, agora: number) => LiveConsumptionResult

export class LiveExecutionAuthorization {
  /**
   * ─── A AUTORIDADE ────────────────────────────────────────────────────────
   *
   * Campos privados de LINGUAGEM. `#emissao` responde "o que Stefano autorizou" e
   * `#consumida` responde "já foi gasta". Nenhum é alcançável por propriedade,
   * protótipo, `Reflect` ou serialização, e nenhum depende de método substituível.
   *
   * Substituem `private consumida` + `_consumeOnce(SELO)` + `EMITIDAS.has(auth)` +
   * `instanceof`. Os três últimos eram despacho MUTÁVEL no caminho de autoridade:
   *
   *   A._consumeOnce = B._consumeOnce.bind(B)  → consumir A queimava B
   *   A._consumeOnce = () => true              → uso único desaparecia
   *   WeakSet.prototype.has = () => true       → objeto qualquer virava emissão
   *   Object.defineProperty(C, Symbol.hasInstance, …) → `instanceof` mentia
   *
   * E `_consumeOnce(SELO)` entregava o selo do módulo a uma função escolhida pelo
   * detentor. A d2b/d2c pagaram quatro rodadas para fechar esta classe; aqui é a
   * mesma correção, no módulo que guarda a autoridade de Stefano.
   */
  readonly #emissao: IssuedAuthorizationState
  #consumida = false

  /**
   * ─── OBSERVACIONAIS, não autoritativos ──────────────────────────────────
   *
   * `readonly` é do compilador; em runtime são graváveis. Reescrevê-los não muda
   * identidade da aprovação, vínculo de execução, TTL, prazo, fingerprint nem consumo.
   */
  readonly spec: LiveExecutionSpecV1
  readonly execution_fingerprint: string
  readonly decision_id: string
  readonly issued_at_monotonic: number

  /** @internal — só `issueLiveExecutionAuthorization` passa o selo. */
  constructor(
    selo: typeof SELO,
    spec: LiveExecutionSpecV1,
    fingerprint: string,
    decision_id: string,
    issued_at_monotonic: number,
  ) {
    if (selo !== SELO) {
      throw new Error("LIVE_AUTHORIZATION_NOT_OWNED")
    }
    // A spec armazenada TEM de ser o instantâneo próprio — não uma referência do
    // chamador, não um clone independente feito depois do fingerprint.
    if (!PROPRIAS.has(spec)) {
      throw new Error("LIVE_AUTHORIZATION_SPEC_NOT_OWNED")
    }
    // E o fingerprint selado TEM de ser o desta spec. Dois valores fornecidos de
    // fora não se conferem sozinhos: aqui um deles é DERIVADO do outro.
    if (liveExecutionFingerprint(spec) !== fingerprint) {
      throw new Error("LIVE_AUTHORIZATION_FINGERPRINT_NOT_OF_SPEC")
    }
    // Mesma referência. Copiar de novo aqui recriaria a divergência que a r1 fecha.
    this.spec = spec
    // ─── r2: o invariante conferido DEPOIS da atribuição ─────────────────────
    //
    // A conferência acima olha o ARGUMENTO. Esta olha o que ficou ARMAZENADO — e é
    // essa que protege o invariante "nenhuma representação posterior". Um clone
    // introduzido aqui perde a identidade própria e falha pelo caminho normal do
    // emissor exportado, sem exportar o selo nem abrir costura de teste.
    //
    // A r1 classificou a mutação deste ponto como guarda inalcançável. Estava errado:
    // esta linha executa em TODA emissão bem-sucedida. O regate do Codex cobrou.
    if (!PROPRIAS.has(this.spec)) {
      throw new Error("LIVE_AUTHORIZATION_SPEC_NOT_OWNED")
    }
    this.execution_fingerprint = fingerprint
    this.decision_id = decision_id
    this.issued_at_monotonic = issued_at_monotonic

    // ─── O estado AUTORITATIVO, construído LOCALMENTE ───────────────────────
    //
    // Objeto local, congelado no lugar com o intrínseco capturado, e o LOCAL é o que
    // se atribui. `this.#emissao = CONGELA(...)` faria a autoridade ser o valor de
    // retorno de uma função substituível — o defeito que a d2c-r5 fechou.
    const emitida: IssuedAuthorizationState = {
      spec,
      execution_fingerprint: fingerprint,
      decision_id,
      issued_at_monotonic,
      authorization_ttl_seconds: spec.authorization_ttl_seconds,
      attempt_deadline_seconds: spec.attempt_deadline_seconds,
    }
    CONGELA(emitida)
    this.#emissao = emitida
  }

  /** Já foi consumida? Leitura, não autoridade — e vem do campo privado. */
  get isConsumed(): boolean {
    return this.#consumida
  }

  /**
   * Serializar uma autorização produziria um objeto que PARECE autoridade. Recusa.
   *
   * O evento de auditoria seguro é outro objeto, montado por `safeAuditView()`, e ele
   * nunca é aceito de volta como capacidade.
   */
  toJSON(): never {
    throw new Error("LIVE_AUTHORIZATION_NOT_SERIALIZABLE")
  }

  /**
   * Primitivos governados para auditoria. NUNCA aceito de volta como autoridade.
   *
   * Lê a EMISSÃO, não os campos públicos: uma visão que o detentor pudesse reescrever
   * seria auditoria de nada.
   */
  safeAuditView(): Readonly<Record<string, string | number | boolean>> {
    const e = this.#emissao
    const visao = {
      execution_id: e.spec.execution_id,
      execution_fingerprint: e.execution_fingerprint,
      decision_id: e.decision_id,
      response_policy_id: e.spec.response_policy_id,
      response_policy_version: e.spec.response_policy_version,
      provider: e.spec.provider,
      model: e.spec.model,
      api_mode: e.spec.api_mode,
      sdk_version: e.spec.sdk_version,
      attempt_deadline_seconds: e.attempt_deadline_seconds,
      max_retries: e.spec.max_retries,
      background: e.spec.background,
      stream: e.spec.stream,
      tool_count: e.spec.tool_count,
      consumed: this.#consumida,
    }
    CONGELA(visao)
    return visao
  }

  /**
   * Marca, TTL e uso único — os três dentro da classe, onde os campos privados
   * existem, e sem uma única chamada que o detentor possa substituir.
   *
   * `#emissao in auth` é a MARCA: só o construtor real instala um campo privado.
   * `Object.create(prototype)` não a tem, objeto de mesma forma não a tem, registro
   * lido do disco não a tem. Substitui `instanceof` e o `WeakSet` de emitidas.
   *
   * A ORDEM é a de sempre e não mudou: marca → TTL → uso único. Uma autorização
   * expirada NÃO é consumida; exigir aprovação nova é o desfecho certo, e queimá-la
   * aqui esconderia a expiração atrás de "já usada".
   *
   * Atômico por construção: entre ler e escrever `#consumida` não há `await`, chamada
   * externa nem despacho, e o JavaScript não preempta dentro de função síncrona.
   */
  static {
    consumirAutorizacaoViva = (auth: unknown, agora: number): LiveConsumptionResult => {
      if (auth === null || typeof auth !== "object" || !(#emissao in auth)) {
        return { status: "refused", defect: "AUTHORIZATION_NOT_OWNED" }
      }
      const e = auth.#emissao
      const idade = agora - e.issued_at_monotonic
      if (!Number.isFinite(idade) || idade >= e.authorization_ttl_seconds) {
        return { status: "refused", defect: "AUTHORIZATION_EXPIRED" }
      }
      if (auth.#consumida) {
        return { status: "refused", defect: "AUTHORIZATION_ALREADY_CONSUMED" }
      }
      auth.#consumida = true
      return {
        status: "consumed",
        attempt_deadline_monotonic: agora + e.attempt_deadline_seconds,
        execution_fingerprint: e.execution_fingerprint,
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Emissão — reusa o avaliador canônico, nunca uma cópia dele
// ═════════════════════════════════════════════════════════════════════════════

export type LiveAuthorizationResult =
  | { readonly status: "authorized"; readonly authorization: LiveExecutionAuthorization }
  | { readonly status: "not_authorized"; readonly defect: LiveAuthorizationDefect }

/**
 * Emite autorização para UMA execução específica.
 *
 * ─── O que ela NÃO faz ───────────────────────────────────────────────────────
 *
 * Não avalia efetividade de decisão por conta própria. Chama
 * `resolveEffectiveDecision` e `decisionAuthorizes` — as MESMAS funções que
 * `authorizeSharedBriefing` chama. Uma implementação, dois consumidores.
 */
export function issueLiveExecutionAuthorization(
  /** Dado do chamador. O TIPO nasce do funil próprio, nunca de um `as`. */
  spec: unknown,
  approvalRequestRaw: unknown,
  decisionsRaw: unknown,
): LiveAuthorizationResult {
  // ─── Fronteira de propriedade: PRIMEIRO o instantâneo próprio ──────────────
  // Tudo daqui para baixo — validação, fingerprint, comparação com o hash aprovado,
  // selagem — lê ownedSpec. O objeto do chamador não é consultado outra vez.
  const ownedSpec = toOwnedLiveExecutionSpec(spec)
  if (ownedSpec === null) {
    return { status: "not_authorized", defect: "SPEC_NOT_OWNED_SNAPSHOT" }
  }
  if (!especificacaoValida(ownedSpec)) {
    return { status: "not_authorized", defect: "INVALID_EXECUTION_SPEC" }
  }
  if (!politicaDeControleExata(ownedSpec)) {
    return { status: "not_authorized", defect: "SPEC_CONTROL_POLICY_MISMATCH" }
  }

  // Instantâneo próprio + validação canônica + congelamento, exatamente como a
  // fronteira de divulgação. Tipo não é validação: um `as` entrega qualquer coisa.
  let request: ApprovalRequestV1
  try {
    request = toOwnedApprovalRequest(approvalRequestRaw)
  } catch {
    return { status: "not_authorized", defect: "INVALID_APPROVAL_REQUEST" }
  }

  // Ciclo de vida do PEDIDO, antes de qualquer hash.
  if (request.status === "WITHDRAWN") {
    return { status: "not_authorized", defect: "REQUEST_WITHDRAWN" }
  }
  if (request.status !== "DECIDED" || request.decision_ref === undefined) {
    return { status: "not_authorized", defect: "REQUEST_NOT_DECIDED" }
  }

  // O pedido tem de ser sobre ESTA execução. `OTHER` + a id da execução: a fase D1
  // não altera o enum canônico, e o compromisso real é o hash de conteúdo.
  if (request.subject_type !== "OTHER" || request.subject_ref !== ownedSpec.execution_id) {
    return { status: "not_authorized", defect: "APPROVAL_SUBJECT_MISMATCH" }
  }
  if (request.subject_content_hash === undefined) {
    return { status: "not_authorized", defect: "APPROVAL_MISSING_CONTENT_BINDING" }
  }
  const fingerprint = liveExecutionFingerprint(ownedSpec)
  if (request.subject_content_hash !== fingerprint) {
    // Id sozinha não autoriza. Stefano aprova UMA execução, não um identificador.
    return { status: "not_authorized", defect: "EXECUTION_FINGERPRINT_MISMATCH" }
  }

  // ─── A autoridade canônica, reusada ────────────────────────────────────────
  const efetiva = resolveEffectiveDecision(request.approval_id, decisionsRaw)
  if (efetiva.status === "no_decision") {
    return { status: "not_authorized", defect: "NO_DECISION" }
  }
  if (efetiva.status === "malformed_chain") {
    return { status: "not_authorized", defect: "MALFORMED_DECISION_CHAIN" }
  }
  if (efetiva.decision.decision_id !== request.decision_ref) {
    // O terminal efetivo não é o que o pedido aponta: a decisão apontada foi sucedida.
    return { status: "not_authorized", defect: "SUPERSEDED_DECISION" }
  }
  if (!decisionAuthorizes(efetiva.decision.decision)) {
    return { status: "not_authorized", defect: "DECISION_DOES_NOT_AUTHORIZE" }
  }

  const autorizacao = new LiveExecutionAuthorization(
    SELO,
    ownedSpec,
    fingerprint,
    efetiva.decision.decision_id,
    monotonicSeconds(),
  )
  // Nada a registrar fora do objeto: a marca de linguagem JÁ é a prova de emissão, e
  // foi instalada pelo construtor — que exige o selo do módulo e uma spec própria.
  return { status: "authorized", authorization: autorizacao }
}

// ═════════════════════════════════════════════════════════════════════════════
// Consumo e prazo
// ═════════════════════════════════════════════════════════════════════════════

export type LiveConsumptionResult =
  | {
      readonly status: "consumed"
      /** Prazo TOTAL, monotônico, de propriedade do orquestrador TypeScript. */
      readonly attempt_deadline_monotonic: number
      readonly execution_fingerprint: string
    }
  | { readonly status: "refused"; readonly defect: LiveConsumptionDefect }

/**
 * Consome a autorização ANTES de qualquer coisa que possa chamar o provedor.
 *
 * Uso único vale para TODO desfecho — timeout, falha de transporte, recusa do modelo,
 * resposta malformada, rejeição semântica. Uma segunda tentativa exige uma nova
 * aprovação humana.
 */
export function consumeLiveExecutionAuthorization(
  auth: unknown,
  nowMonotonic: number = monotonicSeconds(),
): LiveConsumptionResult {
  return consumirAutorizacaoViva(auth, nowMonotonic)
}

export type TimeoutDerivation =
  | { readonly status: "ok"; readonly timeout_seconds: number }
  | { readonly status: "expired" }

/**
 * O timeout do `create`, derivado do orçamento monotônico RESTANTE.
 *
 * ─── Quem é o dono do prazo TOTAL ────────────────────────────────────────────
 *
 * A 3.1d-D1 observou que o timeout do httpx é POR FASE — `connect`, `read`, `write`,
 * `pool`. `Timeout(180)` põe 180 em cada uma, e o pior caso soma acima de 180.
 *
 * Então o prazo total NÃO é garantido pelo SDK. Ele é do orquestrador TypeScript, por
 * relógio monotônico, com descarte do resultado tardio. O timeout do SDK é um limite
 * SECUNDÁRIO de transporte, e nunca excede o restante.
 */
export function deriveAttemptTimeoutSeconds(
  attemptDeadlineMonotonic: number,
  nowMonotonic: number = monotonicSeconds(),
): TimeoutDerivation {
  const restante = attemptDeadlineMonotonic - nowMonotonic
  if (!Number.isFinite(restante) || restante <= 0) {
    return { status: "expired" }
  }
  if (restante > LIVE_ATTEMPT_DEADLINE_SECONDS) {
    // Restante maior que o máximo aprovado significa relógio inconsistente. Fecha.
    return { status: "expired" }
  }
  return { status: "ok", timeout_seconds: restante }
}
