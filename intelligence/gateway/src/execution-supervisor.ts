/**
 * Fase 3.1d-D2B — SUPERVISOR GOVERNADO DE EXECUÇÃO.
 *
 * ─── A ordem é a segurança ───────────────────────────────────────────────────
 *
 *   1. captura do relógio monotônico          (conservador: ANTES de tudo)
 *   2. consumo SÍNCRONO da autorização d1     (nenhum `await` antes disto)
 *   3. reserva global durável de `execution_id`
 *   4. só então a capacidade `ReservedExecutionAttempt`
 *
 * O passo 2 vem antes do 3 por uma razão concreta: um objeto de mesma forma, ou uma
 * autorização expirada, NÃO pode queimar `execution_id` no livro-razão persistente.
 * Se a d1 recusar, nenhuma linha é escrita no disco. Reservar primeiro deixaria um
 * atacante gastar identificadores sem nunca ter tido autorização.
 *
 * ─── A janela que essa ordem cria, e por que é aceitável ─────────────────────
 *
 * Consumir antes de reservar abre um intervalo: se o processo morrer depois do consumo
 * e antes da reserva durável, a autoridade d1 desaparece com ele. Isso NÃO viola "uma
 * tentativa real", porque nenhuma tentativa real ocorreu — não houve worker, não houve
 * provedor, não houve modelo. A d2c só pode cruzar a fronteira de não-retorno DEPOIS de
 * a reserva estar durável.
 *
 * Se algum artefato de reserva sobreviveu, aquele `execution_id` está queimado. Falha
 * fechada, e é a leitura correta: preferimos exigir aprovação nova a arriscar a
 * segunda chamada.
 *
 * ─── O livro-razão não é autoridade humana ───────────────────────────────────
 *
 * `ReservedExecutionAttempt` significa "esta execução passou pela d1 E é dona da
 * reserva persistente única". Não significa aprovação: a aprovação já foi avaliada, e
 * só pela d1. O supervisor não olha `ApprovalRequestV1` nem decisão.
 *
 * ─── Nada volta do disco ─────────────────────────────────────────────────────
 *
 * Não existe `loadReservedExecutionAttempt`, `restoreAttempt` nem
 * `deserializeAttempt`. Depois de um reinício, toda capacidade em memória se foi para
 * sempre. Estado serializado é auditoria, nunca capacidade.
 */

import {
  type ExecutionLedgerDefect,
  PRODUCTION_EXECUTION_LEDGER_ROOT,
  isDurableReservationReceipt,
  reserveExecutionAttempt,
} from "./execution-ledger"
import {
  type LiveConsumptionDefect,
  type LiveExecutionAuthorization,
  type LiveExecutionSpecV1,
  consumeLiveExecutionAuthorization,
  monotonicSeconds,
} from "./live-execution"

export const RESERVED_ATTEMPT_DEFECTS = [
  "RESERVED_ATTEMPT_INVALID",
  "RESERVED_ATTEMPT_ALREADY_CONSUMED",
  "RESERVED_ATTEMPT_NOT_DURABLE",
] as const
export type ReservedAttemptDefect = (typeof RESERVED_ATTEMPT_DEFECTS)[number]

/** Selo do MÓDULO. Não exportado: sem ele não se constrói nem se falsifica a capacidade. */
const SELO_TENTATIVA: unique symbol = Symbol("creditum.reserved_execution_attempt")

/** As tentativas REALMENTE preparadas aqui. `instanceof` sozinho não responde isto. */
const RESERVADAS = new WeakSet<ReservedExecutionAttempt>()

/**
 * A capacidade local ao processo. NÃO é autoridade de decisão humana, NÃO é
 * serializável, NÃO é persistida, e é consumível uma única vez — porque a autorização
 * d1 já foi gasta, e uma reserva bem-sucedida não pode virar dois workers.
 */
export class ReservedExecutionAttempt {
  private consumida = false

