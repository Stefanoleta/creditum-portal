/**
 * A ÚNICA declaração de quais contratos existem.
 *
 * ─── Por que um módulo só para isto ───────────────────────────────────────────
 *
 * Até a r5-r1 havia duas listas: esta e uma cópia dentro de
 * `scripts/validate-schemas.mjs`. Um regate mostrou o buraco: acrescentar um nome
 * canônico aqui, registrar o hash congelado dele, e ESQUECER da segunda lista fazia
 * o portão de congelamento aprovar um schema que a validação nunca compilava.
 *
 * Duas listas não divergem no dia em que são criadas. Divergem no dia em que alguém
 * mexe em uma — e a que vale passa a ser a que ninguém olhou.
 *
 * ─── Por que aqui, e sem efeito colateral ─────────────────────────────────────
 *
 * `contracts.ts` COMPILA todos os schemas no import. Importá-lo do validador ou do
 * verificador de congelamento acoplaria integridade de arquivo a compilação de
 * schema: um schema quebrado derrubaria a conferência de bytes, que não tem nada a
 * ver com isso.
 *
 * Este módulo não faz nada. Ele declara. Por isso pode ser importado por todos —
 * runtime, validador de schema e portão de congelamento — sem carregar nenhum deles.
 */

/**
 * Contratos ATIVOS. Enumerar aqui é o que os torna canônicos.
 *
 * Contrato canônico do repositório é arquivo em `contracts/` nomeado por este tuple.
 * Uma pasta isolada criaria um segundo sistema de schemas, que é exatamente o que a
 * Fase 3 proíbe.
 */
export const CONTRACT_NAMES = [
  "snapshot",
  "event",
  "evidence",
  // ─── Fase 3.0a — contratos canônicos do Hermes ───────────────────────────
  "executive-briefing",
  "hermes-read-model",
  "hermes-insight",
  "dashboard-observation",
  "market-observation",
  "content-mission",
  "content-package",
  "approval-request",
  "decision-record",
  "shared-briefing",
] as const

export type ContractName = (typeof CONTRACT_NAMES)[number]

/**
 * Contratos RETIRADOS na Fase 3.0a. Ausência governada, não ausência por descuido.
 *
 * ─── Por que saíram ───────────────────────────────────────────────────────────
 *
 *   decision        `decided_by_role: "string"` aceitava `"HERMES"`
 *   aros-briefing   `approved_by_human: boolean` era aprovação sem DecisionRecord
 *   recommendation  `human_decision_required` fora do contrato epistêmico
 *
 * Os três abriam um SEGUNDO caminho de autoridade, incompatível com a constituição
 * da Fase 3. Não há alias de compatibilidade, e é deliberado: um alias para contrato
 * morto criaria dois vocabulários canônicos para a mesma coisa.
 *
 * ─── Por que a lista existe ───────────────────────────────────────────────────
 *
 * Explicação não é conferência. Um regate leu o `git diff` contra um HEAD anterior à
 * 3.0a, viu três arquivos deletados e concluiu — corretamente, para o que podia ver —
 * que autoridade congelada havia sumido.
 *
 * Nomeá-los transforma "sumiram" em "foram retirados, e continuam fora". Se um deles
 * reaparecer, o portão falha: ressurreição de contrato morto é o mesmo segundo
 * caminho de autoridade que a 3.0a fechou.
 */
export const WITHDRAWN_CONTRACT_NAMES = [
  "recommendation",
  "decision",
  "aros-briefing",
] as const

export type WithdrawnContractName = (typeof WITHDRAWN_CONTRACT_NAMES)[number]
