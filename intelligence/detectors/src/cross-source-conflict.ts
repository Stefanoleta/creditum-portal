/**
 * Detector B — divergência entre fontes governadas.
 *
 * ─── O que ele faz ───────────────────────────────────────────────────────────
 * detecta · mede · calcula materialidade · aponta evidência · classifica
 * qualidade · produz evento.
 *
 * ─── O que ele NÃO faz, e não pode fazer ─────────────────────────────────────
 * escolher qual fonte está certa · marcar conflito como resolvido · preencher
 * valor conciliado · inferir causa · alterar snapshot · chamar modelo.
 *
 * A regra que não tem exceção: **conflito detectado ⇒ `resolved: false`**.
 * Fechar um conflito é ato humano, registrado em `decision.conflict_resolutions`
 * — nunca dedução do detector, nem mesmo quando duas de três fontes concordam.
 *
 * Função pura: sem rede, sem disco, sem env, sem relógio implícito, sem
 * aleatoriedade, sem mutação. `detected_at` é entrada.
 */

import { GatewayError } from "../../gateway/src/errors"
import { toEvent } from "../../gateway/src/factory"
import type { Evidence, IntelligenceEvent, Snapshot } from "../../gateway/src/types"
import { compareVersions } from "./comparison"
import type { ComparableKind, ComparisonResult, NormalizedVersion, SourceVersion } from "./comparison"
import { conflictEventId, conflictId } from "./conflict-id"
import type { DisputeParticipant } from "./conflict-id"
import type { DetectorConfig, Severity } from "./config"
import { buildMateriality, shareOfTotalBp } from "./materiality"
import type { Materiality } from "./materiality"
import { classifySeverity } from "./severity"
import { isOk } from "./engine"

export const DETECTOR_ID = "det.cross_source_conflict"
/** SemVer. Muda quando a regra observável muda — nunca data nem hash. */
export const DETECTOR_VERSION = "1.0.0"

export interface Dispute {
  /** Nome governado do campo em disputa. Ex.: `sales_count`. */
  readonly field: string
  readonly kind: ComparableKind
  readonly versions: readonly SourceVersion[]
  /**
   * Consolidado do período, para `share_of_total_bp`.
   * Mesma unidade do `kind`. Ausente = participação não calculável.
   */
  readonly total_for_share?: number
}

export interface ConflictDetectorInput {
  /** Explícito: o detector não lê relógio. */
  readonly detected_at: string
  readonly period_start: string
  readonly period_end: string
  readonly disputes: readonly Dispute[]
  /** Conjunto governado que sustenta os refs. Não é o store inteiro. */
  readonly snapshots: readonly Snapshot[]
  readonly evidence: readonly Evidence[]
  readonly coverage_ratio_bp?: number
}

/**
 * Resumo completo de um conflito detectado.
 *
 * Carrega tudo que a auditoria precisa, inclusive para os NÃO materiais: id,
 * todas as versões com seus `evidence_ref`, as três dimensões de materialidade e
 * `resolved: false`. Um conflito abaixo do limiar continua sendo um conflito —
 * perder essa informação seria indistinguível de não ter detectado nada.
 */
export interface ConflictSummary {
  readonly conflict_id: string
  readonly field: string
  readonly kind: ComparableKind
  /** Escopo lógico da disputa — o que distingue dois datasets do mesmo período. */
  readonly participants: readonly DisputeParticipant[]
  readonly versions: readonly NormalizedVersion[]
  readonly distinct_reprs: readonly string[]
  readonly difference_absolute?: number
  readonly relative_difference_bp?: number
  readonly share_of_total_bp?: number
  readonly materiality: Materiality | null
  /** `null` quando não há base relativa governada para graduar. Ver `avaliar`. */
  readonly severity: Severity | null
  /** Presente exatamente quando `severity` é nula. */
  readonly severity_gap?: string
  readonly material: boolean
  /** Sempre false. O detector nunca fecha o que detectou. */
  readonly resolved: false
}

export interface NotComparableSummary {
  readonly field: string
  readonly kind: ComparableKind
  readonly reason: string
  readonly source_system?: string
}

