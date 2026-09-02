/**
 * Orquestração de PRODUÇÃO da análise do mês corrente do Lucas.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * A Fase 2.12a construiu o mapeador de D, a validação de período e a não-execução
 * governada — e **nada os chamava**. O gate encontrou: zero chamadores de produção
 * para `toMaterialSingleCaseInput` e `detectMaterialSingleCase`, e `currentPeriod`
 * aparecia apenas em comentários. Em produção D nunca executaria, e a não-execução
 * por sujeito repetido nunca seria emitida.
 *
 * Pior: os testes compunham a cadeia **à mão**. Provavam que as peças funcionam
 * juntas quando alguém as monta na ordem certa — não que exista alguém montando. É o
 * mesmo problema que a Fase 2.11 teve com a evidência, e que a 2.11b teve com o
 * adaptador Google. Uma peça correta sem chamador é uma peça que não roda.
 *
 * ─── A cadeia, e por que ela mora num lugar só ────────────────────────────────
 *
 *   currentPeriod()            UMA vez, America/Sao_Paulo
 *     └─ provider.load({ period })          o MESMO período
 *         └─ validateCurrentPeriod(capture, period)
 *             └─ toMaterialSingleCaseInput(validated, …)
 *                 ├─ not_executed  →  para aqui, com a razão
 *                 └─ mapped        →  detectMaterialSingleCase(input, PROD)
 *
 * Enquanto o chamador tinha de montar isso, cada chamador podia montar diferente —
 * resolver o período duas vezes, pular a validação, ou invocar D com um input que a
 * precondição dele recusaria. A composição é a parte que precisa ser única.
 *
 * ─── Uma resolução de período, e o motivo ─────────────────────────────────────
 *
 * O período é resolvido no topo e desce por parâmetro. Se fosse resolvido de novo na
 * validação, uma execução iniciada às 23:59:59 do dia 31 carregaria dados de agosto e
 * validaria contra setembro — a captura seria recusada como `CLOSED_PERIOD` por uma
 * corrida de relógio, não por característica do dado.
 */

import { detectMaterialSingleCase } from "../../../detectors/src/material-single-case"
import type { MaterialSingleCaseResult, SingleCaseAggregator } from "../../../detectors/src/material-single-case"
import type { SingleCaseMetric } from "../../../detectors/src/config"
import { buildProductionDetectorConfig } from "../../../detectors/src/production-policy"
import type { DetectorConfig } from "../../../detectors/src/config"
import { LucasMonthlyContractsProvider, currentPeriod } from "./provider"
import type { LucasCapture } from "./provider"
import {
  toMaterialSingleCaseInput,
  validateCurrentPeriod,
  awaitingSignatureFacts,
  pendingStudentSignatureFacts,
  deadlineIntelligence,
} from "./detector-input"
import type {
  DetectorDNotExecutedReason,
  LabeledPopulation,
  LucasDeadlineIntelligence,
} from "./detector-input"
import { currentCivilDateSaoPaulo } from "./deadline"
import type {
  AwaitingSignatureFact,
  PendingStudentSignatureFact,
} from "./status-semantics"
import type { InvalidSourceReason } from "./provider"
import { projectLucasSource } from "../briefing/source-projection"
import type { LucasSourceProjection } from "../briefing/source-projection"

/**
 * Fatos comerciais da captura. INDEPENDENTES de D ter executado.
 *
 * `A` e `P` são semântica da FONTE, não resultado de detector. Se ficassem atrás do
 * sucesso de D, um sujeito repetido — que impede D — também esconderia os alertas de
 * assinatura, que não têm nada a ver com o problema.
 */
export interface LucasCommercialFacts {
  readonly awaiting_creditum_signature: readonly AwaitingSignatureFact[]
  readonly pending_student_signature: readonly PendingStudentSignatureFact[]
}

/**
 * O resultado da análise. União FECHADA e discriminada.
 *
 * Seis estados, e a razão de não reduzi-los a `resultado | null`: um briefing futuro
 * precisa distinguir "D rodou e não achou nada" de "D não rodou porque a fonte não
 * estava lá" de "D não rodou porque dois contratos são da mesma pessoa". As três
 * viram a mesma ausência de evento, e exigem três conversas diferentes.
 */
