/**
 * Fase 2.13 — inteligência de prazo de assinatura/emissão do contrato.
 *
 * ─── O que a fonte diz, e o que ela NÃO diz ───────────────────────────────────
 *
 * A coluna `Desembolso` da aba oficial carrega o prazo-limite: até essa data o aluno
 * precisa ter assinado e a Creditum precisa ter emitido. A célula é uma DATA REAL do
 * Google Sheets, exibida com o formato `dd/mm`:
 *
 *   formattedValue        "26/08"
 *   effectiveValue        numberValue = 46260
 *   numberFormat          type = DATE, pattern = dd/mm
 *
 * O ano existe na célula. Ele NÃO existe no texto exibido. Essa diferença é a fase
 * inteira: `26/08` sem ano não é uma data, e derivar o ano do nome do arquivo — do
 * período, do `Venc`, do `modifiedTime` — inventaria a informação. Um contrato de
 * dezembro com prazo em janeiro cairia onze meses no passado e o alerta apareceria
 * como prazo perdido no mês errado.
 *
 * Então o prazo vem do serial subjacente, sempre. Não existe caminho neste módulo
 * que produza uma data a partir do texto formatado.
 *
 * ─── A autoridade é a linha, não a legenda ────────────────────────────────────
 *
 * A própria planilha traz uma legenda: "Cancelado (1 dia antes a data do primeiro
 * vencimento se não estiver assinado)". Isso descreve `Venc − 1`, e em 29 das 30
 * linhas observadas `Desembolso` é exatamente `Venc − 1`.
 *
 * Em uma linha não é: `Venc 15/08`, `Desembolso 13/08`.
 *
 * A decisão governada é C1 — vale o valor explícito da LINHA. A legenda é texto geral
 * e não sobrepõe um campo que a fonte preencheu contrato por contrato. Reescrever
 * aquela linha para `14/08` seria corrigir a fonte, que é a única coisa que este
 * subsistema nunca faz. Não existe fallback para `Venc` neste módulo, e a ausência do
 * caminho é a garantia.
 *
 * ─── Estado da fonte × estado derivado ────────────────────────────────────────
 *
 * Isto é constitucional na fase: `AUTO_CANCELLED_BY_DEADLINE` NUNCA vira `C` na
 * fonte. As duas informações viajam juntas e separadas:
 *
 *   source_status            P          o que a fonte afirma, intocado
 *   derived_deadline_state   AUTO_CANCELLED_BY_DEADLINE
 *
 * A fonte pode estar atrasada em relação à regra operacional, e essa divergência é
 * auditável só porque os dois campos coexistem. Colapsar num só transformaria "a
 * planilha ainda não foi atualizada" em "o Lucas registrou cancelamento".
 */

import {
  addCivilDays,
  civilDateFromSheetsSerial,
  diffCivilDays,
  parseCivilDateStrict,
} from "../../../detectors/src/civil-date"
import type { LucasStatus } from "./rows"
import type { SheetCell } from "./drive-port"

/** Nome do campo semântico. O header REAL da fonte fica no provenance. */
export const DEADLINE_SEMANTIC_FIELD = "contract_signature_deadline" as const

/** Header REAL observado na fonte oficial. Preservado para proveniência. */
export const DEADLINE_SOURCE_HEADER = "Desembolso" as const

/**
 * O ÚNICO tipo de formato que a fonte pode dar a um prazo.
 *
 * ─── O defeito que a Fase 2.13a corrige ───────────────────────────────────────
 *
 * A 2.13 lia o valor subjacente com `UNFORMATTED_VALUE`, que devolve o número e não o
 * tipo. Qualquer inteiro na faixa de serial válido virava data — então `46260`
 * digitado por engano numa célula de contagem produziria o prazo `2026-08-26`,
 * plausível e falso, com alerta ou auto-cancelamento sobre um contrato real.
 *
 * A inspeção manual que provou que HOJE as células são `DATE` não é contrato: ela não
 * diz nada sobre a célula que alguém vai preencher no mês que vem. O runtime agora
 * exige o tipo, célula por célula, na mesma resposta que traz o valor.
 */
