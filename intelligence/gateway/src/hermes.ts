/**
 * Fase 3.0a — contratos canônicos do Hermes, em TypeScript.
 *
 * ─── Onde isto vive, e por quê ────────────────────────────────────────────────
 *
 * `contracts/*.schema.json` é o artefato governado; este módulo é a face tipada
 * dele, no mesmo `gateway/src` onde `factory.ts` já converte payload cru em tipo
 * validado. NÃO criei pasta `hermes/`: contrato canônico neste repositório é arquivo
 * em `contracts/` registrado no tuple de `contracts.ts`, e uma árvore paralela seria
 * um segundo sistema de schemas — exatamente o que a fase proíbe.
 *
 * ─── A regra constitucional ───────────────────────────────────────────────────
 *
 *   HERMES RECOMENDA. STEFANO DECIDE.
 *
 * Ela não é comentário: está no schema. `DecisionRecord.decided_by` é
 * `const "STEFANO"`, `ContentMission.publication_authorized` é `const false`,
 * `DashboardObservation.interaction_mode` é `const "OBSERVE_ONLY"`, e
 * `ApprovalRequest.status` não tem `APPROVED` no vocabulário. Nenhuma dessas
 * proibições depende de revisão de código ou de prompt — revisão vale até o próximo
 * commit, e prompt vale até alguém reescrevê-lo.
 *
 * ─── O que NÃO existe aqui ────────────────────────────────────────────────────
 *
 * Nenhum runtime. Nenhum assembler de briefing, nenhum projetor de audiência,
 * nenhuma chamada de modelo, nenhum prompt. Só tipos, vocabulários fechados e
 * builders que validam e congelam. Construir o runtime antes do contrato é como
 * escolher o denominador antes de saber qual pergunta o número responde.
 */

import { createHash } from "node:crypto"
import { assertValid } from "./contracts"
import { deepFreeze, snapshotPlainData } from "./immutability"
import { GatewayError } from "./errors"
import type { ContractName } from "./contracts"

// ═════════════════════════════════════════════════════════════════════════════
// Vocabulários FECHADOS
// ═════════════════════════════════════════════════════════════════════════════
//
// Fechados porque autoridade e epistemologia não admitem string genérica: um
// `approver: string` aceitaria `"HERMES"`, e a fase inteira existe para que não
// aceite.

/** Audiências governadas. Não existe ALL, EVERYONE nem PUBLIC — o default é negar. */
export const AUDIENCES = ["EXECUTIVE_STEFANO", "COMMERCIAL_LUCAS", "FINANCE_LEONARDO"] as const
export type Audience = (typeof AUDIENCES)[number]

/** A fronteira epistêmica. `kind` é obrigatório em todo insight. */
export const INSIGHT_KINDS = ["FACT", "INFERENCE", "ALERT", "RECOMMENDATION"] as const
export type InsightKind = (typeof INSIGHT_KINDS)[number]

/** Único aprovador da v1. `const`, não união de um item: a intenção é declarada. */
export const FINAL_APPROVER = "STEFANO" as const
export type FinalApprover = typeof FINAL_APPROVER

/**
 * Estados de um pedido de aprovação. Repare no que falta: `APPROVED`.
 *
 * `DECIDED` afirma que existe um `DecisionRecord` — e não diz qual foi a decisão.
 * Ler o veredito exige ir ao registro assinado, que é o ponto.
 */
export const APPROVAL_STATUSES = ["AWAITING_STEFANO_APPROVAL", "DECIDED", "WITHDRAWN"] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

/** Vereditos possíveis. Só aparecem dentro de `DecisionRecord`. */
export const DECISIONS = ["APPROVED", "REJECTED", "APPROVED_WITH_CHANGES"] as const
export type Decision = (typeof DECISIONS)[number]

/** Donos de fonte. Papel de CURADORIA — nunca de aprovação. */
export const SOURCE_OWNERS = ["LUCAS", "LEONARDO", "CREDITUM_INTERNAL"] as const
export type SourceOwner = (typeof SOURCE_OWNERS)[number]

/** Os cinco estados de fonte da Fase 2.11. Ausência nunca é zero. */
export const SOURCE_VIEW_STATES = [
  "available",
  "available_empty",
  "data_not_available",
  "source_error",
  "invalid_source",
] as const
export type SourceViewState = (typeof SOURCE_VIEW_STATES)[number]

/** `not_executed` NUNCA é `executed_no_findings`. O primeiro exige alguém agir. */
export const EXECUTION_STATES = [
  "unavailable",
  "not_executed",
  "executed_no_findings",
  "executed_with_findings",
] as const
export type ExecutionState = (typeof EXECUTION_STATES)[number]

export const CONTENT_FORMATS = ["REEL", "CAROUSEL", "POST"] as const
export type ContentFormat = (typeof CONTENT_FORMATS)[number]

export const CONTENT_OBJECTIVES = [
  "FOLLOWER_GROWTH",
  "ENGAGEMENT",
  "SHAREABILITY",
  "LEAD_GENERATION",
  "REFERRAL",
  "BRAND_AUTHORITY",
] as const
export type ContentObjective = (typeof CONTENT_OBJECTIVES)[number]

/** Objetivo primário inicial da frente Hermes+Aros. */
export const PRIMARY_GROWTH_OBJECTIVE = "FOLLOWER_GROWTH" as const

/**
 * Ausência de cadeia de atribuição.
 *
 * Declarada como constante para que nenhum consumidor futuro afirme post → contrato:
 * a afirmação exigiria uma cadeia governada que não existe, e um número sem cadeia
 * pareceria atribuição sem ser.
 */
export const NO_ATTRIBUTION = "NO_GOVERNED_ATTRIBUTION_CHAIN" as const

export const MARKET_SOURCE_TYPES = [
  "COMPETITOR",
  "SOCIAL_TREND",
  "MARKET",
  "CREATOR",
  "INDUSTRY",
] as const
export type MarketSourceType = (typeof MARKET_SOURCE_TYPES)[number]

/** Único modo de interação com dashboard. WRITE/EDIT/ADMIN não existem. */
export const INTERACTION_MODE_OBSERVE_ONLY = "OBSERVE_ONLY" as const

export const PACKAGE_STATUSES = [
  "READY_FOR_HERMES_REVIEW",
  "REVISION_REQUESTED",
  "ACCEPTED_FOR_APPROVAL",
] as const
export type PackageStatus = (typeof PACKAGE_STATUSES)[number]

/**
 * Restrições que TODO read model do Hermes carrega.
 *
 * O schema exige as três primeiras por `contains`. Estão aqui para que o produtor
 * futuro não precise lembrar delas — e para que um teste possa afirmar que existem.
 */
export const MANDATORY_RESTRICTIONS = [
  "NO_FINAL_APPROVAL",
  "NO_PUBLICATION",
  "NO_SOURCE_MUTATION",
] as const

/**
 * Capacidades do enum fechado de `hermes-read-model`.
 *
 * Companheira de runtime do schema, no mesmo espírito de `HERMES_RESTRICTIONS`: a
 * autoridade é o contrato, e esta lista existe para que a validação de fronteira e os
 * testes possam falar dela sem escrever literais soltos.
 *
 * `OBSERVE_*` é PERCEPÇÃO. `PRODUCE_*` e `REQUEST_APPROVAL` são o que o runtime
 * futuro poderá fazer com o que percebeu — nada disso é executado ao montar o read
 * model.
 */
export const HERMES_CAPABILITIES = [
  "OBSERVE_SOURCES",
  "OBSERVE_DASHBOARDS",
  "OBSERVE_MARKET",
  "PRODUCE_INSIGHTS",
  "PRODUCE_MISSIONS",
  "REQUEST_APPROVAL",
] as const
export type HermesCapability = (typeof HERMES_CAPABILITIES)[number]

export const HERMES_RESTRICTIONS = [
  ...MANDATORY_RESTRICTIONS,
  "NO_DASHBOARD_WRITE",
  "NO_PII_ACCESS",
  "NO_SCHEDULING",
] as const
export type HermesRestriction = (typeof HERMES_RESTRICTIONS)[number]

