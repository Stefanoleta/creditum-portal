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
 *
 * ─── R2: as propriedades públicas são OBSERVACIONAIS ─────────────────────────
 *
 * `readonly` é do compilador. Em runtime, `Object.defineProperty` reescreve qualquer
 * campo público desta classe, e a d2c-R1 derivava autoridade justamente deles.
 *
 * O ataque concreto: o chamador obtém DUAS capacidades autênticas, A e B, e reescreve
 * em A todos os campos públicos com os valores de B — internamente coerentes, porque
 * são de uma emissão real. A é consumida, e a execução acontece sob a identidade de B,
 * no diretório já reservado de B, sem consumir B. Coerência mútua não distingue
 * "minha identidade" de "identidade de outra emissão real".
 *
 * A correção não é validar melhor os campos públicos: é não os consultar. Os campos
 * públicos permanecem para diagnóstico e continuam legíveis, mas nenhuma decisão de
 * produção depende deles.
 *
 * ─── R4: nem `WeakMap` privado basta ────────────────────────────────────────
 *
 * A r3 guardou identidade num `WeakMap` e uso único num `WeakSet`, ambos privados do
 * módulo. O acesso, porém, era `EMISSAO.get(attempt)` — despacho comum por
 * `WeakMap.prototype.get`, cujo descritor é `writable: true, configurable: true`.
 *
 * O ataque: depois de o módulo já ter sido inicializado, o chamador guarda o `get`
 * original e o substitui por um invólucro que, ao ser chamado com a chave A, chama o
 * original com a chave B. `EMISSAO.get(A)` devolve a emissão de B sem que ninguém
 * jamais tenha alcançado o `WeakMap`. A é marcada como gasta e a execução acontece sob
 * a identidade de B, que segue não consumida.
 *
 * O mesmo vale para `WeakSet.prototype.has`/`add` — `has` mentindo "nunca consumida"
 * derruba o uso único — e para `instanceof`, porque `Symbol.hasInstance` também é
 * gravável na classe exportada.
 *
 * A classe inteira do defeito é a mesma: AUTORIDADE POR DESPACHO MUTÁVEL. Fechá-la
 * exige estado que a linguagem — não uma convenção de biblioteca — torne inalcançável:
 * campos privados de classe. `this.#emissao` não é uma propriedade que se procure num
 * protótipo; é uma referência resolvida lexicalmente, sem método que se possa
 * substituir. E `#emissao in obj` é uma marca que só o construtor real instala: não se
 * forja, não se acrescenta, e não se intercepta.
 *
 * O consumidor vive num bloco `static {}` da própria classe, e o módulo exporta apenas
 * uma função que o chama. Não há selo atravessando fronteira, nem retorno de chamada
 * escolhido pelo chamador.
 *
 * ─── O que este desenho NÃO promete ────────────────────────────────────────
 *
 * DENTRO do modelo de ameaça: o chamador reescreve campos públicos, acrescenta ou
 * substitui métodos, e adultera protótipos globais DEPOIS de os módulos governados
 * terem sido inicializados. Com múltiplas capacidades autênticas em mão.
 *
 * FORA: código hostil arbitrário do MESMO realm executando ANTES da inicialização
 * destes módulos, ou substituição do próprio Node/V8. Quem controla o bootstrap
 * substitui a classe, o `import`, o `crypto` — e nenhuma dureza incremental aqui
 * responde a isso. A resposta a essa ameaça é isolamento de processo, não este arquivo.
 *
 * O caminho do diretório é derivado por `join` importado de `node:path`. Um binding
 * nomeado de ESM não é interceptável: substituir `path.join` depois do import não
 * afeta esta chamada — medido, não presumido.
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

/**
 * O consumidor LEXICAL do módulo. Atribuído no bloco `static {}` da classe, onde os
 * campos privados são visíveis. Não é exportado, não recebe retorno de chamada, e não
 * atravessa fronteira nenhuma.
 */