export const DEADLINE_REQUIRED_FORMAT_TYPE = "DATE" as const

/**
 * Deslocamentos governados, em DIAS DE CALENDÁRIO.
 *
 * Negativos porque são "antes de D". Nomeados para que nenhum literal `-4` apareça
 * solto numa comparação: `offset >= -4` sem nome não diz de qual regra é.
 */
export const P_ATTENTION_OFFSET_DAYS = -4
export const A_ALERT_OFFSET_DAYS = -1

/**
 * Resolução do prazo de UMA linha.
 *
 * Três estados, e `not_evaluable` é o que a fase existe para preservar. Sem ele,
 * "nenhum alerta" e "não foi possível avaliar" chegariam ao Hermes futuro como a
 * mesma ausência — e a segunda exige alguém olhar a planilha.
 */
export type DeadlineResolution =
  | { readonly status: "resolved"; readonly deadline: string; readonly source_serial: number }
  | { readonly status: "not_evaluable"; readonly reason: DeadlineNotEvaluableReason }

export type DeadlineNotEvaluableReason =
  /** A coluna não existe na grade deste mês. */
  | "DEADLINE_COLUMN_ABSENT"
  /** A célula está vazia. */
  | "DEADLINE_MISSING"
  /** A célula tem conteúdo que não é serial de data suportado. */
  | "DEADLINE_NOT_A_SOURCE_DATE"
  /**
   * A célula tem número, mas a fonte NÃO a tipa como data. Fase 2.13a.
   *
   * Razão própria e não colapsada em `NOT_A_SOURCE_DATE` porque a ação é diferente:
   * aqui alguém digitou um número numa coluna de data, e a correção é na planilha.
   */
  | "DEADLINE_NOT_DATE_TYPED"
  /** As duas grades não alinharam. Ver `provider`. */
  | "DEADLINE_UNDERLYING_UNAVAILABLE"

/**
 * Resolve o prazo a partir da CÉLULA observada — valor efetivo e tipo, juntos.
 *
 * `colunaExiste` distingue "a coluna não existe neste mês" de "a célula está vazia":
 * a primeira é característica do mês, a segunda de um contrato, e reportar as duas
 * como a mesma coisa mandaria alguém conferir a linha errada.
 *
 * A célula chega inteira e de UMA observação. Não há parâmetro por onde entre o texto
 * formatado como fonte de data, e não há parâmetro por onde entre um número sem o tipo
 * que o acompanha — as duas ausências são o contrato, não omissão.
 */
export function resolveDeadline(
  celula: SheetCell | undefined,
  colunaExiste: boolean,
): DeadlineResolution {
  if (!colunaExiste) return { status: "not_evaluable", reason: "DEADLINE_COLUMN_ABSENT" }
  if (celula === undefined) return { status: "not_evaluable", reason: "DEADLINE_MISSING" }

  // Célula sem valor numérico efetivo: vazia, ou texto. Em nenhum dos casos há data.
  // O valor EXIBIDO não é consultado nem aqui nem em lugar nenhum deste módulo — é o
  // que garante que `"26/08"` não tenha caminho até um prazo.
  if (celula.number_value === null) {
    return {
      status: "not_evaluable",
      reason: celula.formatted.trim() === "" ? "DEADLINE_MISSING" : "DEADLINE_NOT_A_SOURCE_DATE",
    }
  }

  // O tipo é exigido ANTES da conversão. Um número que a fonte não chama de data não
  // é prazo, mesmo caindo na faixa de serial válido.
  if (celula.number_format_type !== DEADLINE_REQUIRED_FORMAT_TYPE) {
    return { status: "not_evaluable", reason: "DEADLINE_NOT_DATE_TYPED" }
  }

  const civil = civilDateFromSheetsSerial(celula.number_value)
  if (civil === null) return { status: "not_evaluable", reason: "DEADLINE_NOT_A_SOURCE_DATE" }
  return { status: "resolved", deadline: civil, source_serial: celula.number_value }
}