/** Fatos governados que o briefing transporta. Calculados na Fase 2.13, não aqui. */
export const OPERATIONAL_FACT_TYPES = [
  "AWAITING_CREDITUM_SIGNATURE",
  "PENDING_STUDENT_SIGNATURE",
  "P_SIGNATURE_DEADLINE_ATTENTION",
  "A_EMISSION_DEADLINE_ALERT",
  "CONTRACT_DEADLINE_MISSED",
  "AUTO_CANCELLED_BY_DEADLINE",
] as const
export type OperationalFactType = (typeof OPERATIONAL_FACT_TYPES)[number]

/** Recuperação é INVESTIGAÇÃO. O identificador carrega a dúvida. */
export const RECOVERY_SEMANTICS = "RECOVERY_OPPORTUNITY_TO_INVESTIGATE" as const

// ═════════════════════════════════════════════════════════════════════════════
// Envelope de texto
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Texto livre, sempre rotulado como não-confiável.
 *
 * Vale para o texto que o PRÓPRIO Hermes escreve. Uma frase gerada por modelo é
 * dado; sem o rótulo ela chegaria a um consumidor a jusante indistinguível de uma
 * instrução do sistema, que é a porta de injeção mais óbvia deste desenho.
 */
export interface UntrustedText {
  readonly untrusted: true
  readonly content: string
  readonly origin?: string
}

/** Constrói o envelope. Existe para que ninguém escreva `untrusted: false`. */
export function untrusted(content: string, origin?: string): UntrustedText {
  return deepFreeze(origin === undefined ? { untrusted: true as const, content } : { untrusted: true as const, content, origin })
}

// ═════════════════════════════════════════════════════════════════════════════
// Os dez contratos
// ═════════════════════════════════════════════════════════════════════════════

export interface HermesInsightV1 {
  readonly insight_id: string
  readonly schema_version: string
  readonly kind: InsightKind
  readonly generated_at: string
  readonly statement: UntrustedText
  readonly supporting_refs?: readonly string[]
  /** Obrigatório e não-vazio quando `kind` é FACT. */
  readonly evidence_refs?: readonly string[]
  /** Obrigatório e não-vazio quando `kind` é INFERENCE. */
  readonly limitations?: readonly UntrustedText[]
  readonly audiences: readonly Audience[]
  readonly requires_stefano_approval: boolean
  readonly alert_basis?: "GOVERNED" | "INTERPRETIVE"
  readonly governed_fact_type?: string
  readonly severity?: "info" | "low" | "medium" | "high" | "critical" | null
  readonly materiality_ref?: string
  readonly proposed_action?: UntrustedText
}

export interface ApprovalRequestV1 {
  readonly approval_id: string
  readonly schema_version: string
  readonly requested_at: string
  readonly requested_by: "HERMES" | "AROS"
  readonly approver: FinalApprover
  readonly subject_type:
    | "HERMES_INSIGHT"
    | "CONTENT_MISSION"
    | "CONTENT_PACKAGE"
    | "SHARED_BRIEFING"
    | "OTHER"
  readonly subject_ref: string
  /** Vínculo com o CONTEÚDO aprovado. Obrigatório para `SHARED_BRIEFING`. */
  readonly subject_content_hash?: string
  readonly proposed_action: UntrustedText
  readonly rationale: UntrustedText
  readonly supporting_refs: readonly string[]
  readonly risk_and_uncertainty: readonly UntrustedText[]
  readonly status: ApprovalStatus
  readonly decision_ref?: string
}

export interface DecisionRecordV1 {
  readonly decision_id: string
  readonly schema_version: string
  readonly approval_id: string
  readonly decided_by: FinalApprover
  readonly decision: Decision
  readonly decided_at: string
  readonly changes?: readonly UntrustedText[]
  readonly rationale?: UntrustedText
  readonly supersedes?: string
}

export interface SourceHealthEntry {
  readonly dataset_id: string
  readonly owner: SourceOwner
  readonly view_state: SourceViewState
  readonly detail?: UntrustedText
}

export interface SourceViewGap {
  readonly gap: "SOURCE_VIEW_GAP"
  readonly owner: SourceOwner
  readonly dimension: string
  readonly detail?: UntrustedText
}

export interface OperationalFact {
  readonly fact_type: OperationalFactType
  readonly subject_ref: string
  /** O que a FONTE afirma. Nunca reescrito pelo estado derivado. */
  readonly source_status: "E" | "A" | "P" | "C"
  readonly derived_deadline_state?:
    | "p_signature_deadline_attention"
    | "a_emission_deadline_alert"
    | "contract_deadline_missed"
    | "auto_cancelled_by_deadline"
  /** Data civil JÁ resolvida pela Fase 2.13. Este contrato não recalcula. */
  readonly deadline?: string
  readonly evaluation_date?: string
  readonly offset_days?: number
  readonly recovery_candidate?: boolean
  readonly recovery_semantics?: typeof RECOVERY_SEMANTICS | null
  readonly unit_id?: string | null
  readonly severity?: "info" | "low" | "medium" | "high" | "critical" | null
  readonly severity_status?: "SEVERITY_POLICY_UNRESOLVED" | "SEVERITY_GOVERNED"
  readonly evidence_refs?: readonly string[]
}

export interface DetectorResult {
  readonly detector: string
  readonly execution_state: ExecutionState
  readonly not_executed_reason?: string
  readonly events?: number
  readonly candidates_evaluated?: number
  readonly quality_status?: "ok" | "degraded" | "insufficient" | "conflicted"
  readonly population?: "COMMERCIAL_POTENTIAL" | "COMMERCIALLY_CONFIRMED" | "EMITTED"
}

export interface ExecutiveBriefingV1 {
  readonly briefing_id: string
  readonly schema_version: string
  readonly generated_at: string
  readonly period: string
  readonly scope: readonly ("COMMERCIAL" | "FINANCIAL" | "OPERATIONAL" | "MARKET" | "GROWTH")[]
  readonly source_health: readonly SourceHealthEntry[]
  readonly source_view_gaps?: readonly SourceViewGap[]
  readonly commercial_state: {
    readonly view_state: SourceViewState
    readonly commercial_potential?: number
    readonly commercially_confirmed?: number
    readonly emitted?: number
    readonly historical_realized?: number
    readonly fully_completed?: { readonly status: "DEFERRED_REQUIRES_OMIE_PAYMENT" }
  }
  readonly operational_facts?: readonly OperationalFact[]
  readonly detector_results: readonly DetectorResult[]
  readonly material_findings?: readonly string[]
  /**
   * Qualidade e cobertura. TRÊS situações, e a terceira NÃO é a segunda.
   *
   *   medido e suficiente      ok / degraded
   *   medido e insuficiente    insufficient / conflicted
   *   NÃO medido               not_measured
   *
   * União discriminada de propósito: no ramo `not_measured` não EXISTE onde escrever
   * `expected_units`, então ausência de medição não tem como virar medição de zero.
   * Antes disso o vocabulário só tinha os quatro resultados medidos, e a única forma
   * de dizer "não medi" era escolher um deles — que é inventar veredito.
   */
  readonly quality_and_coverage:
    | {
        readonly quality_status: "not_measured"
        readonly notes?: readonly UntrustedText[]
      }
    | {
        readonly quality_status: "ok" | "degraded" | "insufficient" | "conflicted"
        readonly expected_units?: number
        readonly reporting_units?: number
        readonly notes?: readonly UntrustedText[]
      }
  readonly evidence_index: readonly string[]
  readonly unavailable_capabilities?: readonly {
    readonly capability: string
    readonly status: "unavailable" | "deferred"
    readonly reason?: UntrustedText
  }[]
  readonly governance_gaps?: readonly UntrustedText[]
}

/**
 * Vínculo de percepção: QUAL observação, e exatamente QUAL conteúdo dela.
 *
 * `observation_ref` continua sendo a identidade lógica da observação — não virou hash.
 * A separação é a mesma já estabelecida para o briefing e para a autorização de
 * divulgação:
 *
 *   IDENTIDADE            diz qual coisa
 *   COMPROMISSO DE CONTEÚDO   diz exatamente o que aquela coisa era
 *
 * O corpo da observação NÃO entra aqui. Quem resolver esta referência tem de conferir
 * os dois campos — ver `observationBindingMatches`.
 */
