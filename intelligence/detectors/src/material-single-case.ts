/**
 * Detector D — caso único material.
 *
 * Responde a UMA pergunta, aritmeticamente:
 *
 *   "Quanto este agregado seria diferente se este caso não estivesse no conjunto?"
 *
 * ─── Contrafactual aritmético NÃO é causalidade ────────────────────────────────
 *
 * O detector remove um item do conjunto OBSERVADO e recalcula. É subtração, não
 * um modelo. Ele não afirma que o caso *causou* o resultado, que sem ele o mês
 * teria sido diferente, que é fraude, anomalia, ou que deve ser removido de
 * lugar algum. A distinção não é retórica: "este caso responde por 40% do
 * volume" é verificável por aritmética; "este caso causou a queda" é uma
 * hipótese sobre o mundo, e o detector não tem como sustentá-la.
 *
 * Por isso o vocabulário publicado é `aggregate_without_item` e
 * `delta_if_excluded`, nunca `caused`, `responsible_for` ou `would_have`.
 *
 * ─── Três grandezas que não se substituem ─────────────────────────────────────
 *
 *   delta                  com − sem, na unidade do agregado        (ABSOLUTO)
 *   relative_delta_bp      delta ÷ agregado SEM o item              (MUDANÇA)
 *   share_of_total_bp      delta ÷ agregado COM o item              (PARTE)
 *
 * As duas últimas se expressam em basis points e respondem a perguntas
 * diferentes. A mudança relativa pode ser negativa (remover um estorno LEVANTA o
 * agregado) e pode passar de 10000 bp (um caso que triplica a média). A
 * participação, quando existe, está sempre em `[0, 10000]`. Só a segunda cabe
 * num campo `basis_points` do contrato — e só quando é de fato parte-do-todo.
 *
 * Função pura: sem rede, disco, env, relógio implícito, aleatoriedade ou mutação.
 * Só `observed`, `calculated` e `gap` — nenhuma inferência, nenhuma previsão.
 */

import { GatewayError } from "../../gateway/src/errors"
import { toEvent } from "../../gateway/src/factory"
import { deepFreeze } from "../../gateway/src/immutability"
import type { Evidence, IntelligenceEvent, Snapshot } from "../../gateway/src/types"
import type { CanonicalUnitResult } from "./canonical-units"
import type {
  DetectorConfig,
  Severity,
  SingleCaseMetric,
  SingleCaseSeverityDimension,
} from "./config"
import { counterfactual, countAggregator, meanAggregator, sumAggregator } from "./counterfactual"
import { indexCounterfactualProvenance } from "./counterfactual-provenance"
import type { ComputedEvidenceProvenance } from "./counterfactual-provenance"
import { gap, isOk } from "./engine"
import type { Metric } from "./engine"
import { isPartOfWhole } from "./part-of-whole"
import type { SeverityScale } from "./config"
import { classifySeverity } from "./severity"
import { compareCodeUnits, structuralId, structuralMaterial } from "./structural-id"

export const DETECTOR_ID = "det.material_single_case"
/** SemVer. Muda quando a regra observável muda — nunca data nem hash. */
export const DETECTOR_VERSION = "1.0.0"

const EVENT_TYPE = "material_single_case"

// ─── Entrada ──────────────────────────────────────────────────────────────────

export interface CaseRecord {
  /** Pseudônimo estável. NUNCA nome, CPF, telefone ou e-mail. */
  readonly subject_ref: string
  /** Já canonicalizada por D13. O detector não executa heurística própria. */
  readonly unit: CanonicalUnitResult
  /** Ausente = `null`. Nunca zero por omissão. */
  readonly amount_cents: number | null
  readonly evidence_refs: readonly string[]
  readonly snapshot_id: string
}

/** Agregador realmente executado. Fechado, e parte do binding. */
export type SingleCaseAggregator = "sum" | "mean" | "count"

/** Escopo governado de agregação. */
export interface GovernedScope {
  readonly source_system: string
  readonly dataset_id: string
}

/**
 * Vínculo entre UM candidato e a evidência que sustenta o agregado sem ele.
 *
 * ─── Por que texto de fórmula não serve ───────────────────────────────────────
 *
 * A versão anterior aceitava uma evidência `computed` global e a reusava para
 * todos os candidatos. Uma evidência cuja fórmula descrevia "soma sem X"
 * sustentava também o evento de Y: o executivo leria um número calculado para
 * outro caso. Casar strings de fórmula não resolve — fórmula é prosa, e prosa
 * não é autoridade de associação.
 *
 * O binding ESTRUTURADO é a autoridade. Cada campo abaixo é comparado por
 * igualdade contra o que o detector realmente executou; nenhum é inferido de
 * texto, nenhum é opcional, e não existe `metadata` livre onde algo possa se
 * esconder.
 *
 * Vive no input governado do detector, NÃO em `evidence.schema.json`: `Evidence`
 * é um contrato de localização de dado, compartilhado por todos os consumidores,
 * e não precisa carregar a semântica de um contrafactual para todos eles.
 */
export interface CounterfactualBinding {
  /** A evidência `computed` que registra a computação. */
  readonly evidence_ref: string
  /** O candidato EXCLUÍDO do agregado. É isto que faltava antes. */
  readonly subject_ref: string
  readonly metric: SingleCaseMetric
  readonly aggregator: SingleCaseAggregator
  /** Única operação suportada. Fechada de propósito. */
  readonly operation: "exclude_subject"
  readonly period_start: string
  readonly period_end: string
  /** Escopo governado que o agregado atravessa. */
  readonly scope: readonly GovernedScope[]
}