  readonly execution_id: string
  readonly execution_fingerprint: string
  /** O MESMO instantâneo próprio e congelado da d1. Nunca uma segunda representação. */
  readonly spec: LiveExecutionSpecV1
  readonly execution_key: string
  readonly attempt_deadline_monotonic: number

  /** @internal — só `prepareGovernedExecution` passa o selo E um recibo autêntico. */
  constructor(
    selo: typeof SELO_TENTATIVA,
    receipt: unknown,
    spec: LiveExecutionSpecV1,
    attemptDeadlineMonotonic: number,
  ) {
    if (selo !== SELO_TENTATIVA) {
      throw new Error("RESERVED_ATTEMPT_NOT_OWNED")
    }
    // ─── A fronteira de durabilidade, exigida e não apenas ordenada ─────────
    //
    // A d2b garantia "reserva antes da capacidade" só pela ORDEM das linhas. Ordem
    // textual não é invariante — mover duas linhas a desfaz sem que nada observe.
    // Aqui a capacidade EXIGE a prova, e a prova só existe depois do `fsync`.
    if (!isDurableReservationReceipt(receipt)) {
      throw new Error("RESERVED_ATTEMPT_NOT_DURABLE")
    }
    // O recibo tem de ser DESTA execução. Um recibo válido de outra reserva não
    // autoriza esta — coerência conferida, nunca presumida.
    if (receipt.execution_id !== spec.execution_id) {
      throw new Error("RESERVED_ATTEMPT_NOT_DURABLE")
    }
    this.execution_id = receipt.execution_id
    this.execution_fingerprint = receipt.execution_fingerprint
    this.spec = spec
    this.execution_key = receipt.execution_key
    this.attempt_deadline_monotonic = attemptDeadlineMonotonic
  }

  get isConsumed(): boolean {
    return this.consumida
  }

  /**
   * Consumo atômico de uso único. Como na d1: o JavaScript não preempta dentro de uma
   * função síncrona, então duas tentativas concorrentes não conseguem ambas ver
   * `false`. Não é mutex — é a garantia do modelo de execução.
   *
   * @internal
   */
  _consumeOnce(selo: typeof SELO_TENTATIVA): boolean {
    if (selo !== SELO_TENTATIVA) return false
    if (this.consumida) return false
    this.consumida = true
    return true
  }

  /** Serializar produziria algo que PARECE capacidade. Recusa. */
  toJSON(): never {
    throw new Error("RESERVED_ATTEMPT_NOT_SERIALIZABLE")
  }

  /** Primitivos governados para auditoria. NUNCA aceito de volta como capacidade. */
  safeAuditView(): Readonly<Record<string, string | number | boolean>> {
    return Object.freeze({
      execution_id: this.execution_id,
      execution_key: this.execution_key,
      execution_fingerprint: this.execution_fingerprint,
      model: this.spec.model,
      api_mode: this.spec.api_mode,
      attempt_deadline_seconds: this.spec.attempt_deadline_seconds,
      consumed: this.consumida,
    })
  }
}

export type GovernedPreparationResult =
  | { readonly status: "reserved"; readonly attempt: ReservedExecutionAttempt }
  | {
      readonly status: "refused"
      // União FECHADA. Um `| string` aqui engoliria as três e deixaria passar
      // qualquer texto — inclusive material externo — como se fosse defeito governado.
      readonly defect: LiveConsumptionDefect | ExecutionLedgerDefect | ReservedAttemptDefect
    }

