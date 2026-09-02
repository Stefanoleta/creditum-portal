/**
 * O que `E`, `A`, `P` e `C` significam — e por que a resposta depende do mês.
 *
 * ─── A medição que fixou isto ─────────────────────────────────────────────────
 *
 * Fase 2.10, dados reais:
 *
 *   julho (fechado)   19 `E`,  5 `C`,  ZERO `A`,  ZERO `P`
 *   agosto (vigente)   8 `E`,  0 `C`,  1 `A`,     11 `P`
 *
 * Julho não tem nenhum pendente porque pendente se RESOLVE antes do mês fechar. É
 * isso que faz as duas contas coincidirem em retrospecto e divergirem no presente:
 *
 *   julho    `status != C` = 19   `E` = 19    iguais
 *   agosto   `status != C` = 20   `E` = 8     2,5×
 *
 * O relatório oficial calcula `status != C` e publica 20 para agosto. Não é defeito:
 * para o mês fechado é exato. Mas chamar 20 de "realizado" no mês vigente soma 11
 * contratos que o aluno não assinou.
 *
 * ─── Por que a decomposição vive AQUI e não no relatório ──────────────────────
 *
 * O KPI do Lucas é dele. Este módulo não recalcula "vendas" nem publica número
 * concorrente — ele CLASSIFICA cada linha em realizado/pendente/cancelado, para que
 * quem consumir escolha a população com o rótulo à vista. Preservar o KPI oficial e
 * rotular a população não são coisas em conflito.
 *
 * ─── `A` é o único que muda de natureza, não só de contagem ───────────────────
 *
 * `A` significa que o aluno e o garantidor assinaram e falta a **Creditum**. No mês
 * vigente é fato comercial acionável — o gargalo é interno. Em mês fechado, um `A`
 * que ficou `A` é simplesmente não realizado. O mesmo símbolo, duas leituras, e a
 * diferença é o tempo.
 */

import type { LucasStatus } from "./rows"

/** Como tratar o período. Não é opinião — o mês vigente ainda muda. */
export type PeriodStance = "current" | "closed"

/**
 * Classificação comercial de uma linha. União FECHADA.
 *
 * `awaiting_creditum` existe apenas em `current`. Em `closed` um `A` cai em
 * `not_realized`, porque o mês terminou e ele não virou `E`.
 */
export type CommercialOutcome =
  | "realized"
  | "awaiting_creditum"
  | "pending_unsigned"
  | "not_realized"
  | "cancelled"

/**
 * Os TRÊS eixos independentes de um contrato no mês corrente.
 *
 * ─── Por que três, e não um número ────────────────────────────────────────────
 *
 * A Fase 2.10 mediu agosto: 8 `E`, 1 `A`, 11 `P`. Qualquer resposta única para
 * "quantas vendas?" escolhe uma das três populações e esconde as outras duas — e as
 * três são perguntas comerciais legítimas e diferentes:
 *
 *   quanto pode virar venda?          E + A + P   possibilidade
 *   quanto o cliente já confirmou?    E + A       confirmado
 *   quanto a Creditum já emitiu?      E           emitido
 *
 * Projetar cada contrato nos três eixos é o que torna a escolha do consumidor
 * explícita. Um campo só chamado `sales` obrigaria a decidir aqui, em silêncio.
 *
 * ─── E o que os três NÃO são ──────────────────────────────────────────────────
 *
 * Nenhum deles é "venda 100% concluída". Essa dimensão exige `E` MAIS pagamento do
 * aluno confirmado no Omie, e o Omie não é fonte observável nesta fase. Chamar
 * `E + A` de concluída somaria contratos que a Creditum ainda não emitiu.
 */
export interface CommercialProjection {
  /** Está no funil do mês: pode virar venda. `E`, `A` e `P`. */
  readonly in_commercial_pipeline: boolean
  /** O CLIENTE confirmou — aluno e garantidor assinaram. `E` e `A`. */
  readonly commercially_confirmed: boolean
  /** A CREDITUM emitiu. Só `E`. */
  readonly emitted: boolean
}

const NADA: CommercialProjection = Object.freeze({
  in_commercial_pipeline: false,
  commercially_confirmed: false,
  emitted: false,
})

/**
 * Projeta um status nos três eixos, para o mês CORRENTE.
 *
 * O `switch` é exaustivo sobre `LucasStatus` e o compilador prova: status novo no
 * vocabulário sem projeção aqui não compila.
 */
