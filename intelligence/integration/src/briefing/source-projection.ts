/**
 * Fase 3.0b — projeção do que a captura do Lucas JÁ calculou.
 *
 * ─── Por que este módulo existe ───────────────────────────────────────────────
 *
 * `ExecutiveBriefingV1` exige `quality_and_coverage` e `evidence_index`. Os dois
 * valores existem: a captura calcula qualidade, cobertura e o conjunto de evidências
 * desde a Fase 2.11. O que faltava era EXPOSIÇÃO — `LucasAnalysisOutcome` não os
 * carregava, e sem eles o assembler não teria de onde tirá-los.
 *
 * Havia duas saídas ruins e uma boa:
 *
 *   ruim   o assembler recebe a qualidade como input que ninguém em produção
 *          consegue preencher — a peça órfã que quatro NO-SHIP me ensinaram a
 *          reconhecer;
 *   ruim   o assembler recalcula qualidade e cobertura por conta própria, criando
 *          uma segunda autoridade sobre o mesmo número;
 *   boa    expor o que já foi computado, sem tocar em como foi computado.
 *
 * Esta é a terceira. Nenhuma linha aqui decide qualidade, conta unidade ou monta
 * evidência: tudo é leitura de campo já governado.
 */

import type { LucasCapture } from "../lucas/provider"
import type { RowQualityCounts } from "../lucas/provider"
import type { SourceQualityFact } from "../lucas/source-quality"

/**
 * Cobertura governada, como o snapshot a declara.
 *
 * `expected_units` sem valor NÃO é zero: é a lacuna de governança que a Fase 2.6
 * registrou e que segue aberta. O campo é opcional aqui por isso, e o assembler
 * simplesmente não declara cobertura quando ela não existe.
 */
export interface GovernedCoverage {
  readonly expected_units: number
  readonly reporting_units: number
  readonly ratio_bp: number
  readonly missing_units?: readonly string[]
}

/**
 * O que a captura já sabe, exposto para montagem.
 *
 * `evidence_ids` é o índice AUTORITATIVO — não a união do que os fatos citam. A
 * diferença importa: com o índice autoritativo, uma referência pendurada num fato
 * fica detectável. Se o índice fosse a união das citações, integridade referencial
 * seria verdadeira por construção e o teste dela seria vazio.
 */
export interface LucasSourceProjection {
  readonly dataset_id: string
  readonly snapshot_id: string
  /**
   * O estado de visão da FONTE, como a captura o decidiu.
   *
   * `available` × `available_empty` é decidido em UM lugar: o provider, ao construir
   * a captura. Transportar é obrigatório porque a alternativa — o assembler olhar
   * `row_count === 0` — criaria uma segunda autoridade sobre a mesma distinção. Hoje
   * as duas concordariam; a que estivesse errada só apareceria no dia em que
   * divergissem, que é exatamente quando ninguém está olhando.
   */
  readonly view_state: "available" | "available_empty"
  /**
   * Resultado da medição de qualidade do snapshot. SEMPRE medido.
   *
   * Uma captura utilizável tem snapshot, e snapshot tem veredito. `not_measured` NÃO
   * aparece aqui de propósito: ele descreve a ausência de medição, e aqui a medição
   * existe. Quem monta o briefing sem captura declara `not_measured` por si.
   */
  readonly quality_status: "ok" | "degraded" | "conflicted" | "insufficient"
  readonly coverage: GovernedCoverage | null
  readonly source_quality: readonly SourceQualityFact[]
  readonly row_quality_counts: RowQualityCounts
  readonly evidence_ids: readonly string[]
  readonly row_count: number
}

/**
 * A captura que TEM corpo. As outras não computaram nada que se possa projetar.
 *
 * Derivado da união em vez de redeclarado: um ramo novo com corpo entra aqui sozinho,
 * e um ramo sem corpo continua fora sem ninguém precisar lembrar.
 */
export type UsableLucasCapture = Extract<LucasCapture, { readonly status: "available" | "available_empty" }>

/**
 * Projeta a captura utilizável. NUNCA devolve `null`.
 *
 * ─── Por que a assinatura mudou ───────────────────────────────────────────────
 *
 * A versão anterior aceitava qualquer `LucasCapture` e devolvia `null` para os ramos
 * sem corpo. O tipo era honesto sobre a função e MENTIROSO sobre o chamador: a
 * orquestração só chama isto depois de ter estreitado a captura, mas o `| null`
 * viajava para dentro de `LucasAnalysisOutcome` e chegava ao assembler como se
 * "resultado utilizável sem projeção" fosse um estado possível. Não é: é violação de
 * invariante. Estreitar a ENTRADA elimina a saída impossível na origem.
 *
 * Nenhuma linha aqui decide qualidade, conta unidade ou monta evidência: tudo é
 * leitura de campo já governado.
 */
export function projectLucasSource(capture: UsableLucasCapture): LucasSourceProjection {
  const cobertura = capture.snapshot.coverage
  return {
    dataset_id: capture.snapshot.dataset_id,
    snapshot_id: capture.snapshot.snapshot_id,
    // Transporte do que o provider decidiu. Não recontamos linhas para redecidir.
    view_state: capture.status,
    quality_status: capture.snapshot.quality_status,
    coverage:
      cobertura === undefined
        ? null
        : {
            expected_units: cobertura.expected_units,
            reporting_units: cobertura.reporting_units,
            ratio_bp: cobertura.ratio_bp,
            ...(cobertura.missing_units === undefined
              ? {}
              : { missing_units: [...cobertura.missing_units] }),
          },
    source_quality: [...capture.source_quality],
    row_quality_counts: { ...capture.row_quality_counts },
    // Ordenado para que a identidade do briefing não dependa da ordem em que o
    // conjunto de evidências foi montado.
    evidence_ids: [...capture.evidence.all.map((e) => e.evidence_id)].sort(),
    row_count: capture.row_count,
  }
}