export interface ConflictDetectionResult {
  /** Conflitos materiais, já validados contra o contrato. */
  readonly events: readonly IntelligenceEvent[]
  /** Detectados e abaixo do limiar. Registrados, não escondidos. */
  readonly non_material: readonly ConflictSummary[]
  /**
   * Conflitos MATERIAIS que não viraram Event por falta de severidade governada.
   *
   * Não são "não materiais": a divergência é real e passou do limiar. O que
   * falta é a base relativa para graduá-la, e a Fase 2.7 §6 proíbe inventá-la.
   * Ficam aqui, auditáveis, em vez de sumirem ou virarem `low`.
   */
  readonly material_not_emitted: readonly ConflictSummary[]
  /** Disputas que não puderam ser comparadas. Nunca viram conflito por omissão. */
  readonly not_comparable: readonly NotComparableSummary[]
}

// ─── Precondições ─────────────────────────────────────────────────────────────

/**
 * Valida o lastro antes de comparar qualquer coisa.
 *
 * Falha fechado: um conflito executivo sem evidência que o reproduza é uma
 * afirmação sem prova, e é pior que não detectar — chega ao humano com
 * aparência de rastreável e a trilha morre no vazio.
 */
/**
 * Escopo governado de um participante da disputa.
 *
 * Resolvido a partir do SNAPSHOT, nunca do rótulo que o chamador escreveu. É o
 * que impede uma versão de se declarar `google_sheets` usando um snapshot do
 * Bitrix — e é o que dá ao `conflict_id` a identidade lógica do dataset.
 */
interface EscopoGovernado {
  readonly source_system: string
  readonly dataset_id: string
}

function assertPrecondicoes(input: ConflictDetectorInput): Map<string, EscopoGovernado> {
  const problemas: string[] = []

  const snapshotPorId = new Map(input.snapshots.map((s) => [s.snapshot_id, s]))
  const evidencePorId = new Map(input.evidence.map((e) => [e.evidence_id, e]))
  const escopos = new Map<string, EscopoGovernado>()

  for (const disputa of input.disputes) {
    if (
      disputa.total_for_share !== undefined &&
      (!Number.isSafeInteger(disputa.total_for_share) || disputa.total_for_share < 0)
    ) {
      problemas.push(`${disputa.field}: total_for_share precisa ser inteiro exato não negativo`)
    }

    for (const v of disputa.versions) {
      const onde = `${disputa.field}/${v.source_system}`

      const snap = snapshotPorId.get(v.snapshot_id)
      if (snap === undefined) {
        problemas.push(`${onde}: snapshot inexistente no conjunto governado: ${v.snapshot_id}`)
        continue
      }

      // A fonte declarada pela versão tem que ser a do snapshot. Sem isto, um
      // chamador rotula um snapshot do Bitrix como `google_sheets` e o evento
      // executivo sai atribuindo a divergência à fonte errada.
      if (v.source_system !== snap.source_system) {
        problemas.push(
          `${onde}: versão declara fonte "${v.source_system}" mas o snapshot ${v.snapshot_id} é de "${snap.source_system}"`,
        )
      }

      const ev = evidencePorId.get(v.evidence_ref)
      if (ev === undefined) {
        problemas.push(`${onde}: evidência inexistente: ${v.evidence_ref}`)
        continue
      }

      // Ownership da Fase 1: a evidência pertence ao snapshot declarado.
      if (ev.snapshot_id !== v.snapshot_id) {
        problemas.push(
          `${onde}: evidência ${v.evidence_ref} pertence ao snapshot ${ev.snapshot_id}, não a ${v.snapshot_id}`,
        )
        continue
      }

      // E o localizador aponta para o dataset do snapshot. Sem isto uma
      // evidência da planilha financeira sustenta uma versão do pipeline: o
      // contrato de evento não tem como perceber, e o número chega ao humano
      // ancorado em dado que a versão nunca observou.
      if (ev.locator.dataset_id !== snap.dataset_id) {
        problemas.push(
          `${onde}: evidência ${v.evidence_ref} localiza o dataset "${ev.locator.dataset_id}" mas o snapshot é do dataset "${snap.dataset_id}"`,
        )
      }

      escopos.set(v.snapshot_id, {
        source_system: snap.source_system,
        dataset_id: snap.dataset_id,
      })
    }
  }

  if (problemas.length > 0) {
    throw new GatewayError("SCHEMA_INVALID", "Lastro insuficiente para detectar conflito", problemas)
  }

  return escopos
}

