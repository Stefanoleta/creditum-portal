/**
 * Data Gateway da Creditum — plano de consulta somente leitura.
 *
 * É a única superfície que o runtime agêntico enxerga. Três invariantes que o
 * resto do sistema depende:
 *
 *   1. Nenhum método escreve. A superfície pública são cinco leituras, e os
 *      internos são `#private` de verdade — não aparecem no protótipo, então
 *      não há o que enumerar (§15).
 *   2. Toda resposta carrega frescor e qualidade (§9), e o frescor é o da
 *      dependência **mais velha**.
 *   3. Nada sai sem passar pela fronteira de PII (§12.1).
 *
 * O que este módulo deliberadamente NÃO faz: somar, tirar média, calcular
 * percentual, ranquear ou projetar. Esses cálculos pertencem aos detectores em
 * código testado (§9). O gateway serve; ele não conclui.
 */

import { createHash } from "node:crypto"
import { Allowlist, POC_ALLOWLIST } from "./allowlist"
import type { AllowlistConfig } from "./allowlist"
import { GatewayError } from "./errors"
import { guardEgress } from "./egress"
import { FUTURE_TOLERANCE_MS } from "./semantic"
import { assertValidatedStore } from "./store"
import type { ReadOnlyStore } from "./store"
import type {
  ContributingCase,
  Evidence,
  GatewayResponse,
  IntelligenceEvent,
  ModelFacingEvidence,
  ModelFacingPayload,
  ModelFacingSnapshot,
  QualityStatus,
  ResponseMeta,
  Severity,
  Snapshot,
  SnapshotPayload,
  SourceSystem,
  UntrustedText,
  WithheldText,
} from "./types"

export const CONTRACT_VERSION = "1.0.0"

/**
 * Substitui texto de fonte por metadado.
 *
 * O conteúdo continua no store; o que atravessa é origem, tamanho e hash — o
 * bastante para o humano recuperar o original na auditoria, e insuficiente para
 * o modelo ler uma instrução.
 */
function withholdText(texto: UntrustedText): WithheldText {
  return {
    untrusted: true,
    withheld: true,
    ...(texto.origin === undefined ? {} : { origin: texto.origin }),
    content_sha256: createHash("sha256").update(texto.content, "utf8").digest("hex"),
    content_length: texto.content.length,
  }
}

/** Injetável para que os testes não dependam do relógio da máquina. */
export type Clock = () => Date

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

/**
 * `conflicted` é o pior estado, acima de `insufficient`: cobertura baixa
 * significa que falta informação; conflito significa que a informação existente
 * pode estar errada. O segundo é mais perigoso para quem decide.
 */
const QUALITY_ORDER: Readonly<Record<QualityStatus, number>> = {
  ok: 0,
  degraded: 1,
  insufficient: 2,
  conflicted: 3,
}

function weakestQuality(statuses: readonly QualityStatus[]): QualityStatus {
  let worst: QualityStatus = "ok"
  for (const s of statuses) {
    if (QUALITY_ORDER[s] > QUALITY_ORDER[worst]) worst = s
  }
  return worst
}

export interface SnapshotQuery {
  readonly source_system?: SourceSystem
  readonly period_start?: string
  readonly period_end?: string
}

export interface EventQuery {
  readonly event_type?: IntelligenceEvent["event_type"]
  readonly min_severity?: Severity
  readonly period_start?: string
  readonly period_end?: string
}

export class ReadOnlyGateway {
  readonly #store: ReadOnlyStore
  readonly #allowlist: Allowlist
  readonly #now: Clock