export interface UnitCoverage {
  readonly expected_units: number
  readonly reporting_units: number
  readonly ratio_bp: number
}

export interface MaterialSingleCaseInput {
  readonly detected_at: string
  readonly period_start: string
  readonly period_end: string
  /** Qual agregado está sendo analisado. Precisa estar em `supported_metrics`. */
  readonly metric: SingleCaseMetric
  readonly cases: readonly CaseRecord[]
  /** Conjunto governado que sustenta os refs. Não é o store inteiro. */
  readonly snapshots: readonly Snapshot[]
  readonly evidence: readonly Evidence[]
  /** Evidência do agregado COM o item — número que a fonte sustenta. */
  readonly aggregate_evidence_ref: string
  /**
   * Um binding POR candidato. Não existe evidência contrafactual reutilizável.
   *
   * Cada agregado sem um item é um número diferente, que nenhuma fonte publicou.
   * Uma evidência só pode provar UMA dessas computações.
   */
  readonly counterfactual_bindings: readonly CounterfactualBinding[]
  /**
   * Âncora GOVERNADA `evidence_ref → computation_id`.
   *
   * Produzida por quem CALCULOU a evidência, não por quem a consome. Sem ela o
   * binding é só afirmação do chamador, e um binding coerente para Y pode
   * apontar para a evidência de X sem ninguém perceber — foi o furo que o gate
   * da Fase 2.4 encontrou. Ver `counterfactual-provenance.ts`.
   */
  readonly counterfactual_provenance: readonly ComputedEvidenceProvenance[]
  readonly unit_coverage?: UnitCoverage
}

// ─── Saída ────────────────────────────────────────────────────────────────────

/** Por que um candidato não rendeu evento. Tipada, nunca string livre. */
export type NotEmittedReason =
  | "NOT_MATERIAL"
  | "SEVERITY_DIMENSION_UNAVAILABLE"
  | "DATA_NOT_AVAILABLE"
  | "NOT_COMPARABLE"

export type CaseOutcome = "material" | "not_material" | "not_comparable"

export interface CaseImpact {
  readonly subject_ref: string
  /**
   * Nome de exibição do CATÁLOGO governado, nunca da fonte. Omitido quando D13
   * não resolveu — candidato `unknown`/`ambiguous` não é promovido a identidade.
   */
  readonly unit?: string
  readonly aggregate_with_item: Metric<number>
  readonly aggregate_without_item: Metric<number>
  /** com − sem, na unidade do agregado. */
  readonly delta: Metric<number>
  /** delta ÷ agregado SEM o item. Pode ser negativo ou passar de 10000 bp. */
  readonly relative_delta_bp: Metric<number>
  /** delta ÷ agregado COM o item — só quando é parte-do-todo de verdade. */
  readonly share_of_total_bp: Metric<number>
  readonly outcome: CaseOutcome
  /** `null` quando a dimensão configurada é lacuna. Nunca fabricada. */
  readonly severity: Severity | null
  readonly severity_gap?: string
  readonly emitted: boolean
  readonly not_emitted_reason?: NotEmittedReason
  /** Cópia detector-owned. Nunca a referência do chamador. */
  readonly evidence_refs: readonly string[]
  /** A evidência que sustenta o agregado SEM ESTE caso. Por candidato. */
  readonly counterfactual_evidence_ref: string
  /** Identidade determinística da computação contrafactual deste candidato. */
  readonly counterfactual_computation_id: string
}

export interface SingleCaseSummary {
  readonly metric: SingleCaseMetric
  readonly severity_dimension: SingleCaseSeverityDimension
  readonly candidates_evaluated: number
  readonly material: number
  readonly not_material: number
  readonly not_comparable: number
  readonly emitted: number
  readonly quality_status: "ok" | "degraded" | "conflicted" | "insufficient"
  /** Casos sem valor, quando a métrica depende de valor. Contados, não escondidos. */
  readonly missing_amount: number
}

export interface MaterialSingleCaseResult {
  readonly events: readonly IntelligenceEvent[]
  /** TODOS os candidatos avaliados, materiais ou não. Nada descartado em silêncio. */
  readonly evaluated: readonly CaseImpact[]
  readonly summary: SingleCaseSummary
}

// ─── Fórmulas ─────────────────────────────────────────────────────────────────
//
// Descrevem exatamente a operação executada, e nada além dela. Sem limiar
// embutido, sem linguagem causal.

interface EspecificacaoMetrica {
  /** Nome legível da operação, para mensagens de lacuna. */
  readonly rotulo: string
  /** Agregador executado. Comparado contra o binding, nunca inferido. */
  readonly aggregator: SingleCaseAggregator
  /** Agregador exato do motor. */
  readonly agregar: (casos: readonly CaseRecord[]) => Metric<number>
  readonly formula_with: string
  readonly formula_without: string
  /**
   * A participação faz sentido nesta métrica?
   *
   * Para SOMA e CONTAGEM, `delta ÷ com` é a fração do total que o caso
   * representa. Para MÉDIA não é: `(média_com − média_sem) ÷ média_com` é uma
   * mudança relativa, não uma parte de um todo. Publicá-la como participação
   * seria erro dimensional — o mesmo que os gates anteriores encontraram.
   */
  readonly share_faz_sentido: boolean
  /** A métrica depende do valor monetário de cada caso? */
  readonly depende_de_valor: boolean
  readonly unidade: "cents" | "count"
}

const FORMULA_SEM = "except the subject case"