// ─── Materialidade e severidade ───────────────────────────────────────────────

const KIND_TO_BASIS = {
  count: "count",
  cents: "amount_cents",
  basis_points: "ratio_bp",
} as const

interface Avaliacao {
  readonly materiality: Materiality | null
  /**
   * `null` quando não há base governada para graduar.
   *
   * Fase 2.7, §6: nenhuma severidade é fabricada. Antes desta correção o cálculo
   * era `classifySeverity(escala, shareBp ?? relativaBp ?? 0)` — o `?? 0` fazia
   * um conflito sem medida relativa computável ser classificado pela primeira
   * banda. Sob a escala aprovada isso vira `low`, um número executivo saído de
   * uma base que não existe. A/C/D já falhavam fechado nesse ponto; B era o
   * único que preenchia o buraco.
   */
  readonly severity: Severity | null
  /** Por que não houve severidade. Presente exatamente quando `severity` é nula. */
  readonly severity_gap?: string
  readonly material: boolean
  /** Divergência entre as versões. Dimensão (B). */
  readonly relative_difference_bp?: number
  /** Participação num total real. Dimensão (C). Ausente quando não há total. */
  readonly share_of_total_bp?: number
}

/**
 * Separa "há conflito" de "o conflito é material".
 *
 * Campo estrutural (data, identidade) não tem diferença pequena: ou bate ou não.
 * Por isso ele é material por pertencer à lista, não por tamanho — e a
 * severidade vem de `structural_severity`, já que dias não se convertem em
 * basis points sem inventar uma taxa.
 */