  /**
   * O segundo parâmetro é CONFIGURAÇÃO, não uma instância de `Allowlist`.
   *
   * Aceitar a instância deixava a política de egresso na mão do chamador: uma
   * subclasse com `projectPayload` sobrescrito reintroduziria qualquer campo,
   * inclusive os da denylist. Aqui o gateway recebe dados, valida, e constrói
   * ele mesmo a implementação concreta — não há o que substituir.
   */
  constructor(
    store: ReadOnlyStore,
    config: AllowlistConfig = POC_ALLOWLIST,
    now: Clock = () => new Date(),
  ) {
    // `ReadOnlyStore` é interface ESTRUTURAL: qualquer objeto com os três
    // métodos a satisfaz, e o compilador não roda em produção. Sem esta
    // checagem, um adaptador — hostil ou apenas descuidado — entregaria dados
    // sem schema, sem semântica, sem integridade e mutáveis, e o gateway
    // confiaria neles.
    assertValidatedStore(store)

    this.#store = store
    this.#allowlist = new Allowlist(config)
    this.#now = now

    Object.freeze(this)
  }

  // ---------------------------------------------------------------- capacidades

  listSnapshots(query: SnapshotQuery = {}): GatewayResponse<readonly ModelFacingSnapshot[]> {
    this.#allowlist.assertCapability("listSnapshots")

    if (query.source_system !== undefined) {
      this.#allowlist.assertSource(query.source_system)
    }

    const found = this.#visibleSnapshots().filter((s) => {
      if (query.source_system !== undefined && s.source_system !== query.source_system) return false
      if (query.period_start !== undefined && s.period_end < query.period_start) return false
      if (query.period_end !== undefined && s.period_start > query.period_end) return false
      return true
    })

    return this.#respond(found.map((s) => this.#modelFacingSnapshot(s)), found)
  }

  getSnapshot(snapshotId: string): GatewayResponse<ModelFacingSnapshot> {
    this.#allowlist.assertCapability("getSnapshot")

    const snapshot = this.#visibleSnapshots().find((s) => s.snapshot_id === snapshotId)
    if (snapshot === undefined) {
      // Mesma mensagem para "não existe" e "fonte não permitida": distinguir os
      // dois deixaria o agente mapear o que existe fora da allowlist.
      throw new GatewayError("UNKNOWN_SNAPSHOT", `Snapshot não disponível: ${snapshotId}`, [
        snapshotId,
      ])
    }

    return this.#respond(this.#modelFacingSnapshot(snapshot), [snapshot])
  }

  listEvents(query: EventQuery = {}): GatewayResponse<readonly IntelligenceEvent[]> {
    this.#allowlist.assertCapability("listEvents")

    const minRank = query.min_severity === undefined ? -1 : SEVERITY_ORDER[query.min_severity]

    const found = this.#visibleEvents().filter((e) => {
      if (query.event_type !== undefined && e.event_type !== query.event_type) return false
      if (SEVERITY_ORDER[e.severity] < minRank) return false
      if (query.period_start !== undefined && e.period_end < query.period_start) return false
      if (query.period_end !== undefined && e.period_start > query.period_end) return false
      return true
    })

    const snapshots = this.#snapshotsBackingEvents(found)
    return this.#respond(found, snapshots, found.map((e) => e.data_quality.quality_status))
  }

  getEvidence(evidenceIds: readonly string[]): GatewayResponse<readonly ModelFacingEvidence[]> {
    this.#allowlist.assertCapability("getEvidence")

    const visibleSnapshotIds = new Set(this.#visibleSnapshots().map((s) => s.snapshot_id))
    const wanted = new Set(evidenceIds)

    const found = this.#store
      .allEvidence()
      .filter((e) => wanted.has(e.evidence_id) && visibleSnapshotIds.has(e.snapshot_id))

    const snapshots = this.#visibleSnapshots().filter((s) =>
      found.some((e) => e.snapshot_id === s.snapshot_id),
    )

    return this.#respond(found.map((e) => this.#modelFacingEvidence(e)), snapshots)
  }

  /**
   * Casos individuais materialmente responsáveis por um consolidado (§9).
   *
   * Devolve pseudônimos e contribuições — nunca identidade. É o que permite
   * responder "quem move o número" sem revelar quem é a pessoa (caso D).
   */
  getMaterialCases(eventId: string): GatewayResponse<readonly ContributingCase[]> {
    this.#allowlist.assertCapability("getMaterialCases")

    const event = this.#visibleEvents().find((e) => e.event_id === eventId)
    if (event === undefined) {
      throw new GatewayError("UNKNOWN_EVENT", `Evento não disponível: ${eventId}`, [eventId])
    }

    const snapshots = this.#snapshotsBackingEvents([event])
    return this.#respond(event.contributing_cases ?? [], snapshots, [
      event.data_quality.quality_status,
    ])
  }

  // ------------------------------------------------------------------- internos
  //
  // `#private` de verdade: não existem no protótipo, então não há superfície
  // interna para descobrir a partir de uma instância.

  #visibleSnapshots(): readonly Snapshot[] {
    return this.#store.allSnapshots().filter((s) => this.#allowlist.isSourceAllowed(s.source_system))
  }

  #visibleEvents(): readonly IntelligenceEvent[] {
    const visibleIds = new Set(this.#visibleSnapshots().map((s) => s.snapshot_id))
    // Um evento cujo lastro inclui fonte não permitida não aparece: o contrário
    // permitiria inferir conteúdo de fonte bloqueada pela materialidade.
    return this.#store.allEvents().filter((e) => e.snapshot_ids.every((id) => visibleIds.has(id)))
  }

  #snapshotsBackingEvents(events: readonly IntelligenceEvent[]): readonly Snapshot[] {
    const ids = new Set(events.flatMap((e) => [...e.snapshot_ids]))
    return this.#visibleSnapshots().filter((s) => ids.has(s.snapshot_id))
  }

  /**
   * Converte para a forma que o modelo pode ver.
   *
   * Duas camadas, com propósitos distintos: a allowlist decide QUAIS campos
   * atravessam; a retenção decide que o CONTEÚDO de texto de fonte não
   * atravessa. Um sem o outro deixa metade do buraco aberto — a allowlist
   * sozinha deixaria `source_notes.content` passar inteiro.
   */
  #modelFacingSnapshot(snapshot: Snapshot): ModelFacingSnapshot {
    return { ...snapshot, payload: this.#modelFacingPayload(snapshot.payload) }
  }

  /**
   * Projeção FECHADA, campo a campo.
   *
   * Não é laço sobre `Object.entries` de propósito: aquele formato copiava
   * qualquer chave que a allowlist deixasse passar, então um campo novo no
   * contrato — ou um campo reabilitado por configuração — atravessava sozinho.
   * Aqui, campo que não está escrito abaixo não existe para o modelo, e a
   * denylist não depende de configuração nenhuma para valer.
   *
   * `unit_breakdown` e `internal_margin_bp` não aparecem, e é por construção.
   */
  #modelFacingPayload(payload: SnapshotPayload): ModelFacingPayload {
    const p = this.#allowlist.projectPayload(payload)

    return {
      ...(p.period_label === undefined ? {} : { period_label: p.period_label }),
      ...(p.sales_count === undefined ? {} : { sales_count: p.sales_count }),
      ...(p.leads_received === undefined ? {} : { leads_received: p.leads_received }),
      ...(p.leads_eligible === undefined ? {} : { leads_eligible: p.leads_eligible }),
      ...(p.volume_contracted_cents === undefined
        ? {}
        : { volume_contracted_cents: p.volume_contracted_cents }),
      ...(p.average_ticket_cents === undefined
        ? {}
        : { average_ticket_cents: p.average_ticket_cents }),
      ...(p.gross_conversion_bp === undefined
        ? {}
        : { gross_conversion_bp: p.gross_conversion_bp }),
      ...(p.eligible_conversion_bp === undefined
        ? {}
        : { eligible_conversion_bp: p.eligible_conversion_bp }),
      ...(p.installments_histogram === undefined
        ? {}
        : { installments_histogram: p.installments_histogram }),
      ...(p.first_due_date_histogram === undefined
        ? {}
        : { first_due_date_histogram: p.first_due_date_histogram }),
      ...(p.source_notes === undefined
        ? {}
        : { source_notes: p.source_notes.map(withholdText) }),
    }
  }

  /**
   * Construção positiva, campo a campo.
   *
   * Não é `{...evidence}` de propósito: um campo novo no contrato de evidência
   * atravessaria sozinho para o modelo. Aqui, campo novo só passa se alguém o
   * acrescentar aqui explicitamente.
   */
  #modelFacingEvidence(evidence: Evidence): ModelFacingEvidence {
    return {
      evidence_id: evidence.evidence_id,
      snapshot_id: evidence.snapshot_id,
      kind: evidence.kind,
      locator: evidence.locator,
      observed_at: evidence.observed_at,
      ...(evidence.formula === undefined ? {} : { formula: evidence.formula }),
      ...(evidence.untrusted_excerpt === undefined
        ? {}
        : { untrusted_excerpt: withholdText(evidence.untrusted_excerpt) }),
    }
  }

  #respond<T>(
    data: T,
    snapshots: readonly Snapshot[],
    extraQuality: readonly QualityStatus[] = [],
  ): GatewayResponse<T> {
    // Fronteira `to_model`: o que sai daqui entra no contexto do agente e, por
    // consequência, no do provedor externo. É o ponto mais crítico dos quatro.
    guardEgress(data, "to_model")

    return { data, meta: this.#buildMeta(snapshots, extraQuality) }
  }

  /**
   * Frescor agregado.
   *
   * `as_of` é o `observed_at` **mais velho** do conjunto, não o mais novo. Uma
   * resposta que mistura um snapshot de hoje com um de junho não é fresca de
   * hoje: ela vale o que vale sua dependência mais velha. Publicar o mais novo
   * faria dado velho passar por atual — exatamente a falha que o sistema existe
   * para não cometer.
   *
   * A comparação é por instante (`Date.getTime()`), não por ordenação de string.
   * Ordenação textual só coincide com ordenação temporal quando todos os
   * timestamps estão no mesmo fuso e no mesmo formato — e um `-03:00` no meio de
   * uma lista de `Z` reordena tudo em silêncio.
   */
  #buildMeta(
    snapshots: readonly Snapshot[],
    extraQuality: readonly QualityStatus[],
  ): ResponseMeta {
    if (snapshots.length === 0) {
      return {
        // Sem snapshot não há "as of" honesto. Usar o relógio aqui faria uma
        // resposta vazia parecer fresca.
        as_of: "1970-01-01T00:00:00.000Z",
        quality_status: "insufficient",
        data_age_hours: Number.MAX_SAFE_INTEGER,
        coverage_ratio_bp: null,
        contract_version: CONTRACT_VERSION,
        source_systems: [],
        clock_anomaly: false,
      }
    }

    const agora = this.#now().getTime()
    let maisVelho = Number.POSITIVE_INFINITY
    let anomalia = false

    for (const s of snapshots) {
      const t = new Date(s.observed_at).getTime()
      if (Number.isNaN(t)) {
        // Não deveria acontecer: a factory recusa timestamp não parseável. Se
        // chegou aqui, a garantia foi contornada — falha fechado.
        throw new GatewayError(
          "SCHEMA_INVALID",
          `observed_at não parseável no snapshot ${s.snapshot_id}`,
          [s.observed_at],
        )
      }
      if (t > agora + FUTURE_TOLERANCE_MS) anomalia = true
      if (t < maisVelho) maisVelho = t
    }

    const quality = weakestQuality([...snapshots.map((s) => s.quality_status), ...extraQuality])
    const ratios = snapshots.map((s) => s.coverage.ratio_bp)

    return {
      as_of: new Date(maisVelho).toISOString(),
      // Timestamp no futuro além da tolerância significa pipeline com relógio
      // errado. O dado pode estar certo, mas a idade dele é desconhecida — e
      // idade desconhecida não é "fresco", é insuficiente para afirmar.
      quality_status: anomalia ? "insufficient" : quality,
      data_age_hours: Math.max(0, Math.floor((agora - maisVelho) / 3_600_000)),
      coverage_ratio_bp: Math.min(...ratios),
      contract_version: CONTRACT_VERSION,
      source_systems: [...new Set(snapshots.map((s) => s.source_system))],
      clock_anomaly: anomalia,
    }
  }
}