/**
 * Valores exatos, ou nada.
 *
 * Um único valor ausente torna a lista inteira indisponível. O detector já
 * bloqueia isso antes de chamar o agregador, mas a guarda mora aqui também: um
 * `?? 0` neste ponto faria a soma parecer completa, e o caso faltante parecer
 * neutro. Defesa em profundidade, não redundância — quem editar o chamador
 * amanhã não reabre o furo.
 */
function valoresExatos(casos: readonly CaseRecord[]): number[] | null {
  const valores: number[] = []
  for (const c of casos) {
    if (c.amount_cents === null) return null
    valores.push(c.amount_cents)
  }
  return valores
}

function lacunaSemValor(): Metric<number> {
  return gap<number>(
    "DATA_NOT_AVAILABLE",
    "calculated",
    "ao menos um caso sem valor: o agregado não é somável",
  )
}

const ESPECIFICACOES: Readonly<Record<SingleCaseMetric, EspecificacaoMetrica>> = Object.freeze({
  amount_sum_cents: {
    rotulo: "soma",
    aggregator: "sum",
    agregar: (casos) => {
      const v = valoresExatos(casos)
      return v === null ? lacunaSemValor() : sumAggregator(v)
    },
    formula_with: "sum(amount_cents of all eligible cases)",
    formula_without: `sum(amount_cents of all eligible cases ${FORMULA_SEM})`,
    share_faz_sentido: true,
    depende_de_valor: true,
    unidade: "cents",
  },
  amount_mean_cents: {
    rotulo: "média",
    aggregator: "mean",
    agregar: (casos) => {
      const v = valoresExatos(casos)
      return v === null ? lacunaSemValor() : meanAggregator(v)
    },
    formula_with: "sum(amount_cents of all eligible cases) / count(all eligible cases)",
    formula_without: `sum(amount_cents ${FORMULA_SEM}) / count(all eligible cases ${FORMULA_SEM})`,
    share_faz_sentido: false,
    depende_de_valor: true,
    unidade: "cents",
  },
  case_count: {
    rotulo: "contagem",
    aggregator: "count",
    agregar: (casos) => countAggregator(casos),
    formula_with: "count(all eligible cases)",
    formula_without: `count(all eligible cases ${FORMULA_SEM})`,
    share_faz_sentido: true,
    depende_de_valor: false,
    unidade: "count",
  },
})

const FORMULA_DELTA = "aggregate_with_item - aggregate_without_item"
const FORMULA_RELATIVE = `(${FORMULA_DELTA}) / aggregate_without_item`
const FORMULA_SHARE = `(${FORMULA_DELTA}) / aggregate_with_item`

// ─── Precondições ─────────────────────────────────────────────────────────────

interface EscopoGovernado {
  readonly source_system: string
  readonly dataset_id: string
}

/**
 * Lastro e escopo. Falha fechada, com todos os problemas de uma vez.
 *
 * Devolve os escopos `(snapshot_id → source/dataset)` de onde os casos vieram —
 * é o escopo de agregação, e é ele que a evidência agregada tem de sustentar.
 */
function assertPrecondicoes(input: MaterialSingleCaseInput): Map<string, EscopoGovernado> {
  const problemas: string[] = []
  const snapshotPorId = new Map(input.snapshots.map((s) => [s.snapshot_id, s]))
  const evidencePorId = new Map(input.evidence.map((e) => [e.evidence_id, e]))
  const escopos = new Map<string, EscopoGovernado>()

  for (const c of input.cases) {
    const onde = `caso ${c.subject_ref}`

    if (!/^subj_[a-f0-9]{16}$/.test(c.subject_ref)) {
      problemas.push(`${onde}: subject_ref precisa ser pseudônimo estável`)
    }

    const snap = snapshotPorId.get(c.snapshot_id)
    if (snap === undefined) {
      problemas.push(`${onde}: snapshot inexistente no conjunto governado: ${c.snapshot_id}`)
      continue
    }

    if (c.evidence_refs.length === 0) {
      problemas.push(`${onde}: sem evidência — nenhum número individual sem lastro`)
    }
    for (const ref of c.evidence_refs) {
      const ev = evidencePorId.get(ref)
      if (ev === undefined) {
        problemas.push(`${onde}: evidência inexistente: ${ref}`)
        continue
      }
      if (ev.snapshot_id !== c.snapshot_id) {
        problemas.push(
          `${onde}: evidência ${ref} pertence ao snapshot ${ev.snapshot_id}, não a ${c.snapshot_id}`,
        )
        continue
      }
      if (ev.locator.dataset_id !== snap.dataset_id) {
        problemas.push(
          `${onde}: evidência ${ref} localiza o dataset "${ev.locator.dataset_id}" mas o snapshot é do dataset "${snap.dataset_id}"`,
        )
      }
    }

    escopos.set(c.snapshot_id, {
      source_system: snap.source_system,
      dataset_id: snap.dataset_id,
    })
  }

  conferirEvidenciaAgregada(
    input.aggregate_evidence_ref,
    "agregado com o item",
    evidencePorId,
    escopos,
    problemas,
  )

  conferirBindings(input, evidencePorId, escopos, problemas)

  if (problemas.length > 0) {
    throw new GatewayError("SCHEMA_INVALID", "Lastro insuficiente para medir impacto de caso único", problemas)
  }

  return escopos
}