function avaliar(
  disputa: Dispute,
  comparacao: Extract<ComparisonResult, { status: "conflict" }>,
  config: DetectorConfig,
): Avaliacao {
  const cfg = config.crossSourceConflict
  const estrutural = cfg.structural_fields.includes(disputa.field)

  if (comparacao.kind === "date" || comparacao.kind === "canonical_id") {
    // Conflito de data ou de identidade não tem denominador: a diferença é em
    // dias ou em "são dois valores distintos", não em proporção. As bandas
    // aprovadas na Fase 2.7 são relativas e não se aplicam aqui, e a Política
    // Creditum v1 não decidiu um valor próprio. Sem decisão, sem severidade.
    return {
      materiality: { basis: "count", count: comparacao.distinct_reprs.length },
      severity: cfg.structural_severity ?? null,
      ...(cfg.structural_severity === undefined
        ? { severity_gap: "conflito estrutural: severidade não decidida pela política" }
        : {}),
      material: estrutural,
    }
  }

  const amplitude = comparacao.difference_absolute ?? 0
  const basis = KIND_TO_BASIS[comparacao.kind]

  // (C) Participação num TOTAL real. Só existe quando a disputa declara um.
  const share =
    disputa.total_for_share === undefined || disputa.total_for_share === 0
      ? undefined
      : shareOfTotalBp(amplitude, disputa.total_for_share, "amplitude / consolidado_do_periodo")

  const shareBp = share !== undefined && isOk(share) ? share.value.bps : undefined

  // Amplitude maior que o total declarado é entrada incoerente: a divergência de
  // uma parte não pode superar o todo do qual ela participa. Falha fechado em
  // vez de gravar um basis point fora da faixa do contrato.
  if (shareBp !== undefined && shareBp > 10000) {
    throw new GatewayError(
      "SCHEMA_INVALID",
      `Amplitude maior que o total declarado em "${disputa.field}"`,
      [`amplitude ${amplitude} sobre total ${String(disputa.total_for_share)} = ${shareBp} bp`],
    )
  }

  // (B) Divergência RELATIVA entre as versões. Dimensão diferente de (C): mede
  // quanto as fontes discordam entre si, não quanto isso pesa no consolidado.
  const relativaBp =
    comparacao.relative_difference_bp !== undefined && isOk(comparacao.relative_difference_bp)
      ? comparacao.relative_difference_bp.value
      : undefined

  // `share_of_total_bp` só entra na materialidade quando há total REAL. Nunca
  // como sinônimo da diferença relativa.
  const materiality = buildMateriality(
    basis === "amount_cents" || basis === "count"
      ? { basis, value: { ok: true, dataClass: "observed", value: amplitude } }
      : {
          basis,
          value: {
            ok: true,
            dataClass: "observed",
            value: { bps: amplitude, numerator: amplitude, denominator: 1 },
          },
        },
    share,
  )

  // (A) Diferença ABSOLUTA, cada unidade com seu limiar. `basis_points` tem o
  // seu próprio: comparar diferença absoluta em bp contra um limiar de
  // participação seria erro dimensional.
  const limiarAbsoluto =
    basis === "amount_cents"
      ? cfg.material_amount_cents
      : basis === "count"
        ? cfg.material_absolute_count
        : cfg.material_absolute_basis_points

  const material =
    estrutural ||
    amplitude >= limiarAbsoluto ||
    (relativaBp !== undefined && relativaBp >= cfg.material_relative_difference_bp) ||
    (shareBp !== undefined && shareBp >= cfg.material_share_bp)

  // Severidade sobre medida RELATIVA: participação quando há total real, senão
  // divergência relativa. As duas são proporções em bp — mesma dimensão.
  //
  // Quando NENHUMA das duas é computável, não há base. Um conflito material só
  // por diferença absoluta — R$ 80 mil entre duas fontes, sem total declarado e
  // sem divergência relativa calculável — é material de verdade, e continua
  // sendo reportado como fato; o que não sai é um número de gravidade inventado
  // a partir de zero.
  const base = shareBp ?? relativaBp
  return {
    materiality,
    severity: base === undefined ? null : classifySeverity(cfg.severity_by_relative_bp, base),
    ...(base === undefined
      ? { severity_gap: "sem medida relativa: nem participação num total nem divergência relativa" }
      : {}),
    material,
    ...(relativaBp === undefined ? {} : { relative_difference_bp: relativaBp }),
    ...(shareBp === undefined ? {} : { share_of_total_bp: shareBp }),
  }
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export function detectCrossSourceConflicts(
  input: ConflictDetectorInput,
  config: DetectorConfig,
): ConflictDetectionResult {
  const escopos = assertPrecondicoes(input)

  const events: IntelligenceEvent[] = []
  const naoMateriais: ConflictSummary[] = []
  const materiaisSemSeveridade: ConflictSummary[] = []
  const naoComparaveis: NotComparableSummary[] = []

  for (const disputa of input.disputes) {
    const comparacao = compareVersions(disputa.kind, disputa.versions)

    if (comparacao.status === "equal") continue

    if (comparacao.status === "not_comparable") {
      // NÃO vira conflito. "Não consegui comparar" e "as fontes discordam" são
      // afirmações diferentes, e trocar uma pela outra inventa divergência.
      naoComparaveis.push({
        field: disputa.field,
        kind: disputa.kind,
        reason: comparacao.reason,
        ...(comparacao.source_system === undefined ? {} : { source_system: comparacao.source_system }),
      })
      continue
    }

    // Escopo lógico: fonte e dataset vêm do SNAPSHOT governado, não do rótulo
    // que o chamador escreveu. É o que separa duas planilhas do mesmo mês.
    const participants: DisputeParticipant[] = comparacao.versions.map((v) => {
      const escopo = escopos.get(v.snapshot_id)
      if (escopo === undefined) {
        throw new GatewayError("SCHEMA_INVALID", "Escopo governado ausente", [v.snapshot_id])
      }
      return {
        source_system: escopo.source_system,
        dataset_id: escopo.dataset_id,
        value_repr: v.value_repr,
      }
    })

    const id = conflictId({
      field: disputa.field,
      kind: disputa.kind,
      period_start: input.period_start,
      period_end: input.period_end,
      versions: participants,
    })

    const avaliacao = avaliar(disputa, comparacao, config)
    const { materiality, severity, material } = avaliacao

    const resumo: ConflictSummary = Object.freeze({
      conflict_id: id,
      field: disputa.field,
      kind: disputa.kind,
      participants: Object.freeze(participants),
      versions: comparacao.versions,
      distinct_reprs: comparacao.distinct_reprs,
      ...(comparacao.difference_absolute === undefined
        ? {}
        : { difference_absolute: comparacao.difference_absolute }),
      ...(avaliacao.relative_difference_bp === undefined
        ? {}
        : { relative_difference_bp: avaliacao.relative_difference_bp }),
      ...(avaliacao.share_of_total_bp === undefined
        ? {}
        : { share_of_total_bp: avaliacao.share_of_total_bp }),
      materiality,
      severity,
      ...(avaliacao.severity_gap === undefined ? {} : { severity_gap: avaliacao.severity_gap }),
      material,
      resolved: false as const,
    })

    if (!material || materiality === null) {
      naoMateriais.push(resumo)
      continue
    }

    // Material, mas sem severidade governada. O contrato de Event exige
    // `severity`, e a Fase 2.7 §6 proíbe fabricá-la. O conflito não se perde:
    // sai como fato material não emitido, com o motivo tipado. É a mesma escolha
    // do low-ticket enquanto sua severidade esteve pendente.
    if (severity === null) {
      materiaisSemSeveridade.push(resumo)
      continue
    }

    events.push(construirEvento(input, disputa, comparacao, { ...resumo, severity }, materiality))
  }

  return {
    events: Object.freeze(events),
    non_material: Object.freeze(naoMateriais),
    material_not_emitted: Object.freeze(materiaisSemSeveridade),
    not_comparable: Object.freeze(naoComparaveis),
  }
}

/**
 * Constrói o evento e o faz passar pelo caminho validado da Fase 1.
 *
 * O objeto nasce como `unknown` e só vira `IntelligenceEvent` depois de
 * `toEvent` — contrato mais invariantes semânticas. Não existe `as Event`.
 */
function construirEvento(
  input: ConflictDetectorInput,
  disputa: Dispute,
  comparacao: Extract<ComparisonResult, { status: "conflict" }>,
  resumo: ConflictSummary,
  materiality: Materiality,
): IntelligenceEvent {
  const snapshotIds = [...new Set(comparacao.versions.map((v) => v.snapshot_id))].sort()
  const evidenceRefs = [...new Set(comparacao.versions.map((v) => v.evidence_ref))].sort()

  const bruto: unknown = {
    event_id: conflictEventId(resumo.conflict_id),
    event_type: "data_quality_conflict",
    detector_id: DETECTOR_ID,
    detector_version: DETECTOR_VERSION,
    snapshot_ids: snapshotIds,
    period_start: input.period_start,
    period_end: input.period_end,
    detected_at: input.detected_at,
    severity: resumo.severity,
    materiality,
    observed_metric: {
      name: "amplitude_entre_fontes",
      data_class: "calculated",
      unit: unidadeDe(disputa.kind),
      value: comparacao.difference_absolute ?? comparacao.distinct_reprs.length,
      formula: "MAX(versoes) - MIN(versoes)",
    },
    // A referência é a versão conciliada — que NÃO existe, por construção.
    // Declarar lacuna com motivo é o que impede o consumidor de tratar uma das
    // versões como a correta.
    reference_metric: {
      name: "valor_conciliado",
      data_class: "gap",
      gap_reason: "DATA_CONFLICT",
    },
    evidence_refs: evidenceRefs,
    data_quality: {
      quality_status: "conflicted",
      conflict_ids: [resumo.conflict_id],
      ...(input.coverage_ratio_bp === undefined
        ? {}
        : { coverage_ratio_bp: input.coverage_ratio_bp }),
    },
  }

  return toEvent(bruto, { now: new Date(input.detected_at) })
}

function unidadeDe(kind: ComparableKind): "cents" | "count" | "basis_points" | "days" {
  switch (kind) {
    case "cents":
      return "cents"
    case "basis_points":
      return "basis_points"
    case "date":
      return "days"
    default:
      return "count"
  }
}
