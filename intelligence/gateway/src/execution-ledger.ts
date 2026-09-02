/**
 * Fase 3.1d-D2B — LIVRO-RAZÃO DA TENTATIVA ÚNICA.
 *
 * ─── A pergunta que este módulo responde, e a que ele NÃO responde ───────────
 *
 * A d1 responde "Stefano autorizou canonicamente ESTA execução?".
 * O livro-razão responde "este `execution_id` já cruzou a fronteira global de
 * tentativa única?".
 *
 * São autoridades DIFERENTES, e a confusão entre elas seria o defeito. Este módulo
 * NUNCA avalia `ApprovalRequestV1`, `DecisionRecordV1`, `resolveEffectiveDecision` nem
 * `decisionAuthorizes`. Ele não sabe o que é uma aprovação humana. Guarda
 * identificadores, hashes, estados fechados e carimbos de auditoria.
 *
 * ─── Por que sistema de arquivos, e não banco ────────────────────────────────
 *
 * A primitiva governante exigida é UMA: reserva atômica e exclusiva por
 * `execution_id`, válida entre processos. `mkdir` sem `recursive` é exatamente isso —
 * o SO garante que um único chamador cria o diretório e os demais recebem `EEXIST`.
 *
 * SQLite, Redis, fila ou serviço remoto trariam uma dependência nova e uma segunda
 * fonte de verdade para uma pergunta que a chamada de sistema já responde. O
 * `state.db` do Hermes está fora de questão por outra razão: não é nosso.
 *
 * ─── `exists()` e depois `mkdir()` seria uma corrida ─────────────────────────
 *
 * Entre o teste e a criação, outro processo cria o diretório, e os dois seguem
 * acreditando que venceram. A atomicidade tem de estar na PRIMEIRA operação que
 * estabelece propriedade, não numa conferência anterior a ela.
 *
 * ─── Diretório existente é SEMPRE queimado ──────────────────────────────────
 *
 * Registro ausente, parcial, malformado, processo morto no meio: nada disso devolve
 * "livre". Um diretório que existe significa que aquele `execution_id` já foi gasto.
 * Interpretar corrupção como disponibilidade seria transformar falha em segunda
 * tentativa — exatamente o que a fase existe para impedir.
 *
 * ─── Não existe desfazer ─────────────────────────────────────────────────────
 *
 * Nenhuma `deleteReservation`, `unreserve`, `reset`, `retry`, `release`, nem limpeza
 * por TTL. Nova tentativa exige `execution_id` NOVO e aprovação NOVA de Stefano.
 * Conservador de propósito: o custo de recusar demais é uma aprovação a mais; o custo
 * de permitir demais é uma segunda chamada viva que ninguém autorizou.
 */

import { createHash } from "node:crypto"
import { constants as FS } from "node:fs"
import { access, lstat, mkdir, open, readFile, realpath, stat } from "node:fs/promises"
import { join, relative } from "node:path"

// ═════════════════════════════════════════════════════════════════════════════
// Constantes governadas
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A raiz de produção, FIXA em código. Nenhum chamador governado a escolhe: uma raiz
 * escolhida pelo chamador seria um desvio da unicidade global — dois supervisores em
 * raízes diferentes reservariam o mesmo `execution_id` sem se ver.
 */
export const PRODUCTION_EXECUTION_LEDGER_ROOT =
  "/data/creditum_hermes_runtime/execution-ledger/v1"

export const EXECUTION_RESERVATION_RECORD_TYPE =
  "creditum_live_execution_reservation/v1"
export const EXECUTION_COMMIT_RECORD_TYPE = "creditum_live_execution_commit/v1"
export const EXECUTION_TERMINAL_RECORD_TYPE = "creditum_live_execution_terminal/v1"

/** Nomes de registro. Cada um é escrito UMA vez; não existe estado reescrito. */
const ARQ_RESERVA = "reservation.json"
const ARQ_COMMIT = "attempt-committed.json"
const ARQ_TERMINAL = "terminal.json"

