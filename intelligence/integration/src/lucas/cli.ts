/**
 * Gatilho de PRODUÇÃO da análise do Lucas. Comando server-side.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * A Fase 2.12b construiu `runProductionLucasAnalysis` e o gate encontrou que
 * **nada o chamava**: a busca no repositório o achava apenas na própria definição e
 * nos testes. Publicar a árvore não carregava a planilha nem executava D.
 *
 * É o quarto achado da mesma família nesta linha de fases — `EvidenceBuilder` sem
 * implementação, `LucasDrivePort` sem adaptador, o mapeador de D sem chamador, e
 * agora o entrypoint sem gatilho. O padrão comum: uma peça correta a mais de
 * distância do runtime do que eu supunha, e testes que chamavam a peça diretamente
 * em vez de partir de onde a execução realmente começa.
 *
 * ─── Este arquivo NÃO orquestra ───────────────────────────────────────────────
 *
 * Ele chama `runProductionLucasAnalysis` e formata o resultado. Não resolve período,
 * não carrega a fonte, não valida, não mapeia e não invoca detector. Se orquestrasse,
 * haveria dois caminhos de produção — e o segundo poderia divergir do primeiro sem
 * que nada falhasse.
 *
 * ─── Comando, não agendador ───────────────────────────────────────────────────
 *
 * `npm run lucas:analyze --prefix intelligence`.
 *
 * Sem cron, sem fila, sem execução em background. O que esta fase estabelece é que
 * existe um gatilho operacional CHAMÁVEL. Quando chamá-lo é decisão de runtime, e um
 * agendador futuro deve invocar ESTE comando em vez de reconstruir a análise.
 *
 * ─── Server-side ──────────────────────────────────────────────────────────────
 *
 * Vive em `integration/src/lucas`, fora de `src/app`, e importa
 * `google-auth-library`. Nenhum bundle de browser o alcança, e a credencial não sai
 * do servidor.
 */

import { GatewayError } from "../../../gateway/src/errors"
import { runProductionLucasAnalysis } from "./production"
import type { ProductionSeams } from "./production"
import type { LucasAnalysisOutcome, LucasAnalysisSeams } from "./analysis"
import type { LucasDeadlineIntelligence } from "./detector-input"
import type { DeadlineFactType } from "./deadline"
import { LUCAS_DATASET_ID } from "./drive-port"

/**
 * Códigos de saída. Explícitos porque o repositório não tinha convenção.
 *
 * A distinção que importa: um RESULTADO GOVERNADO é sucesso do comando, ainda que
 * diga "a fonte não estava lá" ou "D não executou". O sistema respondeu, e a resposta
 * é a informação. Só falha de bootstrap e defeito de programação são erro do comando.
 *
 * Tratar `source_not_available` como erro faria um mês sem arquivo parecer com o
 * processo quebrado — e um operador investigaria a infraestrutura em vez de olhar a
 * pasta do Drive.
 */
export const EXIT = Object.freeze({
  /** Um dos seis estados governados foi emitido. */
  GOVERNED_RESULT: 0,
  /** Configuração ausente/inválida. Nada foi lido. */
  BOOTSTRAP_FAILURE: 1,
  /** Defeito nosso: exceção que não é estado governado nem bootstrap. */
  UNEXPECTED_FAILURE: 2,
} as const)

/**
 * Resumo SEGURO de um resultado, para stdout e log.
 *
 * ─── O que NÃO sai ────────────────────────────────────────────────────────────
 *
 * Nenhuma linha de contrato, nenhum objeto de `Evidence`, nenhum CPF, nome, chave ou
 * token. Despejar a captura inteira num log operacional seria mover PII para um lugar
 * que ninguém trata como sensível.
 *
 * `subject_ref` aparece — e só ele — nos sujeitos repetidos. É pseudônimo governado
 * (`subj_<16 hex>`), projetado desde a Fase 2.11 para ser seguro fora do domínio, e é
 * a única forma de um operador rastrear qual caso travou D.
 *
 * Fatos de `A` e `P` saem como CONTAGEM. O detalhe individual existe no objeto
 * devolvido, para quem consome programaticamente; o log não precisa dele.
 */