function conferirEvidenciaAgregada(
  ref: string,
  rotulo: string,
  evidencePorId: ReadonlyMap<string, Evidence>,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  problemas: string[],
): void {
  const ev = evidencePorId.get(ref)
  if (ev === undefined) {
    problemas.push(`${rotulo}: evidência inexistente: ${ref}`)
    return
  }
  if (ev.kind !== "computed" && ev.kind !== "aggregate") {
    problemas.push(
      `${rotulo}: evidência ${ref} é do tipo "${ev.kind}"; agregado exige computed ou aggregate`,
    )
    return
  } else if (ev.kind === "computed" && ev.formula === undefined) {
    problemas.push(`${rotulo}: evidência computed sem fórmula`)
    return
  }

  const alvos = [...escopos.entries()]
  if (alvos.length > 1) {
    // FALHA FECHADA, e não escolha arbitrária — a mesma lição do Detector A.
    //
    // `Evidence.locator` carrega UM `dataset_id`. Um agregado que atravessa dois
    // datasets não é sustentado por uma evidência que aponta para um deles: o
    // outro lado da soma fica sem lastro e o evento afirma um número mais amplo
    // que sua prova.
    //
    // LIMITAÇÃO REGISTRADA: agregação multi-dataset exige contrato de evidência
    // com escopo composto. Decisão de arquitetura pendente.
    const legivel = alvos
      .map(([snap, e]) => `${snap}/${e.dataset_id}`)
      .sort(compareCodeUnits)
      .join(", ")
    problemas.push(
      `${rotulo}: os casos cobrem ${alvos.length} escopos governados (${legivel}), ` +
        `mas o localizador de evidência expressa um único dataset_id. Falha fechada.`,
    )
    return
  }

  const [unico] = alvos
  if (unico === undefined) return // sem casos: nenhum agregado é afirmado

  const [snapshotDaAgregacao, escopo] = unico
  if (ev.snapshot_id !== snapshotDaAgregacao) {
    problemas.push(
      `${rotulo}: evidência ${ref} pertence ao snapshot ${ev.snapshot_id}, mas o agregado é do snapshot ${snapshotDaAgregacao}`,
    )
  }
  if (ev.locator.dataset_id !== escopo.dataset_id) {
    problemas.push(
      `${rotulo}: evidência ${ref} localiza o dataset "${ev.locator.dataset_id}", mas o agregado é do dataset "${escopo.dataset_id}"`,
    )
  }
}

/**
 * Identidade determinística da COMPUTAÇÃO contrafactual.
 *
 * Estruturada, nunca por gramática de delimitador. `evidence_ref` fica FORA de
 * propósito: a identidade é da computação, não do registro que a documenta —
 * reingerir o mesmo dataset lógico produz a mesma computação com outra evidência.
 */
export function counterfactualComputationId(b: CounterfactualBinding): string {
  return structuralId(
    "creditum:material_single_case:counterfactual:v1",
    {
      detector: DETECTOR_ID,
      metric: b.metric,
      aggregator: b.aggregator,
      operation: b.operation,
      subject_ref: b.subject_ref,
      period_start: b.period_start,
      period_end: b.period_end,
      scope: escopoCanonico(b.scope),
    },
    "cfc",
  )
}

/** Ordem estável por unidade de código — nunca locale. */
function escopoCanonico(scope: readonly GovernedScope[]): readonly GovernedScope[] {
  return [...scope]
    .map((e) => ({ source_system: e.source_system, dataset_id: e.dataset_id }))
    .sort(
      (a, b) =>
        compareCodeUnits(a.source_system, b.source_system) ||
        compareCodeUnits(a.dataset_id, b.dataset_id),
    )
}

/**
 * O binding contrafactual de CADA candidato, validado campo a campo.
 *
 * Cada comparação abaixo é igualdade estrutural contra o que o detector
 * realmente vai executar. Nenhuma é inferida da fórmula: se o binding diz
 * `metric: "case_count"` e o detector está somando centavos, a evidência não
 * sustenta esta computação — mesmo que a fórmula pareça convincente.
 */