export interface ObservationBinding {
  readonly observation_ref: string
  readonly observation_hash: string
}

export interface HermesReadModelV1 {
  readonly read_model_id: string
  readonly schema_version: string
  readonly generated_at: string
  /** REFERÊNCIA ao briefing, com hash. Não é cópia — cópia poderia divergir. */
  readonly executive_briefing_ref: string
  readonly executive_briefing_hash: string
  readonly dashboard_observations?: readonly ObservationBinding[]
  readonly market_observations?: readonly ObservationBinding[]
  readonly growth_context?: {
    readonly primary_objective: typeof PRIMARY_GROWTH_OBJECTIVE
    readonly attribution?: typeof NO_ATTRIBUTION
    readonly observed: readonly {
      readonly metric: string
      readonly value: number
      readonly captured_at: string
      readonly evidence_ref?: string
    }[]
  }
  readonly aros_context?: readonly string[]
  readonly prior_decisions?: readonly string[]
  readonly permitted_evidence_refs?: readonly string[]
  readonly capabilities: readonly HermesCapability[]
  readonly restrictions: readonly HermesRestriction[]
}

export interface SharedBriefingV1 {
  readonly shared_briefing_id: string
  readonly schema_version: string
  readonly generated_from: string
  readonly generated_at: string
  readonly audience: Audience
  readonly permitted_insights: readonly string[]
  readonly contextual_cross_domain_insights?: readonly string[]
  readonly permitted_evidence_refs: readonly string[]
  /**
   * DecisionRecord que autoriza ESTA divulgação. Obrigatório.
   *
   * `authorized_by` foi removido na remediação: um nome dentro do próprio objeto não
   * é prova de autoridade. A prova é a referência, verificada por
   * `authorizeSharedBriefing`.
   */
  readonly authorization_ref: string
}

export interface DashboardObservationV1 {
  readonly observation_id: string
  readonly schema_version: string
  readonly source: string
  readonly owner: SourceOwner
  readonly observed_at: string
  readonly interaction_mode: typeof INTERACTION_MODE_OBSERVE_ONLY
  readonly view_state: {
    readonly period?: string
    readonly unit?: string
    readonly status?: string
    readonly view?: string
    readonly tab?: string
    readonly grouping?: string
    readonly filters?: readonly { readonly field: string; readonly value: string }[]
    readonly search?: string
    readonly page?: number
  }
  readonly observations: readonly UntrustedText[]
  readonly evidence_refs?: readonly string[]
}

export interface MarketObservationV1 {
  readonly observation_id: string
  readonly schema_version: string
  readonly observed_at: string
  readonly source_type: MarketSourceType
  readonly source_ref?: string
  readonly platform?: string
  readonly subject: UntrustedText
  /** O que foi OBSERVADO. A leitura do que significa é um HermesInsight INFERENCE. */
  readonly observed_fact: UntrustedText
  readonly metrics_if_available?: readonly { readonly metric: string; readonly value: number }[]
  readonly period?: string
  readonly capture_time: string
  readonly evidence_ref?: string
}

export interface ContentMissionV1 {
  readonly mission_id: string
  readonly schema_version: string
  readonly created_at: string
  readonly created_by: "HERMES"
  readonly primary_objective: ContentObjective
  readonly secondary_objective?: ContentObjective
  readonly format: ContentFormat
  readonly audience: Audience
  readonly theme: UntrustedText
  readonly strategic_angle?: UntrustedText
  readonly desired_hook?: UntrustedText
  readonly message: UntrustedText
  readonly cta?: UntrustedText
  readonly market_context_refs?: readonly string[]
  readonly competitor_refs?: readonly string[]
  readonly business_context_refs?: readonly string[]
  readonly constraints?: readonly UntrustedText[]
  readonly variants_requested?: number
  /** `false` e somente `false`. Publicação exige DecisionRecord de Stefano. */
  readonly publication_authorized: false
}

export interface ContentPackageV1 {
  readonly package_id: string
  readonly schema_version: string
  readonly mission_id: string
  readonly created_by: "AROS"
  readonly created_at: string
  readonly format: ContentFormat
  readonly concept: UntrustedText
  readonly hook?: UntrustedText
  readonly caption: UntrustedText
  readonly cta?: UntrustedText
  readonly script_or_slides?: readonly UntrustedText[]
  readonly visual_direction?: UntrustedText
  readonly production_notes?: readonly UntrustedText[]
  readonly configuration?: {
    readonly aspect_ratio?: string
    readonly duration_seconds?: number
    readonly slide_count?: number
  }
  readonly variants?: readonly {
    readonly variant_id: string
    readonly hook: UntrustedText
    readonly caption?: UntrustedText
  }[]
  readonly status: PackageStatus
  readonly review_notes?: readonly UntrustedText[]
  readonly approval_request_ref?: string
}

// ═════════════════════════════════════════════════════════════════════════════
// Builders: VALIDATE → FREEZE → RETURN
// ═════════════════════════════════════════════════════════════════════════════
//
// Mesmo padrão de `factory.ts`: `assertValid` contra o schema governado, depois
// congelamento profundo. Nenhum builder aceita opção que relaxe a validação — um
// parâmetro `skipValidation` seria a porta que este desenho existe para não ter.
//
// `deepFreeze` a mais que em `factory.ts`, de propósito: DecisionRecord e
// ApprovalRequest são objetos de AUTORIDADE, e mutação silenciosa depois da
// validação trocaria um veredito registrado por outro sem deixar rastro.

export function toHermesInsight(raw: unknown): HermesInsightV1 {
  assertValid("hermes-insight", raw)
  return deepFreeze(raw as HermesInsightV1)
}

export function toApprovalRequest(raw: unknown): ApprovalRequestV1 {
  assertValid("approval-request", raw)
  return deepFreeze(raw as ApprovalRequestV1)
}

export function toDecisionRecord(raw: unknown): DecisionRecordV1 {
  assertValid("decision-record", raw)
  return deepFreeze(raw as DecisionRecordV1)
}

/**
 * A FRONTEIRA DE CONFIANÇA da Fase 3.0c, num lugar só.
 *
 * ─── A ordem, e por que ela mudou ─────────────────────────────────────────────
 *
 *   1  snapshotPlainData    instantâneo próprio, sem executar acessor
 *   2  assertValid          o contrato, sobre o instantâneo COMPLETO
 *   3  deepFreeze           imutável, e é NOSSO que está sendo congelado
 *
 * A regra anterior era "validar antes de copiar", e ela existia para impedir
 * saneamento silencioso: copiar só os campos conhecidos transformaria objeto inválido
 * em válido. A regra continua valendo — e a ordem inverteu porque validar primeiro
 * também LÊ o objeto do chamador, e ler um objeto com getter é executar código dele.
 *
 * A troca é segura porque o instantâneo não sanea nada:
 *
 *   captura TODA propriedade de dado própria e enumerável, inclusive a desconhecida
 *   recusa acessor, Proxy, símbolo, ciclo e não-JSON em vez de contorná-los
 *
 * Então `additionalProperties: false` continua recusando campo extra, e nenhum valor
 * chega ao schema tendo passado por código do chamador.
 *
 * Depois do passo 1, o objeto original NUNCA é lido de novo. É isso que impede que
 * duas leituras do mesmo campo devolvam coisas diferentes.
 */
