/**
 * Severidade — mecanismo, não política.
 *
 * Este módulo sabe CLASSIFICAR contra uma escala. Ele não contém nenhuma escala
 * da Creditum, porque nenhuma foi aprovada. A escala vem da configuração, e uma
 * configuração sem escala é recusada em `config.ts`.
 *
 * ─── Severidade não é confiança, nem qualidade, nem materialidade ─────────────
 *
 * As quatro coisas são medidas diferentes e vivem em campos diferentes:
 *
 *   severidade     quanto isto importa para quem decide
 *   materialidade  quanto do consolidado isto move
 *   qualidade      quanto se pode confiar no dado por trás
 *   confiança      quanto se pode confiar numa inferência específica
 *
 * A tentação recorrente é rebaixar a severidade quando o dado está conflitado.
 * Seria errado: um impacto enorme sobre dado em disputa continua sendo um
 * impacto enorme — e o fato de estar em disputa é justamente mais um motivo para
 * alguém olhar, não menos. Por isso `classifySeverity` não recebe qualidade nem
 * confiança: elas não têm como influenciá-la nem por acidente.
 */

import { GatewayError } from "../../gateway/src/errors"
import type { Severity, SeverityScale } from "./config"

export type { Severity, SeverityScale } from "./config"

/**
 * Classifica um valor contra a escala.
 *
 * A escala é validada na configuração: começa em 0, estritamente crescente. Aqui
 * a busca é pela ÚLTIMA banda cujo `at_least` não passa do valor.
 *
 * Falha fechado para valor não inteiro: severidade derivada de float traria
 * arredondamento silencioso para dentro da decisão executiva.
 */
export function classifySeverity(scale: SeverityScale, value: number): Severity {
  if (!Number.isSafeInteger(value)) {
    throw new GatewayError("NOT_ALLOWED", "Severidade exige valor inteiro exato", [String(value)])
  }
  if (scale.length === 0) {
    throw new GatewayError("NOT_ALLOWED", "Escala de severidade vazia", [])
  }

  let atual: Severity | null = null
  for (const banda of scale) {
    if (value >= banda.at_least) atual = banda.severity
    else break
  }

  if (atual === null) {
    // Só acontece se a escala não começar em 0 — o que a validação de config
    // impede. Se chegou aqui, a garantia foi contornada: falha fechado.
    throw new GatewayError("NOT_ALLOWED", "Valor abaixo da primeira banda da escala", [
      String(value),
    ])
  }

  return atual
}

const ORDEM: Readonly<Record<Severity, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

/** A mais grave de um conjunto. Útil quando um evento tem mais de uma dimensão. */
export function highestSeverity(severities: readonly Severity[]): Severity {
  let pior: Severity = "info"
  for (const s of severities) {
    if (ORDEM[s] > ORDEM[pior]) pior = s
  }
  return pior
}

export function severityRank(s: Severity): number {
  return ORDEM[s]
}
