/**
 * Fatos de qualidade da fonte do Lucas. Conjunto FECHADO.
 *
 * ─── Fato de qualidade não é Event ────────────────────────────────────────────
 *
 * Nada aqui vira alerta executivo por conta própria. Um `INVALID_TICKET` é uma
 * observação sobre o DADO; um Event é uma afirmação sobre o NEGÓCIO, precisa de
 * severidade governada, e a Fase 2.7 fechou que severidade sem lastro no artefato
 * não sai. A separação é o que impede "3 células vazias" de chegar ao CEO com a
 * mesma urgência de uma concentração material de parcelamento.
 *
 * ─── Por que união fechada e não string ──────────────────────────────────────
 *
 * String livre viraria mensagem. Mensagem não agrega, não conta e não compara
 * entre períodos — e a primeira coisa que se quer perguntar a um fato de qualidade
 * é "isto está piorando?". Tipo fechado responde; texto não.
 *
 * ─── Escopo: linha ou fonte ───────────────────────────────────────────────────
 *
 * Os fatos se dividem em dois escopos e eles não se somam. `DUPLICATE_SOURCE_WARNING`
 * é uma propriedade do ARQUIVO — vale uma vez para a captura inteira.
 * `IDENTITY_MISSING` é de LINHA e pode valer 1 de 20. Contar os dois na mesma
 * escala produziria um número de "problemas" que não significa nada.
 */

/** Fato de qualidade de uma LINHA da fonte. */
export type RowQualityFact =
  | "IDENTITY_MISSING"
  | "UNIT_IDENTITY_UNRESOLVED"
  | "INVALID_STATUS"
  | "INVALID_TICKET"
  | "INVALID_INSTALLMENT_COUNT"
  | "INVALID_DISCOUNT"
  | "TICKET_RECONCILIATION_MISMATCH"
  | "FIRST_DUE_DATE_INCOMPLETE"
  | "FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE"
  | "FIRST_DUE_DATE_MISSING"
  | "FIRST_DUE_DATE_INVALID"

/** Fato de qualidade da FONTE inteira. */
export type SourceQualityFact =
  | "DUPLICATE_SOURCE_WARNING"
  | "CANDIDATE_WITH_INCOMPATIBLE_MIME"
  | "OPTIONAL_HEADER_MISSING"
  | "UNKNOWN_HEADER_PRESENT"

/**
 * Companheiros de runtime das duas uniões.
 *
 * `Readonly<Record<T, true>>` em vez de `readonly T[]`: o compilador exige uma
 * entrada por membro, então acrescentar um fato ao tipo e esquecer de registrá-lo
 * aqui não compila. Uma lista literal aceitaria o esquecimento em silêncio, e a
 * lista incompleta é pior que nenhuma — parece cobrir tudo.
 */
const FATOS_DE_LINHA: Readonly<Record<RowQualityFact, true>> = Object.freeze({
  IDENTITY_MISSING: true,
  UNIT_IDENTITY_UNRESOLVED: true,
  INVALID_STATUS: true,
  INVALID_TICKET: true,
  INVALID_INSTALLMENT_COUNT: true,
  INVALID_DISCOUNT: true,
  TICKET_RECONCILIATION_MISMATCH: true,
  FIRST_DUE_DATE_INCOMPLETE: true,
  FIRST_DUE_DATE_NOT_AVAILABLE_AS_DATE: true,
  FIRST_DUE_DATE_MISSING: true,
  FIRST_DUE_DATE_INVALID: true,
})

const FATOS_DE_FONTE: Readonly<Record<SourceQualityFact, true>> = Object.freeze({
  DUPLICATE_SOURCE_WARNING: true,
  CANDIDATE_WITH_INCOMPATIBLE_MIME: true,
  OPTIONAL_HEADER_MISSING: true,
  UNKNOWN_HEADER_PRESENT: true,
})

export const ROW_QUALITY_FACTS: readonly RowQualityFact[] = Object.freeze(
  Object.keys(FATOS_DE_LINHA).sort() as RowQualityFact[],
)

export const SOURCE_QUALITY_FACTS: readonly SourceQualityFact[] = Object.freeze(
  Object.keys(FATOS_DE_FONTE).sort() as SourceQualityFact[],
)

export const isRowQualityFact = (v: string): v is RowQualityFact => v in FATOS_DE_LINHA
export const isSourceQualityFact = (v: string): v is SourceQualityFact => v in FATOS_DE_FONTE
