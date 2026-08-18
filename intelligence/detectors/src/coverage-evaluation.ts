/**
 * Avaliação de cobertura como ESTADO EXPLÍCITO.
 *
 * ─── O que este módulo corrige ────────────────────────────────────────────────
 *
 * A Fase 2.8 entregou o modelo de `expected_units` e a cobertura, mas deixou uma
 * brecha: `unit_coverage` é campo OPCIONAL nos detectores, e sem membership a
 * produção simplesmente omitia. `undefined` passava a significar três coisas ao
 * mesmo tempo — "não pedi cobertura", "não avaliei" e "não tenho o dado" — e um
 * consumidor futuro não teria como distingui-las.
 *
 * Ausência de dado governado precisa ser AFIRMADA, não inferida de um campo que
 * não veio.
 *
 * ─── Como a omissão fica estruturalmente impossível ───────────────────────────
 *
 * `CoverageEvaluation` é união discriminada, e o ramo indisponível **não tem**
 * campos de razão, denominador ou percentual. Não é que fabricar seja proibido por
 * convenção: é que não existe onde escrever. `ratio_bp` só existe no ramo em que
 * há denominador.
 *
 * E quem orquestra produção carrega este valor como campo OBRIGATÓRIO — o
 * compilador recusa um resultado de produção sem estado de cobertura. Omitir não é
 * uma escolha ruim disponível; é um erro de tipo.
 *
 * ─── O que NÃO muda ───────────────────────────────────────────────────────────
 *
 * Nenhum schema de contrato foi alterado, nenhum limiar foi tocado, e
 * `unit_coverage` continua opcional na entrada dos detectores — que é o contrato
 * interno deles, exercitado por fixtures sintéticas. O que passa a ser garantido é
 * o caminho de PRODUÇÃO.
 *
 * Cobertura indisponível também NÃO interrompe a execução factual: o detector
 * continua calculando o que ele de fato possui, preservando evidência e
 * procedência, e emitindo Event se todos os OUTROS requisitos estiverem
 * satisfeitos. O que não acontece é um número de cobertura sair do nada.
 */

import { deepFreeze } from "../../gateway/src/immutability"
import { assessCoverage, coverageQuality } from "./expected-units"
import type {
  CoverageQuality,
  ExpectedUnitsProvider,
  ExpectedUnitsQuery,
} from "./expected-units"
import type { UnitId } from "./canonical-units"

/**
 * Por que a cobertura não pôde ser avaliada. Conjunto FECHADO.
 *
 * Um único motivo hoje, e é decisão registrada: as memberships operacionais não
 * existem em fonte governada. Motivo novo entra aqui, nomeado — nunca como string
 * livre, que viraria mensagem em vez de estado auditável.
 */
export type CoverageUnavailableReason = "EXPECTED_UNITS_DATA_NOT_AVAILABLE"

/**
 * O estado da cobertura de uma execução. Sempre um dos dois — nunca ausente.
 *
 * Repare no que o ramo `data_not_available` não tem: `ratio_bp`,
 * `expected_count`, `missing_count`, `quality_status`. Sem denominador não existe
 * percentual, e o tipo é onde isso fica dito de forma que não dá para contornar.
 */
export type CoverageEvaluation =
  | {
      readonly status: "available"
      readonly period: string
      readonly dataset_id: string
      /** Identidade estrutural da membership usada. Auditoria: esperado segundo o quê. */
      readonly membership_id: string
      readonly expected_count: number
      readonly observed_expected_count: number
      readonly missing_unit_ids: readonly UnitId[]
      readonly missing_count: number
      readonly missing_share_bp: number
      readonly ratio_bp: number
      readonly unexpected_observed_unit_ids: readonly UnitId[]
      readonly quality_status: CoverageQuality
    }
  | {
      readonly status: "data_not_available"
      readonly period: string
      readonly dataset_id: string
      readonly reason: CoverageUnavailableReason
      readonly detail: string
    }

/**
 * Resolve o provider e devolve o estado. SEMPRE consulta.
 *
 * Não existe caminho que pule a consulta e devolva "indisponível" por preguiça:
 * indisponível é o que o provider responde, não uma suposição de quem chama.
 *
 * O limiar entra por parâmetro, da política governada. Este módulo não sabe onde
 * fica a fronteira entre `degraded` e `insufficient`.
 */
export function evaluateCoverage(
  provider: ExpectedUnitsProvider,
  query: ExpectedUnitsQuery,
  observed: readonly UnitId[],
  missing_share_insufficient_at_bp: number,
): CoverageEvaluation {
  const lookup = provider.getExpectedUnits(query)

  if (lookup.status === "DATA_NOT_AVAILABLE") {
    return deepFreeze({
      status: "data_not_available" as const,
      period: lookup.period,
      dataset_id: lookup.dataset_id,
      reason: "EXPECTED_UNITS_DATA_NOT_AVAILABLE" as const,
      detail: lookup.detail,
    })
  }

  const a = assessCoverage(lookup.membership, observed)

  return deepFreeze({
    status: "available" as const,
    period: lookup.membership.period,
    dataset_id: lookup.membership.dataset_id,
    membership_id: lookup.membership.membership_id,
    expected_count: a.expected_count,
    observed_expected_count: a.observed_expected_count,
    missing_unit_ids: a.missing_unit_ids,
    missing_count: a.missing_count,
    missing_share_bp: a.missing_share_bp,
    ratio_bp: a.ratio_bp,
    unexpected_observed_unit_ids: a.unexpected_observed_unit_ids,
    quality_status: coverageQuality(a, missing_share_insufficient_at_bp),
  })
}

/**
 * A forma que os detectores já consomem, quando ela existe.
 *
 * `undefined` no ramo indisponível é deliberado e SEGURO aqui, porque o estado
 * explícito viaja ao lado: quem recebe `undefined` desta função também recebe a
 * `CoverageEvaluation` que diz por quê. O `undefined` deixou de ser a única
 * informação disponível.
 */
export function coverageForDetector(e: CoverageEvaluation):
  | { readonly expected_units: number; readonly reporting_units: number; readonly ratio_bp: number }
  | undefined {
  if (e.status !== "available") return undefined
  return deepFreeze({
    expected_units: e.expected_count,
    reporting_units: e.observed_expected_count,
    ratio_bp: e.ratio_bp,
  })
}

/** Pergunta de uma linha para o consumidor, sem inspecionar campo ausente. */
export function isCoverageEvaluated(e: CoverageEvaluation): boolean {
  return e.status === "available"
}