function conferirBindings(
  input: MaterialSingleCaseInput,
  evidencePorId: ReadonlyMap<string, Evidence>,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  problemas: string[],
): void {
  const spec = ESPECIFICACOES[input.metric]
  const escopoReal = escopoCanonico(
    [...escopos.values()].map((e) => ({ source_system: e.source_system, dataset_id: e.dataset_id })),
  )
  const escopoRealSerial = structuralMaterial(escopoReal)

  // A âncora governada. Validada antes de qualquer comparação: aceitar a
  // estrutura sem conferir trocaria um dado forjável por outro.
  const ancora = indexCounterfactualProvenance(input.counterfactual_provenance)

  const porSujeito = new Map<string, CounterfactualBinding[]>()
  for (const b of input.counterfactual_bindings) {
    const lista = porSujeito.get(b.subject_ref) ?? []
    lista.push(b)
    porSujeito.set(b.subject_ref, lista)
  }

  // Uma evidência computed registra UMA computação. Duas computações distintas
  // apontando para a mesma evidência significam que ao menos uma delas não tem
  // lastro — exatamente o furo que este gate encontrou.
  const porEvidencia = new Map<string, string[]>()
  for (const b of input.counterfactual_bindings) {
    const ids = porEvidencia.get(b.evidence_ref) ?? []
    ids.push(counterfactualComputationId(b))
    porEvidencia.set(b.evidence_ref, ids)
  }
  for (const [ref, ids] of porEvidencia) {
    const distintas = new Set(ids)
    if (distintas.size > 1) {
      problemas.push(
        `contrafactual: evidência ${ref} é declarada para ${distintas.size} computações distintas; ` +
          `uma evidência calculada prova UM número`,
      )
    }
  }

  if (input.counterfactual_bindings.some((b) => b.evidence_ref === input.aggregate_evidence_ref)) {
    problemas.push(
      "contrafactual: a evidência do agregado SEM o item não pode ser a mesma do agregado COM o item — " +
        "são dois números distintos, e um deles é calculado",
    )
  }

  for (const c of input.cases) {
    const onde = `contrafactual de ${c.subject_ref}`
    const candidatos = porSujeito.get(c.subject_ref) ?? []

    if (candidatos.length === 0) {
      problemas.push(`${onde}: sem binding contrafactual — nenhum agregado sem o item sem lastro`)
      continue
    }
    if (candidatos.length > 1) {
      problemas.push(`${onde}: ${candidatos.length} bindings para o mesmo candidato; a associação precisa ser única`)
      continue
    }

    const b = candidatos[0]
    if (b === undefined) continue

    if (b.metric !== input.metric) {
      problemas.push(`${onde}: binding declara a métrica "${b.metric}", mas o agregado é "${input.metric}"`)
    }
    if (b.aggregator !== spec.aggregator) {
      problemas.push(
        `${onde}: binding declara o agregador "${b.aggregator}", mas a métrica "${input.metric}" usa "${spec.aggregator}"`,
      )
    }
    if (b.operation !== "exclude_subject") {
      problemas.push(`${onde}: operação "${String(b.operation)}" não é suportada`)
    }
    if (b.period_start !== input.period_start || b.period_end !== input.period_end) {
      problemas.push(
        `${onde}: binding declara o período ${b.period_start}..${b.period_end}, mas o agregado é de ${input.period_start}..${input.period_end}`,
      )
    }
    if (structuralMaterial(escopoCanonico(b.scope)) !== escopoRealSerial) {
      problemas.push(
        `${onde}: o escopo declarado no binding não é o escopo governado do agregado`,
      )
    }

    const ev = evidencePorId.get(b.evidence_ref)
    if (ev === undefined) {
      problemas.push(`${onde}: evidência inexistente: ${b.evidence_ref}`)
      continue
    }
    if (ev.kind !== "computed") {
      problemas.push(
        `${onde}: evidência ${b.evidence_ref} é do tipo "${ev.kind}"; um número calculado exige computed`,
      )
      continue
    }
    if (ev.formula === undefined) {
      problemas.push(`${onde}: evidência computed sem fórmula`)
      continue
    }
    conferirEvidenciaAgregada(b.evidence_ref, onde, evidencePorId, escopos, problemas)

    // ── A âncora, e o que ela fecha ────────────────────────────────────────
    //
    // Tudo acima confere o binding contra a computação que o detector VAI
    // executar — as duas pontas vêm do mesmo lado, então nada disso prova que a
    // evidência foi produzida para ESTA computação. A comparação abaixo é a
    // única que usa um dado que o chamador não escreveu.
    const esperada = counterfactualComputationId(b)
    const ancorada = ancora.get(b.evidence_ref)
    if (ancorada === undefined) {
      problemas.push(
        `${onde}: evidência ${b.evidence_ref} sem provenance governada — nenhuma evidência calculada sem âncora`,
      )
      continue
    }
    if (ancorada !== esperada) {
      problemas.push(
        `${onde}: a evidência ${b.evidence_ref} documenta a computação ${ancorada}, ` +
          `mas este binding descreve ${esperada}`,
      )
    }
  }
}

// ─── Impacto de um caso ───────────────────────────────────────────────────────

function medirImpacto(
  casos: readonly CaseRecord[],
  indice: number,
  spec: EspecificacaoMetrica,
  minPopulacao: number,
  valorIndisponivel: boolean,
  binding: CounterfactualBinding,
): Omit<CaseImpact, "outcome" | "severity" | "emitted" | "severity_gap" | "not_emitted_reason"> {
  const caso = casos[indice]
  if (caso === undefined) throw new Error(`índice ${indice} fora da população`)

  const refs = [...caso.evidence_refs]
  const identidade = {
    subject_ref: caso.subject_ref,
    ...(caso.unit.status === "matched" ? { unit: caso.unit.display_name } : {}),
    evidence_refs: refs,
    counterfactual_evidence_ref: binding.evidence_ref,
    counterfactual_computation_id: counterfactualComputationId(binding),
  }

  // Valor ausente numa métrica que depende de valor: o agregado inteiro é
  // lacuna, não zero. Somar `?? 0` faria a soma parecer completa e o delta do
  // caso faltante parecer nulo.
  if (valorIndisponivel) {
    const lacuna = gap<number>(
      "DATA_NOT_AVAILABLE",
      "calculated",
      "ao menos um caso da população sem valor: o agregado não é somável",
    )
    return {
      ...identidade,
      aggregate_with_item: lacuna,
      aggregate_without_item: lacuna,
      delta: lacuna,
      relative_delta_bp: lacuna,
      share_of_total_bp: lacuna,
    }
  }

  const cf = counterfactual<CaseRecord>({
    items: casos,
    removeIndex: indice,
    aggregate: spec.agregar,
    minPopulationAfterRemoval: minPopulacao,
  })

  return {
    ...identidade,
    aggregate_with_item: cf.aggregate_with_item,
    aggregate_without_item: cf.aggregate_without_item,
    delta: cf.delta,
    relative_delta_bp: mudancaRelativa(cf.delta_bp, cf.aggregate_without_item),
    share_of_total_bp: participacao(cf.share_of_total_bp, cf.delta, cf.aggregate_with_item, spec),
  }
}