export interface LucasAnalysisReport {
  readonly status: LucasAnalysisOutcome["status"]
  readonly dataset_id: string
  readonly period: string
  /** Presente quando houve captura válida. */
  readonly population?: { readonly population: string; readonly count: number }
  readonly detector?: {
    readonly candidates_evaluated: number
    readonly events: number
    readonly quality_status: string
  }
  readonly detector_not_executed?: {
    readonly reason: string
    readonly duplicated_subjects: readonly {
      readonly subject_ref: string
      readonly contracts: number
    }[]
  }
  readonly facts?: {
    readonly awaiting_creditum_signature: number
    readonly pending_student_signature: number
  }
  /**
   * Prazo (Fase 2.13). CONTAGENS e a data de avaliação — nada mais.
   *
   * Nenhum `subject_ref`, nenhum prazo individual, nenhum `row_number`. O detalhe por
   * contrato existe no objeto devolvido, para quem consome programaticamente; o log
   * operacional não precisa dele e um log é o lugar menos protegido do sistema.
   *
   * `not_evaluable` sai separado das contagens de fato de propósito: é a distinção
   * que a fase existe para preservar. "Zero alertas" e "não foi possível avaliar
   * quatro contratos" exigem ações diferentes, e um número só as confundiria.
   */
  readonly deadline?: {
    readonly evaluation_date: string
    readonly p_deadline_attention_count: number
    readonly a_emission_deadline_alert_count: number
    readonly deadline_missed_count: number
    readonly auto_cancelled_by_deadline_count: number
    readonly recovery_candidate_count: number
    readonly not_evaluable_count: number
  }
  readonly source?: {
    readonly expected_file_name?: string
    readonly reason?: string
    readonly capture_period?: string
    readonly detail?: string
  }
}

/**
 * Projeta o resultado no resumo seguro. `switch` EXAUSTIVO sobre os seis estados.
 *
 * O compilador prova a exaustividade: um estado novo no contrato da orquestração sem
 * tratamento aqui não compila. Sem isso, um estado novo cairia num `default` e
 * apareceria no log como "desconhecido" — que é a pior forma de descobrir um estado.
 */
/** Projeta o prazo em contagens seguras. Nenhum identificador individual sai. */
function resumoDePrazo(d: LucasDeadlineIntelligence): NonNullable<LucasAnalysisReport["deadline"]> {
  const conta = (t: DeadlineFactType): number => d.facts.filter((f) => f.fact === t).length
  return {
    evaluation_date: d.evaluation_date,
    p_deadline_attention_count: conta("P_SIGNATURE_DEADLINE_ATTENTION"),
    a_emission_deadline_alert_count: conta("A_EMISSION_DEADLINE_ALERT"),
    deadline_missed_count: conta("CONTRACT_DEADLINE_MISSED"),
    auto_cancelled_by_deadline_count: conta("AUTO_CANCELLED_BY_DEADLINE"),
    recovery_candidate_count: d.facts.filter((f) => f.recovery_candidate).length,
    not_evaluable_count: d.not_evaluable.length,
  }
}