/**
 * Estado derivado do prazo. União FECHADA.
 *
 * `not_evaluable` carrega a razão; os demais carregam o deslocamento, porque um
 * briefing futuro precisa dizer "faltam 3 dias" sem recalcular data nenhuma.
 */
export type DeadlineState =
  | { readonly state: "not_evaluable"; readonly reason: DeadlineNotEvaluableReason }
  /** Antes da janela crítica do status corrente. Nenhum fato de prazo. */
  | { readonly state: "outside_window"; readonly deadline: string; readonly offset_days: number }
  /** `P` em D-4..D-1. */
  | { readonly state: "p_signature_deadline_attention"; readonly deadline: string; readonly offset_days: number }
  /** `A` em D-1. */
  | { readonly state: "a_emission_deadline_alert"; readonly deadline: string; readonly offset_days: number }
  /** D0 com `P` ou `A`: o contrato caiu. */
  | { readonly state: "contract_deadline_missed"; readonly deadline: string; readonly offset_days: number }
  /** D+1 ou depois com `P` ou `A`: cancelamento automático pela regra operacional. */
  | { readonly state: "auto_cancelled_by_deadline"; readonly deadline: string; readonly offset_days: number }
  /** Status sem pendência de prazo (`E`), ou `C` da fonte. Nenhum fato derivado. */
  | { readonly state: "not_applicable"; readonly reason: DeadlineNotApplicableReason }

export type DeadlineNotApplicableReason =
  /** `E`: emitido. Nenhuma assinatura pendente. */
  | "CONTRACT_EMITTED"
  /** `C` da FONTE. Proveniência distinta de `auto_cancelled_by_deadline`. */
  | "SOURCE_CANCELLED"
  /** Status ausente ou fora do vocabulário. Não inventamos comportamento. */
  | "STATUS_NOT_GOVERNED"

/** O nome do fato governado que cada estado emite, ou `null` quando não emite. */
export type DeadlineFactType =
  | "P_SIGNATURE_DEADLINE_ATTENTION"
  | "A_EMISSION_DEADLINE_ALERT"
  | "CONTRACT_DEADLINE_MISSED"
  | "AUTO_CANCELLED_BY_DEADLINE"

/**
 * Avalia o estado de prazo de uma linha.
 *
 * `evaluation_date` entra por parâmetro e é a MESMA para toda a execução. Se cada
 * linha consultasse o relógio, uma análise iniciada às 23:59:59 avaliaria metade dos
 * contratos contra hoje e metade contra amanhã — e a fronteira D0/D+1 é justamente
 * onde "o contrato caiu" vira "cancelado".
 *
 * A ordem dos testes importa e é deliberada: status primeiro, prazo depois. Um `E`
 * não produz fato de prazo mesmo com `Desembolso` ilegível, porque não há pendência
 * a avaliar — reportar `not_evaluable` ali criaria uma pendência de investigação
 * sobre um contrato que já está resolvido.
 */