/**
 * A mudança relativa, quando a base permite interpretá-la.
 *
 * A primitive divide por `aggregate_without_item`. Se essa base for negativa, o
 * sinal do resultado inverte de significado sem aviso: um caso que AUMENTA o
 * agregado produz um percentual negativo. Como tratar mudança relativa sobre
 * base negativa é decisão de negócio, não de engenharia.
 */
function mudancaRelativa(deltaBp: Metric<number>, semItem: Metric<number>): Metric<number> {
  if (!isOk(deltaBp)) return deltaBp
  if (!isOk(semItem)) return semItem
  if (semItem.value < 0) {
    return gap<number>(
      "BUSINESS_RULE_PENDING",
      "calculated",
      "agregado sem o item é negativo: mudança relativa sobre base negativa exige regra do CEO",
    )
  }
  return deltaBp
}

/**
 * A participação, quando ela existe.
 *
 * Dois filtros, em ordem. O primeiro é dimensional: a média não tem
 * participação — `(média_com − média_sem) ÷ média_com` é mudança relativa
 * disfarçada, e publicá-la como parte-do-todo repetiria o erro dimensional que
 * os gates anteriores já cobraram duas vezes.
 *
 * O segundo é de sinal: com estorno no conjunto, a parte pode ser negativa ou
 * maior que o todo. Nesses casos não existe participação — existe um delta, que
 * continua publicado e exato.
 */
function participacao(
  shareBp: Metric<number>,
  delta: Metric<number>,
  comItem: Metric<number>,
  spec: EspecificacaoMetrica,
): Metric<number> {
  if (!spec.share_faz_sentido) {
    return gap<number>(
      "BUSINESS_RULE_PENDING",
      "calculated",
      `participação não é definida para ${spec.rotulo}: a razão sobre este agregado é mudança relativa, não parte de um todo`,
    )
  }
  if (!isOk(shareBp)) return shareBp
  if (!isOk(delta) || !isOk(comItem)) {
    return gap<number>("DATA_NOT_AVAILABLE", "calculated", "agregado indisponível")
  }
  if (comItem.value === 0) {
    return gap<number>("EMPTY_DENOMINATOR", "calculated", "agregado com o item é zero")
  }
  if (!isPartOfWhole(delta.value, comItem.value)) {
    return gap<number>(
      "BUSINESS_RULE_PENDING",
      "calculated",
      "sinal misto (estorno): participação exige regra do CEO",
    )
  }
  return shareBp
}

// ─── Detector ─────────────────────────────────────────────────────────────────

export function detectMaterialSingleCase(
  input: MaterialSingleCaseInput,
  config: DetectorConfig,
): MaterialSingleCaseResult {
  const cfg = config.materialSingleCase

  if (!cfg.supported_metrics.includes(input.metric)) {
    throw new GatewayError("NOT_ALLOWED", "Métrica não habilitada para o Detector D", [
      `metric: "${input.metric}" não está em supported_metrics (${cfg.supported_metrics.join(", ")})`,
    ])
  }

  const escopos = assertPrecondicoes(input)
  const spec = ESPECIFICACOES[input.metric]

  const semValor = input.cases.filter((c) => c.amount_cents === null).length
  const valorIndisponivel = spec.depende_de_valor && semValor > 0

  const bindingPorSujeito = new Map(
    input.counterfactual_bindings.map((b) => [b.subject_ref, b]),
  )

  const impactos: CaseImpact[] = input.cases.map((caso, i) => {
    const binding = bindingPorSujeito.get(caso.subject_ref)
    // `assertPrecondicoes` já recusou entrada sem binding por candidato. Se
    // chegou aqui sem, a garantia foi contornada: falha fechada, não `?? algo`.
    if (binding === undefined) {
      throw new GatewayError("SCHEMA_INVALID", "Candidato sem binding contrafactual", [
        `caso ${caso.subject_ref}`,
      ])
    }
    const base = medirImpacto(
      input.cases,
      i,
      spec,
      cfg.min_population_after_removal,
      valorIndisponivel,
      binding,
    )

    const dimensao =
      cfg.severity_dimension === "relative_delta_bp" ? base.relative_delta_bp : base.share_of_total_bp

    // Duas razões distintas para não haver grau, e nenhuma delas vira zero:
    //   a dimensão não existe        → lacuna da métrica
    //   existe mas está fora da escala → política ausente
    const graduavel = isOk(dimensao) && escalaCobre(cfg.severity_scale, dimensao.value)
    const severity = graduavel ? classifySeverity(cfg.severity_scale, dimensao.value) : null
    // Fase 2.7b: quando a base aprovada é `share_of_total_bp` e ela não tem
    // semântica de parte-do-todo — o caso da MÉDIA — a razão é própria e
    // tipada. Não é "não material": o fato pode ser material por delta
    // absoluto. O que falta é a semântica executiva de gravidade. E não há
    // queda para `relative_delta_bp`: mudança contrafactual não é participação,
    // pode ser negativa e passar de 10000 bp.
    const baseInaplicavel =
      cfg.severity_dimension === "share_of_total_bp" && !isOk(base.share_of_total_bp)

    const severityGap = graduavel
      ? undefined
      : baseInaplicavel
        ? `SEVERITY_BASIS_NOT_APPLICABLE: share_of_total_bp não é parte-do-todo para ${input.metric} (${base.share_of_total_bp.gap})`
        : isOk(dimensao)
          ? `${cfg.severity_dimension}: ${dimensao.value} bp fora do domínio da escala configurada`
          : `${cfg.severity_dimension}: ${dimensao.gap}`

    const comparavel = isOk(base.delta)
    const material = comparavel && atingeMaterialidade(base, cfg, spec)

    const outcome: CaseOutcome = !comparavel ? "not_comparable" : material ? "material" : "not_material"
    const emitted = outcome === "material" && severity !== null

    const naoEmitido: NotEmittedReason | undefined = emitted
      ? undefined
      : outcome === "not_comparable"
        ? isOk(base.aggregate_with_item)
          ? "NOT_COMPARABLE"
          : "DATA_NOT_AVAILABLE"
        : outcome === "not_material"
          ? "NOT_MATERIAL"
          : "SEVERITY_DIMENSION_UNAVAILABLE"

    return {
      ...base,
      outcome,
      severity,
      ...(severityGap === undefined ? {} : { severity_gap: severityGap }),
      emitted,
      ...(naoEmitido === undefined ? {} : { not_emitted_reason: naoEmitido }),
    }
  })

  const quality = resolverQualidade(input, impactos, valorIndisponivel, config)

  // BUILD → VALIDATE → FREEZE → RETURN. `toEvent` valida e devolve a MESMA
  // referência, então o grafo congelado é o grafo validado.
  const events = impactos
    .filter((i) => i.emitted && i.severity !== null)
    .flatMap((i) =>
      // Estreitamento no ponto de emissão: `construirEvento` recebe números, não
      // métricas que "deveriam" estar ok. Nenhum `: 0` sobra no caminho.
      isOk(i.delta) && i.severity !== null
        ? [construirEvento(input, escopos, i, i.severity, i.delta.value, quality)]
        : [],
    )

  return deepFreeze({
    events,
    evaluated: impactos,
    summary: {
      metric: input.metric,
      severity_dimension: cfg.severity_dimension,
      candidates_evaluated: impactos.length,
      material: impactos.filter((i) => i.outcome === "material").length,
      not_material: impactos.filter((i) => i.outcome === "not_material").length,
      not_comparable: impactos.filter((i) => i.outcome === "not_comparable").length,
      emitted: events.length,
      quality_status: quality,
      missing_amount: semValor,
    },
  })
}

