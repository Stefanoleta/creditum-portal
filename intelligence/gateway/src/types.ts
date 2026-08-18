/**
 * Tipos do plano de consulta.
 *
 * Espelham os contratos JSON, mas não os substituem: o JSON Schema é a
 * autoridade em runtime (dado externo não é confiável), o TypeScript é a
 * autoridade em tempo de compilação. Os dois precisam concordar — o teste
 * `contracts.test.ts` exercita fixtures contra ambos.
 *
 * Nenhum tipo aqui tem campo de escrita. A ausência é o ponto.
 */

export type QualityStatus = "ok" | "degraded" | "conflicted" | "insufficient"

export type DataClass = "observed" | "calculated" | "inferred" | "forecast" | "gap"

export type GapReason =
  | "DATA_NOT_AVAILABLE"
  | "DATA_CONFLICT"
  | "LOW_CONFIDENCE"
  | "EMPTY_DENOMINATOR"
  | "INSUFFICIENT_COVERAGE"
  | "BUSINESS_RULE_PENDING"

export type Severity = "info" | "low" | "medium" | "high" | "critical"

export type EventType =
  | "installment_concentration"
  | "data_quality_conflict"
  | "first_due_date_concentration"
  | "material_single_case"
  | "coverage_degraded"

export type SourceSystem =
  | "google_sheets"
  | "bitrix24"
  | "omie"
  | "omie_criteria"
  | "supabase_ceo"
  | "manual_upload"

export interface Coverage {
  readonly expected_units: number
  readonly reporting_units: number
  readonly ratio_bp: number
  readonly missing_units?: readonly string[]
}

export interface ConflictVersion {
  readonly source_system: string
  readonly value_repr: string
  readonly evidence_ref?: string
}

export interface Conflict {
  readonly conflict_id: string
  readonly field: string
  readonly versions: readonly ConflictVersion[]
  readonly resolved?: false
}

/**
 * Payload FECHADO.
 *
 * Não é `Record<string, unknown>`: um mapa aberto no tipo é a porta pela qual
 * texto livre — e portanto instrução — entra no que vai ao modelo. Todo campo
 * aqui tem forma; texto de fonte só existe em `source_notes`, rotulado.
 */
export interface SnapshotPayload {
  readonly period_label?: string
  readonly sales_count?: number
  readonly leads_received?: number
  readonly leads_eligible?: number
  readonly volume_contracted_cents?: number
  readonly average_ticket_cents?: number
  readonly gross_conversion_bp?: number
  readonly eligible_conversion_bp?: number
  readonly installments_histogram?: Readonly<Record<string, number>>
  readonly first_due_date_histogram?: Readonly<Record<string, number>>
  readonly unit_breakdown?: Readonly<Record<string, number>>
  /** Campo legítimo da ingestão que a allowlist do gateway não expõe. */
  readonly internal_margin_bp?: number
  readonly source_notes?: readonly UntrustedText[]
}

export interface Snapshot {
  readonly snapshot_id: string
  readonly schema_version: string
  readonly source_system: SourceSystem
  readonly dataset_id: string
  readonly period_start: string
  readonly period_end: string
  readonly observed_at: string
  readonly ingested_at: string
  readonly content_hash: string
  readonly record_count: number
  readonly rows_skipped: number
  readonly coverage: Coverage
  readonly quality_status: QualityStatus
  readonly conflicts: readonly Conflict[]
  readonly missing_fields: readonly string[]
  readonly evidence_refs: readonly string[]
  readonly payload: SnapshotPayload
}

export interface Metric {
  readonly name: string
  readonly data_class: DataClass
  readonly unit?: "cents" | "count" | "basis_points" | "days"
  readonly value?: number
  readonly formula?: string
  readonly confidence_bp?: number
  readonly range_low?: number
  readonly range_high?: number
  readonly gap_reason?: GapReason
}

export interface ContributingCase {
  readonly subject_ref: string
  readonly contribution: {
    readonly amount_cents?: number
    readonly count?: number
    readonly share_of_event_bp?: number
  }
  readonly unit?: string
  readonly evidence_refs?: readonly string[]
}