export function evaluateDeadline(
  status: LucasStatus | null,
  resolution: DeadlineResolution,
  evaluation_date: string,
): DeadlineState {
  if (status === "E") return { state: "not_applicable", reason: "CONTRACT_EMITTED" }
  if (status === "C") return { state: "not_applicable", reason: "SOURCE_CANCELLED" }
  if (status !== "P" && status !== "A") {
    return { state: "not_applicable", reason: "STATUS_NOT_GOVERNED" }
  }

  if (resolution.status === "not_evaluable") {
    return { state: "not_evaluable", reason: resolution.reason }
  }

  // Data de avaliação inválida é defeito de programação, não estado da fonte — mas
  // fechar aqui é mais barato que confiar: um `evaluation_date` corrompido produziria
  // deslocamento absurdo e um "cancelado" que ninguém consegue explicar.
  const hoje = parseCivilDateStrict(evaluation_date)
  if (hoje === null) {
    return { state: "not_evaluable", reason: "DEADLINE_UNDERLYING_UNAVAILABLE" }
  }

  const offset = diffCivilDays(resolution.deadline, hoje)
  if (offset === null) {
    return { state: "not_evaluable", reason: "DEADLINE_NOT_A_SOURCE_DATE" }
  }

  const base = { deadline: resolution.deadline, offset_days: offset } as const

  // D+1 e depois: a regra operacional considera cancelado.
  if (offset > 0) return { state: "auto_cancelled_by_deadline", ...base }
  // D0: o contrato caiu.
  if (offset === 0) return { state: "contract_deadline_missed", ...base }

  if (status === "P") {
    return offset >= P_ATTENTION_OFFSET_DAYS
      ? { state: "p_signature_deadline_attention", ...base }
      : { state: "outside_window", ...base }
  }
  // `A`: a janela é só D-1. Antes disso o gargalo é interno mas não é prazo.
  return offset >= A_ALERT_OFFSET_DAYS
    ? { state: "a_emission_deadline_alert", ...base }
    : { state: "outside_window", ...base }
}

/** O fato governado que o estado emite. `null` quando o estado não emite fato. */
export function deadlineFactType(s: DeadlineState): DeadlineFactType | null {
  switch (s.state) {
    case "p_signature_deadline_attention":
      return "P_SIGNATURE_DEADLINE_ATTENTION"
    case "a_emission_deadline_alert":
      return "A_EMISSION_DEADLINE_ALERT"
    case "contract_deadline_missed":
      return "CONTRACT_DEADLINE_MISSED"
    case "auto_cancelled_by_deadline":
      return "AUTO_CANCELLED_BY_DEADLINE"
    case "not_evaluable":
    case "outside_window":
    case "not_applicable":
      return null
  }
}

/**
 * `AUTO_CANCELLED_BY_DEADLINE` entra no conceito de recuperação.
 *
 * ─── O que este booleano afirma, e o que NÃO afirma ───────────────────────────
 *
 * Afirma: é candidato a INVESTIGAÇÃO de recontratação.
 *
 * Não afirma: que é recuperável, que volta, que vira venda. Nenhum critério governado
 * sustenta essas três, e o repositório não tem contrato de churn/recovery existente
 * para reutilizar — verifiquei antes de nomear. O nome escolhido carrega a dúvida no
 * próprio identificador para que ninguém o leia como promessa.
 *
 * `C` da fonte tem proveniência DIFERENTE e não passa por aqui: um contrato que a
 * fonte cancelou não foi cancelado por prazo, e afirmar o caminho causal sem
 * evidência histórica seria inventar a causa.
 */
export const RECOVERY_SEMANTICS = "RECOVERY_OPPORTUNITY_TO_INVESTIGATE" as const

export function isRecoveryCandidate(s: DeadlineState): boolean {
  return s.state === "auto_cancelled_by_deadline"
}

/**
 * Data civil de HOJE em `America/Sao_Paulo`.
 *
 * O fuso é o mesmo de `currentPeriod`, e por o mesmo motivo: o dia de um contrato é o
 * dia em São Paulo, não o dia UTC. Às 22:00 de 31/08 em São Paulo já é 01/09 em UTC,
 * e um prazo em 31/08 apareceria como perdido por diferença de fuso.
 *
 * `en-CA` produz `YYYY-MM-DD`. A saída passa por `parseCivilDateStrict` para que o
 * formato seja verificado e não presumido.
 */
export function currentCivilDateSaoPaulo(now: Date = new Date()): string | null {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  return parseCivilDateStrict(s)
}

/** Datas-chave da janela, para proveniência. Nenhuma delas é recalculada a jusante. */
export function deadlineWindow(deadline: string): {
  readonly p_attention_from: string | null
  readonly a_alert_from: string | null
} {
  return {
    p_attention_from: addCivilDays(deadline, P_ATTENTION_OFFSET_DAYS),
    a_alert_from: addCivilDays(deadline, A_ALERT_OFFSET_DAYS),
  }
}