export function projectCurrentMonth(status: LucasStatus): CommercialProjection {
  switch (status) {
    case "E":
      // Emitido: os três eixos. Não precisa de alerta de assinatura.
      return Object.freeze({
        in_commercial_pipeline: true,
        commercially_confirmed: true,
        emitted: true,
      })
    case "A":
      // Aluno e garantidor assinaram; falta a Creditum emitir. Confirmado pelo
      // cliente, NÃO emitido — e é essa distinção que o alerta de `A` carrega.
      return Object.freeze({
        in_commercial_pipeline: true,
        commercially_confirmed: true,
        emitted: false,
      })
    case "P":
      // Contrato gerado, aluno não assinou. Só possibilidade.
      return Object.freeze({
        in_commercial_pipeline: true,
        commercially_confirmed: false,
        emitted: false,
      })
    case "C":
      return NADA
  }
}

/** Nome canônico de cada população. Fechado — nenhuma é `sales`. */
export type CommercialPopulation =
  | "COMMERCIAL_POTENTIAL"
  | "COMMERCIALLY_CONFIRMED"
  | "EMITTED"

const POPULACOES: Readonly<Record<CommercialPopulation, true>> = Object.freeze({
  COMMERCIAL_POTENTIAL: true,
  COMMERCIALLY_CONFIRMED: true,
  EMITTED: true,
})

export const COMMERCIAL_POPULATIONS: readonly CommercialPopulation[] = Object.freeze(
  Object.keys(POPULACOES).sort() as CommercialPopulation[],
)

/**
 * O status pertence à população? Mês CORRENTE.
 *
 * `COMMERCIAL_POTENTIAL` = E+A+P · `COMMERCIALLY_CONFIRMED` = E+A · `EMITTED` = E.
 */
export function belongsToPopulation(
  status: LucasStatus,
  population: CommercialPopulation,
): boolean {
  const p = projectCurrentMonth(status)
  switch (population) {
    case "COMMERCIAL_POTENTIAL":
      return p.in_commercial_pipeline
    case "COMMERCIALLY_CONFIRMED":
      return p.commercially_confirmed
    case "EMITTED":
      return p.emitted
  }
}

/**
 * A dimensão que ainda NÃO existe, nomeada para não ser confundida com as três.
 *
 * `FULLY_COMPLETED_SALE` exige `E` mais pagamento do aluno confirmado no Omie. O
 * Omie não é fonte observável nesta fase, então a dimensão é declarada e não
 * computada — declarar impede que `EMITTED` ou `COMMERCIALLY_CONFIRMED` sejam lidos
 * como conclusão financeira.
 */
export const FULLY_COMPLETED_SALE_STATUS = "DEFERRED_REQUIRES_OMIE_PAYMENT" as const

/**
 * Classifica. Determinística, total sobre os quatro status.
 *
 * O `switch` é exaustivo sobre `LucasStatus` e o compilador prova: acrescentar um
 * status ao vocabulário sem tratá-lo aqui não compila.
 */
export function classifyOutcome(status: LucasStatus, stance: PeriodStance): CommercialOutcome {
  switch (status) {
    case "E":
      return "realized"
    case "C":
      return "cancelled"
    case "A":
      return stance === "current" ? "awaiting_creditum" : "not_realized"
    case "P":
      return stance === "current" ? "pending_unsigned" : "not_realized"
  }
}

/**
 * Realizado é `E`, e só `E`, nos dois regimes.
 *
 * Função separada de propósito: é a pergunta que um número executivo faz, e ela
 * precisa ter uma resposta que não dependa de ninguém lembrar de filtrar.
 */
export function isRealized(status: LucasStatus): boolean {
  return status === "E"
}

export interface PopulationCounts {
  /** E + A + P. Possibilidade comercial do mês. NÃO é "vendas realizadas". */
  readonly COMMERCIAL_POTENTIAL: number
  /** E + A. O cliente confirmou. NÃO é "emitido". */
  readonly COMMERCIALLY_CONFIRMED: number
  /** E. A Creditum emitiu. NÃO é "venda 100% concluída". */
  readonly EMITTED: number
}

/**
 * As três populações do mês CORRENTE.
 *
 * Status fora do vocabulário não entra em nenhuma: não sabemos o que a linha é, e
 * incluí-la seria decidir por ela.
 */
export function countPopulations(
  linhas: readonly { readonly status: LucasStatus | null }[],
): PopulationCounts {
  let potential = 0
  let confirmed = 0
  let emitted = 0
  for (const l of linhas) {
    if (l.status === null) continue
    const p = projectCurrentMonth(l.status)
    if (p.in_commercial_pipeline) potential += 1
    if (p.commercially_confirmed) confirmed += 1
    if (p.emitted) emitted += 1
  }
  return Object.freeze({
    COMMERCIAL_POTENTIAL: potential,
    COMMERCIALLY_CONFIRMED: confirmed,
    EMITTED: emitted,
  })
}