export interface EventDataQuality {
  readonly quality_status: QualityStatus
  readonly conflict_ids?: readonly string[]
  readonly missing_fields?: readonly string[]
  readonly coverage_ratio_bp?: number
}

export interface IntelligenceEvent {
  readonly event_id: string
  readonly event_type: EventType
  readonly detector_id: string
  readonly detector_version: string
  readonly snapshot_ids: readonly string[]
  readonly period_start: string
  readonly period_end: string
  readonly detected_at: string
  readonly severity: Severity
  readonly materiality: {
    readonly basis: "amount_cents" | "count" | "ratio_bp"
    readonly amount_cents?: number
    readonly count?: number
    readonly ratio_bp?: number
    readonly share_of_total_bp?: number
  }
  readonly observed_metric?: Metric
  readonly reference_metric?: Metric
  readonly contributing_cases?: readonly ContributingCase[]
  readonly evidence_refs: readonly string[]
  readonly data_quality: EventDataQuality
}

export interface UntrustedText {
  readonly untrusted: true
  readonly content: string
  readonly origin?: string
}

export interface Evidence {
  readonly evidence_id: string
  readonly snapshot_id: string
  readonly kind: "cell" | "row" | "aggregate" | "computed" | "absence"
  readonly locator: {
    readonly dataset_id: string
    readonly sheet?: string
    readonly row_key?: string
    readonly column?: string
  }
  readonly observed_at: string
  readonly formula?: string
  readonly untrusted_excerpt?: UntrustedText
}

/**
 * Texto de fonte RETIDO, substituído por metadado.
 *
 * O rótulo `untrusted: true` diz ao consumidor que aquilo é dado, não instrução
 * — mas rótulo é metadado, não mecanismo: um modelo que lê o texto pode seguir
 * o texto. Então o texto simplesmente **não vai**.
 *
 * O que atravessa é o suficiente para o humano recuperar o original na
 * auditoria: origem, tamanho e o hash do conteúdo. O texto continua íntegro no
 * store e no snapshot — ele só não entra no contexto do modelo.
 */
export interface WithheldText {
  readonly untrusted: true
  readonly withheld: true
  readonly origin?: string
  readonly content_sha256: string
  readonly content_length: number
}

/**
 * Payload como o modelo o vê.
 *
 * Três campos somem em relação a `SnapshotPayload`:
 *   - `source_notes` vira `WithheldText[]` — sem `content`
 *   - `unit_breakdown` não é exposto enquanto suas chaves forem nomes livres de
 *     unidade (resíduo R1; fecha na Fase 2 com o vocabulário canônico de D13)
 *   - `internal_margin_bp` nunca esteve na allowlist
 */
export interface ModelFacingPayload
  extends Omit<SnapshotPayload, "source_notes" | "unit_breakdown" | "internal_margin_bp"> {
  readonly source_notes?: readonly WithheldText[]
}

export interface ModelFacingSnapshot extends Omit<Snapshot, "payload"> {
  readonly payload: ModelFacingPayload
}

export interface ModelFacingEvidence extends Omit<Evidence, "untrusted_excerpt"> {
  readonly untrusted_excerpt?: WithheldText
}

/**
 * Metadados obrigatórios em TODA resposta do gateway (§9).
 *
 * Não é opcional e não tem default silencioso: uma resposta sem frescor e sem
 * qualidade permite ao consumidor tratar dado velho como dado atual.
 */
export interface ResponseMeta {
  readonly as_of: string
  readonly quality_status: QualityStatus
  readonly data_age_hours: number
  readonly coverage_ratio_bp: number | null
  readonly contract_version: string
  readonly source_systems: readonly SourceSystem[]
  /**
   * Algum snapshot do conjunto tem `observed_at` no futuro além da tolerância.
   * Quando true, `quality_status` é forçado a `insufficient`: a idade do dado é
   * desconhecida, e idade desconhecida não é frescor.
   */
  readonly clock_anomaly: boolean
}

export interface GatewayResponse<T> {
  readonly data: T
  readonly meta: ResponseMeta
}