export type LucasAnalysisOutcome =
  | {
      readonly status: "source_not_available"
      readonly period: string
      readonly expected_file_name: string
      readonly detail: string
    }
  | { readonly status: "source_error"; readonly period: string; readonly detail: string }
  | {
      readonly status: "source_invalid"
      readonly period: string
      readonly reason: InvalidSourceReason
      readonly detail: string
    }
  | {
      readonly status: "not_current"
      readonly period: string
      readonly capture_period: string
      readonly reason: "CLOSED_PERIOD" | "FUTURE_PERIOD"
    }
  | {
      readonly status: "d_not_executed"
      readonly period: string
      readonly reason: DetectorDNotExecutedReason
      readonly detail: string
      readonly population: LabeledPopulation
      readonly duplicated_subjects: readonly {
        readonly subject_ref: string
        readonly contracts: number
      }[]
      /** Presentes mesmo sem D: são fatos da fonte. */
      readonly facts: LucasCommercialFacts
      /** Prazo (Fase 2.13). Independente de D, como os fatos de A/P. */
      readonly deadline: LucasDeadlineIntelligence
      /**
       * Fase 3.0b — o que a captura JÁ calculou: qualidade, cobertura, evidências.
       *
       * Exposição, não computação. Sem este campo o assembler do briefing teria de
       * recalcular qualidade e cobertura por conta própria, criando uma segunda
       * autoridade sobre o mesmo número. Nada aqui altera como a captura decide.
       *
       * OBRIGATÓRIO e não-nulo. Este estado só existe depois de uma captura
       * utilizável, e a projeção é o que prova isso. `| null` aqui admitiria
       * "resultado utilizável sem a fonte que o sustenta" como estado — e o briefing
       * publicaria estado comercial sem índice de evidência nem medição de qualidade.
       * Isso não é fonte ausente: é invariante violada.
       */
      readonly source: LucasSourceProjection
    }
  | {
      readonly status: "d_executed"
      readonly period: string
      readonly population: LabeledPopulation
      readonly detector: MaterialSingleCaseResult
      readonly facts: LucasCommercialFacts
      /** Prazo (Fase 2.13). Independente de D. */
      readonly deadline: LucasDeadlineIntelligence
      /** Fase 3.0b — exposição do que a captura já calculou. Obrigatória. Ver acima. */
      readonly source: LucasSourceProjection
    }

/**
 * Costuras da fronteira externa. Test-only.
 *
 * `periodClock` é separado do relógio do provider de propósito. O provider usa o
 * dele para `collected_at`; este resolve o PERÍODO, e é chamado exatamente uma vez.
 * Ter os dois no mesmo seam misturaria "quando lemos" com "qual mês analisamos", e o
 * teste de resolução-única não conseguiria distinguir os dois usos.
 */
export interface LucasAnalysisSeams {
  /** Relógio do PERÍODO. Chamado UMA vez por execução. */
  readonly periodClock?: () => Date
  /** Configuração governada de detector. Padrão: a de produção, do artefato. */
  readonly config?: DetectorConfig
}

export interface LucasAnalysisRequest {
  readonly provider: LucasMonthlyContractsProvider
  readonly detected_at: string
  readonly metric: SingleCaseMetric
  readonly aggregator: SingleCaseAggregator
}

/**
 * Roda a análise do mês CORRENTE. Ponto de entrada de produção.
 *
 * O período é resolvido UMA vez, aqui, e desce por parâmetro para o `load` e para a
 * validação. Nenhuma função a jusante consulta relógio para decidir o mês.
 *
 * D é invocado **somente** quando o mapeamento devolve input válido. A não-execução
 * governada não vira exceção nem se dissolve em `source_error`: é um estado, com a
 * razão preservada.
 */
