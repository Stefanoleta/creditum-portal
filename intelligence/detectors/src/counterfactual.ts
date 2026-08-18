/**
 * Contrafactual — quanto um item individual move um agregado.
 *
 * Responde a "e se este caso não existisse?" de forma determinística e exata.
 * É a primitive do Caso D, mas não é sobre ticket médio: o agregador é
 * parâmetro, porque a mesma pergunta vale para volume, contagem e conversão.
 *
 * Duas armadilhas que este módulo existe para não cair:
 *
 *   1. **Denominador vazio.** Remover o único item deixa uma população vazia.
 *      Média de nada não é zero — é `EMPTY_DENOMINATOR`. Tratar como zero
 *      produziria um delta gigante e falso justamente no caso mais raro.
 *   2. **Exatidão.** Toda soma passa por `sumCents`; toda razão por `ratio`.
 *      Um `reduce` local contornaria as guardas de D11.
 */

import { gap, isOk, meanCents, ratio, observed, sumCents } from "./engine"
import type { Metric } from "./engine"

export interface CounterfactualInput<T> {
  readonly items: readonly T[]
  /** Índice do item removido. Fora da faixa é erro explícito, não silêncio. */
  readonly removeIndex: number
  /** Agregador exato. Devolve lacuna quando não consegue responder. */
  readonly aggregate: (items: readonly T[]) => Metric<number>
  /** Mínimo de itens que a população precisa manter para o resultado valer. */
  readonly minPopulationAfterRemoval: number
}

export interface CounterfactualResult {
  readonly aggregate_with_item: Metric<number>
  readonly aggregate_without_item: Metric<number>
  /** com − sem. Lacuna se qualquer um dos dois for lacuna. */
  readonly delta: Metric<number>
  /**
   * Delta relativo ao agregado SEM o item, em basis points.
   *
   * O denominador é o agregado sem o item de propósito: a pergunta é "quanto
   * este caso distorce o resto", e usar o total com o item embutido diluiria a
   * própria distorção que se quer medir.
   */
  readonly delta_bp: Metric<number>
  /** Participação do item no total, quando o agregado for soma. */
  readonly share_of_total_bp: Metric<number>
}

function semValor(detalhe: string): Metric<number> {
  return gap<number>("EMPTY_DENOMINATOR", "calculated", detalhe)
}

/**
 * Calcula o contrafactual.
 *
 * Nunca lança para entrada de domínio: população insuficiente e índice inválido
 * viram lacuna com motivo, porque são respostas legítimas de "não dá para
 * afirmar" — e um detector precisa poder registrar isso, não estourar.
 */
export function counterfactual<T>(input: CounterfactualInput<T>): CounterfactualResult {
  const { items, removeIndex, aggregate: agregar, minPopulationAfterRemoval } = input

  if (!Number.isSafeInteger(removeIndex) || removeIndex < 0 || removeIndex >= items.length) {
    const motivo = semValor(`índice ${removeIndex} fora da população de ${items.length}`)
    return {
      aggregate_with_item: motivo,
      aggregate_without_item: motivo,
      delta: motivo,
      delta_bp: motivo,
      share_of_total_bp: motivo,
    }
  }

  const restantes = [...items.slice(0, removeIndex), ...items.slice(removeIndex + 1)]

  const comItem = agregar(items)

  // Remover o item deixa população insuficiente: o agregado "sem" não existe, e
  // inventá-lo como zero produziria um delta falso e enorme.
  if (restantes.length < minPopulationAfterRemoval || restantes.length === 0) {
    const motivo = semValor(
      `população de ${restantes.length} após remoção, abaixo do mínimo de ${minPopulationAfterRemoval}`,
    )
    return {
      aggregate_with_item: comItem,
      aggregate_without_item: motivo,
      delta: motivo,
      delta_bp: motivo,
      share_of_total_bp: motivo,
    }
  }

  const semItem = agregar(restantes)

  if (!isOk(comItem) || !isOk(semItem)) {
    const motivo = gap<number>("DATA_NOT_AVAILABLE", "calculated", "agregado indisponível")
    return {
      aggregate_with_item: comItem,
      aggregate_without_item: semItem,
      delta: motivo,
      delta_bp: motivo,
      share_of_total_bp: motivo,
    }
  }

  const diferenca = sumCents([comItem.value, -semItem.value])
  const delta =
    diferenca === null
      ? gap<number>("DATA_NOT_AVAILABLE", "calculated", "delta fora da faixa exata")
      : observed(diferenca)

  const deltaBp = isOk(delta)
    ? mapRatioToBp(ratio(observed(delta.value), observed(semItem.value), "delta / agregado_sem_item"))
    : delta

  const shareBp = isOk(delta)
    ? mapRatioToBp(ratio(observed(delta.value), observed(comItem.value), "delta / agregado_com_item"))
    : delta

  return {
    aggregate_with_item: comItem,
    aggregate_without_item: semItem,
    delta,
    delta_bp: deltaBp,
    share_of_total_bp: shareBp,
  }
}

function mapRatioToBp(m: Metric<{ bps: number }>): Metric<number> {
  return isOk(m) ? observed(m.value.bps) : m
}

// ─── Agregadores prontos ──────────────────────────────────────────────────────
//
// Delegam ao motor. Existem para que o chamador não seja tentado a escrever o
// próprio `reduce` e perder as guardas de exatidão.

/** Soma exata em centavos. */
export function sumAggregator(values: readonly number[]): Metric<number> {
  const total = sumCents(values)
  return total === null
    ? gap<number>("DATA_NOT_AVAILABLE", "calculated", "soma fora da faixa exata")
    : observed(total)
}

/** Média em centavos inteiros. Lista vazia é `EMPTY_DENOMINATOR`, não zero. */
export function meanAggregator(values: readonly number[]): Metric<number> {
  return meanCents(values, "SUM(valores) / COUNT(valores)")
}

/** Contagem. */
export function countAggregator(values: readonly unknown[]): Metric<number> {
  return observed(values.length)
}