/**
 * A ÚNICA via de preparação. Recebe a AUTORIZAÇÃO d1 — não `execution_id`, não JSON de
 * aprovação, não `authorized: true`, não token. Uma via que aceitasse identificador
 * seria uma segunda autoridade, mais fraca, para a mesma pergunta.
 *
 * ─── Por que não existe mais costura de teste aqui ───────────────────────────
 *
 * A r2 separou esta função (aridade 1) de uma
 * `__prepareGovernedExecutionForTests(auth, seam)` que aceitava `ledgerRoot`, para que
 * a bancada pudesse usar raiz temporária. A segunda era EXPORTADA.
 *
 * Nome com `ForTests`, marca `@internal` e ausência do `index.ts` não são controle de
 * acesso: o módulo é importável diretamente e o pacote não tem export map. Duas
 * autorizações d1 legítimas para o MESMO `execution_id`, com duas raízes graváveis,
 * venciam cada uma o seu `mkdir` atômico e produziam DUAS capacidades.
 *
 * A unicidade global é por identificador, e só coincide com "por diretório" enquanto a
 * raiz for única. Uma raiz escolhida pelo chamador desfaz a coincidência.
 *
 * Código de produção não exporta capacidade de teste. Os testes que precisam de raiz
 * temporária mockam o módulo do livro-razão; não existe porta em produção.
 */
export async function prepareGovernedExecution(
  auth: unknown,
): Promise<GovernedPreparationResult> {
  // Raiz FIXA e relógio monotônico canônico. Sem parâmetro, sem alternativa.
  const raiz = PRODUCTION_EXECUTION_LEDGER_ROOT

  // (A) Orçamento começa AQUI. A IO do livro-razão consome o mesmo prazo total; ela
  //     não ganha 180 s novos depois de terminar.
  const inicio = monotonicSeconds()

  // (B) Consumo SÍNCRONO da d1. Nenhum `await` acima desta linha.
  const consumo = consumeLiveExecutionAuthorization(auth, inicio)
  if (consumo.status !== "consumed") {
    return { status: "refused", defect: consumo.defect }
  }
  // A autorização é genuína: só um objeto emitido pela d1 chega aqui.
  const autorizada = auth as LiveExecutionAuthorization
  const executionId = autorizada.spec.execution_id
  const prazo = consumo.attempt_deadline_monotonic

  // (C) Primeiro `await` do fluxo — depois do consumo, nunca antes.
  const reserva = await reserveExecutionAttempt(
    raiz,
    executionId,
    consumo.execution_fingerprint,
    new Date().toISOString(),
  )
  if (reserva.status !== "reserved") {
    // Sem reserva durável, nenhuma capacidade escapa.
    return { status: "refused", defect: reserva.defect }
  }

  // (D) Só agora a capacidade existe.
  // O fingerprint do recibo vem do livro-razão; o da d1 vem do consumo. Têm de ser
  // o mesmo — conferido, porque duas fontes que ninguém compara podem divergir.
  if (reserva.receipt.execution_fingerprint !== consumo.execution_fingerprint) {
    return { status: "refused", defect: "RESERVED_ATTEMPT_NOT_DURABLE" }
  }
  const tentativa = new ReservedExecutionAttempt(
    SELO_TENTATIVA,
    reserva.receipt,
    autorizada.spec,
    prazo,
  )
  RESERVADAS.add(tentativa)
  return { status: "reserved", attempt: tentativa }
}

export type AttemptConsumptionResult =
  | { readonly status: "consumed"; readonly attempt_deadline_monotonic: number }
  | { readonly status: "refused"; readonly defect: ReservedAttemptDefect }

/**
 * Consome a capacidade — o passo que a d2c fará imediatamente antes de escrever
 * `ATTEMPT_COMMITTED`. Exatamente um consumidor vence.
 *
 * A d2b NÃO faz `spawn`, `fork` nem `exec`. Isto apenas fecha a semântica de uso único.
 */
export function consumeReservedExecutionAttempt(
  attempt: unknown,
): AttemptConsumptionResult {
  if (!(attempt instanceof ReservedExecutionAttempt) || !RESERVADAS.has(attempt)) {
    return { status: "refused", defect: "RESERVED_ATTEMPT_INVALID" }
  }
  if (!attempt._consumeOnce(SELO_TENTATIVA)) {
    return { status: "refused", defect: "RESERVED_ATTEMPT_ALREADY_CONSUMED" }
  }
  return {
    status: "consumed",
    attempt_deadline_monotonic: attempt.attempt_deadline_monotonic,
  }
}