function canonicoProprio<T>(raw: unknown, contract: ContractName): T {
  const instantaneo = snapshotPlainData(raw)
  if (instantaneo === null) {
    // Sem eco de valor: o objeto recusado pode carregar texto externo ou credencial, e
    // formatá-lo numa mensagem exigiria lê-lo — justamente o que não fazemos.
    throw new GatewayError(
      "SCHEMA_INVALID",
      `Entrada não é dado canônico simples para "${contract}"`,
    )
  }
  assertValid(contract, instantaneo)
  return deepFreeze(instantaneo as T)
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedDashboardObservation(raw: unknown): DashboardObservationV1 {
  return canonicoProprio<DashboardObservationV1>(raw, "dashboard-observation")
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedMarketObservation(raw: unknown): MarketObservationV1 {
  return canonicoProprio<MarketObservationV1>(raw, "market-observation")
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedHermesReadModel(raw: unknown): HermesReadModelV1 {
  return canonicoProprio<HermesReadModelV1>(raw, "hermes-read-model")
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedHermesInsight(raw: unknown): HermesInsightV1 {
  return canonicoProprio<HermesInsightV1>(raw, "hermes-insight")
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedSharedBriefing(raw: unknown): SharedBriefingV1 {
  return canonicoProprio<SharedBriefingV1>(raw, "shared-briefing")
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedApprovalRequest(raw: unknown): ApprovalRequestV1 {
  return canonicoProprio<ApprovalRequestV1>(raw, "approval-request")
}

/** Instantâneo próprio, validado e congelado. O original não é tocado nem relido. */
export function toOwnedDecisionRecord(raw: unknown): DecisionRecordV1 {
  return canonicoProprio<DecisionRecordV1>(raw, "decision-record")
}

/**
 * Valida e devolve uma cópia PRÓPRIA, congelada. Não toca no objeto do chamador.
 *
 * ─── Por que existe ao lado de `toExecutiveBriefing` ──────────────────────────
 *
 * As factories canônicas fazem `deepFreeze` no que recebem — devolvem a MESMA
 * referência, congelada. É o desenho correto para quem CONSTRÓI o objeto: o grafo
 * congelado é o grafo que a validação examinou.
 *
 * Não serve para quem RECEBE objeto de fora. Congelar o objeto do chamador muda
 * `writable`, `extensible` e `frozen` num grafo que não é nosso, e isso é efeito
 * observável — a Fase 3.0c fez exatamente isso e o gate cobrou.
 *
 * Aqui a ordem é: validar o objeto submetido INTEIRO (campo desconhecido continua
 * sendo erro), copiar, e só então congelar a cópia. Copiar antes de validar seria pior
 * de um jeito silencioso: a cópia poderia perder uma propriedade desconhecida e
 * transformar objeto inválido em válido.
 */
export function toOwnedExecutiveBriefing(raw: unknown): ExecutiveBriefingV1 {
  return canonicoProprio<ExecutiveBriefingV1>(raw, "executive-briefing")
}

export function toExecutiveBriefing(raw: unknown): ExecutiveBriefingV1 {
  assertValid("executive-briefing", raw)
  return deepFreeze(raw as ExecutiveBriefingV1)
}

export function toHermesReadModel(raw: unknown): HermesReadModelV1 {
  assertValid("hermes-read-model", raw)
  return deepFreeze(raw as HermesReadModelV1)
}

export function toSharedBriefing(raw: unknown): SharedBriefingV1 {
  assertValid("shared-briefing", raw)
  return deepFreeze(raw as SharedBriefingV1)
}

export function toDashboardObservation(raw: unknown): DashboardObservationV1 {
  assertValid("dashboard-observation", raw)
  return deepFreeze(raw as DashboardObservationV1)
}

export function toMarketObservation(raw: unknown): MarketObservationV1 {
  assertValid("market-observation", raw)
  return deepFreeze(raw as MarketObservationV1)
}

export function toContentMission(raw: unknown): ContentMissionV1 {
  assertValid("content-mission", raw)
  return deepFreeze(raw as ContentMissionV1)
}

export function toContentPackage(raw: unknown): ContentPackageV1 {
  assertValid("content-package", raw)
  return deepFreeze(raw as ContentPackageV1)
}

/**
 * A audiência pode ver este insight?
 *
 * Allowlist, e o default é NEGAR: audiência ausente da lista não vê. A função existe
 * para que a decisão não seja reimplementada em cada consumidor — e para que a
 * negativa seja o caminho barato, não o caminho que alguém esquece.
 */
export function insightVisibleTo(insight: HermesInsightV1, audience: Audience): boolean {
  return insight.audiences.includes(audience)
}

// ═════════════════════════════════════════════════════════════════════════════
// Resolução da decisão EFETIVA
// ═════════════════════════════════════════════════════════════════════════════
//
// ─── O defeito que isto corrige ───────────────────────────────────────────────
//
// A primeira versão perguntava se ALGUM registro histórico dizia `APPROVED`:
//
//   decisions.some((d) => d.decision === "APPROVED")
//
// O gate encontrou a consequência, e ela é grave: uma aprovação seguida de uma
// revogação explícita continuava valendo para sempre.
//
//   D1  APPROVED
//   D2  supersedes D1  →  REJECTED
//   resultado anterior: aprovado ✗
//
// O modelo append-only existe justamente para que a revisão não apague o histórico.
// Mas "não apagar" não é "continuar valendo": o histórico é auditoria, e a AUTORIDADE
// é o único registro terminal da cadeia.
//
// ─── Linhagem explícita, nunca relógio ────────────────────────────────────────
//
// A autoridade vem de `supersedes`, e de nada mais. `decided_at` é auditoria: um
// relógio adiantado não revoga nem aprova, e ordenar por timestamp faria a autoridade
// depender de qual máquina gravou primeiro. Posição no array e ordem lexicográfica de
// id têm o mesmo problema, com menos aparência de razão.
//
// ─── Falha fechada, sempre ────────────────────────────────────────────────────
//
// Bifurcação, ciclo, referência pendurada, raiz múltipla e id duplicado NÃO são
// resolvidos por escolha. Cada um deles significa que a história de autoridade está
// contraditória, e escolher um lado seria inventar a decisão que ninguém tomou.

export const DECISION_CHAIN_DEFECTS = [
  /** Dois registros com o mesmo `decision_id` no conjunto avaliado. */
  "DUPLICATE_DECISION_ID",
  /** `supersedes` aponta um registro que não está no conjunto relevante. */
  "DANGLING_SUPERSESSION",
  /** A cadeia se fecha sobre si mesma. */
  "CYCLIC_CHAIN",
  /** Dois registros sucedem o MESMO antecessor, ou há mais de um terminal. */
  "FORKED_CHAIN",
  /** Mais de um registro sem antecessor, sem relação declarada entre eles. */
  "MULTIPLE_ROOTS",
  /** `supersedes` atravessa pedidos de aprovação diferentes. */
  "CROSS_APPROVAL_SUPERSESSION",
  /** Registro cuja autoridade não é Stefano chegou ao conjunto. */
  "NON_STEFANO_DECIDER",
  /** Entrada que não é um `DecisionRecord` canônico chegou ao resolvedor. */
  "INVALID_DECISION_RECORD",
] as const
export type DecisionChainDefect = (typeof DECISION_CHAIN_DEFECTS)[number]

/**
 * Resultado da resolução. Três estados, e os três importam.
 *
 * `no_decision` é o estado ORDINÁRIO de quem aguarda — não é defeito. Colapsá-lo em
 * `malformed_chain` faria todo pedido pendente parecer história corrompida, e quem
 * investigasse procuraria bug onde só falta a decisão.
 */
export type EffectiveDecision =
  | { readonly status: "no_decision" }
  | { readonly status: "effective"; readonly decision: DecisionRecordV1 }
  | { readonly status: "malformed_chain"; readonly defect: DecisionChainDefect }

/**
 * O único registro autoritativo para um pedido, ou o motivo de não haver um.
 *
 * `decisions` pode conter registros de outros pedidos: a filtragem acontece aqui, e
 * `CROSS_APPROVAL_SUPERSESSION` é verificado ANTES dela — uma cadeia que atravessa
 * pedidos é contraditória mesmo que o registro invasor pertença a outro `approval_id`.
 */
/**
 * Valida sem lançar. `null` significa "não é o objeto canônico".
 *
 * A fronteira de AUTORIDADE não pode confiar em tipo TypeScript: tipo desaparece na
 * compilação, e um `as`, um `JSON.parse` ou um chamador em JavaScript entregam
 * qualquer coisa. O gate encontrou exatamente isso — o objeto passava tipado, o hash
 * cobria só os campos conhecidos, e um campo extra de divulgação viajava por fora do
 * compromisso aprovado.
 *
 * Repare no que esta função NÃO faz: ela não remove o campo estranho para depois
 * validar. `additionalProperties: false` existe para RECUSAR o objeto, e "limpar antes
 * de validar" transformaria a proteção em formalidade.
 *
 * ─── E o que ela passou a NÃO fazer ───────────────────────────────────────────
 *
 * Ela entregava o objeto do CHAMADOR à factory canônica, e a factory faz `deepFreeze`
 * no que recebe. Consequência: pedir uma autorização — operação de LEITURA — congelava
 * o grafo de quem perguntou. `Object.freeze` não altera valor, altera `writable`,
 * `extensible` e `frozen`, e isso é observável de fora.
 *
 * A regra estava escrita em `immutability.ts` desde a Fase 1: ownership antes de
 * congelar. A fronteira de autoridade passava por cima dela.
 *
 * Agora vai por `canonicoProprio`: instantâneo próprio → schema → congela a CÓPIA. A
 * semântica de autoridade não muda em nada — o que muda é de quem é o objeto congelado.
 */
function canonico<T>(contract: ContractName, raw: unknown): T | null {
  try {
    return canonicoProprio<T>(raw, contract)
  } catch {
    return null
  }
}

/**
 * Valida uma coleção de decisões. Uma entrada inválida invalida o conjunto.
 *
 * Descartar a inválida e seguir com as demais seria pior que recusar: a decisão
 * descartada pode ser justamente a que revoga, e a cadeia resultante pareceria
 * íntegra.
 */
function decisoesCanonicas(raw: unknown): readonly DecisionRecordV1[] | null {
  // A COLEÇÃO inteira primeiro. Iterar o array do chamador com `for...of` executaria
  // `Symbol.iterator` e getters de índice — código dele, dentro da autorização — e um
  // container instável poderia entregar membros diferentes em leituras diferentes.
  // Mesma lição da Fase 3.0c, aplicada aqui.
  const propria = snapshotPlainData<unknown>(raw)
  if (!Array.isArray(propria)) return null
  const out: DecisionRecordV1[] = []
  for (const d of propria) {
    const v = canonico<DecisionRecordV1>("decision-record", d)
    if (v === null) return null
    out.push(v)
  }
  return out
}

export function resolveEffectiveDecision(
  approval_id: string,
  decisionsRaw: unknown,
): EffectiveDecision {
  const decisions = decisoesCanonicas(decisionsRaw)
  if (decisions === null) {
    return { status: "malformed_chain", defect: "INVALID_DECISION_RECORD" }
  }
  // `approval_id` não-string simplesmente não casa com registro nenhum, e o resultado
  // é `no_decision`: nenhuma autoridade concedida. Falha fechada sem inventar defeito.
  if (typeof approval_id !== "string") return { status: "no_decision" }

  const porId = new Map<string, DecisionRecordV1>()
  for (const d of decisions) {
    if (porId.has(d.decision_id)) {
      return { status: "malformed_chain", defect: "DUPLICATE_DECISION_ID" }
    }
    porId.set(d.decision_id, d)
  }

  // Supersessão que cruza pedidos: falha fechada, e antes de filtrar.
  for (const d of decisions) {
    if (d.supersedes === undefined) continue
    const alvo = porId.get(d.supersedes)
    if (alvo !== undefined && alvo.approval_id !== d.approval_id) {
      return { status: "malformed_chain", defect: "CROSS_APPROVAL_SUPERSESSION" }
    }
  }

  const relevantes = decisions.filter((d) => d.approval_id === approval_id)
  if (relevantes.length === 0) return { status: "no_decision" }

  for (const d of relevantes) {
    if (d.decided_by !== FINAL_APPROVER) {
      return { status: "malformed_chain", defect: "NON_STEFANO_DECIDER" }
    }
  }

  const doPedido = new Map(relevantes.map((d) => [d.decision_id, d]))

  // Antecessor tem de existir NO CONJUNTO relevante. Tratar ausente como raiz faria
  // um registro órfão virar autoridade justamente quando falta o que ele revoga.
  for (const d of relevantes) {
    if (d.supersedes !== undefined && !doPedido.has(d.supersedes)) {
      return { status: "malformed_chain", defect: "DANGLING_SUPERSESSION" }
    }
  }

  // Dois registros sucedendo o mesmo antecessor: bifurcação.
  const sucessoresDe = new Map<string, number>()
  for (const d of relevantes) {
    if (d.supersedes === undefined) continue
    sucessoresDe.set(d.supersedes, (sucessoresDe.get(d.supersedes) ?? 0) + 1)
  }
  for (const n of sucessoresDe.values()) {
    if (n > 1) return { status: "malformed_chain", defect: "FORKED_CHAIN" }
  }

  const raizes = relevantes.filter((d) => d.supersedes === undefined)
  if (raizes.length === 0) return { status: "malformed_chain", defect: "CYCLIC_CHAIN" }
  if (raizes.length > 1) return { status: "malformed_chain", defect: "MULTIPLE_ROOTS" }

  // Ciclo desconexo da raiz: percorre a partir dela e confere que alcançou tudo.
  const alcancados = new Set<string>()
  let atual: DecisionRecordV1 | undefined = raizes[0]
  while (atual !== undefined) {
    if (alcancados.has(atual.decision_id)) {
      return { status: "malformed_chain", defect: "CYCLIC_CHAIN" }
    }
    alcancados.add(atual.decision_id)
    const id: string = atual.decision_id
    atual = relevantes.find((d) => d.supersedes === id)
  }
  if (alcancados.size !== relevantes.length) {
    return { status: "malformed_chain", defect: "CYCLIC_CHAIN" }
  }

  const terminais = relevantes.filter(
    (d) => !relevantes.some((o) => o.supersedes === d.decision_id),
  )
  if (terminais.length !== 1) return { status: "malformed_chain", defect: "FORKED_CHAIN" }

  const terminal = terminais[0]
  if (terminal === undefined) return { status: "malformed_chain", defect: "FORKED_CHAIN" }
  return { status: "effective", decision: terminal }
}

/** A decisão autoriza a ação? Preserva a semântica governada de `Decision`. */
export function decisionAuthorizes(d: Decision): boolean {
  return d === "APPROVED" || d === "APPROVED_WITH_CHANGES"
}

/**
 * Existe aprovação EFETIVA de Stefano para este pedido?
 *
 * Consome o resolvedor: nada de "algum registro histórico aprovou". Só responde
 * `true` quando a cadeia é estruturalmente válida, tem exatamente um terminal, e esse
 * terminal foi decidido por Stefano com veredito que autoriza.
 *
 * Silêncio (`no_decision`) e história contraditória (`malformed_chain`) devolvem
 * `false` pelo mesmo caminho — nenhum dos dois é aprovação — mas são estados
 * distintos em `resolveEffectiveDecision`, para quem precisa da diferença.
 */
export function isApprovedByStefano(requestRaw: unknown, decisionsRaw: unknown): boolean {
  // Mesma razão da fronteira de divulgação: tipo não é validação. Entrada
  // não-canônica devolve `false` — nunca aprovação.
  const request = canonico<ApprovalRequestV1>("approval-request", requestRaw)
  if (request === null) return false
  const r = resolveEffectiveDecision(request.approval_id, decisionsRaw)
  return r.status === "effective" && decisionAuthorizes(r.decision.decision)
}

// ═════════════════════════════════════════════════════════════════════════════
// Autorização de divulgação
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Versão do compromisso de conteúdo de uma divulgação.
 *
 * Dedicada, e NÃO a de `content-hash.ts` do Lucas: os domínios são diferentes, e
 * compartilhar a versão faria uma mudança na regra de ingestão invalidar aprovações
 * de divulgação que ninguém tocou.
 */
export const SHARED_BRIEFING_CONTENT_HASH_VERSION = "1.0.0" as const

/**
 * Identidade canônica do CONTEÚDO de uma projeção compartilhada.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * A autorização vinculava só `shared_briefing_id`. O gate mostrou a consequência:
 *
 *   A  id=shb_1  audience=COMMERCIAL_LUCAS  → aprovado por Stefano
 *   B  id=shb_1  audience=FINANCE_LEONARDO  → autorizado pela decisão de A  ✗
 *
 * Reusar a id fazia a decisão antiga autorizar uma divulgação materialmente
 * diferente. Stefano aprova UMA divulgação, não um identificador.
 *
 * ─── O que entra, e por quê ───────────────────────────────────────────────────
 *
 * Todo campo cuja mudança altera O QUE é divulgado, ou PARA QUEM:
 *
 *   shared_briefing_id                  qual projeção
 *   generated_from                      de qual briefing ela deriva
 *   audience                            para quem — mudar isto é outra divulgação
 *   permitted_insights                  qual inteligência
 *   contextual_cross_domain_insights    qual contexto de outro domínio
 *   permitted_evidence_refs             qual evidência fica alcançável
 *
 * ─── O que fica FORA, e por quê ───────────────────────────────────────────────
 *
 * `generated_at` é observacional — é quando NÓS geramos. Incluí-lo faria regenerar a
 * mesma divulgação exigir nova aprovação, sem que nada do que Stefano avaliou tivesse
 * mudado. É a mesma razão pela qual `collected_at` está fora do hash do Lucas.
 *
 * `authorization_ref` fica fora por circularidade: a aprovação vincula o hash, então
 * o hash não pode vincular a aprovação.
 *
 * ─── Ordem das allowlists ─────────────────────────────────────────────────────
 *
 * As três listas são CONJUNTOS de permissão: `[I1, I2]` e `[I2, I1]` liberam
 * exatamente a mesma coisa, e duplicata não libera nada a mais. São ordenadas e
 * deduplicadas de propósito — sem isso, reordenar a lista exigiria nova aprovação para
 * a mesma divulgação, e a governança viraria ruído.
 *
 * É o oposto da decisão do hash do Lucas, onde a ordem das LINHAS é material porque
 * localiza evidência. Domínios diferentes, escolhas diferentes, ambas explícitas.
 *
 * ─── Não é armazenado no objeto ───────────────────────────────────────────────
 *
 * `SharedBriefingV1` NÃO tem campo `content_hash`. Um hash guardado pode discordar do
 * próprio payload, e então seria preciso verificar essa discordância também — mais um
 * estado para manter coerente. Derivado sob demanda, não existe o que falsificar: o
 * hash é sempre do conteúdo que está ali.
 */
export function sharedBriefingContentHash(raw: unknown): string {
  // Nunca calcular identidade de conteúdo sobre objeto não validado: um campo extra
  // ficaria fora do material, e o hash afirmaria cobrir um conteúdo que não cobre.
  // Cópia PRÓPRIA. Calcular hash é leitura, e leitura não congela o objeto de quem
  // perguntou. O material é montado por campo nomeado, então a semântica do hash é
  // exatamente a mesma: instantâneo do mesmo conteúdo dá o mesmo hash.
  const b = toOwnedSharedBriefing(raw)
  const conjunto = (xs: readonly string[] | undefined): readonly string[] =>
    [...new Set(xs ?? [])].sort()

  // Estrutura tipada em ordem FIXA de campos, nunca iteração sobre chaves do objeto:
  // ordem de inserção de propriedade não pode influenciar identidade.
  const material = JSON.stringify({
    v: SHARED_BRIEFING_CONTENT_HASH_VERSION,
    shared_briefing_id: b.shared_briefing_id,
    generated_from: b.generated_from,
    audience: b.audience,
    permitted_insights: conjunto(b.permitted_insights),
    contextual_cross_domain_insights: conjunto(b.contextual_cross_domain_insights),
    permitted_evidence_refs: conjunto(b.permitted_evidence_refs),
  })
  return createHash("sha256").update(material, "utf8").digest("hex")
}

// ─────────────────────────────────────────────────────────────────────────────
// Identidade de conteúdo do ExecutiveBriefing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Versão do domínio de hash do CONTEÚDO do briefing executivo.
 *
 * Domínio próprio, e não a versão do `SharedBriefing` nem a do Lucas: uma mudança na
 * regra de divulgação não pode invalidar o compromisso de percepção de um read model
 * que ninguém tocou, e vice-versa. Domínios diferentes, versões diferentes.
 */
export const EXECUTIVE_BRIEFING_CONTENT_HASH_VERSION = "1.0.0" as const

/**
 * Canonicalização determinística: chaves de objeto ORDENADAS, ordem de array PRESERVADA.
 *
 * As duas metades são decisões, não conveniência:
 *
 *   chaves ordenadas    `{a,b}` e `{b,a}` são o MESMO objeto. Sem isto, um briefing
 *                       vindo de `JSON.parse` teria hash diferente do montado em
 *                       memória, e o compromisso de conteúdo dependeria de ordem de
 *                       inserção de propriedade — que não é conteúdo.
 *
 *   arrays preservados  a ordem de um array É conteúdo. `evidence_index` e
 *                       `operational_facts` chegam em ordem canônica da Fase 3.0b;
 *                       reordená-los aqui apagaria a diferença entre duas listas
 *                       materialmente distintas.
 */
export function canonicoParaHash(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicoParaHash)
  if (typeof v === "object" && v !== null) {
    const entrada = v as Record<string, unknown>
    const saida: Record<string, unknown> = {}
    for (const k of Object.keys(entrada).sort()) saida[k] = canonicoParaHash(entrada[k])
    return saida
  }
  return v
}

/**
 * Identidade canônica do CONTEÚDO de um `ExecutiveBriefingV1`.
 *
 * ─── Por que ela existe ───────────────────────────────────────────────────────
 *
 * `HermesReadModelV1` referencia o briefing por `executive_briefing_ref` MAIS
 * `executive_briefing_hash`. Só a referência não bastaria: uma id é um nome, e um nome
 * pode ser reusado por conteúdo diferente. O read model precisa afirmar
 * "eu descrevo ESTE briefing", e é o hash que sustenta a afirmação.
 *
 * ─── O que entra: TUDO ────────────────────────────────────────────────────────
 *
 * O briefing inteiro, validado. Não há allowlist de campos, e isso é deliberado: uma
 * lista escolhida à mão nasce incompleta no dia em que o contrato ganha um campo, e a
 * omissão é silenciosa — o hash continuaria afirmando cobrir um conteúdo que já não
 * cobre. Foi assim que a Fase 3.0a descobriu `historical_realized` faltando numa
 * proibição enumerada.
 *
 * `generated_at` ENTRA, e aqui a escolha é o oposto da do `SharedBriefing`. Lá o
 * timestamp está fora porque incluí-lo exigiria nova APROVAÇÃO para a mesma
 * divulgação. Aqui o objeto é PERCEPÇÃO: quando o briefing foi gerado é parte do que
 * Hermes percebe, porque recência é informação sobre o dado. Dois briefings do mesmo
 * conteúdo gerados em momentos distintos são duas observações, e um read model
 * apontando para "qualquer uma das duas" descreveria menos do que afirma.
 *
 * `briefing_id` também entra: é o nome daquilo que se está comprometendo.
 *
 * ─── Valida antes de hashear, e NÃO toca no objeto ────────────────────────────
 *
 * `assertValid` primeiro, sempre. Hashear objeto não validado produziria um compromisso
 * sobre forma desconhecida — e um campo extra ficaria dentro do material sem que nada
 * tivesse conferido que ele pode existir.
 *
 * A validação é de leitura pura: o AJV do repositório não usa `removeAdditional`,
 * `coerceTypes` nem `useDefaults`, então nada do objeto submetido é alterado. E o
 * material do hash sai de `canonicoParaHash`, que constrói um grafo NOVO — o objeto do
 * chamador é lido e devolvido como estava.
 *
 * Não passa pela factory de propósito: `toExecutiveBriefing` faz `deepFreeze` no que
 * recebe, e congelar objeto do chamador é efeito colateral sobre quem só pediu um hash.
 */
export function executiveBriefingContentHash(raw: unknown): string {
  const b = toOwnedExecutiveBriefing(raw)
  const material = JSON.stringify({
    v: EXECUTIVE_BRIEFING_CONTENT_HASH_VERSION,
    briefing: canonicoParaHash(b),
  })
  return createHash("sha256")
    .update(`executive_briefing_content/v1:${material}`, "utf8")
    .digest("hex")
}

// ─────────────────────────────────────────────────────────────────────────────
// Identidade de conteúdo das observações
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Domínios de hash SEPARADOS para as duas observações.
 *
 * Não um "hash genérico de observação": os dois objetos têm semântica diferente e
 * evoluem em ritmos diferentes. Um domínio único faria uma mudança na regra de
 * observação de dashboard mexer na identidade de percepção de mercado, que ninguém
 * tocou. Domínios diferentes, versões diferentes.
 */
export const DASHBOARD_OBSERVATION_CONTENT_HASH_VERSION = "1.0.0" as const
export const MARKET_OBSERVATION_CONTENT_HASH_VERSION = "1.0.0" as const

/**
 * Identidade canônica do CONTEÚDO de uma `DashboardObservationV1`.
 *
 * ─── O defeito que isto fecha ─────────────────────────────────────────────────
 *
 * O read model guardava só `observation_id`. O gate mostrou a consequência:
 *
 *   A  id=dob_1  conteúdo=X  → read model R
 *   B  id=dob_1  conteúdo=Y  → read model R  ✗  a MESMA identidade
 *
 * Uma id é um nome. Sem compromisso de conteúdo, um resolvedor futuro devolveria Y
 * onde a percepção registrada era X, e nada falharia — a percepção teria mudado sem
 * que o objeto que a descreve mudasse.
 *
 * ─── O que entra: TUDO ────────────────────────────────────────────────────────
 *
 * A observação inteira, validada, sem allowlist de campos — inclusive
 * `observation_id`, `observed_at`, `view_state`, `interaction_mode`, o texto em
 * `untrusted_text` e as refs de evidência. Campo novo no contrato passa a afetar a
 * identidade sozinho, sem ninguém precisar lembrar. Lista escrita à mão nasce
 * incompleta no dia seguinte, e a omissão é silenciosa.
 *
 * Os TIMESTAMPS entram: observação feita em T1 e observação feita em T2 não são a
 * mesma percepção só porque o texto coincidiu. Aqui a decisão é a oposta da do
 * `SharedBriefing` pelo mesmo motivo que no briefing executivo — o objeto é
 * percepção, e quando se observou é parte do que se percebeu.
 *
 * ─── Texto de injeção é conteúdo, e nada além ─────────────────────────────────
 *
 * `IGNORE ALL PREVIOUS INSTRUCTIONS` participa do hash como qualquer outro texto:
 * bytes comprometidos. Mudá-lo muda a identidade da percepção, e não muda permissão
 * alguma. O hash dá integridade, não veracidade — hash conferido não significa
 * observação verdadeira, aprovada ou confiável.
 */
export function dashboardObservationContentHash(raw: unknown): string {
  // Um instantâneo próprio, e o hash sai DELE. A observação do chamador sai desta
  // função exatamente como entrou — inclusive `isFrozen`, `isSealed` e `isExtensible` —
  // e não é lida uma segunda vez.
  //
  // Chamar isto com um objeto que JÁ é instantâneo próprio é idempotente: dado simples
  // capturado de novo dá o mesmo grafo.
  const o = toOwnedDashboardObservation(raw)
  const material = JSON.stringify({
    v: DASHBOARD_OBSERVATION_CONTENT_HASH_VERSION,
    observation: canonicoParaHash(o),
  })
  return createHash("sha256")
    .update(`dashboard_observation_content/v1:${material}`, "utf8")
    .digest("hex")
}

/**
 * Identidade canônica do CONTEÚDO de uma `MarketObservationV1`.
 *
 * Mesmo desenho e mesmas razões do hash de dashboard, em domínio próprio. Compromete
 * a proveniência inteira — `source_type`, `source_ref`, `platform`, `subject`,
 * `observed_fact`, `capture_time`, métricas e ref de evidência — porque proveniência
 * é o que distingue observação externa de fato interno, e perdê-la apagaria a
 * fronteira epistêmica.
 */
export function marketObservationContentHash(raw: unknown): string {
  const o = toOwnedMarketObservation(raw)
  const material = JSON.stringify({
    v: MARKET_OBSERVATION_CONTENT_HASH_VERSION,
    observation: canonicoParaHash(o),
  })
  return createHash("sha256")
    .update(`market_observation_content/v1:${material}`, "utf8")
    .digest("hex")
}

/**
 * Confere um vínculo contra a observação resolvida. Para a Fase 3.1.
 *
 * ─── A invariante que 3.1 HERDA ───────────────────────────────────────────────
 *
 * Nenhum runtime pode desreferenciar um vínculo de observação sem conferir:
 *
 *   resolvida.observation_id  ===  vínculo.observation_ref
 *   hashCanônico(resolvida)   ===  vínculo.observation_hash
 *
 * Falha em qualquer um dos dois: FALHA FECHADA. Sem isso, o vínculo volta a ser um
 * ponteiro mutável e a percepção registrada deixa de ser a percepção lida.
 *
 * Função pura: não busca nada, não guarda nada, não resolve nada. Quem tem o objeto
 * resolvido pergunta se ele é o que o vínculo prometia. A infraestrutura de
 * persistência e resolução é fase posterior — isto é o que a torna segura.
 */
export function observationBindingMatches(
  binding: ObservationBinding,
  resolvedRaw: unknown,
  kind: "DASHBOARD" | "MARKET",
): boolean {
  if (typeof binding !== "object" || binding === null) return false
  let propria: DashboardObservationV1 | MarketObservationV1
  try {
    // UM instantâneo. A versão anterior hasheava o objeto resolvido e depois relia
    // `observation_id` dele — com um getter, o hash e a id podiam vir de conteúdos
    // diferentes, e a conferência aprovaria uma correspondência que não existe.
    propria =
      kind === "DASHBOARD"
        ? toOwnedDashboardObservation(resolvedRaw)
        : toOwnedMarketObservation(resolvedRaw)
  } catch {
    // Observação resolvida fora do contrato não corresponde a vínculo algum.
    return false
  }
  const hash =
    kind === "DASHBOARD"
      ? dashboardObservationContentHash(propria)
      : marketObservationContentHash(propria)
  return propria.observation_id === binding.observation_ref && hash === binding.observation_hash
}

/**
 * O assunto de aprovação de uma divulgação, derivado do objeto real.
 *
 * Existe para que nenhum chamador coordene `subject_ref` e `subject_content_hash` à
 * mão — coordenação manual entre dois campos é onde eles divergem.
 */
export function sharedBriefingApprovalSubject(raw: unknown): {
  readonly subject_type: "SHARED_BRIEFING"
  readonly subject_ref: string
  readonly subject_content_hash: string
} {
  const b = toOwnedSharedBriefing(raw)
  return deepFreeze({
    subject_type: "SHARED_BRIEFING" as const,
    subject_ref: b.shared_briefing_id,
    subject_content_hash: sharedBriefingContentHash(b),
  })
}

export const SHARE_AUTHORIZATION_DEFECTS = [
  /** O DecisionRecord apontado não está no conjunto conhecido. */
  "AUTHORIZATION_REF_NOT_FOUND",
  /** O registro apontado pertence a OUTRO pedido de aprovação. */
  "DECISION_FOR_DIFFERENT_APPROVAL",
  /** O pedido não é sobre compartilhar ESTE briefing. */
  "APPROVAL_SUBJECT_MISMATCH",
  /** O pedido não declarou o conteúdo aprovado. */
  "APPROVAL_MISSING_CONTENT_BINDING",
  /** O conteúdo mudou desde a aprovação: outra divulgação, outra decisão. */
  "CONTENT_HASH_MISMATCH",
  /** A referência aponta um registro já revogado por supersessão. */
  "SUPERSEDED_DECISION",
  /** O veredito efetivo não autoriza. */
  "DECISION_DOES_NOT_AUTHORIZE",
  /** A história de autoridade está contraditória. */
  "MALFORMED_DECISION_CHAIN",
  /** Não há decisão nenhuma. */
  "NO_DECISION",
  /** O briefing recebido não é o objeto canônico — campo extra, enum inválido, etc. */
  "INVALID_SHARED_BRIEFING",
  /** O pedido recebido não é o objeto canônico. */
  "INVALID_APPROVAL_REQUEST",
  /** Alguma decisão recebida não é o objeto canônico. */
  "INVALID_DECISION_RECORD",
  /** O pedido ainda aguarda Stefano: nenhuma decisão foi vinculada a ele. */
  "REQUEST_NOT_DECIDED",
  /** O pedido foi RETIRADO. Retirado nunca autoriza. */
  "REQUEST_WITHDRAWN",
  /** O pedido e o briefing apontam decisões DIFERENTES. */
  "DECISION_REF_MISMATCH",
] as const
export type ShareAuthorizationDefect = (typeof SHARE_AUTHORIZATION_DEFECTS)[number]

export type ShareAuthorization =
  | { readonly status: "authorized"; readonly decision_id: string }
  | { readonly status: "not_authorized"; readonly defect: ShareAuthorizationDefect }

/**
 * O compartilhamento está autorizado?
 *
 * ─── Por que isto existe fora do schema ───────────────────────────────────────
 *
 * JSON Schema valida UM objeto. Não consegue afirmar que o id em
 * `authorization_ref` aponta um DecisionRecord que existe, pertence ao pedido certo,
 * é o terminal da cadeia e foi decidido por Stefano. Essa é relação entre objetos, e
 * o único lugar honesto para verificá-la é a fronteira de construção.
 *
 * ─── O que é recusado, e por quê ──────────────────────────────────────────────
 *
 * `APPROVAL_SUBJECT_MISMATCH` fecha o caso mais escorregadio: "Stefano aprovou
 * alguma coisa em algum lugar" não autoriza divulgar este briefing. O pedido tem de
 * ser sobre `SHARED_BRIEFING` e sobre ESTE `shared_briefing_id`.
 *
 * `SUPERSEDED_DECISION` liga esta função ao primeiro achado: uma aprovação revogada
 * depois deixa de autorizar, mesmo que o briefing continue apontando para ela. O
 * objeto não muda — a autoridade dele muda, porque autoridade é da cadeia.
 *
 * ─── Os três objetos têm de concordar ─────────────────────────────────────────
 *
 * Um DecisionRecord não ativa um pedido sozinho:
 *
 *   pedido      status DECIDED, com `decision_ref`
 *   briefing    `authorization_ref` IGUAL ao `decision_ref` do pedido
 *   decisão     terminal efetivo da cadeia, de Stefano, que autoriza
 *
 * `WITHDRAWN` e `AWAITING_STEFANO_APPROVAL` nunca autorizam, mesmo com um registro
 * `APPROVED` de mesmo `approval_id` em mãos. Casar só por `approval_id` deixaria o
 * código escolher a decisão que aprova entre duas do mesmo pedido.
 *
 * As razões são vocabulário fechado e não carregam conteúdo de objeto nem PII: um
 * motivo de recusa que vazasse a linha do aluno trocaria um problema de autoridade
 * por um vazamento.
 */
export function authorizeSharedBriefing(
  briefingRaw: unknown,
  requestRaw: unknown,
  decisionsRaw: unknown,
): ShareAuthorization {
  // ─── Validação ANTES de hash, de resolução e de qualquer comparação ───────
  //
  // O gate encontrou o furo: a função confiava no tipo TypeScript. Tipo desaparece na
  // compilação — um `as`, um `JSON.parse` ou um chamador em JavaScript entregam
  // qualquer objeto. Como o material do hash cobre só os campos conhecidos, um campo
  // extra de divulgação viajava por fora do compromisso e o hash aprovado ainda
  // autorizava.
  //
  // `additionalProperties: false` já dizia que tal objeto é inválido. Faltava a
  // fronteira de autoridade PERGUNTAR.
  const briefing = canonico<SharedBriefingV1>("shared-briefing", briefingRaw)
  if (briefing === null) {
    return { status: "not_authorized", defect: "INVALID_SHARED_BRIEFING" }
  }
  const request = canonico<ApprovalRequestV1>("approval-request", requestRaw)
  if (request === null) {
    return { status: "not_authorized", defect: "INVALID_APPROVAL_REQUEST" }
  }
  const decisions = decisoesCanonicas(decisionsRaw)
  if (decisions === null) {
    return { status: "not_authorized", defect: "INVALID_DECISION_RECORD" }
  }

  // ─── O ciclo de vida do PEDIDO, antes de qualquer hash ───────────────────
  //
  // O gate encontrou que a autoridade era montada a partir do DecisionRecord e do
  // `approval_id`, sem nunca perguntar em que estado o pedido está. Consequência: um
  // pedido RETIRADO, ou um que ainda AGUARDA Stefano, autorizava divulgação desde que
  // alguém fornecesse um registro `APPROVED` com o mesmo `approval_id`.
  //
  // Isso tornava a retirada inócua — e retirada que não retira é pior que não existir,
  // porque quem a usou acredita ter fechado a porta.
  //
  // Um DecisionRecord NÃO ativa um pedido por conta própria. Autoridade exige acordo
  // entre os três objetos: o pedido diz que foi decidido, o briefing e o pedido
  // apontam a MESMA decisão, e essa decisão é o terminal efetivo da cadeia.
  if (request.status === "WITHDRAWN") {
    // Retirado é final para ESTE pedido. Reviver exige um pedido novo, pela mesma
    // regra append-only do resto — não um registro antigo reapresentado.
    return { status: "not_authorized", defect: "REQUEST_WITHDRAWN" }
  }
  if (request.status !== "DECIDED") {
    // "Existe um DecisionRecord, então o pedido deve estar decidido" é exatamente a
    // inferência proibida: o estado canônico do pedido é que afirma o vínculo.
    return { status: "not_authorized", defect: "REQUEST_NOT_DECIDED" }
  }
  // O schema garante `decision_ref` quando `DECIDED`; o narrowing mantém a promessa
  // sem asserção — um `!` aqui afirmaria forma sem ter verificado.
  if (request.decision_ref === undefined) {
    return { status: "not_authorized", defect: "REQUEST_NOT_DECIDED" }
  }
  // Pedido e briefing têm de apontar a MESMA decisão. Casar só por `approval_id`
  // deixaria o código escolher, entre duas decisões do mesmo pedido, a que aprova.
  if (request.decision_ref !== briefing.authorization_ref) {
    return { status: "not_authorized", defect: "DECISION_REF_MISMATCH" }
  }

  const apontado = decisions.find((d) => d.decision_id === briefing.authorization_ref)
  if (apontado === undefined) {
    return { status: "not_authorized", defect: "AUTHORIZATION_REF_NOT_FOUND" }
  }
  if (apontado.approval_id !== request.approval_id) {
    return { status: "not_authorized", defect: "DECISION_FOR_DIFFERENT_APPROVAL" }
  }
  // O pedido tem de ser sobre compartilhar ESTE briefing.
  if (
    request.subject_type !== "SHARED_BRIEFING" ||
    request.subject_ref !== briefing.shared_briefing_id
  ) {
    return { status: "not_authorized", defect: "APPROVAL_SUBJECT_MISMATCH" }
  }

  // E o CONTEÚDO tem de ser o aprovado. A id sozinha não é autorização: reusá-la
  // com outra audiência ou outra allowlist é outra divulgação, e exige outra decisão.
  if (request.subject_content_hash === undefined) {
    return { status: "not_authorized", defect: "APPROVAL_MISSING_CONTENT_BINDING" }
  }
  if (request.subject_content_hash !== sharedBriefingContentHash(briefing)) {
    return { status: "not_authorized", defect: "CONTENT_HASH_MISMATCH" }
  }

  const efetiva = resolveEffectiveDecision(request.approval_id, decisions)
  if (efetiva.status === "no_decision") {
    return { status: "not_authorized", defect: "NO_DECISION" }
  }
  if (efetiva.status === "malformed_chain") {
    return { status: "not_authorized", defect: "MALFORMED_DECISION_CHAIN" }
  }
  if (efetiva.decision.decision_id !== apontado.decision_id) {
    return { status: "not_authorized", defect: "SUPERSEDED_DECISION" }
  }
  if (!decisionAuthorizes(efetiva.decision.decision)) {
    return { status: "not_authorized", defect: "DECISION_DOES_NOT_AUTHORIZE" }
  }
  return { status: "authorized", decision_id: efetiva.decision.decision_id }
}