export const EXECUTION_LEDGER_DEFECTS = [
  "EXECUTION_ALREADY_RESERVED",
  "EXECUTION_LEDGER_UNAVAILABLE",
  "EXECUTION_LEDGER_INVALID",
  "EXECUTION_RESERVATION_NOT_DURABLE",
  "TERMINAL_ALREADY_RECORDED",
  "ATTEMPT_NOT_RESERVED",
] as const
export type ExecutionLedgerDefect = (typeof EXECUTION_LEDGER_DEFECTS)[number]

/**
 * Vocabulário FECHADO de desfecho. Códigos, nunca texto de erro do provedor: um
 * corpo de erro externo é material não confiável, e o livro-razão é auditoria.
 */
export const EXECUTION_TERMINAL_OUTCOMES = [
  "COMPLETED_ACCEPTED",
  "TIMED_OUT",
  "WORKER_FAILED",
  "MODEL_REFUSED",
  "RESPONSE_REJECTED",
  "SEMANTIC_REJECTED",
  "INTERNAL_ABORTED",
  "RECOVERED_ABORTED",
] as const
export type ExecutionTerminalOutcome = (typeof EXECUTION_TERMINAL_OUTCOMES)[number]

/** Estado DERIVADO da existência de registros imutáveis. Nunca lido de um campo. */
export const EXECUTION_ATTEMPT_STATES = [
  "UNSEEN",
  "RESERVED",
  "ATTEMPT_COMMITTED",
  "TERMINAL",
  "MALFORMED",
] as const
export type ExecutionAttemptState = (typeof EXECUTION_ATTEMPT_STATES)[number]

// ═════════════════════════════════════════════════════════════════════════════
// Chave de caminho — determinismo, não autoridade
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O `execution_id` canônico não vai cru para o caminho: um identificador pode conter
 * `/`, `..` ou byte que o sistema de arquivos interprete. O hash é SEGURANÇA DE
 * CAMINHO e busca determinística — não é autoridade, e não substitui o id.
 */
export function executionKey(executionId: string): string {
  return createHash("sha256").update(executionId, "utf8").digest("hex")
}

// ═════════════════════════════════════════════════════════════════════════════
// A prova de durabilidade
// ═════════════════════════════════════════════════════════════════════════════

/** Selo do MÓDULO. Não exportado: ninguém de fora cunha um recibo. */
const SELO_RECIBO: unique symbol = Symbol("creditum.durable_reservation_receipt")

/** Recibos REALMENTE cunhados aqui. `instanceof` sozinho não responde isto. */
const RECIBOS = new WeakSet<DurableReservationReceipt>()

/**
 * A prova de que a reserva global CRUZOU a fronteira de durabilidade governada.
 *
 * ─── O que ele prova, e o que não prova ──────────────────────────────────────
 *
 * Prova UMA coisa: neste processo, a reserva de `execution_id` completou criação
 * atômica do diretório, registro íntegro, `fsync` do arquivo e `fsync` do diretório.
 *
 * Não prova aprovação humana. Não avalia `ApprovalRequestV1`, `DecisionRecordV1`,
 * `resolveEffectiveDecision` nem `decisionAuthorizes` — essa autoridade é da d1, e
 * duplicá-la aqui criaria uma segunda definição, mais fraca, de "aprovado".
 *
 * ─── Por que ele existe ──────────────────────────────────────────────────────
 *
 * A d2b provava a ordem "reserva antes da capacidade" apenas pela ORDEM do código.
 * Ordem textual não é invariante: mover duas linhas a desfaz sem que nada observe. O
 * recibo torna a fronteira EXPLÍCITA — sem ele não existe capacidade, e ele não pode
 * existir antes da durabilidade.
 */
export class DurableReservationReceipt {
  readonly execution_id: string
  readonly execution_key: string
  readonly execution_fingerprint: string