/**
 * O `Object.freeze` confiável, capturado na INICIALIZAÇÃO do módulo.
 *
 * `Object.freeze` é `writable: true, configurable: true`. Escrever
 * `this.#emissao = Object.freeze({...})` fazia a autoridade ser o VALOR DE RETORNO de
 * uma função substituível: um invólucro hostil, instalado depois da inicialização,
 * devolvia o estado de outra emissão e a capacidade A nascia com a identidade de B.
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
 * O consumidor LEXICAL do módulo. Atribuído no bloco `static {}` da classe, onde os
 * campos privados são visíveis. Não é exportado, não recebe retorno de chamada, e não
 * atravessa fronteira nenhuma.
 */
let consumirTentativaReservada!: (attempt: unknown) => AttemptConsumptionResult

export interface IssuedExecutionState {
  readonly execution_id: string
  readonly execution_key: string
  readonly execution_fingerprint: string
  /** O MESMO instantâneo próprio e congelado da d1. Nunca uma segunda representação. */
  readonly spec: LiveExecutionSpecV1
  readonly attempt_deadline_monotonic: number
  readonly attempt_deadline_seconds: number
}

/**
 * A capacidade local ao processo. NÃO é autoridade de decisão humana, NÃO é
 * serializável, NÃO é persistida, e é consumível uma única vez — porque a autorização
 * d1 já foi gasta, e uma reserva bem-sucedida não pode virar dois workers.
 */
export class ReservedExecutionAttempt {
  /**
   * ─── A AUTORIDADE ────────────────────────────────────────────────────────
   *
   * Campos privados de LINGUAGEM. `#emissao` responde "quem é esta capacidade" e
   * `#consumida` responde "ela já foi gasta". Nenhum dos dois é alcançável por
   * propriedade, protótipo, `Reflect`, `Object.keys` ou serialização, e nenhum
   * depende de método substituível.
   */
  readonly #emissao: IssuedExecutionState
  #consumida = false

  /**
   * ─── OBSERVACIONAIS, não autoritativos ──────────────────────────────────
   *
   * `readonly` é do compilador; em runtime estes campos são graváveis. A autoridade
   * está em `#emissao`, e sai por `consumeReservedExecutionAttempt`. Não leia daqui
   * para decidir nada — foi exatamente esse caminho que a d2c-R1 pagou para fechar.
   */
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
    // Um prazo não finito viraria orçamento infinito na d2c. Conferido aqui, no cunho.
    if (!Number.isFinite(attemptDeadlineMonotonic)) {
      throw new Error("RESERVED_ATTEMPT_NOT_DURABLE")
    }
    // ─── O estado AUTORITATIVO, capturado antes de qualquer campo público ────
    //
    // Das fontes que já foram validadas: o recibo durável e a spec selada da d1.
    // Fica no `WeakMap` do módulo, e é ele que a d2c consome. Ficar no construtor —
    // e não em `prepareGovernedExecution` — torna estrutural que toda instância
    // construída TEM estado: não existe capacidade autêntica sem emissão registrada.
    // Objeto construído LOCALMENTE. A autoridade é este `emitido`, não o que uma
    // função devolve — nem mesmo a função capturada.
    const emitido: IssuedExecutionState = {
      execution_id: receipt.execution_id,
      execution_key: receipt.execution_key,
      execution_fingerprint: receipt.execution_fingerprint,
      spec,
      attempt_deadline_monotonic: attemptDeadlineMonotonic,
      attempt_deadline_seconds: spec.attempt_deadline_seconds,
    }
    CONGELA(emitido)
    this.#emissao = emitido