export interface StatusDecomposition {
  readonly stance: PeriodStance
  readonly realized: number
  readonly awaiting_creditum: number
  readonly pending_unsigned: number
  readonly not_realized: number
  readonly cancelled: number
  /** Linhas cujo status não pertence ao vocabulário. Nunca somadas em nada. */
  readonly invalid_status: number
  readonly total: number
}

/**
 * Decompõe uma população. NÃO devolve campo chamado "vendas".
 *
 * A ausência é deliberada: um campo com esse nome seria consumido como o KPI
 * oficial, e o KPI oficial é do relatório do Lucas. Quem precisar do agregado
 * oficial soma os rótulos explicitamente e assume o que somou.
 */
export function decomposeStatuses(
  linhas: readonly { readonly status: LucasStatus | null }[],
  stance: PeriodStance,
): StatusDecomposition {
  let realized = 0
  let awaiting = 0
  let pending = 0
  let notRealized = 0
  let cancelled = 0
  let invalid = 0

  for (const l of linhas) {
    if (l.status === null) {
      invalid += 1
      continue
    }
    switch (classifyOutcome(l.status, stance)) {
      case "realized":
        realized += 1
        break
      case "awaiting_creditum":
        awaiting += 1
        break
      case "pending_unsigned":
        pending += 1
        break
      case "not_realized":
        notRealized += 1
        break
      case "cancelled":
        cancelled += 1
        break
    }
  }

  return Object.freeze({
    stance,
    realized,
    awaiting_creditum: awaiting,
    pending_unsigned: pending,
    not_realized: notRealized,
    cancelled,
    invalid_status: invalid,
    total: linhas.length,
  })
}

/**
 * O fato de `A`, sem severidade.
 *
 * `AWAITING_CREDITUM_SIGNATURE` é acionável por natureza — o gargalo está dentro da
 * Creditum. Mas `creditum-policy.v1.json` não cobre este tipo de evento, e a Fase
 * 2.7 fechou que severidade sem lastro governado não sai. O fato sobrevive e fica
 * disponível; o Event executivo espera decisão de política.
 *
 * Mesmo padrão do low-ticket antes de a severidade `medium` ser aprovada.
 */
export const AWAITING_CREDITUM_SIGNATURE = "AWAITING_CREDITUM_SIGNATURE" as const

/**
 * O fato de `P`: contrato gerado e o ALUNO não assinou.
 *
 * Acionável, e o gargalo está FORA da Creditum — é cobrança de assinatura. Distinto
 * de `AWAITING_CREDITUM_SIGNATURE`, em que a pendência é interna, e a distinção
 * importa porque as duas vão para pessoas diferentes.
 *
 * Sem severidade: `creditum-policy.v1.json` não cobre este tipo de evento, e a Fase
 * 2.7 fechou que severidade sem lastro governado não sai. Sem aging e sem prazo: a
 * fonte não traz a data em que o contrato foi gerado de forma governada, e inventar
 * um relógio produziria "atrasado" sem definição de atraso.
 */
export const PENDING_STUDENT_SIGNATURE = "PENDING_STUDENT_SIGNATURE" as const

export interface AwaitingSignatureFact {
  readonly fact: typeof AWAITING_CREDITUM_SIGNATURE
  readonly period: string
  readonly subject_ref: string | null
  readonly unit_id: string | null
  readonly ticket_cents: number | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
  /**
   * SEMPRE `null`. Não é campo a preencher depois — é a afirmação de que nenhuma
   * severidade foi atribuída, visível para quem consumir o fato.
   */
  readonly severity: null
  readonly severity_status: "SEVERITY_POLICY_UNRESOLVED"
}

/**
 * O fato de `P`. Mesma forma do de `A`, e severidade igualmente ausente.
 *
 * `severity: null` não é campo a preencher depois — é a afirmação de que nenhuma
 * severidade foi atribuída, visível para quem consumir.
 */
export interface PendingStudentSignatureFact {
  readonly fact: typeof PENDING_STUDENT_SIGNATURE
  readonly period: string
  readonly subject_ref: string | null
  readonly unit_id: string | null
  readonly ticket_cents: number | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
  readonly severity: null
  readonly severity_status: "SEVERITY_POLICY_UNRESOLVED"
}