  /** @internal — só `reserveExecutionAttempt` passa o selo, e só no fim. */
  constructor(
    selo: typeof SELO_RECIBO,
    executionId: string,
    executionKeyValue: string,
    executionFingerprint: string,
  ) {
    if (selo !== SELO_RECIBO) {
      throw new Error("DURABLE_RECEIPT_NOT_OWNED")
    }
    this.execution_id = executionId
    this.execution_key = executionKeyValue
    this.execution_fingerprint = executionFingerprint
  }

  /** Serializar produziria algo que PARECE prova. Recusa. */
  toJSON(): never {
    throw new Error("DURABLE_RECEIPT_NOT_SERIALIZABLE")
  }
}

/**
 * O recibo é AUTÊNTICO? Predicado, não fábrica: exportá-lo não permite cunhar nada.
 * Um objeto de mesma forma, ou um `Object.create` sobre o protótipo, não está no
 * registro — e não é prova de durabilidade.
 */
export function isDurableReservationReceipt(
  valor: unknown,
): valor is DurableReservationReceipt {
  return valor instanceof DurableReservationReceipt && RECIBOS.has(valor)
}

export type ExecutionReservationResult =
  | {
      readonly status: "reserved"
      readonly execution_key: string
      readonly attempt_directory: string
      /** A prova. Sem ela nenhuma capacidade de execução pode ser construída. */
      readonly receipt: DurableReservationReceipt
    }
  | { readonly status: "refused"; readonly defect: ExecutionLedgerDefect }

/**
 * Diretório REAL, no-follow. `lstat`, nunca `stat`.
 *
 * ─── Por que `stat` estava errado ────────────────────────────────────────────
 *
 * `stat` SEGUE o link: um `attempts` que seja symlink para um diretório qualquer
 * passa em `isDirectory()`. E o comentário que eu havia escrito no ramo `EEXIST`
 * dizia, com todas as letras, que link no lugar de `attempts` NÃO é aceitável — e o
 * código o aceitava. Prosa correta, verificação errada.
 *
 * Com o link aceito, o `mkdir` da chave, a escrita e os `fsync` atravessam o link, e
 * o recibo é emitido para estado FORA da raiz fixa — que é exatamente a propriedade
 * que a raiz fixa existe para garantir.
 */
async function diretorioRealNaoLink(
  caminho: string,
): Promise<"ok" | "invalido" | "ausente"> {
  let st
  try {
    st = await lstat(caminho)
  } catch (erro) {
    if ((erro as { code?: string }).code === "ENOENT") return "ausente"
    return "invalido"
  }
  // Link recusado ANTES de qualquer pergunta sobre o alvo: seguir o link e então
  // aprovar o destino seria a mesma falha com outro nome.
  if (st.isSymbolicLink()) return "invalido"
  if (!st.isDirectory()) return "invalido"
  return "ok"
}

/**
 * Validação no-follow do `attempts`. Envelope FINO sobre a checagem compartilhada.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * Semanticamente idêntico a `diretorioRealNaoLink` — e é essa a intenção: a regra de
 * segurança é UMA, não duas. O envelope existe para que a bancada possa mutar a
 * validação do `attempts` SEM tocar na da raiz.
 *
 * A r4 mutava o helper compartilhado, então a mutação quebrava a raiz também, o teste
 * da raiz falhava primeiro, e a bancada lia "morto" sem nunca provar o invariante do
 * `attempts`. Pior: a contenção canônica ainda recusava o link do `attempts` por outro
 * caminho, MASCARANDO a falha. Kill emprestado da proteção vizinha.
 */
async function attemptsRealNaoLink(
  caminho: string,
): Promise<"ok" | "invalido" | "ausente"> {
  return diretorioRealNaoLink(caminho)
}

/**
 * Contenção CANÔNICA: `attempts` resolve exatamente para um filho direto da raiz.
 *
 * `startsWith` não serve — `/ledger/v1-evil` compartilha prefixo com `/ledger/v1`.
 * A comparação é por caminho relativo exato: tem de ser a string `attempts`, nada de
 * `..`, nada de resultado absoluto, nada de caminho alternativo.
 */