export async function runLucasCurrentPeriodAnalysis(
  request: LucasAnalysisRequest,
  seams: LucasAnalysisSeams = {},
): Promise<LucasAnalysisOutcome> {
  // ─── 1. O período, UMA vez ────────────────────────────────────────────────
  const agora = seams.periodClock === undefined ? new Date() : seams.periodClock()
  const period = currentPeriod(agora)

  // ─── 2. Carrega o MESMO período ───────────────────────────────────────────
  const capture: LucasCapture = await request.provider.load({ period })

  switch (capture.status) {
    case "data_not_available":
      // Ausência de arquivo NÃO é zero contratos. O estado carrega o nome do
      // arquivo esperado, que é o que alguém precisa para ir olhar a pasta.
      return {
        status: "source_not_available",
        period,
        expected_file_name: capture.expected_file_name,
        detail: capture.detail,
      }
    case "source_error":
      return { status: "source_error", period, detail: capture.detail }
    case "invalid_source":
      return {
        status: "source_invalid",
        period,
        reason: capture.reason,
        detail: capture.detail,
      }
    case "available":
    case "available_empty":
      break
  }

  // ─── 3. Valida o período, com o MESMO valor resolvido no passo 1 ──────────
  //
  // Defesa contra provider defeituoso: pedimos `period` e ele deveria devolver
  // aquele período, mas a validação não confia — confere. Sem isso, uma resposta
  // com o mês errado entraria como possibilidade comercial corrente.
  const check = validateCurrentPeriod(capture, period)
  if (check.status !== "current") {
    return {
      status: "not_current",
      period,
      capture_period: check.capture_period,
      reason: check.reason,
    }
  }

  // ─── 4. Fatos comerciais, ANTES de D e independentes dele ────────────────
  const entradaDeFatos = {
    capture,
    stance: "current" as const,
    detected_at: request.detected_at,
  }
  const facts: LucasCommercialFacts = {
    awaiting_creditum_signature: awaitingSignatureFacts(entradaDeFatos),
    pending_student_signature: pendingStudentSignatureFacts(entradaDeFatos),
  }

  // ─── 4b. Prazo (Fase 2.13), também antes de D e independente dele ────────
  //
  // A data de avaliação é resolvida UMA vez, do mesmo relógio injetado que resolveu o
  // período, e desce por parâmetro para todas as linhas. Duas leituras de relógio na
  // mesma análise poriam contratos em lados diferentes da fronteira D0/D+1.
  //
  // Fica antes de D e fora do caminho dele de propósito: um sujeito repetido impede D
  // e não tem relação nenhuma com prazo de assinatura. Se o prazo morasse atrás do
  // sucesso de D, um contrato caindo hoje ficaria invisível por causa de um CPF
  // duplicado em outra linha.
  // Projetada UMA vez, da mesma captura que alimentou tudo acima.
  //
  // `capture` já está estreitada para os dois ramos com corpo pelo switch do passo 2:
  // os outros retornaram. Por isso `projectLucasSource` aceita a captura utilizável e
  // devolve projeção — não `projeção | null`. A não-nulidade é garantida pela
  // ESTRUTURA do fluxo, não por asserção.
  const source: LucasSourceProjection = projectLucasSource(capture)

  const dataDeAvaliacao = currentCivilDateSaoPaulo(agora)
  const deadline: LucasDeadlineIntelligence =
    dataDeAvaliacao === null
      ? { evaluation_date: "", facts: [], not_evaluable: [] }
      : deadlineIntelligence(entradaDeFatos, dataDeAvaliacao)

  // ─── 5. Mapeia D pelo mapeador canônico ──────────────────────────────────
  const mapeamento = toMaterialSingleCaseInput(
    check.validated,
    request.detected_at,
    request.metric,
    request.aggregator,
  )

  if (mapeamento.status === "not_executed") {
    // Não lança, não vira `source_error`. O estado preserva a população e os
    // sujeitos repetidos, para que um briefing futuro explique POR QUE D não rodou.
    return {
      status: "d_not_executed",
      period,
      reason: mapeamento.reason,
      detail: mapeamento.detail,
      population: mapeamento.population,
      duplicated_subjects: mapeamento.duplicated_subjects,
      facts,
      deadline,
      source,
    }
  }

  // ─── 6. D, com a configuração GOVERNADA ──────────────────────────────────
  //
  // `buildProductionDetectorConfig()` deriva do artefato. Nenhum limiar é escrito
  // aqui, e nenhuma configuração de teste alcança este caminho.
  const config = seams.config ?? buildProductionDetectorConfig()
  const detector = detectMaterialSingleCase(mapeamento.input, config)

  return {
    status: "d_executed",
    period,
    population: mapeamento.population,
    detector,
    facts,
    deadline,
    source,
  }
}