export function toReport(o: LucasAnalysisOutcome): LucasAnalysisReport {
  const base = { status: o.status, dataset_id: LUCAS_DATASET_ID, period: o.period }

  switch (o.status) {
    case "source_not_available":
      return {
        ...base,
        source: { expected_file_name: o.expected_file_name, detail: o.detail },
      }
    case "source_error":
      return { ...base, source: { detail: o.detail } }
    case "source_invalid":
      return { ...base, source: { reason: o.reason, detail: o.detail } }
    case "not_current":
      return { ...base, source: { reason: o.reason, capture_period: o.capture_period } }
    case "d_not_executed":
      return {
        ...base,
        population: { population: o.population.population, count: o.population.count },
        detector_not_executed: {
          reason: o.reason,
          duplicated_subjects: o.duplicated_subjects,
        },
        facts: {
          awaiting_creditum_signature: o.facts.awaiting_creditum_signature.length,
          pending_student_signature: o.facts.pending_student_signature.length,
        },
        deadline: resumoDePrazo(o.deadline),
      }
    case "d_executed":
      return {
        ...base,
        population: { population: o.population.population, count: o.population.count },
        detector: {
          candidates_evaluated: o.detector.summary.candidates_evaluated,
          events: o.detector.events.length,
          quality_status: o.detector.summary.quality_status,
        },
        facts: {
          awaiting_creditum_signature: o.facts.awaiting_creditum_signature.length,
          pending_student_signature: o.facts.pending_student_signature.length,
        },
        deadline: resumoDePrazo(o.deadline),
      }
  }
}

/** Onde o comando escreve. Injetável para que o teste leia o que foi impresso. */
export interface CliIo {
  readonly out: (line: string) => void
  readonly err: (line: string) => void
}

const IO_PADRAO: CliIo = {
  out: (l) => process.stdout.write(`${l}\n`),
  err: (l) => process.stderr.write(`${l}\n`),
}

export interface CliResult {
  readonly exit_code: number
  /** O resumo, quando houve resultado governado. */
  readonly report?: LucasAnalysisReport
}

/**
 * O comando. Chama a orquestração e formata — nada mais.
 *
 * `metric` e `aggregator` são fixos no vocabulário governado do artefato:
 * `amount_sum_cents` com `sum`. Não são parâmetros de linha de comando porque a
 * escolha da métrica é decisão governada, e um operador passando `case_count` na CLI
 * mudaria o que o Detector D mede sem passar por governança.
 *
 * `detected_at` é o instante da execução. É o único tempo que o comando produz — o
 * período vem da orquestração, que o resolve uma vez.
 */
export async function runLucasAnalysisCommand(
  env: Readonly<Record<string, string | undefined>> = process.env,
  seams: ProductionSeams & LucasAnalysisSeams = {},
  io: CliIo = IO_PADRAO,
): Promise<CliResult> {
  try {
    const outcome = await runProductionLucasAnalysis(
      {
        detected_at: new Date().toISOString(),
        metric: "amount_sum_cents",
        aggregator: "sum",
      },
      env,
      seams,
    )
    const report = toReport(outcome)
    // Uma linha, JSON, legível por máquina. Um agendador futuro consome isto.
    io.out(JSON.stringify(report))
    return { exit_code: EXIT.GOVERNED_RESULT, report }
  } catch (e) {
    // `GatewayError` aqui só pode vir do bootstrap: a orquestração converte toda
    // condição de fonte em estado. A mensagem cita NOMES de variável, nunca valores.
    if (e instanceof GatewayError) {
      io.err(
        JSON.stringify({
          status: "bootstrap_failure",
          dataset_id: LUCAS_DATASET_ID,
          message: e.message,
          details: e.details ?? [],
        }),
      )
      return { exit_code: EXIT.BOOTSTRAP_FAILURE }
    }
    // Defeito nosso. Não vira estado governado: fingir que é um resultado esconderia
    // o bug atrás de uma resposta plausível sobre a fonte do Lucas.
    io.err(
      JSON.stringify({
        status: "unexpected_failure",
        dataset_id: LUCAS_DATASET_ID,
        message: e instanceof Error ? e.message : "erro não identificado",
      }),
    )
    return { exit_code: EXIT.UNEXPECTED_FAILURE }
  }
}

/**
 * Ponto de entrada do processo.
 *
 * Só executa quando o módulo É o script invocado — não quando é importado por um
 * teste. Sem essa guarda, importar o módulo para testá-lo disparia a análise real.
 */
const executadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (executadoDiretamente) {
  const r = await runLucasAnalysisCommand()
  process.exit(r.exit_code)
}