async function contidoNaRaiz(ledgerRoot: string, paiTentativas: string): Promise<boolean> {
  try {
    const raizCanonica = await realpath(ledgerRoot)
    const paiCanonico = await realpath(paiTentativas)
    return relative(raizCanonica, paiCanonico) === "attempts"
  } catch {
    return false
  }
}

/**
 * A raiz tem de existir, ser diretório REAL (não link) e ser gravável. Falha FECHADA:
 * sem queda para `/tmp`, `cwd`, `HOME` ou memória. Um livro-razão de reserva que cai
 * para memória perde a unicidade global exatamente quando ela mais importa.
 *
 * A raiz é provisionada pelo deploy. `lstat` recusa link ANTES de qualquer `realpath`:
 * resolver a raiz por um link e depois aprovar o destino seria transformar a raiz fixa
 * em raiz sugerida.
 */
async function raizUtilizavel(raiz: string): Promise<boolean> {
  if ((await diretorioRealNaoLink(raiz)) !== "ok") return false
  try {
    await access(raiz, FS.W_OK | FS.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * `fsync` de um DIRETÓRIO. Falha fechada.
 *
 * A d2b fazia `await dir.sync().catch(() => undefined)`, alegando proteger plataforma
 * sem suporte. O `catch` não distinguia *plataforma não suporta* de *`ENOSPC` no
 * `fsync`* — engolia os dois e devolvia sucesso, e a capacidade escapava sem a
 * garantia que o recibo existe para provar.
 *
 * Medido: `open(dir, "r")` + `sync()` funciona no alvo de produção (Linux Debian,
 * Node v22.23.2) e no darwin de desenvolvimento. Não havia plataforma a proteger.
 *
 * Então: qualquer falha — `ENOSPC`, `EIO`, `EROFS`, `EPERM`, `EACCES` — é
 * `not_durable`. Sem "melhor esforço", sem rebaixamento silencioso.
 */
async function sincronizaDiretorio(caminho: string): Promise<"ok" | "not_durable"> {
  let dir
  try {
    dir = await open(caminho, "r")
  } catch {
    return "not_durable"
  }
  try {
    await dir.sync()
    return "ok"
  } catch {
    // O errno real fica aqui dentro: para fora vai defeito próprio, nunca o objeto
    // de exceção, o caminho absoluto ou a pilha.
    return "not_durable"
  } finally {
    await dir.close().catch(() => undefined)
  }
}

/** Escrita write-once + durável: `wx` recusa sobrescrita, `fsync` no arquivo e no diretório. */
async function escreveDuravel(
  diretorio: string,
  nome: string,
  material: unknown,
): Promise<"ok" | "exists" | "not_durable"> {
  const caminho = join(diretorio, nome)
  let arquivo
  try {
    // `wx`: cria com exclusividade. Se já existe, NÃO sobrescreve.
    arquivo = await open(caminho, "wx")
  } catch (erro) {
    if ((erro as { code?: string }).code === "EEXIST") return "exists"
    return "not_durable"
  }
  try {
    await arquivo.writeFile(`${JSON.stringify(material, null, 2)}\n`, "utf8")
    await arquivo.sync()
  } catch {
    return "not_durable"
  } finally {
    await arquivo.close().catch(() => undefined)
  }
  // `fsync` do diretório que CONTÉM o arquivo: sem ele a entrada do arquivo pode não
  // sobreviver a uma queda de energia. Exigido, não "melhor esforço".
  if ((await sincronizaDiretorio(diretorio)) !== "ok") return "not_durable"
  return "ok"
}

/**
 * A reserva global de `execution_id`. A PRIMEIRA operação é o `mkdir` atômico.
 *
 * @internal Só o supervisor governado chama isto, e só DEPOIS de consumir a
 * autorização d1. Não existe superfície pública `reserve(execution_id)`.
 */
export async function reserveExecutionAttempt(
  ledgerRoot: string,
  executionId: string,
  executionFingerprint: string,
  reservedAtUtc: string,
): Promise<ExecutionReservationResult> {
  if (typeof executionId !== "string" || executionId.length === 0) {
    return { status: "refused", defect: "EXECUTION_LEDGER_INVALID" }
  }
  if (!(await raizUtilizavel(ledgerRoot))) {
    return { status: "refused", defect: "EXECUTION_LEDGER_UNAVAILABLE" }
  }

  const chave = executionKey(executionId)
  const paiTentativas = join(ledgerRoot, "attempts")

  // ─── Durabilidade da ENTRADA de diretório, e não só do arquivo ─────────────
  //
  // A d2b dava `fsync` no arquivo e no diretório que o contém, mas nunca no PAI. O
  // `reservation.json` podia estar persistido enquanto a entrada do diretório da
  // chave, dentro de `attempts`, não estava.
  //
  // A r2 corrigiu isso pela metade, e a metade que faltou era o furo: o `fsync` da
  // raiz só acontecia quando ESTA invocação tinha criado `attempts`. Bastava a
  // chamada A criar o diretório, falhar no `fsync` da raiz e recusar — deixando
  // `attempts` para trás, como manda a regra de não-limpeza — para a chamada B ver o
  // diretório existente, pular o `fsync`, e emitir recibo sobre uma entrada de
  // diretório cuja durabilidade nunca foi estabelecida. Uma queda de energia levaria
  // `attempts` e toda a subárvore, devolvendo o `execution_id` ao pool DEPOIS de o
  // recibo ter sido emitido. O mesmo vale em concorrência de primeiro uso, sem falha
  // nenhuma: B enxerga o `attempts` de A antes de o `fsync` de A concluir.
  //
  // O invariante correto não é sobre quem criou. É:
  //
  //   antes de qualquer reserva prosseguir, a entrada `attempts` tem de ter passado
  //   por um `fsync` da raiz BEM-SUCEDIDO NESTA invocação governada.
  //
  // Existir no namespace vivo não prova durabilidade. Então o `fsync` da raiz é
  // INCONDICIONAL, em toda invocação, e nenhum booleano o controla. Troca-se um pouco
  // de IO por um invariante simples que falha fechado.
  //
  // E nenhum marcador tipo `attempts.synced` ou `initialized.json`: um marcador desses
  // precisaria, ele próprio, da garantia que alega ter.
  const estadoPai = await attemptsRealNaoLink(paiTentativas)
  if (estadoPai === "invalido") {
    return { status: "refused", defect: "EXECUTION_LEDGER_INVALID" }
  }
  if (estadoPai === "ausente") {
    try {
      // Sem `recursive`: a raiz é provisionada pelo deploy, não fabricada aqui.
      await mkdir(paiTentativas)
    } catch (erro) {
      if ((erro as { code?: string }).code !== "EEXIST") {
        return { status: "refused", defect: "EXECUTION_LEDGER_UNAVAILABLE" }
      }
      // `EEXIST` diz que ALGO ocupa o caminho — não que seja o diretório esperado.
      // Corrida com outro processo criando `attempts` é benigna; arquivo ou LINK no
      // lugar dele não é. Revalidação no-follow, nunca `stat`.
      if ((await attemptsRealNaoLink(paiTentativas)) !== "ok") {
        return { status: "refused", defect: "EXECUTION_LEDGER_INVALID" }
      }
    }
  }
  // Nem link, nem fuga: `attempts` tem de ser filho direto da raiz canônica.
  if (!(await contidoNaRaiz(ledgerRoot, paiTentativas))) {
    return { status: "refused", defect: "EXECUTION_LEDGER_INVALID" }
  }

  // INCONDICIONAL. Falhou aqui, nada abaixo acontece — em particular, o diretório da
  // chave NÃO é criado, para não queimar estado mais fundo sobre um pré-requisito de
  // durabilidade que não se cumpriu.
  if ((await sincronizaDiretorio(ledgerRoot)) !== "ok") {
    // `attempts` fica onde está: apagá-lo é limpeza, e limpeza não existe aqui. A
    // segurança vem de exigir o `fsync` de novo na próxima chamada, não de desfazer.
    return { status: "refused", defect: "EXECUTION_RESERVATION_NOT_DURABLE" }
  }

  const dirTentativa = join(paiTentativas, chave)
  try {
    // ─── A operação atômica ────────────────────────────────────────────────
    // SEM `recursive`. Com `recursive: true` o `mkdir` é idempotente e NÃO falha
    // quando o diretório existe — o que apagaria justamente o sinal de que outro
    // processo já reservou. `EEXIST` é a resposta que queremos.
    await mkdir(dirTentativa)
  } catch (erro) {
    const codigo = (erro as { code?: string }).code
    if (codigo === "EEXIST") {
      // Existe. Queimado — não importa o que haja dentro.
      return { status: "refused", defect: "EXECUTION_ALREADY_RESERVED" }
    }
    return { status: "refused", defect: "EXECUTION_LEDGER_UNAVAILABLE" }
  }

  // A entrada do diretório da chave, comprometida em `attempts`. Antes disto o
  // diretório existe no namespace vivo mas pode não sobreviver a uma queda.
  if ((await sincronizaDiretorio(paiTentativas)) !== "ok") {
    return { status: "refused", defect: "EXECUTION_RESERVATION_NOT_DURABLE" }
  }

  const escrita = await escreveDuravel(dirTentativa, ARQ_RESERVA, {
    record_type: EXECUTION_RESERVATION_RECORD_TYPE,
    execution_id: executionId,
    execution_key: chave,
    execution_fingerprint: executionFingerprint,
    reserved_at_utc: reservedAtUtc,
  })
  if (escrita !== "ok") {
    // O diretório permanece. NÃO limpamos: apagá-lo devolveria o id ao pool e
    // transformaria falha de durabilidade em segunda tentativa.
    return { status: "refused", defect: "EXECUTION_RESERVATION_NOT_DURABLE" }
  }
  // ─── A fronteira de durabilidade foi cruzada AQUI, e não antes ────────────
  // `escreveDuravel` só devolve "ok" depois de criação exclusiva, escrita completa,
  // `fsync` do arquivo e `fsync` do diretório. O recibo é cunhado nesta linha e em
  // nenhuma outra do módulo.
  const recibo = new DurableReservationReceipt(
    SELO_RECIBO,
    executionId,
    chave,
    executionFingerprint,
  )
  RECIBOS.add(recibo)
  return {
    status: "reserved",
    execution_key: chave,
    attempt_directory: dirTentativa,
    receipt: recibo,
  }
}

export type ExecutionRecordResult =
  | { readonly status: "recorded" }
  | { readonly status: "refused"; readonly defect: ExecutionLedgerDefect }

/**
 * `ATTEMPT_COMMITTED` — o contrato que a d2c vai usar. Escrito ANTES de qualquer
 * `spawn`, nunca depois: "STARTED" alegaria que existe um filho no SO, e entre a
 * decisão e o `spawn` há uma janela. Commit é o que sabemos; filho é o que esperamos.
 *
 * @internal
 */
export async function recordAttemptCommitted(
  attemptDirectory: string,
  executionId: string,
  executionFingerprint: string,
  committedAtUtc: string,
): Promise<ExecutionRecordResult> {
  if (!(await raizUtilizavel(attemptDirectory))) {
    return { status: "refused", defect: "ATTEMPT_NOT_RESERVED" }
  }
  const r = await escreveDuravel(attemptDirectory, ARQ_COMMIT, {
    record_type: EXECUTION_COMMIT_RECORD_TYPE,
    execution_id: executionId,
    execution_key: executionKey(executionId),
    execution_fingerprint: executionFingerprint,
    committed_at_utc: committedAtUtc,
  })
  if (r === "exists") return { status: "refused", defect: "TERMINAL_ALREADY_RECORDED" }
  if (r === "not_durable") {
    return { status: "refused", defect: "EXECUTION_RESERVATION_NOT_DURABLE" }
  }
  return { status: "recorded" }
}

/**
 * O desfecho final. O PRIMEIRO vence; um segundo é recusado, nunca sobrescreve.
 * Só código de desfecho fechado — nada de saída bruta, texto de recusa ou stack.
 *
 * @internal
 */
export async function recordExecutionTerminal(
  attemptDirectory: string,
  executionId: string,
  executionFingerprint: string,
  outcome: ExecutionTerminalOutcome,
  terminalAtUtc: string,
  elapsedMs: number,
  resultFingerprint?: string,
): Promise<ExecutionRecordResult> {
  if (!EXECUTION_TERMINAL_OUTCOMES.includes(outcome)) {
    return { status: "refused", defect: "EXECUTION_LEDGER_INVALID" }
  }
  if (!(await raizUtilizavel(attemptDirectory))) {
    return { status: "refused", defect: "ATTEMPT_NOT_RESERVED" }
  }
  const material: Record<string, unknown> = {
    record_type: EXECUTION_TERMINAL_RECORD_TYPE,
    execution_id: executionId,
    execution_key: executionKey(executionId),
    execution_fingerprint: executionFingerprint,
    outcome_code: outcome,
    terminal_at_utc: terminalAtUtc,
    elapsed_ms: elapsedMs,
  }
  if (resultFingerprint !== undefined) material.result_fingerprint = resultFingerprint

  const r = await escreveDuravel(attemptDirectory, ARQ_TERMINAL, material)
  if (r === "exists") return { status: "refused", defect: "TERMINAL_ALREADY_RECORDED" }
  if (r === "not_durable") {
    return { status: "refused", defect: "EXECUTION_RESERVATION_NOT_DURABLE" }
  }
  return { status: "recorded" }
}

/**
 * Auditoria SOMENTE LEITURA. Classifica; nunca torna nada executável de novo.
 *
 * Não existe — e não pode existir — função que devolva capacidade de execução a partir
 * do disco. Estado serializado não é capacidade.
 *
 * @internal
 */
export async function classifyExecutionAttempt(
  ledgerRoot: string,
  executionId: string,
): Promise<ExecutionAttemptState> {
  const dir = join(ledgerRoot, "attempts", executionKey(executionId))
  try {
    const s = await stat(dir)
    if (!s.isDirectory()) return "MALFORMED"
  } catch {
    return "UNSEEN"
  }
  const reserva = await leRegistro(dir, ARQ_RESERVA)
  if (reserva === "malformed" || reserva === null) {
    // Diretório existe sem reserva legível: QUEIMADO, e malformado é o que é.
    return "MALFORMED"
  }
  if (reserva.execution_key !== executionKey(executionId)) return "MALFORMED"
  if (reserva.execution_id !== executionId) return "MALFORMED"
  if (reserva.record_type !== EXECUTION_RESERVATION_RECORD_TYPE) return "MALFORMED"

  if ((await leRegistro(dir, ARQ_TERMINAL)) !== null) return "TERMINAL"
  if ((await leRegistro(dir, ARQ_COMMIT)) !== null) return "ATTEMPT_COMMITTED"
  return "RESERVED"
}

async function leRegistro(
  dir: string,
  nome: string,
): Promise<Record<string, unknown> | "malformed" | null> {
  let texto: string
  try {
    texto = await readFile(join(dir, nome), "utf8")
  } catch {
    return null
  }
  try {
    const v: unknown = JSON.parse(texto)
    if (v === null || typeof v !== "object" || Array.isArray(v)) return "malformed"
    return v as Record<string, unknown>
  } catch {
    return "malformed"
  }
}

/** Sonda de existência para o supervisor. Diretório existente = queimado. @internal */
export async function executionAttemptDirectoryExists(
  ledgerRoot: string,
  executionId: string,
): Promise<boolean> {
  try {
    await stat(join(ledgerRoot, "attempts", executionKey(executionId)))
    return true
  } catch {
    return false
  }
}