/**
 * A escala configurada cobre este valor?
 *
 * `classifySeverity` LANÇA quando o valor fica abaixo da primeira banda, e para
 * ela isso está certo: uma escala que não começa em zero é config inválida.
 * Aqui, porém, a situação é comum e legítima — a mudança relativa de um caso
 * pode ser NEGATIVA, porque remover um caso pequeno de uma média puxada por um
 * caso grande LEVANTA a média. Deixar a exceção subir abortaria a análise de
 * todos os outros casos por causa de um.
 *
 * Valor fora do domínio da escala não é `info`, não é zero e não é erro: é
 * política ausente. Como graduar mudança relativa negativa é decisão do CEO.
 */
function escalaCobre(escala: SeverityScale, valor: number): boolean {
  const primeira = escala[0]
  if (primeira === undefined) return false
  return valor >= primeira.at_least
}

/** Qualquer uma das três dimensões basta — mas cada uma compara o que é dela. */
function atingeMaterialidade(
  i: Pick<CaseImpact, "delta" | "relative_delta_bp" | "share_of_total_bp">,
  cfg: DetectorConfig["materialSingleCase"],
  spec: EspecificacaoMetrica,
): boolean {
  // O delta absoluto de CONTAGEM não é dinheiro. Comparar "1 caso" contra um
  // limiar em centavos trataria um caso como um centavo, e a política monetária
  // decidiria se um evento de contagem sai — foi o que este gate encontrou.
  const limiarAbsoluto =
    spec.unidade === "count" ? cfg.material_count_delta : cfg.material_absolute_delta_cents
  const absoluto = isOk(i.delta) && Math.abs(i.delta.value) >= limiarAbsoluto
  // MAGNITUDE, não valor assinado (Política v1, §8 da Fase 2.7c). Uma queda de
  // 15% no agregado é tão material quanto uma alta de 15%: as duas mudam a
  // leitura executiva. Antes desta decisão `-1500 >= 1000` era falso e o
  // contrafactual negativo desaparecia da materialidade sem deixar rastro.
  //
  // O `abs()` está autorizado AQUI e só aqui. A severidade de D continua em
  // `share_of_total_bp` (decisão da 2.7b): `classifySeverity(abs(delta))` daria
  // gravidade a uma grandeza que não é participação.
  //
  // O sinal sobrevive: `i.relative_delta_bp` é publicado como veio.
  const relativo =
    isOk(i.relative_delta_bp) &&
    Math.abs(i.relative_delta_bp.value) >= cfg.material_relative_delta_bp
  const parte =
    isOk(i.share_of_total_bp) && i.share_of_total_bp.value >= cfg.material_share_of_total_bp
  return absoluto || relativo || parte
}

/**
 * A qualidade é a dependência RELEVANTE mais fraca.
 *
 * Relevante importa: uma lacuna de participação não invalida um delta absoluto
 * que continua exato. O que degrada é dado que falta, identidade não resolvida e
 * cobertura insuficiente — não a ausência de uma razão que nunca fez sentido
 * para a métrica escolhida.
 */
