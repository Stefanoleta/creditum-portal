/**
 * Base de severidade por participação — regra compartilhada por A e C.
 *
 * ─── Por que MAIOR participação disponível ────────────────────────────────────
 *
 * Escolher permanentemente entre quantidade e valor esconderia metade dos casos.
 * Uma data com muitos contratos pequenos e outra com poucos contratos grandes
 * produzem leituras opostas, e nenhuma das duas dimensões é "a certa" para todo
 * evento. A política da Fase 2.7b resolve isso graduando pela participação
 * governada mais forte que estiver **realmente disponível**.
 *
 * ─── O que esta função nunca faz ──────────────────────────────────────────────
 *
 * Não substitui participação ausente por zero, por `info` nem pela outra
 * dimensão quando a escolhida é lacuna — devolve `null`, e o chamador falha
 * fechado. Não usa R$ nem contagem absoluta como substituto de percentual: as
 * duas candidatas já são participações governadas, em basis points, com
 * semântica de parte-do-todo fechada pelos detectores.
 *
 * Vive num módulo só porque A e C precisam da MESMA regra. Uma cópia em cada
 * detector divergiria — foi assim que a Fase 2.5 descobriu que o Detector C
 * tinha esquecido de ler `snapshot.quality_status`.
 */

import { isOk } from "./engine"
import type { Metric } from "./engine"

export type ParticipationDimension = "share_count_bp" | "share_amount_bp"

export interface ParticipationBasis {
  /** Qual participação forneceu o máximo. Publicada pelo evento. */
  readonly dimension: ParticipationDimension
  readonly value: number
}

/**
 * A maior participação válida entre as duas candidatas.
 *
 * Empate resolve por `tieBreak`, que a política governa. No empate os dois
 * valores são numericamente iguais, então a severidade é a mesma — o que a regra
 * de desempate decide é apenas qual dimensão o evento declara ter graduado. A
 * ordem de entrada nunca decide: os dois argumentos são nomeados, não uma lista.
 *
 * Devolve `null` quando nenhuma das duas é válida. Nunca devolve zero.
 */
export function maxAvailableParticipation(
  share_count_bp: Metric<number>,
  share_amount_bp: Metric<number>,
  tieBreak: ParticipationDimension,
): ParticipationBasis | null {
  const contagem = isOk(share_count_bp) ? share_count_bp.value : null
  const valor = isOk(share_amount_bp) ? share_amount_bp.value : null

  if (contagem === null && valor === null) return null
  if (valor === null) return { dimension: "share_count_bp", value: contagem as number }
  if (contagem === null) return { dimension: "share_amount_bp", value: valor }

  if (contagem > valor) return { dimension: "share_count_bp", value: contagem }
  if (valor > contagem) return { dimension: "share_amount_bp", value: valor }
  return { dimension: tieBreak, value: contagem }
}

/** Motivo tipado da ausência de base. Nunca vira severidade. */
export function participationGap(
  share_count_bp: Metric<number>,
  share_amount_bp: Metric<number>,
): string {
  const c = isOk(share_count_bp) ? "ok" : share_count_bp.gap
  const a = isOk(share_amount_bp) ? "ok" : share_amount_bp.gap
  return `nenhuma participação válida: share_count_bp=${c}, share_amount_bp=${a}`
}
