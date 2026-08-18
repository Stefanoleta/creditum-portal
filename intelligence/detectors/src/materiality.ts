/**
 * Primitives de materialidade — só calculam.
 *
 * Nenhum threshold da Creditum aqui. "Quanto é material" é política e vive na
 * configuração; este módulo responde apenas "quanto é", e responde em inteiro
 * exato ou não responde.
 *
 * Tudo que é aritmética já existe no motor: `sumCents` tem a guarda de exatidão
 * de D11, `ratio` tem `EMPTY_DENOMINATOR` explícito. Aqui só se compõe.
 */

import { ratio, sumCents, observed, isOk } from "./engine"
import type { Metric, Ratio } from "./engine"

/** Espelha os quatro `basis` do contrato de evento. */
export type MaterialityBasis = "amount_cents" | "count" | "ratio_bp" | "share_of_total_bp"

export interface Materiality {
  readonly basis: MaterialityBasis
  readonly amount_cents?: number
  readonly count?: number
  readonly ratio_bp?: number
  readonly share_of_total_bp?: number
}

/**
 * Soma exata em centavos.
 *
 * Delega a `sumCents`: um `reduce` local contornaria a guarda de `isSafeInteger`
 * justamente no agregador que produz os totais executivos.
 */
export function amountMateriality(valuesCents: readonly number[]): Metric<number> {
  const total = sumCents(valuesCents)
  if (total === null) {
    return { ok: false, dataClass: "calculated", gap: "DATA_NOT_AVAILABLE", detail: "soma fora da faixa exata" }
  }
  return observed(total)
}

/** Contagem. Zero é resultado válido; lista vazia conta zero, não é lacuna. */
export function countMateriality(items: readonly unknown[]): Metric<number> {
  return observed(items.length)
}

/**
 * Razão em basis points inteiros.
 *
 * Denominador zero devolve `EMPTY_DENOMINATOR`, nunca 0 bp — zero leads e zero
 * conversão são fatos diferentes.
 */
export function ratioBp(numerator: number, denominator: number, formula: string): Metric<Ratio> {
  return ratio(observed(numerator), observed(denominator), formula)
}

/** Participação de uma parte no total, em basis points. */
export function shareOfTotalBp(part: number, total: number, formula: string): Metric<Ratio> {
  return ratioBp(part, total, formula)
}

/**
 * Entrada discriminada pelo `basis`.
 *
 * O par (basis, tipo do valor) anda junto no tipo, e não como dois argumentos
 * independentes. Assim é impossível declarar `amount_cents` entregando uma razão
 * — o erro sairia na validação do contrato, tarde e longe da causa.
 */
export type MaterialityInput =
  | { readonly basis: "amount_cents"; readonly value: Metric<number> }
  | { readonly basis: "count"; readonly value: Metric<number> }
  | { readonly basis: "ratio_bp"; readonly value: Metric<Ratio> }
  | { readonly basis: "share_of_total_bp"; readonly value: Metric<Ratio> }

/**
 * Monta a materialidade no formato do contrato.
 *
 * O `basis` declarado obriga o campo correspondente — a mesma invariante que o
 * `event.schema.json` impõe. Aqui ela é garantida na construção, para que um
 * evento não chegue à validação dizendo "meço em reais" sem dizer quantos.
 *
 * Devolve `null` quando o valor é lacuna: materialidade que não pôde ser
 * calculada não vira zero.
 */
export function buildMateriality(
  input: MaterialityInput,
  shareOfTotal?: Metric<Ratio>,
): Materiality | null {
  const share =
    shareOfTotal !== undefined && isOk(shareOfTotal)
      ? { share_of_total_bp: shareOfTotal.value.bps }
      : {}

  switch (input.basis) {
    case "amount_cents":
      return isOk(input.value)
        ? { basis: input.basis, amount_cents: input.value.value, ...share }
        : null
    case "count":
      return isOk(input.value) ? { basis: input.basis, count: input.value.value, ...share } : null
    case "ratio_bp":
      return isOk(input.value)
        ? { basis: input.basis, ratio_bp: input.value.value.bps, ...share }
        : null
    case "share_of_total_bp":
      return isOk(input.value)
        ? { basis: input.basis, share_of_total_bp: input.value.value.bps }
        : null
  }
}