function resolverQualidade(
  input: MaterialSingleCaseInput,
  impactos: readonly CaseImpact[],
  valorIndisponivel: boolean,
  config: DetectorConfig,
): "ok" | "degraded" | "conflicted" | "insufficient" {
  if (
    input.unit_coverage !== undefined &&
    input.unit_coverage.ratio_bp < config.coverage.emit_event_below_bp
  ) {
    return "insufficient"
  }
  if (valorIndisponivel) return "insufficient"
  if (impactos.some((i) => !isOk(i.aggregate_with_item))) return "insufficient"
  if (impactos.some((i) => i.outcome === "not_comparable")) return "degraded"
  if (input.cases.some((c) => c.unit.status !== "matched")) return "degraded"
  if (
    input.unit_coverage !== undefined &&
    input.unit_coverage.ratio_bp < config.coverage.degraded_below_bp
  ) {
    return "degraded"
  }
  return "ok"
}

/**
 * Identidade lógica do fato.
 *
 * Composta pelo FATO governado, não pela execução: reingerir os mesmos datasets
 * no mesmo período produz o mesmo evento, ainda que os `snapshot_id` mudem. O
 * `subject_ref` entra porque o fato é sobre um caso específico; a métrica entra
 * porque "este caso move a soma" e "este caso move a média" são fatos distintos.
 *
 * A política de severidade NÃO entra: mudar a escala muda o grau atribuído ao
 * fato, não o fato. Estruturada, nunca por gramática de delimitador.
 */
function identidadeDoEvento(
  input: MaterialSingleCaseInput,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  subjectRef: string,
): string {
  const datasets = [...escopos.values()]
    .map((e) => ({ source_system: e.source_system, dataset_id: e.dataset_id }))
    .sort(
      (a, b) =>
        compareCodeUnits(a.source_system, b.source_system) ||
        compareCodeUnits(a.dataset_id, b.dataset_id),
    )

  return structuralId(
    "creditum:material_single_case:v1",
    {
      event_type: EVENT_TYPE,
      metric: input.metric,
      period_start: input.period_start,
      period_end: input.period_end,
      subject_ref: subjectRef,
      datasets,
    },
    "evt",
  )
}

function construirEvento(
  input: MaterialSingleCaseInput,
  escopos: ReadonlyMap<string, EscopoGovernado>,
  i: CaseImpact,
  severity: Severity,
  /** Já estreitado: o evento não existe sem delta, e delta não tem substituto. */
  delta: number,
  quality: "ok" | "degraded" | "conflicted" | "insufficient",
): IntelligenceEvent {
  const spec = ESPECIFICACOES[input.metric]
  const snapshotIds = [...escopos.keys()].sort(compareCodeUnits)
  const evidenceRefs = [
    ...new Set([input.aggregate_evidence_ref, i.counterfactual_evidence_ref, ...i.evidence_refs]),
  ].sort(compareCodeUnits)

  const bruto: unknown = {
    event_id: identidadeDoEvento(input, escopos, i.subject_ref),
    event_type: EVENT_TYPE,
    detector_id: DETECTOR_ID,
    detector_version: DETECTOR_VERSION,
    snapshot_ids: snapshotIds,
    period_start: input.period_start,
    period_end: input.period_end,
    detected_at: input.detected_at,
    severity,
    materiality: materialidade(i, spec, delta),
    // O número principal: quanto o agregado muda se o caso sair. `delta_if_...`
    // e não `impact_caused_by_...` — é subtração, não causa.
    observed_metric: {
      name: "delta_if_case_excluded",
      data_class: "calculated" as const,
      unit: spec.unidade,
      value: delta,
      formula: FORMULA_DELTA,
    },
    reference_metric: metricaSemItem(i, spec),
    contributing_cases: [
      {
        subject_ref: i.subject_ref,
        ...(i.unit === undefined ? {} : { unit: i.unit }),
        contribution: {
          ...(spec.unidade === "cents" ? { amount_cents: delta } : { count: delta }),
          ...(isOk(i.share_of_total_bp) ? { share_of_event_bp: i.share_of_total_bp.value } : {}),
        },
        evidence_refs: [...i.evidence_refs],
      },
    ],
    evidence_refs: evidenceRefs,
    data_quality: {
      quality_status: quality,
      ...(input.unit_coverage === undefined
        ? {}
        : { coverage_ratio_bp: input.unit_coverage.ratio_bp }),
    },
  }

  return toEvent(bruto, { now: new Date(input.detected_at) })
}

/**
 * Base da materialidade.
 *
 * `share_of_total_bp` só entra quando existe — o campo é `basis_points`
 * (0..10000) no contrato, e uma participação fora dessa faixa não é
 * participação. A mudança relativa NÃO cabe aqui: ela pode ser negativa ou
 * passar de 10000, e é publicada como métrica de referência.
 */
function materialidade(i: CaseImpact, spec: EspecificacaoMetrica, delta: number): unknown {
  const parte = isOk(i.share_of_total_bp) ? { share_of_total_bp: i.share_of_total_bp.value } : {}

  if (spec.unidade === "count") return { basis: "count", count: delta, ...parte }
  return { basis: "amount_cents", amount_cents: delta, ...parte }
}

/** O agregado SEM o item — calculado, com a fórmula que o produziu. */
function metricaSemItem(i: CaseImpact, spec: EspecificacaoMetrica): unknown {
  if (!isOk(i.aggregate_without_item)) {
    return {
      name: "aggregate_without_item",
      data_class: "gap" as const,
      gap_reason: i.aggregate_without_item.gap,
    }
  }
  return {
    name: "aggregate_without_item",
    data_class: "calculated" as const,
    unit: spec.unidade,
    value: i.aggregate_without_item.value,
    formula: spec.formula_without,
  }
}

export { FORMULA_DELTA, FORMULA_RELATIVE, FORMULA_SHARE, ESPECIFICACOES }