    // ─── Daqui para baixo: OBSERVACIONAL ────────────────────────────────────
    //
    // Estes campos existem para diagnóstico e para as leituras que já existiam antes
    // da r2. São graváveis em runtime, e por isso nenhuma decisão de produção os lê.
    this.execution_id = receipt.execution_id
    this.execution_fingerprint = receipt.execution_fingerprint
    this.spec = spec
    this.execution_key = receipt.execution_key
    this.attempt_deadline_monotonic = attemptDeadlineMonotonic
  }

  /** Leitura, não autoridade — e vem do campo privado. */
  get isConsumed(): boolean {
    return this.#consumida
  }

  /** Serializar produziria algo que PARECE capacidade. Recusa. */
  toJSON(): never {
    throw new Error("RESERVED_ATTEMPT_NOT_SERIALIZABLE")
  }

  /**
   * Primitivos governados para auditoria. NUNCA aceito de volta como capacidade.
   *
   * Lê a EMISSÃO, não os campos públicos: uma visão de auditoria que o detentor
   * pudesse reescrever seria auditoria de nada.
   */
  safeAuditView(): Readonly<Record<string, string | number | boolean>> {
    const e = this.#emissao
    // Local, congelado no lugar. A visão é observacional, mas a FORMA importa: deixar
    // um `return CONGELA(...)` aqui convida a próxima linha de autoridade a copiá-la.
    const visao = {
      execution_id: e.execution_id,
      execution_key: e.execution_key,
      execution_fingerprint: e.execution_fingerprint,
      model: e.spec.model,
      api_mode: e.spec.api_mode,
      attempt_deadline_seconds: e.attempt_deadline_seconds,
      consumed: this.#consumida,
    }
    CONGELA(visao)
    return visao
  }

  /**
   * Autenticidade, identidade e uso único — os três dentro da classe, onde os campos
   * privados existem, e sem uma única chamada que o chamador possa substituir.
   *
   * `#emissao in attempt` é a MARCA: só o construtor real instala um campo privado.
   * `Object.create(prototype)` não a tem; objeto de mesma forma não a tem; registro
   * lido do disco não a tem. Substitui `instanceof` — que passa por
   * `Symbol.hasInstance`, gravável — e substitui o `WeakSet` de registro, que passava
   * por `WeakSet.prototype.has`.
   *
   * O uso único é atômico por construção: entre a leitura e a escrita de `#consumida`
   * não há `await`, chamada externa nem despacho, e o JavaScript não preempta dentro de
   * uma função síncrona.
   */
  static {
    consumirTentativaReservada = (attempt: unknown): AttemptConsumptionResult => {
      if (attempt === null || typeof attempt !== "object" ||
          !(#emissao in attempt)) {
        return { status: "refused", defect: "RESERVED_ATTEMPT_INVALID" }
      }
      if (attempt.#consumida) {
        return { status: "refused", defect: "RESERVED_ATTEMPT_ALREADY_CONSUMED" }
      }
      attempt.#consumida = true
      return { status: "consumed", state: attempt.#emissao }
    }
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
  // UMA leitura de `.spec`. Duas leituras de uma propriedade gravável podem devolver
  // objetos diferentes — a mesma lição da d1-R1, aplicada a esta fronteira.
  const spec = autorizada.spec
  const executionId = spec.execution_id
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
    spec,
    prazo,
  )
  // Nada a registrar fora do objeto: a marca de linguagem JÁ é a prova de emissão, e
  // ela foi instalada pelo construtor — que exige o selo e um recibo durável.
  return { status: "reserved", attempt: tentativa }
}

export type AttemptConsumptionResult =
  | { readonly status: "consumed"; readonly state: IssuedExecutionState }
  | { readonly status: "refused"; readonly defect: ReservedAttemptDefect }

/**
 * Consome a capacidade e devolve o estado AUTORITATIVO da emissão. Exatamente um
 * consumidor vence, e é ele que recebe a identidade — não quem lê as propriedades.
 *
 * ─── Tudo acontece AQUI, e nada por despacho dinâmico ───────────────────────
 *
 * Autenticidade, identidade e uso único são decididos dentro deste módulo, lendo
 * `RESERVADAS`, `EMISSAO` e `CONSUMIDAS`. Nenhum campo nem método do objeto participa:
 * a versão anterior chamava `attempt._consumeOnce(...)`, e um método público é
 * regravável — o portador escolhia quem decidia o uso único, e recebia o selo de
 * brinde.
 *
 * O uso único é atômico por construção: entre o `has` e o `add` não há `await` nem
 * chamada externa, e o JavaScript não preempta dentro de uma função síncrona. Não é
 * mutex — é a garantia do modelo de execução.
 *
 * O valor devolvido é DADO congelado, não uma segunda capacidade: não tem selo, não
 * está em `RESERVADAS`, e devolvê-lo a qualquer via governada falha em `instanceof`.
 *
 * A d2b NÃO faz `spawn`, `fork` nem `exec`. Isto apenas fecha a semântica de uso único.
 */
export function consumeReservedExecutionAttempt(
  attempt: unknown,
): AttemptConsumptionResult {
  return consumirTentativaReservada(attempt)
}
